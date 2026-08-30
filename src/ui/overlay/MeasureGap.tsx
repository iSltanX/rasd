import { formatUnit } from '@/shared/bidi'

import { box, type Rect } from './geometry'

import type { JSX } from 'preact'

export interface MeasureGapProps {
  /**
   * الأفقي: `x`,`y` بداية الخطّ و`width` طوله (`height` يُتجاهل).
   * الرأسي: `y` البداية و`height` الطول (`width` يُتجاهل).
   */
  rect: Rect
  orientation: 'horizontal' | 'vertical'
  value: number
  unit?: string
  /** الاتجاه الأقرب فعليًّا — تظليل أقوى يميّزه عن بقيّة الاتجاهات الثلاثة. */
  emphasis?: boolean
}

/**
 * `Measure / Gap` — خطّ متقطِّع يصل حافّتين، بشارة قيمة في الوسط.
 *
 * **متقطِّع لا صلب**، خلافًا لـ`Dimension`: الفرق البصري مقصود — الصلب
 * يقيس **عنصرًا واحدًا** (بُعده الذاتي)، والمتقطِّع يقيس **مسافة بين
 * شيئين**. خلطهما بصريًا يجعل «كم يبلغ هذا العنصر» و«كم بينهما» سؤالًا
 * واحدًا وهما مختلفان.
 */
export function MeasureGap({
  rect,
  orientation,
  value,
  unit = 'px',
  emphasis = false,
}: MeasureGapProps): JSX.Element {
  const cls = orientation === 'horizontal' ? 'rasd-ov-gap-h' : 'rasd-ov-gap-v'
  return (
    <div
      class={`rasd-ov-place ${cls}`}
      data-emphasis={emphasis ? 'true' : 'false'}
      style={box(rect)}
      data-rasd-ov="measure-gap"
    >
      <span class="rasd-ov-badge rasd-ov-gap-value">{formatUnit(Math.round(value), unit)}</span>
    </div>
  )
}
