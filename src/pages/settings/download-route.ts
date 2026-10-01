/**
 * طريق تنزيل النسخة الاحتياطية — يتقاسمه قسم البيانات ونافذة تفعيل القفل (`lock / setup`: «خذ نسخة احتياطية»
 * قبل التفعيل، `STAGES/08` المهمّة 5).
 *
 * **صلاحية `downloads` تُطلب في النقرة نفسها:** `chrome.permissions.request` يرمي خارج سلسلة الإيماءة، فحالتها
 * تُقرأ عند الفتح لا بعد النقرة، و`choose` تنادي `then` **متزامنةً** حين لا سؤال — كما كان `startBackup` في
 * `DataSection` قبل أن يُستخرج هنا.
 */
import { useEffect, useRef } from 'preact/hooks'

import {
  afterAsk,
  planDownload,
  type DownloadRoute,
  type PermissionState,
} from '@/modules/export/download'
import { hasPermission, requestPermission } from '@/shared/permissions'

import { downloadsRefused, rememberRefusal } from '../export/permission-memory'

export type ChooseRoute = (then: (route: DownloadRoute, note: string | null) => void) => void

export function useDownloadRoute(): ChooseRoute {
  const permission = useRef<PermissionState>('unknown')

  useEffect(() => {
    let live = true
    void (async () => {
      if (await hasPermission(['downloads'])) {
        if (live) permission.current = 'granted'
        return
      }
      if ((await downloadsRefused()) && live) permission.current = 'denied'
    })()
    return () => {
      live = false
    }
  }, [])

  return (then) => {
    const decision = planDownload(permission.current)
    if (!decision.ask) {
      then(decision.route, decision.note)
      return
    }
    void requestPermission(['downloads']).then(async (outcome) => {
      const next = afterAsk(outcome)
      if (next.remember) {
        permission.current = next.remember
        if (next.remember === 'denied') await rememberRefusal()
      }
      then(next.decision.route, next.decision.note)
    })
  }
}
