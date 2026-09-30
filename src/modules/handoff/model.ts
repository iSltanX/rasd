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
  /**
   * موضع العنصر داخل الصورة المخبوزة، ببكسلها — بعد اقتصاص المحرّر إن وُجد (`frames`). `null` حين أخرج
   * الاقتصاصُ العنصرَ من الصورة كلّه.
   */
  readonly crop: IssueEvidence['crop'] | null
}

/** نافذة الخبز في بكسل اللقطة: الاقتصاص إن وُجد، وإلا الصورة كلّها (`exportWindow`). */
export interface EvidenceFrame {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
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

/**
 * رابط الصفحة كما يخرج في الحزمة.
 *
 * **بيانات الدخول تُحذف دائمًا** (`user:pass@` — صفحاتٌ بمصادقة أساسية)، ولو طُلبت المعاملات: ليست معاملةً بل
 * كلمة مرور. و**بلا `keepQuery`** يُحذف الاستعلام والجزء ومعاملات المقاطع (`;jsessionid=…`): المسار يكفي
 * المطوّر، وكلّها تحمل رموز جلسات ومعرّفات حملات. ورابطٌ لا يُفهم يُقصّ نصًّا بالقاعدة نفسها.
 */
export function pageUrl(url: string, keepQuery: boolean): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    const bare = url.replace(/^([a-z][\w+.-]*:\/\/)[^/?#@]*@/iu, '$1')
    const cut = keepQuery ? bare.indexOf('#') : bare.search(/[;?#]/u)
    return cut === -1 ? bare : bare.slice(0, cut)
  }
  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''
  if (!keepQuery) {
    parsed.search = ''
    parsed.pathname = parsed.pathname.replace(/;[^/]*/gu, '')
  }
  return parsed.href
}

/** موضع العنصر نسبةً إلى نافذة الخبز، مقصوصًا إليها — `null` حين لا يتقاطعان. */
export function cropIn(
  crop: IssueEvidence['crop'],
  frame: EvidenceFrame | undefined,
): IssueEvidence['crop'] | null {
  if (!frame) return crop
  const x0 = Math.max(crop.x, frame.x)
  const y0 = Math.max(crop.y, frame.y)
  const x1 = Math.min(crop.x + crop.width, frame.x + frame.width)
  const y1 = Math.min(crop.y + crop.height, frame.y + frame.height)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0 - frame.x, y: y0 - frame.y, width: x1 - x0, height: y1 - y0 }
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

/**
 * `frames` نوافذ الخبز بمعرّف اللقطة — من المشهد الذي خُبز فعلًا (اقتصاص المحرّر)؛ وبدونها موضع العنصر كما
 * سُجّل في اللقطة الكاملة.
 */
export function buildHandoff(
  issues: readonly IssueRecord[],
  options: HandoffOptions,
  meta: HandoffMeta,
  frames: ReadonlyMap<string, EvidenceFrame> = new Map(),
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
        url: pageUrl(issue.page.url, options.keepQuery),
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
          ? {
              name,
              captureId: issue.evidence.captureId,
              crop: cropIn(issue.evidence.crop, frames.get(issue.evidence.captureId)),
            }
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
