import { cx } from '@/ui/cx'

import styles from './Input.module.css'

import type { JSX } from 'preact'

export type InputSize = 'm' | 'l'
export type InputState = 'default' | 'hover' | 'focus' | 'error' | 'disabled'

export interface InputProps {
  id?: string
  value?: string
  placeholder?: string
  size?: InputSize
  state?: InputState
  type?: 'text' | 'search' | 'number' | 'password'
  /** رسالة الخطأ — إن وُجدت تُربط بـ`aria-describedby` تلقائيًا. */
  errorMessage?: string
  onInput?: (value: string) => void
  class?: string | undefined
  'aria-label'?: string
}

let uid = 0
const nextId = () => `rasd-input-${(++uid).toString(36)}`

/** `Input` — 10 variant: 2 مقاس × 5 حالة. */
export function Input({
  id,
  value,
  placeholder,
  size = 'm',
  state = 'default',
  type = 'text',
  errorMessage,
  onInput,
  class: className,
  ...aria
}: InputProps): JSX.Element {
  const disabled = state === 'disabled'
  const error = state === 'error'
  const inputId = id ?? nextId()
  const errorId = error && errorMessage ? `${inputId}-error` : undefined

  return (
    <span class={styles.wrap}>
      <input
        id={inputId}
        type={type}
        class={cx(
          styles.input,
          styles[`size-${size}`],
          state === 'hover' && styles.forceHover,
          state === 'focus' && styles.forceFocus,
          error && styles.error,
          className,
        )}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        {...(errorId ? { 'aria-describedby': errorId } : {})}
        onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => onInput?.(e.currentTarget.value)}
        {...aria}
      />
      {error && errorMessage ? (
        <span id={errorId} class={styles.errorMessage} role="alert">
          {errorMessage}
        </span>
      ) : null}
    </span>
  )
}
