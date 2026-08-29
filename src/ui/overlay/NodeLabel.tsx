import { formatDimensions } from '@/shared/bidi'

import { at, type Point } from './geometry'

import type { JSX } from 'preact'

/** أي ركن من البطاقة يقع عند `origin`. */
export type NodeLabelAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface NodeLabelProps {
  /** ركن الشارة، بإحداثيات النافذة. */
  origin: Point
  /** اسم الوسم كما في DOM: `section` · `div` · `button`. */
  tag: string
  /** المحدِّد المختصر: `.hero-section` · `#main`. */
  selector: string
  width: number
  height: number
  /**
   * أي ركن من البطاقة يُثبَّت عند `origin`.
   *
   * أُضيف في المرحلة 9، أوّل مستهلك لهذه البدائيّة: الملفّ يعلّق البطاقة
   * بالركن **الأيمن العلوي** لإبراز العنصر، وعرضها HUG لا يُعرَف مسبقًا —
   * فلا يمكن حساب نقطة يسارها في المستدعي.
   */
  anchor?: NodeLabelAnchor
}

/**
 * `Overlay / Node Label` — بطاقة تعريف العنصر المحوَّم عليه.
 *
 * كل محتواها لاتيني تقني (وسم، محدِّد، مقاس)، فالبطاقة LTR كاملةً كما تُجبَر
 * كتل الكود في عقد الاتجاه — لا خلط عربي داخلها يستدعي عزلًا لكل مقطع.
 * ترتيب العناصر هو ترتيب Figma البصري نفسه: المقاس، فاصل، المحدِّد، الوسم.
 */
export function NodeLabel({
  origin,
  tag,
  selector,
  width,
  height,
  anchor = 'top-left',
}: NodeLabelProps): JSX.Element {
  return (
    <div class="rasd-ov-place" style={at(origin)} data-rasd-ov="node-label" data-anchor={anchor}>
      <span class="rasd-ov-node-label">
        <span class="rasd-ov-node-size">
          {formatDimensions(Math.round(width), Math.round(height))}
        </span>
        <span class="rasd-ov-node-divider" />
        <span class="rasd-ov-node-selector" title={selector}>
          {selector}
        </span>
        <span class="rasd-ov-node-tag">{tag}</span>
      </span>
    </div>
  )
}
