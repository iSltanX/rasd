/**
 * تفعيل قفل المكتبة — `lock / setup` · `setup-mismatch` · `enabled` (`293:16890` · `293:17065` · `293:18010`).
 *
 * **النسخة الاحتياطية قبل الرمز** (`STAGES/08` المهمّة 5): «لا طريق لاستعادة الرمز» أوّل سطر، وبطاقة «خذ نسخة
 * احتياطية» بآخر نسخةٍ أُخذت فوق الحقلين. والتفعيل يقيس الدورات على الجهاز ثمّ يشتقّ (نحو 600ms معًا)، فيُعرض
 * الانتظار ولا يُترك الزرّ صامتًا.
 */
import { useState } from 'preact/hooks'

import { codeLength, MIN_CODE_LENGTH } from '@/modules/privacy/kdf'
import { enableLock } from '@/modules/privacy/lock'
import { Banner, Button, Input, Spinner } from '@/ui/components'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import { lastBackupText, type LastBackup } from '../../data-context'
import styles from '../data/data.module.css'
import { DataDialog, sheet } from '../data/DataDialog'

import type { JSX } from 'preact'

type Step = 'form' | 'enabling' | 'enabled' | 'failed'

export interface SetupDialogProps {
  readonly lastBackup: LastBackup | null
  readonly onBackup: () => void
  readonly onClose: () => void
}

/** الرمزان لا يتطابقان — يُقال حين يبلغ الثاني طول الأوّل أو يحيد عنه، لا مع أوّل حرف. */
export function mismatched(code: string, again: string): boolean {
  if (again === '' || again === code) return false
  return again.length >= code.length || !code.startsWith(again)
}

export function SetupDialog({ lastBackup, onBackup, onClose }: SetupDialogProps): JSX.Element {
  const [step, setStep] = useState<Step>('form')
  const [code, setCode] = useState('')
  const [again, setAgain] = useState('')

  const long = codeLength(code) >= MIN_CODE_LENGTH
  const mismatch = mismatched(code, again)
  const ready = long && again === code

  const enable = () => {
    if (!ready) return
    setStep('enabling')
    void enableLock(code).then((result) => {
      setCode('')
      setAgain('')
      setStep(result.ok || result.error.kind === 'already-enabled' ? 'enabled' : 'failed')
    })
  }

  if (step === 'enabling') {
    return (
      <DataDialog
        id="lock-setup"
        phase="enabling"
        busy
        title="قفل المكتبة"
        subtitle="يُفعَّل القفل"
        onClose={() => undefined}
        actions={null}
      >
        <div class={styles.status}>
          <Spinner size="l" label="يُفعَّل القفل" />
        </div>
      </DataDialog>
    )
  }

  if (step === 'enabled') {
    return (
      <DataDialog
        id="lock-setup"
        phase="enabled"
        title="قفل المكتبة"
        subtitle="القفل مفعَّل"
        onClose={onClose}
        actions={
          <Button variant="primary" data-rasd-autofocus="" onClick={onClose}>
            تمّ
          </Button>
        }
      >
        <div class={styles.status}>
          <span class={styles.badge} data-tone="success" aria-hidden="true">
            <Icon name="lock" size="md" />
          </span>
          <p class={cx(styles.statusTitle, 't-arabic-heading-s')}>المكتبة محمية</p>
          <p class={cx(styles.statusText, 't-arabic-ui-s')}>
            يُطلب الرمز عند فتح المكتبة بعد إغلاق المتصفّح، أو حين تقفلها بنفسك.
          </p>
        </div>
      </DataDialog>
    )
  }

  return (
    <DataDialog
      id="lock-setup"
      phase={step === 'failed' ? 'failed' : mismatch ? 'mismatch' : 'form'}
      focus="#lock-new-code"
      title="قفل المكتبة"
      subtitle="اختر رمزًا تفتح به المكتبة"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" data-rasd-cancel="" onClick={onClose}>
            ألغِ
          </Button>
          <Button
            variant="primary"
            icon="lock"
            state={ready ? 'default' : 'disabled'}
            data-rasd-confirm=""
            onClick={enable}
          >
            فعّل القفل
          </Button>
        </>
      }
    >
      {step === 'failed' ? (
        <Banner tone="danger">تعذّر تفعيل القفل. لم يتغيّر شيء، والمكتبة مفتوحة كما كانت.</Banner>
      ) : (
        <Banner tone="warning">
          لا طريق لاستعادة الرمز. نسيانه يعني حذف المكتبة. خذ نسخة احتياطية قبل التفعيل.
        </Banner>
      )}
      <div class={sheet.group}>
        <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>قبل التفعيل</p>
        <div class={styles.option}>
          <div class={styles.optionText}>
            <p class={cx(styles.optionTitle, 't-arabic-ui-s-strong')}>خذ نسخة احتياطية</p>
            <p class={cx(styles.optionHint, 't-arabic-ui-xs')} data-last-backup="">
              {lastBackupText(lastBackup)}
            </p>
          </div>
          <Button variant="secondary" size="s" onClick={onBackup}>
            أنشئ نسخة
          </Button>
        </div>
      </div>
      <label class={styles.field}>
        <span class={cx(styles.fieldLabel, 't-arabic-label-s')}>الرمز</span>
        <Input
          id="lock-new-code"
          type="password"
          value={code}
          onInput={setCode}
          aria-label="الرمز"
        />
        <span class={cx(styles.fieldHint, 't-arabic-ui-xs')}>ثمانية أحرف على الأقل</span>
      </label>
      <label
        class={styles.field}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            enable()
          }
        }}
      >
        <span class={cx(styles.fieldLabel, 't-arabic-label-s')}>أعد كتابة الرمز</span>
        <Input
          id="lock-new-code-again"
          type="password"
          value={again}
          onInput={setAgain}
          state={mismatch ? 'error' : 'default'}
          {...(mismatch ? { errorMessage: 'الرمزان غير متطابقين' } : {})}
          aria-label="أعد كتابة الرمز"
        />
      </label>
    </DataDialog>
  )
}
