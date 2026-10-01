/**
 * مُحمِّل مؤلِّف البلاغ كسولًا — كمُحمِّل نافذة الحزمة (`pages/handoff/HandoffLauncher.tsx`): المؤلِّف وأنماطه وعميل
 * GitHub في قطعةٍ تُحمَّل بعد النقر لا عند فتح النافذة التي تحمل زرّه، فلا يدفع من لا يفتح بلاغًا ثمنها.
 * **ولا يستورد هذا الملفّ إلا خطّافات Preact وأنواع النافذة.**
 *
 * **وفشل التحميل يُقال:** قطعةٌ مفقودة بعد تحديثٍ جزئي كانت ستجعل النقر بلا أثر — زرٌّ صامت ممنوع. فتُقال بتنبيه
 * المتصفّح الأصليّ ثمّ تُغلق.
 */

import { useEffect, useState } from 'preact/hooks'

import type { IssueComposerProps } from './IssueComposer'
import type { ComponentType, JSX } from 'preact'

export const LOAD_FAILED = 'تعذّر فتح مؤلِّف البلاغ — أعد تحميل الصفحة ثمّ حاول مرّةً أخرى.'

export function IssueComposerLauncher(props: IssueComposerProps): JSX.Element | null {
  const [Composer, setComposer] = useState<ComponentType<IssueComposerProps> | null>(null)

  useEffect(() => {
    let live = true
    import('./IssueComposer').then(
      (m) => {
        if (live) setComposer(() => m.IssueComposer)
      },
      () => {
        if (!live) return
        window.alert(LOAD_FAILED)
        props.onClose()
      },
    )
    return () => {
      live = false
    }
  }, [])

  return Composer ? <Composer {...props} /> : null
}
