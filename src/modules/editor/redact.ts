/**
 * الحجب — تحويل عقد المشهد إلى عمليات بكسل، وتنفيذها.
 *
 * **هنا مكانٌ واحد للتحويل، وهذا هو الأمن نفسه.** إحداثيات المشهد بفضاء
 * الصورة؛ والمخزن المستهدَف نافذةُ اقتصاص مضروبة بمقياس التصدير. ولو حُوِّل
 * مرّتين — مرّة في المعاينة ومرّة في الخبز — لكفى اختلافُ سطر واحد أن يقع
 * الغطاء في مكان غير الذي رآه المستخدم. وذلك تسريبٌ **لا يراه فحص التباين**:
 * الفحص يقرأ المستطيل الذي رسمه هو، فيجده مسطّحًا ويقول «مضمون».
 *
 * **والشدّة تُضرب بالمقياس كذلك.** تصديرٌ بمقياس 2 يضاعف كل بُعد؛ وσ يبقى
 * كما هو يعطي ضبابًا نصفَ ما رآه المستخدم بالنسبة إلى الصورة. الشدّة قياسٌ
 * مكانيّ لا رقمٌ مجرَّد.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import {
  blurRegion,
  clampToBuffer,
  coverRegion,
  pixelateRegion,
  bleedMargin,
  type PixelBuffer,
  type PixelRect,
} from './pixel-ops'
import { isIrreversible, type AnnotationColor, type RedactNode, type Scene } from './scene'

import type { ObscureOp } from './blur-protocol'
import type { DeviceRect } from '@/shared/geometry'

/** كيف يُطابَق فضاء المشهد على فضاء المخزن. */
export interface RedactTransform {
  /** نافذة التصدير بفضاء الصورة؛ `null` يعني الصورة كاملة. */
  readonly crop: DeviceRect | null
  /** 1 للمعاينة وللتصدير الأصلي، 2 للتصدير المضاعَف. */
  readonly scale: number
}

/** الهوية — المعاينة على دقّة الصورة بلا اقتصاص. */
export const IDENTITY_TRANSFORM: RedactTransform = { crop: null, scale: 1 }

/** يحلّ توكن لون التغطية إلى قنوات. اللوحة تصل محلولةً من طبقة الصفحة. */
function coverChannels(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.trim().replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0, a: 255 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 }
}

/** يبني عملية بكسل من عقدة حجب. */
export function opForNode(
  node: RedactNode,
  t: RedactTransform,
  palette: Readonly<Record<AnnotationColor, string>>,
): ObscureOp {
  const ox = t.crop?.x ?? 0
  const oy = t.crop?.y ?? 0
  return {
    rect: {
      x: (node.rect.x - ox) * t.scale,
      y: (node.rect.y - oy) * t.scale,
      w: node.rect.width * t.scale,
      h: node.rect.height * t.scale,
    },
    mode: node.mode,
    strength: node.strength * t.scale,
    cover: coverChannels(palette[node.coverToken]),
  }
}

/** كل عمليات الحجب في المشهد، **بترتيب الرسم**. */
export function redactOps(
  scene: Scene,
  t: RedactTransform,
  palette: Readonly<Record<AnnotationColor, string>>,
): readonly ObscureOp[] {
  const out: ObscureOp[] = []
  for (const node of scene.nodes) {
    if (node.kind === 'redact') out.push(opForNode(node, t, palette))
  }
  return out
}

/**
 * المستطيل الذي **يجب أن يُقرأ** لتنفيذ عملية — الوجهة زائدَ الهامش.
 *
 * `null` حين لا يتقاطع مع المخزن أصلًا. والفرق بينه وبين `op.rect` هو ما
 * يمنع الهالة عند حدّ منطقة الضباب.
 */
export function sampleRect(op: ObscureOp, width: number, height: number): PixelRect | null {
  const m = bleedMargin(op.mode, op.strength)
  return clampToBuffer(
    { x: op.rect.x - m, y: op.rect.y - m, w: op.rect.w + 2 * m, h: op.rect.h + 2 * m },
    width,
    height,
  )
}

/**
 * ينفّذ عملية واحدة على المخزن.
 *
 * **الدالّة الوحيدة التي تُترجم النمط إلى فعل.** الـworker والخيط الرئيسي
 * كلاهما يناديها، فالمسار المتزامن يُنتج البايتات نفسها لا مثيلها — والفرق
 * بين «نفسها» و«مثيلها» هو الفرق بين اختبارٍ تفاضلي يمرّ وآخر يفشل عشوائيًّا
 * بحسب أي المسارين عمل.
 */
export function applyOp(img: PixelBuffer, op: ObscureOp): void {
  switch (op.mode) {
    case 'cover':
      return coverRegion(img, op.rect, op.cover)
    case 'pixelate':
      return pixelateRegion(img, op.rect, op.strength)
    case 'blur':
      return blurRegion(img, op.rect, op.strength)
  }
}

/** ينفّذ عمليات بالترتيب. */
export function applyOps(img: PixelBuffer, ops: readonly ObscureOp[]): void {
  for (const op of ops) applyOp(img, op)
}

/**
 * ملخّص الحجب — يُكتب في سجلّ التعليقات ويُقرأ **بلا تحليل المشهد**.
 *
 * تقرؤه النافذة كي لا تعرض أصلًا غير محجوب، وتقرؤه مراحل التصدير والمشاركة.
 * وقراءته من حقلٍ مسطَّح لا من فكّ المشهد تجعل الحارس رخيصًا بما يكفي ليعمل
 * في كل مسار — والحارس الغالي هو الذي يُتخطّى.
 */
export function summariseRedaction(scene: Scene): {
  readonly total: number
  readonly irreversible: number
} {
  let total = 0
  let irreversible = 0
  for (const node of scene.nodes) {
    if (node.kind !== 'redact') continue
    total += 1
    if (isIrreversible(node.mode)) irreversible += 1
  }
  return { total, irreversible }
}

/** حدود الشدّة المعروضة، بالبكسل. */
export const BLUR_SIGMA_MIN = 1
export const BLUR_SIGMA_MAX = 40
export const PIXELATE_CELL_MIN = 2
export const PIXELATE_CELL_MAX = 64

/**
 * أدنى شدّة **فعّالة** لكل نمط.
 *
 * مقيس: أي σ دون 0.798 يعطي `d ≤ 1` في صيغة SVG، أي نافذة بكسل واحد، أي لا
 * شيء. وشريطٌ يبدأ من الصفر يمنح المستخدم مدًى كاملًا لا يفعل فيه شيء —
 * فيظنّ الأداة معطّلة لا الشدّة ضعيفة.
 */
export function clampStrength(mode: RedactNode['mode'], value: number): number {
  if (mode === 'blur') return Math.min(BLUR_SIGMA_MAX, Math.max(BLUR_SIGMA_MIN, value))
  if (mode === 'pixelate') {
    return Math.round(Math.min(PIXELATE_CELL_MAX, Math.max(PIXELATE_CELL_MIN, value)))
  }
  return 0
}

/** الشدّة الافتراضية عند تبديل النمط — لا يُنقل رقمٌ بين وحدتين مختلفتين. */
export function defaultStrength(mode: RedactNode['mode']): number {
  if (mode === 'blur') return 12
  if (mode === 'pixelate') return 12
  return 0
}
