import { Icon } from '@/ui/icons/Icon'

import type { JSX } from 'preact'

/**
 * التلميحات بما يفعله محرّك القياس فعلًا (`content/tools/measure.ts`)، لا بما رسمه الإطار: النقرة
 * تثبّت مرجعًا والثاني يُتتبَّع بالمرور لا بـ«⇧ + نقرة»، و`⌥` يوقف الالتصاق بالحواف في القياس
 * الحرّ لا «يقيس إلى الأب»، و`Esc` يُخرج من الأداة كلّها.
 */
const HINTS: readonly (readonly [key: string, label: string])[] = [
  ['انقر', 'ثبّت عنصرًا مرجعًا'],
  ['اسحب', 'قِس بين نقطتين'],
  ['⌥', 'اسحب بلا التصاق بالحواف'],
  ['Esc', 'اخرج من القياس'],
]

/**
 * `measure / idle` (`98:251`) — قبل أن يُثبَّت عنصر أو يُتتبَّع: بطاقة الأداة بعنوانها ووصفها
 * ومفاتيحها، على هيئة `inspect / idle` نفسها.
 *
 * **سلبيّة للمؤشِّر** (`rasd-ov-insp-passive`): وضع القياس يرفع الدرع، والطبقة تقرأ المؤشِّر
 * فوق خلفيتها وحدها — فبطاقةٌ تلتقطه كانت ستحجب عن الأداة ما تحتها في ركنها كلّه.
 */
export function MeasureIdle(): JSX.Element {
  return (
    <div
      class="rasd-ov-insp rasd-ov-insp-idle rasd-ov-insp-passive"
      role="status"
      data-rasd-ov="measure-idle"
    >
      <span class="rasd-ov-insp-badge" data-tool="measure" aria-hidden="true">
        <Icon name="dimension-h" size="md" />
      </span>
      <div class="rasd-ov-insp-intro">
        <span class="rasd-ov-insp-title">اختر العنصر الأول</span>
        <span class="rasd-ov-insp-sub">بانتظار عنصر</span>
        <p class="rasd-ov-insp-desc">
          انقر عنصرًا ثمّ مرّر فوق آخر — يقرأ رصد الفجوة بينهما ومقاسيهما ومحاذاتهما.
        </p>
      </div>
      <dl class="rasd-ov-insp-hints">
        {HINTS.map(([key, label]) => (
          <div key={key} class="rasd-ov-insp-hint">
            <dt>
              <kbd class="rasd-ov-key">{key}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
