/**
 * حالة القفل في صفحة — تُقرأ عند الفتح، وتتبع `chrome.storage.onChanged` (ADR 0043 §3): فكٌّ في تبويب المكتبة
 * يفتح الإعدادات المفتوحة، و«اقفل الآن» في الإعدادات يقفل المكتبة المفتوحة، بلا إعادة تحميل.
 */
import { useCallback, useEffect, useState } from 'preact/hooks'

import { lockStatus, type LockStatus } from '@/modules/privacy/lock'
import { ATTEMPTS_KEY, forgetLockSnapshot, LOCK_KEY, UNLOCK_KEY } from '@/shared/storage/lock-state'

const WATCHED = new Set([LOCK_KEY, UNLOCK_KEY, ATTEMPTS_KEY])

export interface LockStatusHandle {
  /** `null` حتى تُقرأ أوّل مرّة — لا «بلا قفل» افتراضيًّا. */
  readonly status: LockStatus | null
  readonly refresh: () => Promise<LockStatus>
}

export function useLockStatus(): LockStatusHandle {
  const [status, setStatus] = useState<LockStatus | null>(null)

  const refresh = useCallback(async () => {
    const next = await lockStatus()
    setStatus(next)
    return next
  }, [])

  useEffect(() => {
    void refresh()
    const onChanged = (changes: Record<string, unknown>) => {
      if (!Object.keys(changes).some((key) => WATCHED.has(key))) return
      // لا يُتّكل على ترتيب المستمعين: حالة الحارس في الذاكرة تُبطَل هنا قبل القراءة.
      forgetLockSnapshot()
      void refresh()
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [refresh])

  return { status, refresh }
}
