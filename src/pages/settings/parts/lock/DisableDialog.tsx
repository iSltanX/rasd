/**
 * إيقاف قفل المكتبة — `lock / disable` (`293:17856`). بالرمز الحاليّ وحده، ومحاولاته تُعدّ كالفكّ: الإيقاف لا يصير
 * بابًا لتخمينٍ بلا مهلة (ADR 0043 §5). وجملة الإطار عن «تشفيرها» لا تُكتب — لا تشفير (ADR 0043 §1).
 */
import { useEffect, useState } from 'preact/hooks'

import { disableLock, type LockError } from '@/modules/privacy/lock'
import { Button, Input } from '@/ui/components'
import { cx } from '@/ui/cx'

import { codeErrorText } from '../../../shell/lock/lock-text'
import styles from '../data/data.module.css'
import { DataDialog } from '../data/DataDialog'

import type { JSX } from 'preact'

export interface DisableDialogProps {
  readonly cooldownUntil: number | null
  readonly onClose: () => void
  readonly onDisabled: () => void
}

export function DisableDialog({
  cooldownUntil,
  onClose,
  onDisabled,
}: DisableDialogProps): JSX.Element {
  const [code, setCode] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<LockError | null>(
    cooldownUntil === null ? null : { kind: 'cooling-down', until: cooldownUntil },
  )
  const [now, setNow] = useState(Date.now)

  const waitUntil =
    error?.kind === 'cooling-down' ? error.until : error?.kind === 'wrong-code' ? error.until : null
  const cooling = waitUntil !== null && waitUntil > now

  useEffect(() => {
    if (waitUntil === null) return
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= waitUntil) {
        clearInterval(timer)
        setError(null)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [waitUntil])

  const submit = () => {
    if (working || cooling || code === '') return
    setWorking(true)
    void disableLock(code).then((result) => {
      setWorking(false)
      if (result.ok || result.error.kind === 'not-enabled') {
        onDisabled()
        return
      }
      setNow(Date.now())
      setError(result.error)
      setCode('')
    })
  }

  const message = error ? codeErrorText(error, now) : null
  return (
    <DataDialog
      id="lock-disable"
      phase={working ? 'working' : error ? 'wrong' : 'confirm'}
      focus="#lock-current-code"
      busy={working}
      title="إيقاف قفل المكتبة"
      subtitle="أدخل الرمز الحالي"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
            ألغِ
          </Button>
          <Button
            variant="danger"
            state={working || cooling || code === '' ? 'disabled' : 'default'}
            data-rasd-confirm=""
            onClick={submit}
          >
            أوقف القفل
          </Button>
        </>
      }
    >
      <p class={cx(styles.lead, 't-arabic-ui-s')}>بعد الإيقاف تُفتح المكتبة في رصد بلا رمز.</p>
      <label
        class={styles.field}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      >
        <span class={cx(styles.fieldLabel, 't-arabic-label-s')}>الرمز الحالي</span>
        <Input
          id="lock-current-code"
          type="password"
          value={code}
          onInput={setCode}
          state={message ? 'error' : 'default'}
          {...(message ? { errorMessage: message } : {})}
          aria-label="الرمز الحالي"
        />
      </label>
    </DataDialog>
  )
}
