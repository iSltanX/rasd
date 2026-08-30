import { formatUnit } from '@/shared/bidi'

import { at, type Point } from './geometry'

import type { JSX } from 'preact'

export interface AlignGuideProps {
  orientation: 'horizontal' | 'vertical'
  /** موضع الخطّ على المحور العرضي عليه — `y` للأفقي، `x` للرأسي. */
  position: number
  /** بداية الامتداد ونهايته على المحور الآخر. */
  from: number
  to: number
  /** انحراف عن الصفر — شارة `Δ Npx` تظهر حين لا يساوي صفرًا. */
  delta?: number
  unit?: string
}

/**
 * `Measure / Align Guide` — خطّ محاذاة كامل الامتداد بين هدفين.
 *
 * **بلا شارة قيمة إن كانت المحاذاة تامّة** (`delta` صفر أو غائبة): الخطّ
 * نفسه هو الرسالة. شارة `Δ` تظهر فقط حين الانحراف قريب لا معدوم — «تنبيه
 * عند انحراف 1–2px» كما نصّت المرحلة، لا زخرفة دائمة.
 */
export function AlignGuide({
  orientation,
  position,
  from,
  to,
  delta = 0,
  unit = 'px',
}: AlignGuideProps): JSX.Element {
  const start = Math.min(from, to)
  const length = Math.abs(to - from)
  const origin: Point =
    orientation === 'horizontal' ? { x: start, y: position } : { x: position, y: start }
  const lengthVar =
    orientation === 'horizontal'
      ? { '--rasd-ov-w': `${length}px` }
      : { '--rasd-ov-h': `${length}px` }

  return (
    <div
      class={
        orientation === 'horizontal'
          ? 'rasd-ov-place rasd-ov-align-h'
          : 'rasd-ov-place rasd-ov-align-v'
      }
      style={{ ...at(origin), ...lengthVar }}
      data-rasd-ov="align-guide"
      data-near={delta !== 0 ? 'true' : 'false'}
    >
      {delta !== 0 ? (
        <span class="rasd-ov-badge rasd-ov-align-delta">
          Δ {formatUnit(Math.abs(Math.round(delta)), unit)}
        </span>
      ) : null}
    </div>
  )
}
