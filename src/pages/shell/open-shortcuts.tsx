import { useState } from 'preact/hooks'

import { openShortcutSettings, SHORTCUTS_FALLBACK_HINT } from '@/shared/platform/capabilities'

import styles from './open-shortcuts.module.css'

import type { JSX } from 'preact'

/**
 * فتح صفحة اختصارات المتصفّح بالقدرة (`shared/platform/capabilities.ts`) — لا بعنوانٍ مكتوب في كل زرّ.
 *
 * `failed` يصير `true` إن تعذّر الفتح، فتعرض الواجهة `SHORTCUTS_FALLBACK_HINT` مكان الرابط: نصٌّ يقول أين
 * يُسنَد الاختصار بلا رابط يعد بما لا يفتح.
 */
export function useOpenShortcuts(): { open: () => void; failed: boolean } {
  const [failed, setFailed] = useState(false)
  return {
    failed,
    open: () => {
      void openShortcutSettings().then((opened) => setFailed(!opened))
    },
  }
}

/**
 * ما يظهر مكان الاختصار في أمرٍ لا اختصار له: رابط «أسنده من صفحة الاختصارات». وقبل أن تُقرأ الأوامر (`…`)
 * أو إن تعذّر الفتح نصٌّ بلا رابط. يخدم كل متصفّح يترك أمرًا بلا إسناد، لا Opera وحده.
 */
export function AssignShortcut({
  ready,
  open,
  failed,
}: {
  ready: boolean
  open: () => void
  failed: boolean
}): JSX.Element {
  if (!ready) return <span class={styles.none}>…</span>
  if (failed) return <span class={styles.none}>{SHORTCUTS_FALLBACK_HINT}</span>
  return (
    <button type="button" class={styles.link} onClick={open}>
      أسنده من صفحة الاختصارات
    </button>
  )
}
