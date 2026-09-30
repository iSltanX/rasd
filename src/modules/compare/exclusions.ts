/**
 * المناطق المستثناة — التحويل والحلّ والاقتراح (ADR 0034). منطقٌ خالص: لا DOM ولا `chrome.*`.
 *
 * **فضاءٌ واحد للتخزين والقناع:** بكسل صورة المرجع، وهو بكسل الجهاز الذي يعدّه `computeDiff` محاذًى من
 * الزاوية العليا اليسرى. فمستطيلٌ يُرسم فوق المرجع يُعاد إليه بمعكوس تحويل الطبقة (`viewportToReference`)،
 * وعنصرٌ يُختار من الصفحة يُقاس بمستطيله الحيّ مضروبًا في نسبة البكسل — وهو موضعه في لقطة الصفحة التي
 * يقارنها الفرق الحيّ بالمرجع.
 *
 * القصّ على التقاطع ليس هنا: `applyExclusions` في `diff.ts` يقصّ ما يصله، فلا تحتاج المنطقة أن تعرف مقاس
 * الصورة التي ستُقارَن.
 */

import {
  deviceRect,
  referencePoint,
  viewportPoint,
  viewportRect,
  type DeviceRect,
  type ViewportPoint,
  type ViewportRect,
} from '@/shared/geometry'

import { referenceToViewport, viewportToReference, type OverlayTransform } from './overlay'

import type { RefindVerdict } from '@/modules/dom-picker/identity'
import type { ElementAnchor, ExclusionAnchor, ExclusionZone } from '@/shared/exclusion-schema'

/** صندوقٌ يحيط بنقاط — الزوايا الأربع لا اثنتان: التحويل قد يدور، فالمستطيل لا يبقى مستطيلًا محاذيًا. */
function bounds(points: readonly { x: number; y: number }[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/**
 * مستطيلٌ سُحب على الشاشة (زاويتان بفضاء النافذة) ← بكسل المرجع.
 *
 * يُوسَّع إلى البكسلات الصحيحة التي يمسّها — منطقةٌ أصغر ممّا رسمه المستخدم بكسرٍ تترك حافّة الساعة تُعدّ.
 */
export function drawnRectToReference(
  a: ViewportPoint,
  b: ViewportPoint,
  t: OverlayTransform,
): DeviceRect {
  const corners = [a, b, viewportPoint(a.x, b.y), viewportPoint(b.x, a.y)]
  const { x0, y0, x1, y1 } = bounds(corners.map((p) => viewportToReference(p, t)))
  const left = Math.floor(x0)
  const top = Math.floor(y0)
  return deviceRect(left, top, Math.ceil(x1) - left, Math.ceil(y1) - top)
}

/** المستطيل المخزَّن ← فضاء النافذة، لرسمه فوق المرجع حيث هو الآن. */
export function referenceRectToViewport(r: DeviceRect, t: OverlayTransform): ViewportRect {
  const corners = [
    referencePoint(r.x, r.y),
    referencePoint(r.x + r.width, r.y),
    referencePoint(r.x, r.y + r.height),
    referencePoint(r.x + r.width, r.y + r.height),
  ]
  const { x0, y0, x1, y1 } = bounds(corners.map((p) => referenceToViewport(p, t)))
  return viewportRect(x0, y0, x1 - x0, y1 - y0)
}

/** مستطيل منطقةٍ ساعة القياس، وهل سقطت إلى احتياطها. */
export interface ZoneResolution {
  readonly rect: DeviceRect
  readonly fallback: boolean
}

/**
 * يقرّر مستطيل منطقة العنصر من حكم إعادة العثور (ADR 0031).
 *
 * **`changed` مقبولة كـ`found`:** المحتوى المتجدّد يغيّر بصمة نصّه بطبعه — وهذا سبب استثنائه. أمّا الغائب
 * والملتبس والمحجوب فيسقط إلى المستطيل المحفوظ، ويُعلَم المستخدم بذلك.
 */
export function resolveElementZone(
  anchor: ElementAnchor,
  verdict: RefindVerdict['kind'],
  liveRect: DeviceRect | null,
): ZoneResolution {
  const located = verdict === 'found' || verdict === 'changed'
  return located && liveRect
    ? { rect: liveRect, fallback: false }
    : { rect: anchor.rect, fallback: true }
}

/**
 * مستطيلات القناع من القائمة المخزَّنة — تبنيها الخلفية.
 *
 * `live` مستطيلات العنصر كما وجدتها الطبقة الآن، **ويُقبل منها ما يخصّ منطقة عنصر في القائمة وحده**: الصفحة
 * لا تضيف منطقةً لم تُحفظ، ولا تنقل منطقة مستطيل. وما غاب عنها يسقط إلى مستطيله المحفوظ.
 */
export function exclusionRects(
  zones: readonly ExclusionZone[],
  live: Readonly<Record<string, DeviceRect>> = {},
): DeviceRect[] {
  return zones.map((zone) =>
    zone.anchor.kind === 'element' && Object.hasOwn(live, zone.id)
      ? (live[zone.id] as DeviceRect)
      : zone.anchor.rect,
  )
}

/**
 * مفتاح هوية منطقة العنصر للمقارنة بين المقاسات — المحدِّد وسلسلة المضيفين، لا البصمة: بصمة النصّ لعنصرٍ
 * متجدّد تختلف بين مرجعين التُقطا في وقتين، وهو العنصر نفسه.
 */
const elementKey = (a: ElementAnchor): string => JSON.stringify([a.hosts, a.selector])

/**
 * مناطق العنصر في مراجع المقاسات الأخرى للصفحة نفسها، وليست في هذا المرجع — اقتراحٌ لا كتابة.
 *
 * `rect` لا تُقترح: مستطيلٌ رُسم فوق صورة سطح المكتب لا معنى له فوق صورة الهاتف (ADR 0034 §3).
 */
export function suggestElementZones(
  current: readonly ExclusionZone[],
  siblings: readonly (readonly ExclusionZone[])[],
): ExclusionZone[] {
  const seen = new Set(
    current.flatMap((z) => (z.anchor.kind === 'element' ? [elementKey(z.anchor)] : [])),
  )
  const out: ExclusionZone[] = []
  for (const zone of siblings.flat()) {
    if (zone.anchor.kind !== 'element') continue
    const key = elementKey(zone.anchor)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(zone)
  }
  return out
}

/** منطقةٌ جديدة باسمٍ فارغ — الاسم يضعه المستخدم، والعرض يسقط إلى المحدِّد أو المقاس. */
export function newZone(anchor: ExclusionAnchor, id: string, now: number): ExclusionZone {
  return { id, label: null, createdAt: now, anchor }
}
