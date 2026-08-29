import { formatUnit } from '@/shared/bidi'

import { box, type Rect } from './geometry'

import type { JSX } from 'preact'

export interface DimensionVerticalProps {
  /** المسطرة الرأسية: `y` بداية الخطّ و`height` طوله. `width` يُتجاهل. */
  rect: Rect
  value?: number
  unit?: string
}

/**
 * `Overlay / Dimension · Vertical` — مكوّن مستقلّ لا نسخة مُدارة من الأفقي.
 *
 * السبب منصوص في وصف المكوّن في Figma: تدوير المسطرة الأفقية يقلب شارة
 * القيمة معها فتصير غير مقروءة. الشارة هنا تبقى أفقية دائمًا، إلى جانب
 * الخطّ لا فوقه.
 */
export function DimensionVertical({
  rect,
  value,
  unit = 'px',
}: DimensionVerticalProps): JSX.Element {
  return (
    <div class="rasd-ov-place rasd-ov-dimv" style={box(rect)} data-rasd-ov="dimension-vertical">
      <span class="rasd-ov-dimv-cap rasd-ov-dimv-cap-a" />
      <span class="rasd-ov-dimv-cap rasd-ov-dimv-cap-b" />
      <span class="rasd-ov-badge rasd-ov-dimv-value">
        {formatUnit(Math.round(value ?? rect.height), unit)}
      </span>
    </div>
  )
}
