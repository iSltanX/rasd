/**
 * **البلاغ كما يُرسَل** — جسم الطلب بعقد قناة الاستقبال (النسخة 1، `Docs/Support.md`)، وما يُعرض منه قبل التأكيد،
 * ونسخته نصًّا. منطقٌ خالص بلا `chrome.*` ولا شبكة ([ADR 0050](../../../Docs/ADR/0050-problem-reports.md)).
 *
 * **ما يُعرض هو ما يُرسَل حرفًا:** صفوف «ما سيُرسَل» (`reviewRows`) تُشتقّ من الجسم المبنيّ نفسه لا من النموذج،
 * فلا يفترق المعروض عن المرسَل بحقلٍ يُضاف إلى أحدهما وحده. ونسخة «انسخ البلاغ نصًّا» الجسمُ نفسه وكل مرفقٍ
 * مستبدلٌ بنوعه وحجمه — كما يشترط العقد.
 *
 * **وما لا يُرسَل أبدًا:** رابط الصفحة وعنوانها ومحتواها، واسم المشروع، والمكتبة والإعدادات. لا حقل لها هنا أصلًا،
 * ورمز الخطأ يُقبل بشكلٍ ضيّق (`ERROR_CODE`) فلا يحمل عنوانًا ولا نصًّا حرًّا.
 */

import { bytesToBase64 } from '@/shared/base64'

import type { ReportKind } from '@/shared/storage/schema'

/** معرّف رصد في القناة المشتركة — ثابتٌ لا يُعاد تسميته (`product:rasd`). */
export const PRODUCT_ID = 'rasd'

/** سقوف العقد — الخادم يفرضها، والواجهة تفحصها قبل الإرسال كي لا يُرسَل ما سيُرفض. */
export const LIMITS = {
  /** الوصف بعد التشذيب: 1–2000 حرف. */
  description: 2000,
  /** بايتات الصورة الواحدة قبل base64. */
  attachmentBytes: 3 * 1024 * 1024,
  /** جسم الطلب كاملًا. */
  body: 16 * 1024 * 1024,
  /** التشخيص مسلسلًا. */
  diagnostics: 16 * 1024,
} as const

/** العنوان يصير عنوان البلاغ عند المالك (أوّل سطر، 60 حرفًا) — والحقل يقبل أطول بقليل ويُقصّ هناك. */
export const TITLE_MAX = 120

export type ImageType = 'image/png' | 'image/jpeg'

export interface ReportForm {
  readonly kind: ReportKind
  readonly title: string
  readonly what: string
  readonly steps: string
  readonly expected: string
  /** الأداة المتأثّرة إن فُتح النموذج من رسالة خطأ — معرّفٌ تقني لا نصّ. */
  readonly tool: string | null
  readonly errorCode: string | null
}

/** تشخيصٌ يجمعه `diagnostics.ts` من المتصفّح — لا شيء فيه من الصفحة ولا من المكتبة. */
export interface Diagnostics {
  readonly appVersion: string
  readonly os: string
  readonly osVersion: string
  readonly arch: string
  readonly browser: string
  readonly browserVersion: string
}

export interface ReportImage {
  readonly type: ImageType
  readonly bytes: Uint8Array
}

/** الجسم بعقد النسخة 1 — بأسماء حقوله حرفًا. */
export interface ReportPayload {
  readonly product: typeof PRODUCT_ID
  readonly app_version: string
  readonly os: string
  readonly os_version: string
  readonly arch: string
  readonly locale: 'ar'
  readonly kind: ReportKind
  readonly description: string
  readonly diagnostics: Readonly<Record<string, string>>
  readonly attachments?: readonly { readonly type: ImageType; readonly data: string }[]
  readonly test?: true
}

/** معرّف أداة أو رمز خطأ: حروفٌ لاتينية وأرقام وفواصل — لا مسافة ولا `/` ولا `:` فلا يحمل عنوانًا. */
const TOOL_ID = /^[a-z][a-z0-9-]{0,31}$/u
const ERROR_CODE = /^[A-Za-z0-9_.-]{1,64}$/u

/** الأداة كما تُكتب في الطلب، أو `null` حين لا تطابق الشكل — فلا يتسلّل نصٌّ حرّ من رابطٍ مصنوع. */
export function safeTool(tool: string | null | undefined): string | null {
  return tool && TOOL_ID.test(tool) ? tool : null
}

export function safeErrorCode(code: string | null | undefined): string | null {
  return code && ERROR_CODE.test(code) ? code : null
}

const clip = (value: string, max: number): string => value.trim().slice(0, max)

/**
 * الوصف المرسَل: العنوان سطرًا أوّل (منه يُبنى عنوان البلاغ عند المالك)، ثمّ الأقسام غير الفارغة بعناوينها.
 * والخادم يعرضه نصًّا لا Markdown، فلا حاجة لتهريب شيء هنا.
 */
export function composeDescription(form: ReportForm): string {
  const sections: string[] = [form.title.trim().replace(/\s+/gu, ' ')]
  const add = (heading: string, text: string) => {
    const body = text.trim()
    if (body) sections.push(`${heading}\n${body}`)
  }
  add('ماذا حدث؟', form.what)
  add('خطوات حدوثها', form.steps)
  add('ماذا توقّعت؟', form.expected)
  return sections.join('\n\n')
}

export type FieldError = 'title' | 'what' | 'length'

/** ما يمنع الانتقال من الخطوة الأولى — بأسماء الحقول، والنصّ في الواجهة. */
export function formErrors(form: ReportForm): FieldError[] {
  const errors: FieldError[] = []
  if (!form.title.trim()) errors.push('title')
  if (!form.what.trim()) errors.push('what')
  if (composeDescription(form).length > LIMITS.description) errors.push('length')
  return errors
}

/** التشخيص المرسَل: المتصفّح وإصداره، والأداة ورمز الخطأ إن وُجدا. لا رابط ولا عنوان ولا مشروع. */
export function diagnosticsFor(form: ReportForm, diag: Diagnostics): Record<string, string> {
  const out: Record<string, string> = {
    browser: clip(diag.browser, 32),
    browser_version: clip(diag.browserVersion, 32),
  }
  const tool = safeTool(form.tool)
  if (tool) out.tool = tool
  const code = safeErrorCode(form.errorCode)
  if (code) out.error_code = code
  return out
}

export interface PayloadOptions {
  /** من بناءٍ تجريبي — يضيف وسم `test` عند المالك. */
  readonly test?: boolean
}

export function buildPayload(
  form: ReportForm,
  diag: Diagnostics,
  image: ReportImage | null,
  options: PayloadOptions = {},
): ReportPayload {
  return {
    product: PRODUCT_ID,
    app_version: clip(diag.appVersion, 32),
    os: clip(diag.os, 16),
    os_version: clip(diag.osVersion, 32),
    arch: clip(diag.arch, 16),
    locale: 'ar',
    kind: form.kind,
    description: composeDescription(form),
    diagnostics: diagnosticsFor(form, diag),
    ...(image ? { attachments: [{ type: image.type, data: bytesToBase64(image.bytes) }] } : {}),
    ...(options.test ? { test: true as const } : {}),
  }
}

/** الجسم مسلسلًا — ما يخرج في الطلب بايتًا ببايت. */
export function serialise(payload: ReportPayload): string {
  return JSON.stringify(payload)
}

/** ما يمنع الإرسال قبل أن يُطلب: سقوف العقد. */
export type PayloadProblem = 'description' | 'attachment' | 'diagnostics' | 'body'

export function payloadProblems(payload: ReportPayload, imageBytes: number): PayloadProblem[] {
  const problems: PayloadProblem[] = []
  const length = payload.description.trim().length
  if (length < 1 || length > LIMITS.description) problems.push('description')
  if (imageBytes > LIMITS.attachmentBytes) problems.push('attachment')
  if (JSON.stringify(payload.diagnostics).length > LIMITS.diagnostics) problems.push('diagnostics')
  if (new TextEncoder().encode(serialise(payload)).length > LIMITS.body) problems.push('body')
  return problems
}

/**
 * «انسخ البلاغ نصًّا» — الجسم نفسه منسَّقًا، وكل مرفقٍ `{ type, bytes }` بدل بياناته (العقد). يُرسله المستخدم
 * بطريقته حين يكون الإرسال معطَّلًا أو مرفوضًا.
 */
export function copyText(payload: ReportPayload): string {
  const { attachments, ...rest } = payload
  const shown = attachments
    ? {
        ...rest,
        attachments: attachments.map((a) => ({ type: a.type, bytes: base64Length(a.data) })),
      }
    : rest
  return JSON.stringify(shown, null, 2)
}

export interface ReviewRow {
  /** مفتاح الحقل في الجسم — `diagnostics.browser` مثلًا. */
  readonly key: string
  readonly value: string
}

/**
 * كل قيمةٍ في الجسم صفًّا، بمفتاحها وقيمتها كما تُرسَل — والواجهة تضع لكل مفتاحٍ اسمه العربي. والوصف قيمةٌ واحدة
 * كاملة لا ملخّص، والمرفق نوعه وحجمه. فلا قيمة في الطلب لا يراها المستخدم قبل «أرسل».
 */
export function reviewRows(payload: ReportPayload): ReviewRow[] {
  const rows: ReviewRow[] = [
    { key: 'kind', value: payload.kind },
    { key: 'description', value: payload.description },
    { key: 'app_version', value: payload.app_version },
    { key: 'os', value: payload.os },
    { key: 'os_version', value: payload.os_version },
    { key: 'arch', value: payload.arch },
    { key: 'locale', value: payload.locale },
  ]
  for (const [key, value] of Object.entries(payload.diagnostics)) {
    rows.push({ key: `diagnostics.${key}`, value })
  }
  for (const [index, a] of (payload.attachments ?? []).entries()) {
    rows.push({ key: `attachments.${index}`, value: `${a.type} · ${base64Length(a.data)}` })
  }
  rows.push({ key: 'product', value: payload.product })
  if (payload.test) rows.push({ key: 'test', value: 'true' })
  return rows
}

/** بايتات ما يرمّزه base64 — بلا فكّه. */
export function base64Length(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  return (data.length / 4) * 3 - padding
}
