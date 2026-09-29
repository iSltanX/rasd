import { formatHuman, formatPercent } from '@/shared/bidi'
import { Button } from '@/ui/components/Button/Button'
import { KeyCap } from '@/ui/TechnicalValue'

import styles from './Capturing.module.css'

import type { JSX } from 'preact'

export interface CapturingProps {
  done: number
  total: number
  onCancel: () => void
}

/**
 * `popup / capturing` — تقدّم تجميع مقاطع الصفحة كاملة.
 *
 * المعاينة زخرفية (ماسح فوق هيكل صفحة)، والأرقام حقيقية من `session.job`. الإطار يكتب
 * «الارتفاع 12,480 px» ولا تحمل المهمّة ارتفاعًا، فيُعرض رقم المقطع بدله. والوصف يقول
 * ما يفعله المحرّك فعلًا (`fixed-elements.ts`)، لا تحميل الصور المؤجّلة الذي لا يفعله.
 */
export function Capturing({ done, total, onCancel }: CapturingProps): JSX.Element {
  const fraction = total > 0 ? done / total : 0

  return (
    <div class={styles.state}>
      <div class={styles.scanner} aria-hidden="true">
        <span class={styles.sk} />
        <span class={styles.sk} />
        <span class={styles.skRow}>
          <span class={styles.block} />
          <span class={styles.block} />
        </span>
        <span class={styles.sk} />
        <span class={styles.band} />
      </div>

      <div class={styles.status}>
        <p class={`${styles.title} t-arabic-ui-m-strong`}>جارٍ التقاط الصفحة كاملة</p>
        <p class={`${styles.sub} t-arabic-ui-xs`}>الرؤوس الثابتة تظهر مرّة واحدة لا في كل مقطع</p>
      </div>

      <div class={styles.progress}>
        <div
          class={styles.track}
          role="progressbar"
          aria-label="تقدّم الالتقاط"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
        >
          <span class={styles.bar} style={{ '--rasd-capture-fraction': String(fraction) }} />
        </div>
        <div class={styles.row}>
          <bdi class={`${styles.percent} t-mono-xs-strong`} dir="ltr">
            {formatPercent(fraction)}
          </bdi>
          <span class={`${styles.count} t-arabic-ui-xs`}>
            المقطع {formatHuman(done)} من {formatHuman(total)}
          </span>
        </div>
      </div>

      {/*
       * «Esc» بعد النصّ: المفتاح يُلغي المهمّة من الصفحة (`content/index.ts`) — تلميحٌ صادق لا
       * يرسمه الإطار. و`verify:capturing` الحاجب يقرأ الزرّ بنصّه ومفتاحه هذين.
       */}
      <Button
        variant="secondary"
        size="l"
        icon="close"
        class={styles.cancel}
        onClick={onCancel}
        trailing={<KeyCap>Esc</KeyCap>}
      >
        إلغاء الالتقاط
      </Button>
    </div>
  )
}
