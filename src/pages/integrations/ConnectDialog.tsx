/**
 * نافذة «اتّصل بـGitHub» — `github / connect` و`github / connecting` (`Docs/Design.md`).
 *
 * **رمزٌ يلصقه المستخدم بنفسه** (رمز وصول دقيق الصلاحيات) يتحقّق منه رصد بسؤال GitHub عن صاحبه ثمّ يحفظه
 * مشفَّرًا في الخزنة؛ فرمزٌ خاطئ لا يُحفظ. ولا يبقى في حالة الواجهة بعد النجاح.
 *
 * **صلاحية المضيف تُطلب من النقرة نفسها، قبل أي `await`:** `chrome.permissions.request` تشترط إيماءة مستخدم،
 * وإن سبقها `await` سقطت الإيماءة (نمط `ExportFlow`). والاتّصال نفسه يمرّ من مخرج الشبكة الواحد، فـ«الوضع المحلّي
 * فقط» المفعَّل يرفضه بسببه لا برسالةٍ عامّة.
 *
 * **ونصّ الصلاحيات صادق عن الخيارين:** Issues تكفي لفتح البلاغ، ورفع الصورة أصلًا في المستودع يشترط Contents
 * (كتابة) كذلك — فلا يَعِد الإطار بما لا يفعله الرمز.
 */

import { useEffect, useRef, useState } from 'preact/hooks'

import { connectGitHub } from '@/modules/export/integrations/github'
import { requestHostPermission } from '@/shared/permissions'
import { Banner, Button, Input } from '@/ui/components'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { useFocusTrap } from '@/ui/use-focus-trap'

import sheet from '../export/export.module.css'

import { GITHUB_HOST_PATTERN } from './connection'
import styles from './integrations.module.css'
import { savePrefs } from './preferences'
import { failureText, failureTitle } from './text'

import type { JSX } from 'preact'

export interface ConnectDialogProps {
  readonly onClose: () => void
  /** بعد اتّصالٍ ناجح وحفظ الحساب — لتُعاد قراءة الحالة. */
  readonly onConnected: () => void
}

/** ما يفعله رصد بالرمز — كما في الإطار، وكلّه صادق عمّا يُنفَّذ. */
const USES: readonly { readonly label: string; readonly value: string }[] = [
  { label: 'يفتح Issue', value: 'حين تؤكّد أنت' },
  { label: 'يرفع صورة البلاغ', value: 'إن اخترت رفعها أصلًا' },
  { label: 'يقرأ شيفرتك', value: 'لا' },
]

export const HOST_DENIED =
  'لم تمنح رصد صلاحية الوصول إلى api.github.com، فلا يتّصل. امنحها حين يسألك المتصفّح لتتّصل.'

export function ConnectDialog({ onClose, onConnected }: ConnectDialogProps): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  useFocusTrap(dialog)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ title: string; text: string } | null>(null)
  const live = useRef(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || busy) return
      e.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  useEffect(
    () => () => {
      live.current = false
    },
    [],
  )

  /** **يُستدعى متزامنًا من النقرة** — لا `await` قبل طلب الصلاحية. */
  const connect = (): void => {
    if (busy || token.trim() === '') return
    setBusy(true)
    setError(null)
    void requestHostPermission([GITHUB_HOST_PATTERN]).then(async (outcome) => {
      if (!live.current) return
      if (outcome !== 'granted') {
        setError({ title: failureTitle('connect'), text: HOST_DENIED })
        setBusy(false)
        return
      }
      const connected = await connectGitHub(token)
      if (!live.current) return
      if (!connected.ok) {
        setError({
          title: failureTitle('connect'),
          text: failureText(connected.error.failure, 'connect', connected.error.retryAfterSeconds),
        })
        setBusy(false)
        return
      }
      setToken('')
      await savePrefs({ account: connected.value.login, status: 'ok' })
      onConnected()
      onClose()
    })
  }

  return (
    <div
      class={sheet.scrim}
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-title"
      data-connect-dialog=""
      data-phase={busy ? 'connecting' : 'idle'}
    >
      <form
        class={cx(sheet.modal, styles.modal)}
        onSubmit={(e) => {
          e.preventDefault()
          connect()
        }}
      >
        <header class={sheet.head}>
          <button
            type="button"
            class={sheet.close}
            aria-label="إغلاق"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" size="sm" />
          </button>
          <div class={sheet.headText}>
            <h2 id="connect-title" class={cx(sheet.title, 't-arabic-heading-s')}>
              اتّصل بـGitHub
            </h2>
            <p class={cx(sheet.subtitle, 't-arabic-ui-xs')}>رمز وصول محدود الصلاحية</p>
          </div>
        </header>

        <div class={sheet.body}>
          <Banner tone="info">
            رصد يحفظ الرمز مشفّرًا على هذا الجهاز، ويتّصل بـ<bdi dir="ltr">api.github.com</bdi>{' '}
            وحده.
          </Banner>
          {error ? (
            <Banner tone="danger">
              <strong class={cx(styles.bannerTitle, 't-arabic-ui-s-strong')}>{error.title}</strong>
              <span class={styles.bannerText} data-connect-error="">
                {error.text}
              </span>
            </Banner>
          ) : null}

          <div class={styles.field}>
            <label for="connect-token" class={cx(styles.fieldLabel, 't-arabic-label-xs')}>
              رمز الوصول
            </label>
            <Input
              id="connect-token"
              type="password"
              value={token}
              placeholder="github_pat_…"
              class={styles.ltr}
              state={busy ? 'disabled' : error ? 'error' : 'default'}
              onInput={setToken}
            />
            <p class={cx(styles.fieldHint, 't-arabic-ui-xs')}>
              يكفيه صلاحية Issues على المستودع الذي تختاره. ولرفع صورة البلاغ أصلًا في المستودع
              يلزمه كذلك Contents (كتابة)؛ وإن لم تمنحه فاختر تضمين الصورة في النصّ.
            </p>
          </div>

          <section class={sheet.group} aria-labelledby="connect-uses">
            <h3 id="connect-uses" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
              ما يفعله رصد بالرمز
            </h3>
            <div class={sheet.summary}>
              {USES.map((use) => (
                <div key={use.label} class={sheet.kv}>
                  <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>{use.label}</span>
                  <span class={cx(sheet.rowValue, 't-arabic-ui-xs-strong')}>{use.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer class={cx(sheet.actions, styles.actions)}>
          <Button
            type="submit"
            variant="primary"
            size="l"
            icon="plug"
            state={busy ? 'loading' : token.trim() === '' ? 'disabled' : 'default'}
            data-connect-submit=""
          >
            اتّصل
          </Button>
          <Button
            variant="secondary"
            size="l"
            onClick={onClose}
            {...(busy ? { state: 'disabled' as const } : {})}
          >
            ألغِ
          </Button>
        </footer>
      </form>
    </div>
  )
}
