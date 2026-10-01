/**
 * **نصّ الـIssue** — يُبنى من المشكلات ولقطاتها بعارض Markdown الذي تبني به حزمة التسليم (`modules/handoff`)،
 * ولا نصّ موازٍ له: ترتيب الأقسام وعزل القيم التقنية وحراسة ما كتبته الصفحة من الكسر كلّها من العارض نفسه
 * (`renderEntries`)، فأي تغييرٍ في صياغة قسمٍ يصل الحزمة والـIssue معًا.
 *
 * وما يخصّ الـIssue هنا وحده:
 *   1. **المقدّمة** — نصٌّ يكتبه المستخدم في رأس البلاغ.
 *   2. **الصورة بأحد طريقين** يعرضهما المؤلِّف صراحةً: `inline` — ترميزٌ base64 داخل النصّ (بلا رفع، وحدّ GitHub
 *      للنصّ 65536 محرفًا، فصورةٌ كبيرة تتجاوزه فتُرفض قبل أن تُرسَل)، أو `asset` — ملفٌّ يُرفع إلى المستودع
 *      ويشير إليه النصّ بعنوانٍ مثبَّتٍ على التزامه.
 *   3. **ما يُضمَّن:** الملاحظات (النصّ والخطوات) ورابط الصفحة — كلٌّ يُطفأ فيسقط من النصّ.
 *
 * **والرابط بلا معاملاته دائمًا** (`keepQuery: false`): الـIssue قد يراها غير صاحبها، والمعاملات تحمل رموز جلسات.
 * **ولا شبكة هنا:** الملفّ منطقٌ خالص يبني نصًّا ومسارات؛ والإرسال في `github.ts` بعد تأكيد المستخدم.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { ISSUE_FORMS } from '@/modules/issues/labels'
import { countText } from '@/shared/bidi/numerals'
import { errText, ok, type Result } from '@/shared/result'

import { renderEntries } from '../../handoff/markdown'
import {
  buildHandoff,
  imagesOf,
  type EvidenceFrame,
  type HandoffEntry,
  type HandoffMeta,
  type HandoffModel,
} from '../../handoff/model'

import { toBase64 } from './github'

import type { IssueRecord } from '@/shared/issue-schema'

export type ImageMode = 'inline' | 'asset'

export interface IssueOptions {
  readonly imageMode: ImageMode
  /** نصّ كل مشكلة وخطواتها. */
  readonly notes: boolean
  /** رابط الصفحة وعنوانها. */
  readonly pageLink: boolean
}

/** الأصل في المستودع افتراضيًّا: النصّ يبقى قصيرًا، والصورة تُعرض. */
export const DEFAULT_ISSUE_OPTIONS: IssueOptions = {
  imageMode: 'asset',
  notes: true,
  pageLink: true,
}

/** حدّا GitHub: العنوان 256 محرفًا، والنصّ 65536. */
export const TITLE_LIMIT = 256
export const BODY_LIMIT = 65536

export interface IssueInput {
  readonly issues: readonly IssueRecord[]
  /** من أين جاءت المشكلات — «تحديد في المكتبة» · «لقطة في المحرّر». */
  readonly source: string
  readonly generatedAt: number
  /** نسخة رصد. */
  readonly version: string
  /** الصور المخبوزة بمعرّف اللقطة — من مخرج الترميز الواحد، بعد الحجب. */
  readonly baked: ReadonlyMap<string, Uint8Array>
  /** نوافذ الخبز (اقتصاص المحرّر)، كما في الحزمة. */
  readonly frames?: ReadonlyMap<string, EvidenceFrame>
}

/** صورةٌ في البلاغ: اسمها في النصّ، وبايتاتها، ومسارها إن رُفعت أصلًا. */
export interface PlannedImage {
  readonly name: string
  readonly bytes: Uint8Array
  /** مسارها في المستودع إن اختير «أصل في المستودع» — `.rasd/issues/<لحظة>/issue-01.png`. */
  readonly path: string
}

export interface IssuePlan {
  /** نصّ المشكلات، وصوره بأسمائها المحلّية (`images/issue-01.png`) — يُستبدل بها عند التركيب. */
  readonly markdown: string
  readonly images: readonly PlannedImage[]
}

/** عنوانٌ مقترَح: أوّل مشكلة، وعددُ الباقي إن زادت. */
export function defaultTitle(issues: readonly IssueRecord[]): string {
  const first = issues[0]?.title.trim() ?? ''
  if (issues.length <= 1) return first
  return `${first} (+${issues.length - 1})`
}

/** مقدّمةٌ مقترَحة يعدّلها المستخدم. */
export function defaultIntro(issues: readonly IssueRecord[], source: string): string {
  return `${countText(issues.length, ISSUE_FORMS)} من ${source}.`
}

/** لحظةٌ بـUTC لاسم مجلّد الأصول: `20260930-120000`. */
function stampDir(at: number): string {
  return new Date(at).toISOString().slice(0, 19).replace(/[-:]/gu, '').replace('T', '-')
}

/** يطفئ ما أطفأه المستخدم من المشكلة — العارض يحذف القسم الفارغ. */
function trimmed(entry: HandoffEntry, options: IssueOptions): HandoffEntry {
  return {
    ...entry,
    ...(options.notes ? {} : { body: '', steps: [] }),
    ...(options.pageLink ? {} : { page: { ...entry.page, url: '', title: '' } }),
  }
}

/**
 * يبني خطّة البلاغ: نصّ المشكلات وصورها. **صورةٌ يذكرها النصّ ولم تُخبَز تُرفض باسمها** — لا بلاغٌ بمرجعٍ مكسور،
 * ولا حجبٌ يُفقد لأن لقطةً سقطت.
 */
export function planIssue(input: IssueInput, options: IssueOptions): Result<IssuePlan> {
  const meta: HandoffMeta = {
    source: input.source,
    generatedAt: input.generatedAt,
    version: input.version,
  }
  const model: HandoffModel = buildHandoff(
    input.issues,
    { images: true, properties: false, keepQuery: false },
    meta,
    input.frames ?? new Map(),
  )

  const dir = `.rasd/issues/${stampDir(input.generatedAt)}`
  const images: PlannedImage[] = []
  const missing: string[] = []
  for (const image of imagesOf(model)) {
    const bytes = input.baked.get(image.captureId)
    if (!bytes) {
      missing.push(image.name)
      continue
    }
    images.push({ name: image.name, bytes, path: `${dir}/${image.name.replace(/^images\//u, '')}` })
  }
  if (missing.length > 0) {
    return errText('not-found', 'صورةٌ يذكرها البلاغ لم تُخبَز.', missing.join(' · '))
  }
  return ok({ markdown: renderEntries(model.entries.map((e) => trimmed(e, options))), images })
}

/** سطر صورة: `![بديل](هدف)` — الهدف آخر السطر، فالبديل قد يحمل `](` من محدِّدٍ مهرَّب (كعارض الحزمة). */
const IMAGE_LINE = /^(!\[[^\n]*\]\()([^()\s]+)(\))$/u

/** يستبدل هدف كل صورة بعنوانها النهائي. */
export function withImageTargets(markdown: string, resolve: (name: string) => string): string {
  return markdown
    .split(/\r\n|\r|\n/u)
    .map((line) => {
      const m = IMAGE_LINE.exec(line)
      return m ? `${m[1]}${resolve(m[2] ?? '')}${m[3]}` : line
    })
    .join('\n')
}

/** `inline`: الصورة نفسها في النصّ. */
export function inlineTargets(images: readonly PlannedImage[]): (name: string) => string {
  const byName = new Map(images.map((i) => [i.name, i.bytes]))
  return (name) => `data:image/png;base64,${toBase64(byName.get(name) ?? new Uint8Array())}`
}

/**
 * `asset`: عنوانٌ مثبَّت على الالتزام الذي رفع الصورة — يبقى صالحًا ولو تغيّر الفرع، ويُعرض لمن يرى المستودع
 * (خاصًّا كان أم عامًّا). `commits` مسار كل صورة إلى التزامها.
 */
export function assetTargets(
  owner: string,
  repo: string,
  images: readonly PlannedImage[],
  commits: ReadonlyMap<string, string>,
): (name: string) => string {
  const byName = new Map(images.map((i) => [i.name, i.path]))
  return (name) => {
    const path = byName.get(name) ?? ''
    const sha = commits.get(path) ?? ''
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/blob/${sha}/${encoded}?raw=true`
  }
}

/** رمز التزامٍ بطوله الحقيقي (40 خانة) — لقياس النصّ قبل أن يُعرف الرمز الفعلي. */
export const PENDING_COMMIT = '0'.repeat(40)

/**
 * عناوين الصور في النصّ النهائي بحسب الطريقة. `commits` غائبة ⟵ رموزٌ بطولها الحقيقي: قياسٌ لحدّ GitHub قبل
 * أي رفع، وهو الحدّ الذي يُفحص به النصّ في المعاينة.
 */
export function imageTargets(
  mode: ImageMode,
  plan: IssuePlan,
  owner: string,
  repo: string,
  commits?: ReadonlyMap<string, string>,
): (name: string) => string {
  if (mode === 'inline') return inlineTargets(plan.images)
  const pending = new Map(plan.images.map((image) => [image.path, PENDING_COMMIT]))
  return assetTargets(owner, repo, plan.images, commits ?? pending)
}

/** البلاغ كاملًا: المقدّمة ثمّ المشكلات. */
export function composeBody(intro: string, plan: IssuePlan, targets: (name: string) => string) {
  return [intro.trim(), withImageTargets(plan.markdown, targets)]
    .filter((part) => part !== '')
    .join('\n\n')
}

export type IssueProblem = 'title-empty' | 'title-too-long' | 'body-too-long'

/** ما يرفضه GitHub قبل أن يُسأل. */
export function checkIssue(title: string, body: string): IssueProblem | null {
  const trimmedTitle = title.trim()
  if (trimmedTitle === '') return 'title-empty'
  if (trimmedTitle.length > TITLE_LIMIT) return 'title-too-long'
  if (body.length > BODY_LIMIT) return 'body-too-long'
  return null
}
