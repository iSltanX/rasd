/**
 * نموذج حزمة التسليم — الموضع الوحيد لقرارات محتواها (ADR 0036 §1).
 *
 * العارضان (`markdown.ts` و`json.ts`) يقرآن هذا النموذج وحده ولا يقرآن `IssueRecord`: الرابط بلا استعلام،
 * والقيمة «الآن»، واسم الصورة، والخصائص تُقرَّر هنا مرّةً فتخرج في الصيغتين واحدة.
 *
 * **والحزمة اشتقاقٌ لا سجلّ:** تُبنى من المشكلات كما هي عند الطلب، ولا تُكتب في أي مخزن.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { currentValue } from '@/modules/issues/status'

import { issueProperties, type HandoffProperties } from './properties'

import type {
  ElementIdentity,
  IssueCheck,
  IssueEvidence,
  IssuePage,
  IssueRecord,
  IssueStatus,
  LastCheck,
} from '@/shared/issue-schema'

/** ما يختاره المستخدم في النافذة — «يشمل». */
export interface HandoffOptions {
  /** مقتطع اللقطة حول كل عنصر، بعد الحجب. */
  readonly images: boolean
  /** الخصائص بصيغها الثلاث. */
  readonly properties: boolean
  /** رابط الصفحة بمعاملاته — معطَّل افتراضيًّا. */
  readonly keepQuery: boolean
}

export const DEFAULT_OPTIONS: HandoffOptions = { images: true, properties: true, keepQuery: false }

export interface HandoffMeta {
  /** من أين جاءت المشكلات — نصٌّ يقرؤه إنسان: «تحديد في المكتبة» · «مشروع «منصّة»». */
  readonly source: string
  readonly generatedAt: number
  /** نسخة رصد التي بنت الحزمة. */
  readonly version: string
}

/** هوية العنصر بلا بصمته: البصمة للمطابقة داخل رصد، والمطوّر يحتاج المحدِّد وهشاشته. */
export type HandoffElement = Omit<ElementIdentity, 'fingerprint'>

export interface HandoffImage {
  /** المسار داخل الحزمة — `images/issue-01.png`. */
  readonly name: string
  readonly captureId: string
  /** موضع العنصر داخل الصورة، ببكسلها. */
  readonly crop: IssueEvidence['crop']
}

export interface HandoffEntry {
  /** الرتبة في الحزمة، من 1. */
  readonly ordinal: number
  readonly id: string
  readonly title: string
  readonly body: string
  readonly status: IssueStatus
  readonly createdAt: number
  readonly lastCheck: LastCheck | null
  readonly page: {
    readonly url: string
    readonly title: string
    readonly viewport: IssuePage['viewport']
  }
  readonly element: HandoffElement
  readonly pair: HandoffElement | null
  /** الفحص، و`current` القيمة الآن: آخر ما رُصد، وإلا وقت التسجيل (`currentValue`). */
  readonly check: IssueCheck & { readonly current: string | null }
  readonly steps: readonly string[]
  readonly properties: HandoffProperties | null
  readonly image: HandoffImage | null
}

export interface HandoffModel {
  readonly generatedAt: number
  readonly version: string
  readonly source: string
  readonly options: HandoffOptions
  readonly entries: readonly HandoffEntry[]
}

/** الرابط بلا استعلام ولا جزء — المسار يكفي المطوّر، والاستعلام يحمل رموز جلسات ومعرّفات حملات. */
export function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/u)
  return cut === -1 ? url : url.slice(0, cut)
}

function elementOf(identity: ElementIdentity): HandoffElement {
  const { fingerprint: _fingerprint, ...rest } = identity
  return { ...rest, hosts: [...identity.hosts] }
}

/**
 * أسماء الصور: صورةٌ لكل لقطة دليل، باسم أوّل مشكلة تشير إليها. ومشكلتان تشتركان في لقطةٍ تشيران إلى
 * الملفّ نفسه — لا صورتان متطابقتان. والعرض بخانتين على الأقلّ، وبقدر عدد المشكلات إن زاد.
 */
function imageNames(issues: readonly IssueRecord[]): Map<string, string> {
  const width = Math.max(2, String(issues.length).length)
  const names = new Map<string, string>()
  issues.forEach((issue, i) => {
    const id = issue.evidence.captureId
    if (!names.has(id)) names.set(id, `images/issue-${String(i + 1).padStart(width, '0')}.png`)
  })
  return names
}

export function buildHandoff(
  issues: readonly IssueRecord[],
  options: HandoffOptions,
  meta: HandoffMeta,
): HandoffModel {
  const names = imageNames(issues)
  const entries = issues.map((issue, i): HandoffEntry => {
    const name = names.get(issue.evidence.captureId)
    return {
      ordinal: i + 1,
      id: issue.id,
      title: issue.title,
      body: issue.body,
      status: issue.status,
      createdAt: issue.createdAt,
      lastCheck: issue.lastCheck,
      page: {
        url: options.keepQuery ? issue.page.url : withoutQuery(issue.page.url),
        title: issue.page.title,
        viewport: issue.page.viewport,
      },
      element: elementOf(issue.element),
      pair: issue.pair ? elementOf(issue.pair) : null,
      check: { ...issue.check, current: currentValue(issue) },
      steps: [...issue.steps],
      properties: options.properties ? issueProperties(issue) : null,
      image:
        options.images && name
          ? { name, captureId: issue.evidence.captureId, crop: issue.evidence.crop }
          : null,
    }
  })
  return {
    generatedAt: meta.generatedAt,
    version: meta.version,
    source: meta.source,
    options,
    entries,
  }
}

/** لقطات الدليل التي يحتاجها النموذج، بأسمائها في الحزمة — ما يُخبَز مرّةً لكلٍّ منها. */
export function imagesOf(model: HandoffModel): HandoffImage[] {
  const seen = new Map<string, HandoffImage>()
  for (const entry of model.entries) {
    if (entry.image && !seen.has(entry.image.captureId))
      seen.set(entry.image.captureId, entry.image)
  }
  return [...seen.values()]
}
