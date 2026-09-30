/**
 * مناطق هذه الجلسة — مستطيلات يرسمها المستخدم فوق المسرح لتُستثنى من الحساب — منطق خالص لا DOM.
 *
 * **لقطتان بلا مرجع لا تملكان مكانًا تُحفَظ فيه المناطق** (المناطق الدائمة حقلٌ في المرجع)،
 * فتعيش هنا في حالة الصفحة وحدها وتزول بإغلاقها. لا تخزين ولا رسائل — وهذا الملفّ لا يعرف
 * شيئًا من ذلك عمدًا: قائمة وقيم، والصفحة هي التي تمسكها.
 *
 * **فضاء المستطيل بكسلُ الصورة لا بكسلُ الشاشة.** المسرح صندوق واحد بنسبة `stageSize()`، والمحرّك
 * يستثني بكسلات التقاطع المحاذى من الأعلى-اليسار — فالمستطيل يُخزَّن في ذلك الفضاء نفسه،
 * فيبقى صحيحًا مهما تغيّر المقاس المعروض للمسرح، ويمرّ إلى `computeDiff` كما هو.
 *
 * **التحويل من `left` لا من بداية القراءة.** `getBoundingClientRect()` فيزيائيّ بصرف النظر عن
 * اتجاه الصفحة، وبكسلُ الصورة فيزيائي كذلك (نفس تعليل `layout.ts`): ففي صفحة RTL يبقى العمود 0
 * عند يسار الصندوق. اتجاه السحب نفسه (يمينًا أو يسارًا) لا أثر له — نقطتان تُرتَّبان.
 */

import { formatDimensions } from '@/shared/bidi'
import { formatHuman } from '@/shared/bidi/numerals'
import { deviceRect, type DeviceRect } from '@/shared/geometry'

import type { PixelRect, PixelSize } from './layout'

export interface SessionZone {
  /** معرّف يتزايد — لا يُعاد استعماله ما دامت في القائمة منطقةٌ أحدث. رقم العرض هو الفهرس + 1 لا هذا. */
  readonly id: number
  readonly rect: DeviceRect
}

/** نقطة بإحداثيات نافذة (`clientX`/`clientY`). */
export interface ClientPoint {
  readonly x: number
  readonly y: number
}

/** ما نقرؤه من `getBoundingClientRect()` — الحقول الأربعة الفيزيائية وحدها، فيقبله `DOMRect` مباشرةً. */
export interface ClientBox {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** أصغر سحبةٍ تُعدّ مستطيلًا — أدنى منها نقرةٌ عابرة لا رسمٌ مقصود. بالبكسل **الصورة** لا الشاشة. */
export const MIN_ZONE_PX = 2

export function addZone(zones: readonly SessionZone[], rect: DeviceRect): readonly SessionZone[] {
  const id = zones.reduce((max, zone) => Math.max(max, zone.id), 0) + 1
  return [...zones, { id, rect }]
}

export function removeZone(zones: readonly SessionZone[], id: number): readonly SessionZone[] {
  return zones.filter((zone) => zone.id !== id)
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * حدود السحبة بكسلات صورة **كسريّة**، مقصوصة إلى المسرح — للمعاينة الحيّة وأساسًا لـ`dragToImageRect`.
 * `null` حين الصندوق أو المسرح بلا مساحة أو النقاط غير منتهية: لا قسمة على صفر ولا `NaN` في المخزن.
 */
export function dragToImageBounds(
  start: ClientPoint,
  end: ClientPoint,
  box: ClientBox,
  stage: PixelSize,
): PixelRect | null {
  const numbers = [start.x, start.y, end.x, end.y, box.left, box.top, box.width, box.height]
  if (!numbers.every(Number.isFinite)) return null
  if (box.width <= 0 || box.height <= 0 || stage.width <= 0 || stage.height <= 0) return null

  const toX = (clientX: number): number =>
    clamp(((clientX - box.left) / box.width) * stage.width, 0, stage.width)
  const toY = (clientY: number): number =>
    clamp(((clientY - box.top) / box.height) * stage.height, 0, stage.height)

  const x0 = Math.min(toX(start.x), toX(end.x))
  const x1 = Math.max(toX(start.x), toX(end.x))
  const y0 = Math.min(toY(start.y), toY(end.y))
  const y1 = Math.max(toY(start.y), toY(end.y))
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * سحبةٌ بين نقطتين فوق صندوق المسرح ⟵ مستطيل صحيح بكسلات الصورة.
 *
 * البداية `floor` والنهاية `ceil`: التقريب **إلى الخارج** كي لا يبقى بكسلٌ مَسَّه المستخدم
 * خارج ما استثناه. والحدّ الأدنى يُقاس على السحبة نفسها (بعد القصّ إلى المسرح، قبل التقريب) —
 * سحبةٌ بعرض 0.5 بكسل تعبر حدّ بكسلين لا تصير مستطيلًا من بكسلين.
 */
export function dragToImageRect(
  start: ClientPoint,
  end: ClientPoint,
  box: ClientBox,
  stage: PixelSize,
): DeviceRect | null {
  const bounds = dragToImageBounds(start, end, box, stage)
  if (!bounds) return null
  if (bounds.width < MIN_ZONE_PX || bounds.height < MIN_ZONE_PX) return null

  const x = Math.floor(bounds.x)
  const y = Math.floor(bounds.y)
  const right = Math.min(stage.width, Math.ceil(bounds.x + bounds.width))
  const bottom = Math.min(stage.height, Math.ceil(bounds.y + bounds.height))
  return deviceRect(x, y, right - x, bottom - y)
}

/** «١ · غير محفوظة» — رقم العرض هنديٌّ (عدٌّ بشري: «المنطقة الأولى»)، والفهرس صفريّ. */
export function zoneChipLabel(index: number): string {
  return `${formatHuman(index + 1)} · غير محفوظة`
}

/** أبعاد المستطيل `W × H` — قياسٌ غربي؛ يُعزَل `<bdi dir="ltr">` عند العرض. */
export function zoneDimensions(rect: DeviceRect): string {
  return formatDimensions(rect.width, rect.height)
}
