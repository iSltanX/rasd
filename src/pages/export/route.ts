/**
 * طريق التنزيل من النقرة — مشتركٌ بين نافذة التصدير وتقرير المقارنة.
 *
 * **حقيقتان مقيستان تحكمانه** (انظر ترويسة `ExportFlow.tsx`):
 *
 * ١. **حالة الصلاحية تُستطلَع عند التركيب لا عند النقرة.** `hasPermission` غير متزامنة، و`await` واحدة قبل
 *    `chrome.permissions.request` تكسر سلسلة إيماءة المستخدم فيرمي النداء. فالحالة في مرجعٍ يُقرأ متزامنًا.
 * ٢. **الرفض لا يُفشل التنزيل ولا يُعاد السؤال عنه في الجلسة.** يُسجَّل، ويُسلَك مسار المرساة، ويُعلَن ما فُقد.
 *
 * كان المنطق مكتوبًا داخل `ExportFlow` وحده، وتقرير المقارنة يحتاجه حرفًا بحرف — ونسختان تتباعدان عند أوّل
 * تعديل على إحداهما.
 */

import { useEffect, useRef, type MutableRef } from 'preact/hooks'

import {
  afterAsk,
  planDownload,
  type DownloadRoute,
  type PermissionState,
} from '@/modules/export/download'
import { hasPermission, requestPermission } from '@/shared/permissions'

import { downloadsRefused, rememberRefusal } from './permission-memory'

/** الحالة المستطلَعة عند التركيب — مرجعٌ يُقرأ متزامنًا داخل معالج النقرة. */
export function usePermissionProbe(): MutableRef<PermissionState> {
  const permission = useRef<PermissionState>('unknown')
  useEffect(() => {
    let live = true
    void (async () => {
      if (await hasPermission(['downloads'])) {
        if (live) permission.current = 'granted'
        return
      }
      if (await downloadsRefused()) {
        if (live) permission.current = 'denied'
      }
    })()
    return () => {
      live = false
    }
  }, [])
  return permission
}

export interface ResolvedRoute {
  readonly route: DownloadRoute
  /** ما فُقد بالتدهور، أو `null`. */
  readonly note: string | null
}

/**
 * يحسم الطريق — **يُنادى متزامنًا من النقرة، ولا `await` قبله.** طلب الصلاحية أوّل ما يقع في السلسلة إن
 * لزم، ثمّ تُحفَظ الإجابة: المنح للجلسة، والرفض للجلسة، والعطل التقني لا يُحفَظ رفضًا (`afterAsk`).
 */
export function resolveRoute(permission: MutableRef<PermissionState>): Promise<ResolvedRoute> {
  const decision = planDownload(permission.current)
  if (!decision.ask) return Promise.resolve({ route: decision.route, note: decision.note })

  return requestPermission(['downloads']).then(async (outcome) => {
    const next = afterAsk(outcome)
    if (next.remember) {
      permission.current = next.remember
      if (next.remember === 'denied') await rememberRefusal()
    }
    return { route: next.decision.route, note: next.decision.note }
  })
}
