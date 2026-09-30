/**
 * صورة الفرق شريحةً شريحة — للتقرير ولـ«التقط الفرق».
 *
 * **لا قماش بحجم الصورة كلّها:** الخبز يطلب شرائحه (`bake.ts`، ذروته السطح وشريحة واحدة)، وهذا المصدر
 * يركّب كل شريحة حين تُطلب: اللقطة الحالية باهتةً رماديةً، فوقها خريطة الفرق من صفوفها وحدها، فوقهما
 * المستطيلات بأرقامها. فلا تُضاف إلى ذروة الصفحة صورةٌ ثالثة بحجم اللقطة.
 *
 * **والتركيب كما يراه المستخدم في «فرق البكسل»** (`DiffView.tsx`): الأساس «بعد» مخفَّف اللون، والفرق فوقه
 * بلونَي الإضافة والإزالة كما حسبهما المحرّك، والمناطق المختلفة بإطار `tool/compare/fg`، والمستثناة بقناع
 * `overlay/mask` وحدٍّ متقطّع بلون التحذير — ألوان الورقة الفاتحة لا سمة من صدّر.
 */

import { resolveColor } from '@/tokens/tokens'

import type { ReportMarks } from './report'
import type { RasterImage } from '@/modules/compare/diff'
import type { BakeSlice } from '@/modules/editor/bake'
import type { DeviceRect } from '@/shared/geometry'

const PAPER = resolveColor('surface/default', 'light')
const REGION = resolveColor('tool/compare/fg', 'light')
const ZONE_EDGE = resolveColor('status/warning/fg', 'light')
const ZONE_FILL = resolveColor('overlay/mask', 'light')
const LABEL_FILL = resolveColor('status/warning/surface', 'light')
const LABEL_INK = resolveColor('text/on-brand', 'light')

export interface DiffComposite {
  /** بايتات اللقطة الحالية — الأساس. */
  readonly base: Blob
  readonly width: number
  readonly height: number
  /** خريطة الفرق بحجم التقاطع، من أعلى اليسار. */
  readonly diff: RasterImage
  readonly marks: ReportMarks
}

/** سُمك الإطار ونصّ الرقم بنسبة عرض الصورة — لقطةٌ عرضها 2880 تحتاج إطارًا يُرى مصغَّرًا في الورقة. */
export function markScale(width: number): { readonly line: number; readonly font: number } {
  const unit = Math.max(1, width / 720)
  return { line: Math.round(2 * unit), font: Math.round(12 * unit) }
}

type Ctx = OffscreenCanvasRenderingContext2D

function label(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  fill: string,
  ink: string,
  font: number,
) {
  ctx.font = `700 ${font}px ${'Cairo, system-ui, sans-serif'}`
  const pad = font * 0.4
  const w = ctx.measureText(text).width + pad * 2
  const h = font * 1.5
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.direction = 'rtl'
  ctx.fillText(text, x + w / 2, y + h / 2)
}

/** مصدر شرائح للخبز (`bakeRaster`) — كل شريحة تُركَّب لحظة طلبها وتُغلَق بعد رسمها. */
export function compositeSliceSource(c: DiffComposite): (rect: DeviceRect) => Promise<BakeSlice> {
  const scale = markScale(c.width)
  return async (rect) => {
    const canvas = new OffscreenCanvas(rect.width, rect.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('تعذّر تجهيز شريحة صورة الفرق')

    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, rect.width, rect.height)

    // ١. الأساس باهتًا رماديًّا — يبقى مقروءًا ويبرز الفرق فوقه.
    const baseRows = Math.min(rect.height, c.height - rect.y)
    if (baseRows > 0) {
      const base = await createImageBitmap(c.base, rect.x, rect.y, rect.width, baseRows)
      ctx.save()
      ctx.filter = 'grayscale(1)'
      ctx.globalAlpha = 0.45
      ctx.drawImage(base, 0, 0)
      ctx.restore()
      base.close()
    }

    // ٢. خريطة الفرق — صفوف الشريحة وحدها من مخزن التقاطع.
    const top = Math.max(rect.y, 0)
    const bottom = Math.min(rect.y + rect.height, c.diff.height)
    if (bottom > top && c.diff.width > 0) {
      const from = top * c.diff.width * 4
      const to = bottom * c.diff.width * 4
      const rows = new ImageData(
        new Uint8ClampedArray(c.diff.data.subarray(from, to)),
        c.diff.width,
        bottom - top,
      )
      const overlay = await createImageBitmap(rows)
      ctx.drawImage(overlay, -rect.x, top - rect.y)
      overlay.close()
    }

    // ٣. المستطيلات بأرقامها — بإحداثيات الصورة، مزاحةً إلى الشريحة. ما يعبر حدّ شريحتين يُرسم في كلتيهما
    // بالهندسة نفسها فيلتقي.
    ctx.save()
    ctx.translate(-rect.x, -rect.y)
    ctx.lineWidth = scale.line
    for (const zone of c.marks.zones) {
      ctx.fillStyle = ZONE_FILL
      ctx.fillRect(zone.rect.x, zone.rect.y, zone.rect.width, zone.rect.height)
      ctx.strokeStyle = ZONE_EDGE
      ctx.setLineDash([scale.line * 3, scale.line * 2])
      ctx.strokeRect(zone.rect.x, zone.rect.y, zone.rect.width, zone.rect.height)
      label(ctx, zone.label, zone.rect.x, zone.rect.y, LABEL_FILL, ZONE_EDGE, scale.font)
    }
    ctx.setLineDash([])
    for (const region of c.marks.regions) {
      ctx.strokeStyle = REGION
      ctx.strokeRect(region.rect.x, region.rect.y, region.rect.width, region.rect.height)
      label(ctx, region.label, region.rect.x, region.rect.y, REGION, LABEL_INK, scale.font)
    }
    ctx.restore()

    return {
      image: canvas,
      width: rect.width,
      height: rect.height,
      close: () => {
        canvas.width = 0
        canvas.height = 0
      },
    }
  }
}
