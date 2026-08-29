import { at, type Point } from './geometry'

import type { JSX } from 'preact'

export interface CrosshairProps {
  /** موضع المؤشِّر، بإحداثيات النافذة. */
  point: Point
  /** اللون المأخوذ من الصفحة تحت المؤشِّر — سداسي، يُعرض ويُنسخ كما هو. */
  sample?: string
  /** إخفاء العدسة والشارة وإبقاء الخطّين وحدهما. */
  linesOnly?: boolean
}

/**
 * `Overlay / Crosshair` — خطّا التصويب، وعدسة اللون، وشارته السداسية.
 *
 * العدسة والشارة تتمركزان على النقطة بـ`translate` نسبيًا إلى مقاسيهما، لا
 * بطرح نصف المقاس في JS: مقاس العدسة يعيش في الورقة وحدها، فلا تنشأ نسخة
 * ثانية منه في الشيفرة تنحرف عنها بصمت.
 *
 * قيمة اللون لاتينية بأرقام غربية — قيمة تُنسخ إلى محرّر لا عدّ بشري. واللون
 * نفسه **من الصفحة** لا من سمتنا، فيُمرَّر سطريًا في متغيّر مخصّص.
 */
export function Crosshair({ point, sample, linesOnly = false }: CrosshairProps): JSX.Element {
  return (
    <div data-rasd-ov="crosshair">
      <span class="rasd-ov-cross-h" style={{ '--rasd-ov-y': `${point.y}px` }} />
      <span class="rasd-ov-cross-v" style={{ '--rasd-ov-x': `${point.x}px` }} />

      {linesOnly ? null : (
        <span
          class="rasd-ov-place rasd-ov-cross-anchor"
          style={{ ...at(point), ...(sample ? { '--rasd-ov-sample': sample } : {}) }}
        >
          <span class="rasd-ov-loupe" />
          {sample ? (
            <span class="rasd-ov-badge rasd-ov-hex" data-rasd-ov-sample="">
              {sample.toUpperCase()}
            </span>
          ) : null}
        </span>
      )}
    </div>
  )
}
