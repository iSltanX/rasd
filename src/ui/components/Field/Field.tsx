import { cx } from '@/ui/cx'

import styles from './Field.module.css'

import type { JSX } from 'preact'

export type FieldState = 'default' | 'focus' | 'error'

export interface FieldProps {
  id: string
  label: string
  value: string
  onInput?: (value: string) => void
  placeholder?: string | undefined
  /** تلميح تحت الحقل. في حالة الخطأ يقول ما المطلوب، لا رمز خطأ. */
  hint?: string | undefined
  multiline?: boolean
  /** `error` تُعلَن `aria-invalid`؛ `focus` مفروضة للمعرض. */
  state?: FieldState
  disabled?: boolean
  maxLength?: number | undefined
  class?: string | undefined
}

/**
 * `Field` — 6 variant: سطر أو أسطر × 3 حالة. حقل نموذج بعنوان فوقه وتلميح تحته،
 * والعنوان `<label>` حقيقيّ والتلميح مربوط بـ`aria-describedby`.
 */
export function Field({
  id,
  label,
  value,
  onInput,
  placeholder,
  hint,
  multiline = false,
  state = 'default',
  disabled = false,
  maxLength,
  class: className,
}: FieldProps): JSX.Element {
  const hintId = hint ? `${id}-hint` : undefined
  const common = {
    id,
    class: cx(styles.box, multiline && styles.multi),
    value,
    placeholder,
    disabled,
    maxLength,
    'aria-invalid': state === 'error' ? ('true' as const) : undefined,
    'aria-describedby': hintId,
  }
  return (
    <div
      class={cx(
        styles.field,
        state === 'error' && styles.error,
        state === 'focus' && styles.forceFocus,
        className,
      )}
    >
      <label class={styles.label} for={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          {...common}
          rows={4}
          onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) => onInput?.(e.currentTarget.value)}
        />
      ) : (
        <input
          {...common}
          type="text"
          onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => onInput?.(e.currentTarget.value)}
        />
      )}
      {hint ? (
        <span class={styles.hint} id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
