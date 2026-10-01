/**
 * فكّ المكتبة المقفلة و«نسيت الرمز» — `lock / unlock` · `unlock-wrong` · `unlocking` · `forgot`
 * (`293:17224` · `293:17383` · `293:17542` · `293:17686`)، وفوق المكتبة `library / locked` (`304:3091`).
 *
 * **«نسيت الرمز» يحذف المكتبة ولا يفتحها** (ADR 0043 §4)، بكلمة «احذف» مكتوبةً كتأكيد الحذف الكامل. ونصّ الإطار
 * «المكتبة مشفّرة بالرمز» لا يُكتب: القفل حارس وصول لا تشفير (ADR 0043 §1، فرقٌ مكتوب في `Docs/Design.md`).
 *
 * والمهلة بعد خمس محاولات تعطّل «افتح» حتى تنقضي، وتعود من تلقاء نفسها.
 */
import { useEffect, useState } from 'preact/hooks'

import { forgetCodeAndErase, unlockLibrary, type LockError } from '@/modules/privacy/lock'
import { Banner, Button, Input, Spinner } from '@/ui/components'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from '../../settings/parts/data/data.module.css'
import { DataDialog, Row, sheet } from '../../settings/parts/data/DataDialog'
import { CONFIRM_WORD, confirmMatches } from '../../settings/parts/data/DeleteDialog'

import { codeErrorText } from './lock-text'

import type { JSX } from 'preact'

type Step = 'unlock' | 'unlocking' | 'forgot' | 'erasing' | 'erase-failed'

export interface UnlockDialogProps {
  /** نهاية مهلةٍ جارية عند الفتح (`lockStatus`). */
  readonly cooldownUntil: number | null
  /** `false` فوق المكتبة: لا شيء خلفها يُعاد إليه. */
  readonly dismissible: boolean
  readonly onClose: () => void
  readonly onUnlocked: () => void
  /** حُذفت المكتبة وزال القفل. */
  readonly onErased: () => void
}

export function UnlockDialog({
  cooldownUntil,
  dismissible,
  onClose,
  onUnlocked,
  onErased,
}: UnlockDialogProps): JSX.Element {
  const [step, setStep] = useState<Step>('unlock')
  const [code, setCode] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<LockError | null>(
    cooldownUntil === null ? null : { kind: 'cooling-down', until: cooldownUntil },
  )
  const [now, setNow] = useState(Date.now)

  const waitUntil =
    error?.kind === 'cooling-down' ? error.until : error?.kind === 'wrong-code' ? error.until : null
  const cooling = waitUntil !== null && waitUntil > now

  // المهلة تُحسب ثانيةً بثانية كي يعود «افتح» حين تنقضي ويُحدَّث نصّ الدقائق.
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
    if (cooling || code === '') return
    setStep('unlocking')
    void unlockLibrary(code).then((result) => {
      // قفلٌ أُوقف من تبويبٍ آخر أثناء الكتابة: المكتبة مفتوحة أصلًا.
      if (result.ok || result.error.kind === 'not-enabled') {
        onUnlocked()
        return
      }
      setNow(Date.now())
      setError(result.error)
      setCode('')
      setStep('unlock')
    })
  }

  const erase = () => {
    setStep('erasing')
    void forgetCodeAndErase().then((result) => {
      if (result.ok) onErased()
      else setStep('erase-failed')
    })
  }

  if (step === 'unlocking') {
    return (
      <DataDialog
        id="lock-unlock"
        phase="unlocking"
        compact
        busy
        title="المكتبة مقفلة"
        subtitle="يُتحقَّق من الرمز"
        onClose={() => undefined}
        actions={null}
      >
        <div class={styles.status}>
          <Spinner size="l" label="تُفتح المكتبة" />
          <p class={cx(styles.statusText, 't-arabic-ui-s')}>تُفتح المكتبة</p>
        </div>
      </DataDialog>
    )
  }

  if (step === 'forgot' || step === 'erase-failed') {
    const ready = confirmMatches(typed)
    return (
      <DataDialog
        id="lock-forgot"
        phase={step}
        focus="#lock-forgot-word"
        dismissible={dismissible}
        title="نسيت الرمز"
        subtitle="لا طريق لاستعادته"
        onClose={onClose}
        actions={
          <>
            <Button variant="secondary" data-rasd-cancel="" onClick={() => setStep('unlock')}>
              عُد وجرّب الرمز
            </Button>
            <Button
              variant="danger"
              icon="trash"
              state={ready ? 'default' : 'disabled'}
              data-rasd-confirm=""
              onClick={() => {
                if (ready) erase()
              }}
            >
              {step === 'erase-failed' ? 'أعد محاولة الحذف' : 'احذف المكتبة'}
            </Button>
          </>
        }
      >
        {step === 'erase-failed' ? (
          <Banner tone="danger">
            تعذّر حذف المكتبة كاملةً، والقفل باقٍ على ما بقي منها. أعد المحاولة.
          </Banner>
        ) : (
          <Banner tone="danger">
            رصد لا يحفظ الرمز، فلا طريق لاستعادته ولا لفتح المكتبة بدونه. الحلّ الوحيد حذف المكتبة
            والبدء من جديد.
          </Banner>
        )}
        <div class={sheet.group}>
          <p class={cx(sheet.groupLabel, 't-arabic-label-s')}>إن حذفت</p>
          <div class={sheet.summary}>
            <Row label="المكتبة كلّها: اللقطات والأدلّة واللوحات والمشكلات">تُحذف نهائيًّا</Row>
            <Row label="الإعدادات">تبقى</Row>
            <Row label="نسختك الاحتياطية">تستعيد منها بعد الحذف، إن أخذتها قبل القفل</Row>
          </div>
        </div>
        <label class={styles.field}>
          <span class={cx(styles.fieldLabel, 't-arabic-label-s')}>كلمة التأكيد</span>
          <Input id="lock-forgot-word" value={typed} onInput={setTyped} aria-label="كلمة التأكيد" />
          <span class={cx(styles.fieldHint, 't-arabic-ui-xs')}>اكتب كلمة «{CONFIRM_WORD}»</span>
        </label>
      </DataDialog>
    )
  }

  if (step === 'erasing') {
    return (
      <DataDialog
        id="lock-forgot"
        phase="erasing"
        busy
        title="نسيت الرمز"
        subtitle="تُحذف المكتبة"
        onClose={() => undefined}
        actions={null}
      >
        <div class={styles.status}>
          <Spinner size="l" label="تُحذف المكتبة" />
        </div>
      </DataDialog>
    )
  }

  const message = error ? codeErrorText(error, now) : null
  return (
    <DataDialog
      id="lock-unlock"
      phase={error ? 'wrong' : 'unlock'}
      compact
      focus="#lock-code"
      dismissible={dismissible}
      title="المكتبة مقفلة"
      subtitle="أدخل الرمز لتفتحها"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={() => setStep('forgot')}>
            نسيت الرمز
          </Button>
          <Button
            variant="primary"
            state={cooling || code === '' ? 'disabled' : 'default'}
            data-rasd-confirm=""
            onClick={submit}
          >
            افتح
          </Button>
        </>
      }
    >
      <div class={styles.status}>
        <span class={styles.badge} aria-hidden="true">
          <Icon name="lock" size="md" />
        </span>
        <p class={cx(styles.statusTitle, 't-arabic-heading-s')}>المكتبة مقفلة</p>
        <p class={cx(styles.statusText, 't-arabic-ui-s')}>لا تُقرأ لقطة قبل إدخال الرمز.</p>
      </div>
      <label
        class={styles.field}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      >
        <span class={cx(styles.fieldLabel, 't-arabic-label-s')}>الرمز</span>
        <Input
          id="lock-code"
          type="password"
          value={code}
          onInput={setCode}
          state={message ? 'error' : 'default'}
          {...(message ? { errorMessage: message } : {})}
          aria-label="الرمز"
        />
      </label>
    </DataDialog>
  )
}
