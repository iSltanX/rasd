import { formatUnit } from '@/shared/bidi'

import { box, type Rect } from './geometry'

import type { JSX } from 'preact'

export interface DimensionProps {
  /**
   * المسطرة الأفقية: `x` و`y` بداية الخطّ و`width` طوله. `height` يُتجاهل —
   * ارتفاع المكوّن ثابت من التصميم.
   */
  rect: Rect
  /** القيمة المعروضة. الافتراضي عرض المستطيل نفسه. */
  value?: number
  unit?: string
}

/**
 * `Overlay / Dimension` — مسطرة قياس أفقية بطرفين وشارة قيمة في الوسط.
 */
export function Dimension({ rect, value, unit = 'px' }: DimensionProps): JSX.Element {
  return (
    <div class="rasd-ov-place rasd-ov-dim" style={box(rect)} data-rasd-ov="dimension">
      <span class="rasd-ov-dim-cap rasd-ov-dim-cap-a" />
      <span class="rasd-ov-dim-cap rasd-ov-dim-cap-b" />
      <span class="rasd-ov-badge rasd-ov-dim-value">
        {formatUnit(Math.round(value ?? rect.width), unit)}
      </span>
    </div>
  )
}
