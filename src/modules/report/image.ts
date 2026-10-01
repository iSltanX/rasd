/**
 * **صورة البلاغ** — القصّ والحجب يُخبزان في بيانات الصورة قبل الإرسال، من البوّابة الواحدة (`editor/bake.ts`،
 * [ADR 0015](../../../Docs/ADR/0015-redaction-single-exit.md)) لا من ترميزٍ ثانٍ هنا.
 *
 * - **الحجب تغطيةٌ مصمتة وحدها** (`cover`): النمط الوحيد الذي يُوعَد بعدم عكسه (ADR 0015 §1). لا بكسلة ولا ضبابي
 *   في البلاغ — من يحجب شيئًا قبل أن يرسله إلى جهةٍ أخرى يريد أن يزول، لا أن يُموَّه.
 * - **إعادة الترميز إلزامية** ولو بلا قصّ ولا حجب: ملفّ PNG جديد من بكسلات خام، فلا EXIF ولا GPS ولا مقطع نصّي
 *   يخرج من صورةٍ أرفقها المستخدم من جهازه (عقد القناة: «يعيد التطبيق ترميزها قبل المعاينة»).
 * - **والمصغَّر يُخبز كذلك:** صورةٌ أكبر من سقف العقد تُصغَّر قبل الخبز، والمستطيلات تُضرب في المقياس نفسه.
 *
 * منطقٌ بلا `chrome.*` ولا قماش: السطح والشرائح تُحقن، فيُختبر الخبز بايتًا ببايت بسطحٍ مزيّف.
 */

import {
  bake,
  type BakeReport,
  type BakeSlice,
  type BakeSurface,
  type ExportBytes,
} from '@/modules/editor/bake'
import { applyOps } from '@/modules/editor/redact'
import { asNodeId, type RedactNode, type Scene } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { createTextLayoutCache } from '@/modules/editor/text-layout'
import { deviceRect, type DeviceRect } from '@/shared/geometry'
import { type Result } from '@/shared/result'
import { ANNOTATION_COLORS } from '@/shared/settings/schema'

import type { RenderStyle } from '@/modules/editor/renderer'

/** أطول ضلعٍ يُرسَل — لقطة شاشة كاملة بكثافة 2 تسعها، وPNG بهذا الضلع غالبًا دون ثلاثة ميغابايت. */
export const MAX_SIDE = 2560

/** درجات التصغير حين يتجاوز المخبوز سقف العقد — من الأوضح إلى الأصغر. */
export const FALLBACK_SIDES = [2560, 1920, 1440, 1080, 800] as const

export interface ReportImageEdit {
  /** مقاس الصورة العاملة (بعد تصغير الاستيراد). */
  readonly width: number
  readonly height: number
  /** القصّ بفضاء الصورة العاملة، أو `null` للصورة كاملة. */
  readonly crop: DeviceRect | null
  /** مناطق الحجب بفضاء الصورة العاملة. */
  readonly redactions: readonly DeviceRect[]
}

/** مقاسٌ يسع ضلعه الأطول `side` بنسبته — بلا تكبير. */
export function fitWithin(
  width: number,
  height: number,
  side: number,
): { width: number; height: number; scale: number } {
  const scale = Math.min(1, side / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

/** مستطيلٌ مضروبٌ في مقياس، مقرَّبٌ إلى الخارج فلا يضيق الحجب بالتقريب. */
export function scaleRect(r: DeviceRect, scale: number): DeviceRect {
  const x = Math.floor(r.x * scale)
  const y = Math.floor(r.y * scale)
  return deviceRect(
    x,
    y,
    Math.ceil((r.x + r.width) * scale) - x,
    Math.ceil((r.y + r.height) * scale) - y,
  )
}

/**
 * لون الغطاء — أسود مصمت؛ والخبز يفرض `alpha = 255` على التغطية مهما كان (ADR 0015 §1). **بكسلاتٌ تُخبز في ملفٍّ
 * يغادر الجهاز لا لون واجهة:** ثابتٌ لا يتبع السمة، فلا يصير الحجب رماديًّا فاتحًا في الوضع الفاتح.
 */
const COVER = '#000000' /* rasd-allow-literal */

const STYLE: RenderStyle = {
  palette: Object.fromEntries(ANNOTATION_COLORS.map((c) => [c, COVER])) as RenderStyle['palette'],
  selectionHex: COVER,
  handleHex: COVER,
  redactOutlineHex: COVER,
  textFamily: '',
  monoFamily: '',
}

const LAYOUT = createTextLayoutCache(() => 0)

/** المشهد الذي يُخبز: الصورة بمقاسها، والقصّ، وعقدة تغطيةٍ لكل منطقة حجب. */
export function reportScene(edit: ReportImageEdit): Scene {
  const base = emptyScene({ captureId: 'report', width: edit.width, height: edit.height, dpr: 1 })
  const nodes: RedactNode[] = edit.redactions.map((rect, i) => ({
    kind: 'redact',
    id: asNodeId(`report-redact-${i}`),
    locked: false,
    rotation: 0,
    stroke: { colorToken: 'status/danger/solid', widthPx: 0, dash: [], opacity: 1 },
    rect,
    mode: 'cover',
    strength: 0,
    coverToken: 'status/danger/solid',
  }))
  return { ...base, meta: { ...base.meta, crop: edit.crop }, nodes }
}

export interface ReportBakeInput {
  readonly edit: ReportImageEdit
  readonly surface: BakeSurface
  readonly sliceSource: (rect: DeviceRect) => Promise<BakeSlice>
  readonly signal?: { readonly aborted: boolean }
}

/** يخبز صورة البلاغ PNG — الحجب مدمَّرٌ في البكسلات، والقصّ نافذة التصدير. */
export function bakeReportImage(
  input: ReportBakeInput,
): Promise<Result<{ blob: ExportBytes; report: BakeReport }>> {
  return bake({
    scene: reportScene(input.edit),
    scale: 1,
    format: 'png',
    quality: null,
    stripMetadata: false,
    surface: input.surface,
    style: STYLE,
    paletteMode: 'dark',
    layout: LAYOUT,
    sliceSource: input.sliceSource,
    // على الخيط الرئيسي: مناطق تغطيةٍ قليلة في صورةٍ واحدة، والدالّة نفسها التي ينفّذها خيط المحرّر.
    runPixels: (buffer, width, height, ops) => {
      const data = new Uint8ClampedArray(buffer)
      applyOps({ data, width, height }, ops)
      return Promise.resolve(data.buffer)
    },
    ...(input.signal ? { signal: input.signal } : {}),
  })
}
