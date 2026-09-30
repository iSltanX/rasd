import { at, type Point } from './geometry'

import type { JSX } from 'preact'

/** الصناديق من الخارج إلى الداخل كما تتداخل — وبترتيب القراءة يمينًا إلى يسار. */
const PARTS = [
  { part: 'margin', label: 'الهامش' },
  { part: 'border', label: 'الحدّ' },
  { part: 'padding', label: 'الحشوة' },
  { part: 'content', label: 'المحتوى' },
] as const

export interface BoxLegendProps {
  /** الزاوية العليا اليسرى، بإحداثيات النافذة. */
  at: Point
}

/**
 * مفتاح نموذج الصندوق تحت العنصر المفحوص (`inspect / element-selected`، `62:2`): لون كل صندوق
 * باسمه، بألوان `BoxModel` نفسها.
 */
export function BoxLegend({ at: point }: BoxLegendProps): JSX.Element {
  return (
    // الموضع في فضاء الطبقة (LTR) والاتجاه في الداخل: `inset-inline-start` يُحلّ باتجاه العنصر
    // نفسه، فـ`rtl` على المموضَع كان يرميه إلى الحافّة اليمنى ثمّ يزيحه خارج النافذة.
    <div class="rasd-ov-place" style={at(point)} data-rasd-ov="box-legend">
      <div class="rasd-ov-box-legend">
        {PARTS.map(({ part, label }) => (
          <span key={part} class="rasd-ov-box-key" data-part={part}>
            <span class={`rasd-ov-box-swatch rasd-ov-box-${part}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
