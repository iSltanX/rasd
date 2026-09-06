import { formatDimensions } from '@/shared/bidi'
import { Icon, type IconName } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import styles from './Success.module.css'

import type { JSX } from 'preact'

export interface SuccessAction {
  icon: IconName
  label: string
  onClick: () => void
}

export interface SuccessProps {
  width: number
  height: number
  actions: readonly SuccessAction[]
  onOpenLibrary: () => void
}

/** `success` — تظهر بعد اكتمال التقاط، لا من دالّة اختيار الحالة. */
export function Success({ width, height, actions, onOpenLibrary }: SuccessProps): JSX.Element {
  return (
    <div class={styles.state}>
      <span class={styles.badge}>
        <Icon name="check" size="lg" />
      </span>
      <p class={styles.title}>حُفظت اللقطة</p>
      <p class={styles.sub}>
        محفوظة محليًا ·{' '}
        <TechnicalValue kind="dimension" variant="inherit">
          {formatDimensions(width, height)}
        </TechnicalValue>
      </p>

      <div class={styles.actions}>
        {actions.map((a) => (
          <button key={a.label} type="button" class={styles.action} onClick={a.onClick}>
            <Icon name={a.icon} size="sm" />
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      <button type="button" class={styles.open} onClick={onOpenLibrary}>
        <span>افتح في المكتبة</span>
        <Icon name="external" size="sm" />
      </button>
    </div>
  )
}
