/**
 * بناء سجلّ المشكلة وملاحظتها من مسودّةٍ متحقَّقٍ منها ومن معرفة الخلفية بالتبويب (ADR 0030 §3).
 *
 * **ما يُبنى هنا لا يأتي من الصفحة:** الرابط والعنوان من `sender.tab`، والمعرّفات والأزمنة من الخلفية،
 * والحالة الأولى `open` — فالمسودّة تحمل ما رآه المستخدم وحده.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`. والمعرّفات والزمن تُمرَّر فيبقى البناء قابلًا للاختبار.
 */

import {
  asNodeId,
  cssToImage,
  type AnnotationColor,
  type NoteNode,
  type NoteTag,
  type PinNode,
  type Scene,
} from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { devicePoint, type DeviceRect } from '@/shared/geometry'
import {
  ISSUE_SCHEMA_VERSION,
  type IssueDraft,
  type IssueDraftInput,
  type IssuePage,
  type IssueRecord,
} from '@/shared/issue-schema'

/** الرابط بلا جزء `#`: التجزئة تتبدّل بالتمرير والتبويبات، ولا تغيّر الصفحة المفحوصة. */
export function stripHash(url: string): string {
  const at = url.indexOf('#')
  return at === -1 ? url : url.slice(0, at)
}

/** الأصل والمسار من رابط التبويب — `null` لما لا يُفهم رابطًا. */
export function pageKeyOf(url: string): { origin: string; path: string } | null {
  try {
    const parsed = new URL(url)
    return { origin: parsed.origin, path: parsed.pathname }
  } catch {
    return null
  }
}

/** حدّا المخطّط (`IssueSchema`) — ما جاوزهما يُقصّ هنا، وإلا كُتب سجلٌّ لا تقرؤه لوحته (المراجعة المستقلّة). */
const MAX_URL = 4096
const MAX_TITLE = 1024

export function pageOf(
  tab: { url: string; title: string },
  draft: Pick<IssueDraft, 'viewport' | 'shot'>,
): IssuePage | null {
  const key = pageKeyOf(tab.url)
  if (!key) return null
  const url = stripHash(tab.url)
  // رابطٌ باستعلامٍ فوق الحدّ يُكتب أصلًا ومسارًا: هما مفتاح الصفحة، والاستعلام لا يغيّرها.
  const fallback = `${key.origin}${key.path}`
  return {
    url: url.length <= MAX_URL ? url : fallback.slice(0, MAX_URL),
    origin: key.origin.slice(0, 1024),
    path: key.path.slice(0, MAX_URL),
    title: tab.title.slice(0, MAX_TITLE),
    viewport: { width: draft.viewport.width, height: draft.viewport.height, dpr: draft.shot.dpr },
  }
}

export interface BuildIds {
  readonly issueId: string
  readonly captureId: string
  /** `null` حين لم يُطلب إنشاء ملاحظة. */
  readonly noteId: string | null
}

/** هامش لقطة الدليل حول العنصر — «مقتطع حول العنصر» كما في `library / issue-detail`. */
export const EVIDENCE_MARGIN_CSS = 24

/**
 * ما يُلتقط دليلًا: العنصر وحوله هامش، مقصوصًا إلى النافذة — بفضاء الجهاز.
 *
 * يُحسب في الخلفية لا في الصفحة: الطبقة تبلّغ مستطيل العنصر والنافذة، والخلفية تقرّر ما حولهما.
 */
export function evidenceRect(
  element: DeviceRect,
  viewport: { readonly width: number; readonly height: number },
  dpr: number,
): DeviceRect {
  const margin = EVIDENCE_MARGIN_CSS * dpr
  const x = Math.max(0, Math.floor(element.x - margin))
  const y = Math.max(0, Math.floor(element.y - margin))
  const right = Math.min(
    Math.round(viewport.width * dpr),
    Math.ceil(element.x + element.width + margin),
  )
  const bottom = Math.min(
    Math.round(viewport.height * dpr),
    Math.ceil(element.y + element.height + margin),
  )
  return { space: 'device', x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
}

/** المسودّة كاملةً: ما أرسلته الطبقة ومستطيل اللقطة محسوبًا هنا. */
export function completeDraft(input: IssueDraftInput): IssueDraft {
  return {
    ...input,
    shot: { ...input.shot, rect: evidenceRect(input.shot.element, input.viewport, input.shot.dpr) },
  }
}

/** موضع العنصر داخل لقطة الدليل ببكسل الصورة — ما ترسم المكتبة حوله إطارًا. */
export function cropOf(draft: Pick<IssueDraft, 'shot'>): IssueRecord['evidence']['crop'] {
  const { rect, element } = draft.shot
  // تقاطع العنصر مع اللقطة لا العنصر كلّه: ما خرج منها لا يُرسم إطارٌ حوله.
  const x0 = Math.max(element.x, rect.x)
  const y0 = Math.max(element.y, rect.y)
  const x1 = Math.min(element.x + element.width, rect.x + rect.width)
  const y1 = Math.min(element.y + element.height, rect.y + rect.height)
  return {
    x: Math.min(x0, x1) - rect.x,
    y: Math.min(y0, y1) - rect.y,
    width: Math.max(0, x1 - x0),
    height: Math.max(0, y1 - y0),
  }
}

export function buildIssue(
  draft: IssueDraft,
  page: IssuePage,
  ids: BuildIds,
  at: number,
): IssueRecord {
  return {
    id: ids.issueId,
    schemaVersion: ISSUE_SCHEMA_VERSION,
    projectId: draft.projectId,
    createdAt: at,
    updatedAt: at,
    page,
    element: draft.element,
    pair: draft.pair,
    check: draft.check,
    status: 'open',
    lastCheck: null,
    history: [{ kind: 'created', at, status: 'open', observed: draft.check.actual }],
    evidence: { captureId: ids.captureId, snapshot: draft.snapshot, crop: cropOf(draft) },
    note: ids.noteId ? { captureId: ids.captureId, noteId: ids.noteId } : null,
    title: draft.title.trim(),
    body: draft.body,
    steps: draft.steps.map((s) => s.trim()).filter(Boolean),
  }
}

/** إعدادات التعليق التي يرسم بها المحرّر — تُقرأ من إعدادات المستخدم لا تُخترع هنا. */
export interface NoteStyle {
  readonly colorToken: AnnotationColor
  readonly strokeWidthCss: number
  readonly fontSizeCss: number
  readonly pinShape: Scene['meta']['pinShape']
  readonly pinStart: number
}

/** أرقام المحرّر نفسها (`pages/editor/tools.ts`) — عرض الملاحظة وحشوتها ونصف قطر الدبّوس. */
const NOTE_WIDTH_CSS = 240
const NOTE_PADDING_CSS = 12
const PIN_RADIUS_CSS = 13

const SPACING_PROPS =
  /^(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height)/
const TYPE_PROPS = /^(font|line-height|letter-spacing|word-spacing|text-)/

/** وسم الملاحظة من نوع الفحص — «المسافات» للمسافة والحشوة، و«الخطّ» لخصائص النصّ. */
export function noteTagOf(check: IssueDraft['check']): NoteTag | null {
  if (check.kind === 'spacing') return 'spacing'
  if (check.kind !== 'style') return null
  if (SPACING_PROPS.test(check.property)) return 'spacing'
  if (TYPE_PROPS.test(check.property)) return 'type'
  return null
}

/**
 * مشهد اللقطة الجديدة بدبّوسٍ على العنصر وملاحظةٍ مربوطة به.
 *
 * الدبّوس عند زاوية العنصر العليا، والملاحظة بجواره داخل حدود الصورة — نفس عُقد المحرّر بأرقامه، فيفتحها
 * المستخدم ويحرّرها كأي ملاحظة كتبها بيده. والنصّ عنوان المشكلة ونصّها.
 */
export function noteScene(
  draft: IssueDraft,
  image: { width: number; height: number },
  ids: { captureId: string; noteId: string; pinId: string },
  style: NoteStyle,
): Scene {
  const dpr = draft.shot.dpr
  const crop = cropOf(draft)
  const stroke = {
    colorToken: style.colorToken,
    widthPx: cssToImage(style.strokeWidthCss, dpr),
    dash: [],
    opacity: 1,
  }
  const base = { locked: false, rotation: 0, hidden: false, stroke } as const
  const radius = cssToImage(PIN_RADIUS_CSS, dpr)
  const width = Math.min(
    cssToImage(NOTE_WIDTH_CSS, dpr),
    Math.max(image.width - radius * 2, radius),
  )

  const pin: PinNode = {
    ...base,
    id: asNodeId(ids.pinId),
    kind: 'pin',
    at: devicePoint(
      Math.min(crop.x + radius, image.width),
      Math.min(crop.y + radius, image.height),
    ),
    shape: style.pinShape,
    ordinal: style.pinStart,
    noteId: asNodeId(ids.noteId),
    radiusPx: radius,
  }
  const note: NoteNode = {
    ...base,
    id: asNodeId(ids.noteId),
    kind: 'note',
    at: devicePoint(
      Math.max(0, Math.min(crop.x + radius * 2, image.width - width)),
      Math.max(0, Math.min(crop.y, image.height - radius * 2)),
    ),
    widthPx: width,
    title: draft.title.trim(),
    body: draft.body,
    tag: noteTagOf(draft.check),
    font: {
      family: 'ui',
      sizePx: cssToImage(style.fontSizeCss, dpr),
      weight: 400,
      letterSpacingPx: 0,
    },
    paddingPx: cssToImage(NOTE_PADDING_CSS, dpr),
    pinId: asNodeId(ids.pinId),
  }

  const scene = emptyScene({
    captureId: ids.captureId,
    width: image.width,
    height: image.height,
    dpr,
    pinStart: style.pinStart,
    pinShape: style.pinShape,
  })
  return { ...scene, nodes: [pin, note] }
}
