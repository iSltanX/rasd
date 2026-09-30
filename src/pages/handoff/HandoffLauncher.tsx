/**
 * مُحمِّل نافذة الحزمة كسولًا — ما تستورده المكتبة والمحرّر ساكنًا وحده (`STAGES/33`، الحزمة والأداء).
 *
 * النافذة والنموذج والعارضان وكاتب ZIP وأنماطها في قطعةٍ تُحمَّل بعد النقر لا عند فتح الصفحة، فلا يدفع من لا
 * يصدّر حزمةً ثمنها. **ولا يستورد هذا الملفّ إلا خطّافات Preact وأنواع النافذة:** كل استيرادٍ هنا يُحمَّل مع
 * الصفحة — قِيس أن ورقة نافذة التصدير ومكوّنين لمسار الفشل وحده أضافت نحو 5KB مضغوطة إلى إقلاع المكتبة.
 *
 * **وفشل التحميل يُقال:** قطعةٌ مفقودة بعد تحديثٍ جزئي كانت ستجعل النقر بلا أثر — زرٌّ صامت ممنوع. فتُقال
 * بتنبيه المتصفّح الأصليّ (كتأكيد الحذف في المكتبة) ثمّ تُغلق، بلا مكوّنٍ يُحمَّل لحالةٍ نادرة.
 */

import { useEffect, useState } from 'preact/hooks'

import type { HandoffDialogProps } from './HandoffDialog'
import type { ComponentType, JSX } from 'preact'

export const LOAD_FAILED = 'تعذّر فتح حزمة التسليم — أعد تحميل الصفحة ثمّ حاول مرّةً أخرى.'

export function HandoffLauncher(props: HandoffDialogProps): JSX.Element | null {
  const [Dialog, setDialog] = useState<ComponentType<HandoffDialogProps> | null>(null)

  useEffect(() => {
    let live = true
    import('./HandoffDialog').then(
      (m) => {
        if (live) setDialog(() => m.HandoffDialog)
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

  return Dialog ? <Dialog {...props} /> : null
}
