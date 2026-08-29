import { formatDimensions } from '@/shared/bidi'

import { box, type Rect } from './geometry'

import type { JSX } from 'preact'

/**
 * الجوانب الأربعة بالبكسل.
 *
 * **فيزيائية عمدًا، خلافًا لبقيّة المشروع.** مصدرها `getComputedStyle` على
 * عنصر في صفحة لا نملكها: القيمة هناك نتيجة بعد حلّ اتجاه ذلك العنصر ووضع
 * كتابته، لا نيّة تصميم منّا. ولأن الطبقة ترسم في فضاء النافذة الفيزيائي،
 * فتحويلها إلى منطقية يتطلّب معرفة وضع كتابة كل عنصر على حدة — وهو تعقيد
 * يُدخل خطأً حيث لا غموض أصلًا.
 */
export interface Edges {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/** ترتيب `inset` المختصر: أعلى، يمين، أسفل، يسار. */
const SIDES = ['top', 'right', 'bottom', 'left'] as const

const NONE = Object.fromEntries(SIDES.map((s) => [s, 0])) as unknown as Edges

export interface BoxModelProps {
  /** مستطيل **الهامش** — أوسع الصناديق، بإحداثيات النافذة. */
  rect: Rect
  margin?: Edges
  border?: Edges
  padding?: Edges
}

/** يجمع طبقات الحواف ويصوغها قيمةً لـ`inset`. */
function insetOf(layers: readonly Edges[]): Record<string, string> {
  return {
    inset: SIDES.map((side) => `${layers.reduce((sum, e) => sum + e[side], 0)}px`).join(' '),
  }
}

const axis = (layers: readonly Edges[], a: 'right' | 'bottom') =>
  layers.reduce((sum, e) => sum + e[a] + e[a === 'right' ? 'left' : 'top'], 0)

/**
 * `Overlay / Box Model` — الصناديق الأربعة المتداخلة فوق العنصر المفحوص:
 * الهامش، فالإطار، فالحشوة، فالمحتوى.
 */
export function BoxModel({
  rect,
  margin = NONE,
  border = NONE,
  padding = NONE,
}: BoxModelProps): JSX.Element {
  const shells = [margin, border, padding]
  const contentWidth = Math.max(0, rect.width - axis(shells, 'right'))
  const contentHeight = Math.max(0, rect.height - axis(shells, 'bottom'))

  return (
    <div class="rasd-ov-place rasd-ov-box" style={box(rect)} data-rasd-ov="box-model">
      <span class="rasd-ov-box-ring rasd-ov-box-margin" />
      <span class="rasd-ov-box-ring rasd-ov-box-border" style={insetOf([margin])} />
      <span class="rasd-ov-box-ring rasd-ov-box-padding" style={insetOf([margin, border])} />
      <span class="rasd-ov-box-ring rasd-ov-box-content" style={insetOf(shells)} />
      <span class="rasd-ov-badge rasd-ov-box-label">
        {formatDimensions(Math.round(contentWidth), Math.round(contentHeight))}
      </span>
    </div>
  )
}
