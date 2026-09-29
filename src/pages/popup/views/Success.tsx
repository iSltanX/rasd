import { Button } from '@/ui/components/Button/Button'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './Success.module.css'

import type { JSX } from 'preact'

export interface SuccessAction {
  icon: IconName
  label: string
  onClick: () => void
  /** معطَّل بسبب مكتوب في الزرّ نفسه — ميزة محرّكها في مرحلة لاحقة. */
  soon?: boolean
}

export interface SuccessProps {
  /** المصغَّرة إن وُجدت، وإلّا هيكل المعاينة. */
  thumbUrl: string | null
  /** أربعة إجراءات بترتيب القراءة: تعليق، مقارنة، نسخ، مشاركة. */
  actions: readonly SuccessAction[]
  /** رسالة قصيرة بعد إجراء (نُسخت، أو تعذّر النسخ). */
  notice?: string | null
  onOpenLibrary: () => void
}

/**
 * `popup / success` (`53:174`) — تظهر بعد اكتمال التقاط، لا من دالّة اختيار الحالة.
 * الشارة والعنوان في بداية السطر، ثم المعاينة، ثم أربعة أزرار ثانوية، ثم «افتح في المكتبة».
 */
export function Success({ thumbUrl, actions, notice, onOpenLibrary }: SuccessProps): JSX.Element {
  return (
    <div class={styles.state}>
      <div class={styles.head}>
        <span class={styles.badge} aria-hidden="true">
          <Icon name="check" size="xs" />
        </span>
        <p class={`${styles.title} t-arabic-ui-m-strong`}>حُفظت اللقطة</p>
      </div>

      <div class={styles.preview} aria-hidden="true">
        {thumbUrl ? (
          <img class={styles.img} src={thumbUrl} alt="" />
        ) : (
          <>
            <span class={styles.sk} />
            <span class={styles.sk} />
            <span class={styles.marquee} />
          </>
        )}
      </div>

      <div class={styles.actions}>
        {actions.map((a) => (
          <Button
            key={a.label}
            variant="secondary"
            size="m"
            icon={a.icon}
            state={a.soon ? 'disabled' : 'default'}
            class={styles.action}
            onClick={a.onClick}
          >
            {a.soon ? `${a.label} · قريبًا` : a.label}
          </Button>
        ))}
      </div>

      {notice ? (
        <p class={`${styles.notice} t-arabic-ui-xs`} role="status">
          {notice}
        </p>
      ) : null}

      <Button
        variant="primary"
        size="l"
        icon="external"
        class={styles.open}
        onClick={onOpenLibrary}
      >
        افتح في المكتبة
      </Button>
    </div>
  )
}
