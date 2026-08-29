import { Icon } from '@/ui/icons/Icon'
import { RasdMark } from '@/ui/RasdMark'

import styles from './FirstRun.module.css'

import type { JSX } from 'preact'

export interface FirstRunProps {
  onTour: () => void
  onSkip: () => void
}

/**
 * `first-run` — أوّل فتح للنافذة، قبل أن تُحفظ `settings.onboarding.completed`.
 *
 * صفّ Figma للتلميح يحمل اختصارًا عامًّا `⌥⌘R` لـ«جولة سريعة» — خامسٌ فوق
 * الأربعة التي يقبلها Chrome في `commands` (القيد المُسجَّل تناقضًا رقم 6
 * في `Rasd_Plan.md`). لا اختصار خامس، فلا يُعرَض ادّعاء بمفتاح لا يعمل؛
 * التلميح هنا يصف السلوك الحقيقي — أي أداة تُنقَر تُنهي الجولة الأولى.
 */
export function FirstRun({ onTour, onSkip }: FirstRunProps): JSX.Element {
  return (
    <div class={styles.state}>
      <RasdMark size="regular" class={styles.mark} title="رصد" />
      <h2 class={styles.title}>مرحبًا بك في رصد</h2>
      <p class={styles.tagline}>فحص بصري للويب، من داخل الصفحة</p>
      <p class={styles.desc}>التقط وافحص وقِس وقارن — دون مغادرة الصفحة التي تراجعها.</p>

      <button type="button" class={styles.tour} onClick={onTour}>
        <Icon name="capture-area" size="sm" />
        <span>جولة سريعة</span>
      </button>
      <button type="button" class={styles.skip} onClick={onSkip}>
        تخطَّ — أعرف طريقي
      </button>

      <p class={styles.hint}>نقر أي أداة أدناه يبدأ العمل مباشرة</p>
    </div>
  )
}
