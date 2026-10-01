/**
 * صفّ «قفل المكتبة» في الخصوصية (`privacy / controls`، `68:416`) ونوافذه — ADR 0043.
 *
 * المفتاح يفعّل (`lock / setup`) ويوقف بالرمز (`lock / disable`). **وما ليس في الإطار، وسببه:** «اقفل الآن» حين
 * تكون مفتوحة — وإلا لا طريق لإقفالها غير إغلاق المتصفّح كلّه، ولا لتجربة القفل بعد تفعيله؛ و«افتح» حين تكون
 * مقفلة — الإطار يرسم نافذة الفكّ فوق هذه الصفحة (`lock / unlock`) ولا يرسم ما يفتحها.
 *
 * والسطر تحت الاسم يقول حدّ القفل: يمنع فتح المكتبة في رصد، ولا يشفّر ملفّاتها.
 */
import { useEffect, useState } from 'preact/hooks'

import { lockNow } from '@/modules/privacy/lock'
import { Button } from '@/ui/components/Button/Button'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { Toggle } from '@/ui/components/Toggle/Toggle'

import { UnlockDialog } from '../../../shell/lock/UnlockDialog'
import { useLockStatus } from '../../../shell/lock/use-lock-status'
import { readLastBackup, type LastBackup } from '../../data-context'
import { useDownloadRoute } from '../../download-route'
import { BackupDialog } from '../data/BackupDialog'

import { DisableDialog } from './DisableDialog'
import styles from './lock.module.css'
import { SetupDialog } from './SetupDialog'

import type { DownloadRoute } from '@/modules/export/download'
import type { LockMode } from '@/shared/storage/lock-state'
import type { JSX } from 'preact'

type Dialog =
  | { readonly kind: 'setup' | 'disable' | 'unlock' }
  | { readonly kind: 'backup'; readonly route: DownloadRoute; readonly note: string | null }
  | null

const HINT: Record<LockMode, string> = {
  off: 'لا تُفتح المكتبة في رصد قبل إدخال الرمز. لا يشفّر ملفّاتها على القرص',
  unlocked: 'مفعَّل، والمكتبة مفتوحة حتى تغلق المتصفّح أو تقفلها بنفسك',
  locked: 'مفعَّل، والمكتبة مقفلة الآن',
}

export interface LockRowProps {
  readonly onAnnounce?: ((title: string, detail: string) => void) | undefined
}

export function LockRow({ onAnnounce }: LockRowProps): JSX.Element {
  const { status } = useLockStatus()
  const chooseRoute = useDownloadRoute()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [lastBackup, setLastBackup] = useState<LastBackup | null>(null)

  useEffect(() => {
    void readLastBackup().then(setLastBackup)
  }, [])

  const mode = status?.mode ?? null
  const close = () => setDialog(null)

  return (
    <>
      <SettingRow
        id="privacy-lock"
        label="قفل المكتبة"
        hint={mode ? HINT[mode] : 'تُقرأ حالة القفل…'}
        control={
          <span class={styles.controls} data-lock-mode={mode ?? ''}>
            {mode === 'unlocked' ? (
              <Button
                variant="secondary"
                size="s"
                onClick={() =>
                  void lockNow().then((result) => {
                    if (result.ok) onAnnounce?.('قُفلت المكتبة', 'يُطلب الرمز لفتحها من جديد.')
                  })
                }
              >
                اقفل الآن
              </Button>
            ) : null}
            {mode === 'locked' ? (
              <Button variant="secondary" size="s" onClick={() => setDialog({ kind: 'unlock' })}>
                افتح
              </Button>
            ) : null}
            <Toggle
              on={mode !== null && mode !== 'off'}
              state={mode === null ? 'disabled' : 'default'}
              onChange={(on) => setDialog({ kind: on ? 'setup' : 'disable' })}
              aria-label="قفل المكتبة"
            />
          </span>
        }
      />

      {dialog?.kind === 'setup' ? (
        <SetupDialog
          lastBackup={lastBackup}
          onBackup={() => chooseRoute((route, note) => setDialog({ kind: 'backup', route, note }))}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'backup' ? (
        <BackupDialog
          route={dialog.route}
          note={dialog.note}
          onClose={() => setDialog({ kind: 'setup' })}
          onDelivered={setLastBackup}
        />
      ) : null}
      {dialog?.kind === 'disable' ? (
        <DisableDialog
          cooldownUntil={status?.cooldownUntil ?? null}
          onClose={close}
          onDisabled={() => {
            close()
            onAnnounce?.('أُوقف قفل المكتبة', 'تُفتح المكتبة بلا رمز من الآن.')
          }}
        />
      ) : null}
      {dialog?.kind === 'unlock' ? (
        <UnlockDialog
          cooldownUntil={status?.cooldownUntil ?? null}
          dismissible
          onClose={close}
          onUnlocked={() => {
            close()
            onAnnounce?.('فُتحت المكتبة', 'حتى تغلق المتصفّح أو تقفلها بنفسك.')
          }}
          onErased={() => {
            close()
            onAnnounce?.('حُذفت المكتبة وأُزيل القفل', 'الإعدادات باقية كما هي.')
          }}
        />
      ) : null}
    </>
  )
}
