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
import { devicePoint } from '@/shared/geometry'
import {
  ISSUE_SCHEMA_VERSION,
  type IssueDraft,
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

export function pageOf(
  tab: { url: string; title: string },
  draft: Pick<IssueDraft, 'viewport' | 'shot'>,
): IssuePage | null {
  const key = pageKeyOf(tab.url)
  if (!key) return null
  return {
    url: stripHash(tab.url),
    origin: key.origin,
    path: key.path,
    title: tab.title,
    viewport: { width: draft.viewport.width, height: draft.viewport.height, dpr: draft.shot.dpr },
  }
}

export interface BuildIds {
  readonly issueId: string
  readonly captureId: string
  /** `null` حين لم يُطلب إنشاء ملاحظة. */
  readonly noteId: string | null
}

/** موضع العنصر داخل لقطة الدليل ببكسل الصورة — ما ترسم المكتبة حوله إطارًا. */
export function cropOf(draft: Pick<IssueDraft, 'shot'>): IssueRecord['evidence']['crop'] {
  const { rect, element } = draft.shot
  const x = Math.max(0, element.x - rect.x)
  const y = Math.max(0, element.y - rect.y)
  return {
    x,
    y,
    width: Math.max(0, Math.min(element.width, rect.width - x)),
    height: Math.max(0, Math.min(element.height, rect.height - y)),
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
    at: devicePoint(Math.max(0, Math.min(crop.x + radius * 2, image.width - width)), crop.y),
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
