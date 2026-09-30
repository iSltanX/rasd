import { useEffect, useRef, useState } from 'preact/hooks'

import { formatHuman } from '@/shared/bidi'
import {
  HOST_PERMISSION_RATIONALE,
  REQUIRED_PERMISSION_RATIONALE,
} from '@/shared/permission-policy'
import { Button } from '@/ui/components/Button/Button'
import { ErrorMessage } from '@/ui/components/ErrorMessage/ErrorMessage'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { RasdMark } from '@/ui/RasdMark'

import { CAPTURE_COMMANDS, shortcutKeys } from '../shell/capture-commands'

import { finishOnboarding } from './finish'
import styles from './Onboarding.module.css'

import type { ComponentChildren, JSX } from 'preact'

/**
 * **أسباب الصلاحيات من `permission-policy.ts` نفسه لا منسوخةً** — المصدر الذي يبني البيان ويعرضه
 * قسم الصلاحيات في الإعدادات. تُشرح هنا ولا تُطلب: الجولة لا تطلب صلاحية (خارج نطاقها).
 */
const PERMISSION_NOTES: readonly string[] = [
  REQUIRED_PERMISSION_RATIONALE.activeTab,
  REQUIRED_PERMISSION_RATIONALE.scripting,
  HOST_PERMISSION_RATIONALE,
]

interface Step {
  title: string
  body: string
}

const STEPS: readonly Step[] = [
  {
    title: 'افحص أي صفحة من مكانها',
    body: 'التقط وعلّق وافحص وقِس واستخرج الألوان وقارن، دون أن تغادر الصفحة التي تراجعها.',
  },
  {
    title: 'يعمل حين تطلبه أنت',
    body: 'رصد يقرأ الصفحة في لحظة استخدامك أداةً فيها، لا قبلها. واللقطات تُحفظ على هذا الجهاز وحده.',
  },
  {
    title: 'أربعة اختصارات للالتقاط',
    body: 'منطقة وعنصر والجزء الظاهر وصفحة كاملة. تغيّرها متى شئت من صفحة اختصارات المتصفّح.',
  },
  {
    title: 'التقط أوّل لقطة',
    body: 'افتح أي صفحة واختر وضعًا من الأربعة، باختصاره أو من زرّ رصد في شريط المتصفّح. تُحفظ اللقطة في المكتبة، ويُفتح المحرّر لتعلّق عليها.',
  },
]

/** الخطوة من الرابط (`?step=3`) — لقطات التصميم تفتح كل خطوة مباشرةً. والافتراضي الأولى. */
function initialStep(): number {
  const n = Number(new URLSearchParams(location.search).get('step'))
  return Number.isInteger(n) && n >= 1 && n <= STEPS.length ? n - 1 : 0
}

/**
 * جولة التعريف (`27 — Onboarding`، `74:2` · `74:46` · `74:100` · `74:142`): أربع خطوات في بطاقة
 * 420 — القيمة، ثمّ الصلاحيات، ثمّ الاختصارات، ثمّ أوّل التقاط. تُفتح عند التثبيت وحده
 * (`background/install-flow.ts`)، وتُعاد من الإعدادات ‹ عن رصد.
 *
 * **ارتفاع البطاقة ثابت بين الخطوات:** نصوص الخطوات الأربع مكدَّسة في خليّة واحدة والظاهرة واحدة،
 * فالبطاقة بارتفاع أطولها ولا يقفز «التالي» من تحت المؤشّر حين تطول خطوة الصلاحيات.
 */
export function Onboarding(): JSX.Element {
  const [step, setStep] = useState(initialStep)
  const [commands, setCommands] = useState<readonly chrome.commands.Command[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState(false)
  const titles = useRef<(HTMLHeadingElement | null)[]>([])
  const moved = useRef(false)

  useEffect(() => {
    void chrome.commands.getAll().then(setCommands)
  }, [])

  // تنقّلٌ بين الخطوات ينقل التركيز إلى عنوانها — فيقرأ قارئ الشاشة الخطوة الجديدة. لا عند الفتح.
  useEffect(() => {
    if (moved.current) titles.current[step]?.focus()
  }, [step])

  const last = step === STEPS.length - 1
  const next = () => {
    moved.current = true
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const finish = () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    void finishOnboarding().then((result) => {
      if (result.ok) {
        if (result.value === 'open') setDone(true)
        return
      }
      setFailed(true)
      setBusy(false)
    })
  }

  const areaShortcut = commands?.find((c) => c.name === 'capture-area')?.shortcut ?? ''

  return (
    <main class={styles.page}>
      <div class={styles.card}>
        <div class={styles.illustration} aria-hidden="true">
          {step === 0 ? <ValueArt /> : null}
          {step === 1 ? <PrivacyArt /> : null}
          {step === 2 ? (
            <ShortcutArt keys={shortcutKeys(areaShortcut)} loaded={!!commands} />
          ) : null}
          {step === 3 ? <CaptureArt /> : null}
        </div>

        <div class={styles.copies}>
          {STEPS.map((s, i) => (
            <section
              key={s.title}
              class={cx(styles.copy, i !== step && styles.hidden)}
              aria-labelledby={`rasd-onboarding-step-${i + 1}`}
              {...(i === step ? {} : { inert: true, 'aria-hidden': 'true' })}
            >
              <p class={`${styles.stepLabel} t-arabic-label-xs`}>
                الخطوة {formatHuman(i + 1)} من {formatHuman(STEPS.length)}
              </p>
              <h1
                ref={(el) => {
                  titles.current[i] = el
                }}
                id={`rasd-onboarding-step-${i + 1}`}
                class={`${styles.title} t-arabic-heading-m`}
                tabIndex={-1}
              >
                {s.title}
              </h1>
              <p class={`${styles.body} t-arabic-body-s`}>{s.body}</p>
              {i === 1 ? (
                <ul class={styles.notes}>
                  {PERMISSION_NOTES.map((note) => (
                    <li key={note} class={`${styles.note} t-arabic-ui-xs`}>
                      <Icon name="check" size="xs" class={styles.noteIcon} />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        {failed ? (
          <ErrorMessage
            class={styles.error}
            title="تعذّر حفظ ذلك"
            body="بقيت الجولة مفتوحة كي لا تعود إليك من جديد."
            onRetry={finish}
          />
        ) : null}

        {done ? (
          <p class={`${styles.done} t-arabic-ui-s`} role="status">
            انتهت الجولة. أغلق هذا التبويب متى شئت.
          </p>
        ) : null}

        <footer class={styles.footer}>
          <Dots current={step} total={STEPS.length} />
          <div class={styles.actions}>
            {last ? null : (
              <Button variant="ghost" size="m" onClick={finish}>
                تخطَّ
              </Button>
            )}
            {last ? (
              <Button variant="primary" size="m" icon="check" iconPosition="end" onClick={finish}>
                ابدأ
              </Button>
            ) : (
              <Button
                variant="primary"
                size="m"
                icon="chevron-right"
                iconPosition="end"
                onClick={next}
              >
                التالي
              </Button>
            )}
          </div>
        </footer>
      </div>
    </main>
  )
}

function Dots({ current, total }: { current: number; total: number }): JSX.Element {
  return (
    <div class={styles.dots} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={cx(styles.dot, i === current && styles.dotActive)} />
      ))}
    </div>
  )
}

function Stage({ children }: { children: ComponentChildren }): JSX.Element {
  return <div class={styles.stage}>{children}</div>
}

/** الخطوة الأولى: لونٌ من الصفحة ومتغيّره وعدد من يستعمله — ما تقرؤه أداة الفحص. */
function ValueArt(): JSX.Element {
  return (
    <Stage>
      <span class={styles.swatch} />
      <span class={styles.token} dir="ltr">
        <span class="t-mono-xs">--color-primary</span>
        <Icon name="token" size="xs" />
      </span>
      <span class={`${styles.caption} t-arabic-ui-xs`}>يستخدمه {formatHuman(14)} عنصرًا</span>
    </Stage>
  )
}

function PrivacyArt(): JSX.Element {
  return (
    <Stage>
      <span class={styles.shield}>
        <Icon name="shield" size="2xl" />
      </span>
      <span class={`${styles.badge} t-arabic-ui-xs`}>محلّي دائمًا</span>
    </Stage>
  )
}

/** اختصار «منطقة» كما سجّله المتصفّح فعلًا — لا `⇧⌘T` مرسومًا قد لا يطابق هذا الجهاز. */
function ShortcutArt({ keys, loaded }: { keys: string[]; loaded: boolean }): JSX.Element {
  return (
    <Stage>
      {keys.length > 0 ? (
        <span class={styles.keys} dir="ltr">
          {keys.map((key, i) => (
            <kbd key={`${key}-${i}`} class={`${styles.key} t-mono-l`}>
              {key}
            </kbd>
          ))}
        </span>
      ) : loaded ? (
        <span class={`${styles.badge} t-arabic-ui-xs`}>بلا اختصار على هذا الجهاز</span>
      ) : null}
      <RasdMark size="2xl" class={styles.mark} />
    </Stage>
  )
}

function CaptureArt(): JSX.Element {
  return (
    <div class={styles.tiles}>
      {CAPTURE_COMMANDS.map(({ name, label, icon }) => (
        <span key={name} class={styles.tile}>
          <Icon name={icon} size="md" class={styles.tileIcon} />
          <span class="t-arabic-ui-s-strong">{label}</span>
        </span>
      ))}
    </div>
  )
}
