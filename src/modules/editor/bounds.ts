/**
 * صندوق الإحاطة لكل شكل — مادّة الترشيح والتحديد والمناطق المتّسخة.
 *
 * **الصندوق يشمل السمك والزينة، لا الهندسة وحدها.** خطٌّ من (0,0) إلى
 * (100,0) صندوقه الهندسي بلا ارتفاع، وصندوقه المرسوم بارتفاع السمك. وإعادة
 * رسم منطقة متسخة محسوبة على الهندسة وحدها تترك نصف الخطّ على الشاشة.
 *
 * **ومُذكَّر بـ`WeakMap` على العقدة.** العقد غير قابلة للتغيير بحكم النموذج،
 * فالعقدة نفسها مفتاح صالح ولا يحتاج إبطالًا: تعديلٌ يُنتج عقدة جديدة
 * فتُحسَب مرّة، والقديمة تُجمَع مع مدخلها. والتذكير هنا ليس ترفًا — اختبار
 * الإصابة يمرّ على كل العقد في **كل حركة مؤشِّر**.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { deviceRect, type DeviceRect } from '@/shared/geometry'

import type { SceneNode } from './scene'

/** يقيس صندوق عقدة نصّية — يُحقن لأن القياس يحتاج سياق رسم. */
export type MeasureBox = (node: SceneNode) => DeviceRect | null

const cache = new WeakMap<SceneNode, DeviceRect>()

function union(a: DeviceRect, b: DeviceRect): DeviceRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return deviceRect(
    x,
    y,
    Math.max(a.x + a.width, b.x + b.width) - x,
    Math.max(a.y + a.height, b.y + b.height) - y,
  )
}

function fromPoints(points: readonly number[]): DeviceRect {
  if (points.length < 2) return deviceRect(0, 0, 0, 0)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]!
    const y = points[i + 1]!
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return deviceRect(minX, minY, maxX - minX, maxY - minY)
}

function normalise(r: DeviceRect): DeviceRect {
  const x = r.width < 0 ? r.x + r.width : r.x
  const y = r.height < 0 ? r.y + r.height : r.y
  return deviceRect(x, y, Math.abs(r.width), Math.abs(r.height))
}

function pad(r: DeviceRect, by: number): DeviceRect {
  return deviceRect(r.x - by, r.y - by, r.width + by * 2, r.height + by * 2)
}

/**
 * صندوق الإحاطة **بعد الدوران**.
 *
 * يُحسب بتدوير الرؤوس الأربعة وأخذ اتّحادها: صندوقٌ محاذٍ للمحاور يحيط
 * بالشكل المدوَّر. وهو أوسع من الشكل نفسه — وهذا صحيح للترشيح وللإعادة
 * المتّسخة، والدقّة تأتي من `hitNode` بعده.
 */
function rotatedBounds(box: DeviceRect, rotation: number): DeviceRect {
  if (rotation === 0) return box
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const [px, py] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ] as const) {
    const dx = px - cx
    const dy = py - cy
    const x = cx + dx * cos - dy * sin
    const y = cy + dx * sin + dy * cos
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return deviceRect(minX, minY, maxX - minX, maxY - minY)
}

/** الهندسة الخام قبل السمك والدوران. */
function rawBounds(node: SceneNode, measure?: MeasureBox): DeviceRect {
  switch (node.kind) {
    case 'rect':
    case 'ellipse':
    case 'redact':
      return normalise(node.rect)
    case 'line':
    case 'arrow':
      return deviceRect(
        Math.min(node.a.x, node.b.x),
        Math.min(node.a.y, node.b.y),
        Math.abs(node.b.x - node.a.x),
        Math.abs(node.b.y - node.a.y),
      )
    case 'freehand':
      return fromPoints(node.points)
    case 'pin':
      return deviceRect(
        node.at.x - node.radiusPx,
        node.at.y - node.radiusPx,
        node.radiusPx * 2,
        node.radiusPx * 2,
      )
    case 'text': {
      const measured = measure?.(node)
      if (measured) return normalise(measured)
      /*
       * تقدير بلا قياس — يُستعمل قبل أن يجهز سياق الرسم، وفي الاختبار.
       * العرض يُقدَّر بنصف حجم الخطّ لكل محرف (نسبة معقولة للعربية
       * واللاتينية معًا)، والارتفاع بسطر واحد بمقدار 1.4 من الحجم.
       */
      const width =
        node.maxWidthPx > 0 ? node.maxWidthPx : node.text.length * node.font.sizePx * 0.5
      return deviceRect(node.at.x, node.at.y, width, node.font.sizePx * 1.4)
    }
    case 'note': {
      const measured = measure?.(node)
      if (measured) return normalise(measured)
      const lines = 2 + Math.ceil(node.body.length / 40)
      return deviceRect(
        node.at.x,
        node.at.y,
        node.widthPx,
        node.paddingPx * 2 + lines * node.font.sizePx * 1.4,
      )
    }
    case 'measure':
      return node.b ? union(normalise(node.a), normalise(node.b)) : normalise(node.a)
  }
}

/**
 * صندوق العقدة كما تُرسَم — بالسمك والدوران.
 *
 * `measure` يُمرَّر للعقد النصّية وحدها؛ وبدونه تُقدَّر أبعادها. والتذكير
 * يقع على النتيجة **غير المقيسة** فقط: نتيجة القياس تتغيّر بتغيّر الخطّ
 * المحمَّل، فلا تُخلَّد.
 */
export function nodeBounds(node: SceneNode, measure?: MeasureBox): DeviceRect {
  if (!measure) {
    const hit = cache.get(node)
    if (hit) return hit
  }

  const raw = rawBounds(node, measure)
  const half = node.stroke.widthPx / 2
  const padded = pad(raw, half)
  const result = rotatedBounds(padded, node.rotation)

  if (!measure) cache.set(node, result)
  return result
}

/** اتّحاد صناديق عدّة عقد — `null` حين لا عقدة. */
export function unionBounds(nodes: readonly SceneNode[], measure?: MeasureBox): DeviceRect | null {
  let acc: DeviceRect | null = null
  for (const node of nodes) {
    const box = nodeBounds(node, measure)
    acc = acc ? union(acc, box) : box
  }
  return acc
}
