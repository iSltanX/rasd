/**
 * دليل الخطوات وقالب تصديره — شكلهما المخزَّن (النسخة 5، [ADR 0041](../../Docs/ADR/0041-guide-record-and-exports.md)).
 *
 * هنا لا في `modules/export/` لأن `GuideRecord` و`TemplateRecord` في `shared/storage/schema.ts` يحملانهما، و
 * `shared/` لا يستورد ممّا فوقه — نفس موضع `issue-schema.ts` و`exclusion-schema.ts` وعلّتهما.
 *
 * **الترتيب والعضوية في `captureIds` كما كانا، والنصّ بجانبهما بمعرّف اللقطة** (`stepText`). مصفوفةٌ ثانية
 * موازية بالفهرس كانت ستنزاح عن الأولى حين يُزيل حذفُ لقطةٍ معرّفها (`repository.ts`)، والقاموس لا ينزاح:
 * ما لا معرّف له في `captureIds` لا يُعرض، ويُحذف مع لقطته.
 *
 * **ويُقرأ السجلّ بـ`guideSteps` لا بحقوله مباشرةً:** سجلٌّ كتبه ما قبل النسخة 5 — أو زرعه حارسٌ بشكله القديم
 * — بلا `stepText` يُقرأ خطواتٍ بعناوين فارغة، لا انهيارًا في أوّل واجهة.
 */

/** الصيغ الأربع بترتيب الإطار (`guide / export`، `304:1647`) من اليمين. */
export const GUIDE_FORMATS = ['pdf', 'zip', 'markdown', 'html'] as const
export type GuideFormat = (typeof GUIDE_FORMATS)[number]

/** مقاسا الورقة — نفس `PageSizeId` في `modules/export/pdf-layout.ts`، مكرَّرٌ هنا لحدّ الاستيراد. */
export const GUIDE_PAGE_SIZES = ['a4', 'letter'] as const
export type GuidePageSize = (typeof GUIDE_PAGE_SIZES)[number]

/** إعدادات التصدير التي يحفظها القالب ويستعيدها — ما في الإطار تحت «الخيارات» لا غيره. */
export interface GuideExportOptions {
  readonly format: GuideFormat
  /** للـPDF وحده؛ يُحفظ مع غيره فلا يضيع اختيارٌ بتبديل الصيغة ذهابًا وإيابًا. */
  readonly pageSize: GuidePageSize
  /** «رقّم الخطوات» — بالأرقام الهندية، من اليمين. */
  readonly numbered: boolean
  /** «ضمّن ملاحظات كل خطوة». */
  readonly notes: boolean
}

export const DEFAULT_GUIDE_OPTIONS: GuideExportOptions = {
  format: 'pdf',
  pageSize: 'a4',
  numbered: true,
  notes: true,
}

/** نصّ الخطوة كما يكتبه المستخدم. */
export interface GuideStepText {
  readonly title: string
  readonly note: string
}

/**
 * حدود ما يكتبه المستخدم — يفرضها المحرّر والمخطّط معًا، فلا تُكتب نسخةٌ احتياطية يرفضها استيرادها.
 * `steps` سقف عدد الخطوات: الدليل عشراتٌ لا آلاف، والتصدير يخبز كل صورة.
 */
export const GUIDE_LIMITS = {
  title: 200,
  stepTitle: 200,
  note: 2000,
  steps: 200,
  templateName: 60,
  templates: 50,
} as const

/** قالب تصدير مسمًّى — `guide / template-save` (`304:1922`). */
export interface TemplateRecord {
  readonly id: string
  /** فريدٌ بفهرسه: حفظٌ باسمٍ قائم يستبدله لا يكرّره. */
  readonly name: string
  readonly options: GuideExportOptions
  readonly createdAt: number
  readonly updatedAt: number
}

/** الخطوة كما تُعرض وتُصدَّر: اللقطة بترتيبها ونصّها. */
export interface GuideStep {
  readonly captureId: string
  readonly title: string
  readonly note: string
}

const EMPTY_TEXT: GuideStepText = { title: '', note: '' }

/** نصّ خطوةٍ من القاموس — `hasOwn` لا `[]`: معرّفٌ اسمه `__proto__` لا يقرأ نموذج الكائن. */
export function stepTextOf(
  text: Readonly<Record<string, GuideStepText>> | undefined,
  captureId: string,
): GuideStepText {
  if (!text || typeof text !== 'object' || !Object.hasOwn(text, captureId)) return EMPTY_TEXT
  const found = text[captureId]
  return {
    title: typeof found?.title === 'string' ? found.title : '',
    note: typeof found?.note === 'string' ? found.note : '',
  }
}

/** الخطوات بترتيبها — من سجلٍّ بأيّ شكلٍ كتبته نسخةٌ من رصد. */
export function guideSteps(record: {
  readonly captureIds?: readonly string[]
  readonly stepText?: Readonly<Record<string, GuideStepText>>
}): GuideStep[] {
  const ids = Array.isArray(record.captureIds) ? record.captureIds : []
  return ids
    .filter((id): id is string => typeof id === 'string')
    .map((captureId) => ({ captureId, ...stepTextOf(record.stepText, captureId) }))
}

/** قاموس النصّ من خطواتٍ مرتّبة — ما يُكتب في السجلّ. الخطوة بلا نصّ لا تُكتب: الغياب يُقرأ فراغًا. */
export function stepTextFrom(steps: readonly GuideStep[]): Record<string, GuideStepText> {
  const out: Record<string, GuideStepText> = {}
  for (const step of steps) {
    if (step.title === '' && step.note === '') continue
    Object.defineProperty(out, step.captureId, {
      value: { title: step.title, note: step.note },
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return out
}
