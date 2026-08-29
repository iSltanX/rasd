import { formatDimensions } from '@/shared/bidi'

import { box, type Rect } from './geometry'

import type { JSX } from 'preact'

export interface MarqueeProps {
  /** المستطيل المحدَّد، بإحداثيات النافذة. */
  rect: Rect
  /**
   * تُقلب الشارة إلى داخل التحديد حين لا تتّسع تحته مساحة — يقرّره
   * المستدعي لأنه وحده يعرف ارتفاع النافذة.
   */
  flipBadge?: boolean
  /** إخفاء الشارة أثناء السحب السريع مثلًا. */
  showBadge?: boolean
}

/**
 * `Overlay / Marquee` — مستطيل التحديد بزواياه الأربع وشارة مقاسه.
 *
 * المقاس بأرقام غربية عبر `formatDimensions`: قيمة تُنسخ إلى محرّر كود لا
 * عدّ بشري.
 */
export function Marquee({ rect, flipBadge = false, showBadge = true }: MarqueeProps): JSX.Element {
  return (
    <div class="rasd-ov-place rasd-ov-marquee" style={box(rect)} data-rasd-ov="marquee">
      <span class="rasd-ov-marquee-fill" />
      <span class="rasd-ov-corner rasd-ov-corner-tl" />
      <span class="rasd-ov-corner rasd-ov-corner-tr" />
      <span class="rasd-ov-corner rasd-ov-corner-bl" />
      <span class="rasd-ov-corner rasd-ov-corner-br" />
      {showBadge ? (
        <span
          class="rasd-ov-badge rasd-ov-marquee-badge"
          data-flip={flipBadge ? 'true' : 'false'}
          data-rasd-ov-size=""
        >
          {formatDimensions(Math.round(rect.width), Math.round(rect.height))}
        </span>
      ) : null}
    </div>
  )
}
