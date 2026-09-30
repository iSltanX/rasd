/**
 * مُحمِّل نافذة الحزمة كسولًا — ما تستورده المكتبة والمحرّر ساكنًا وحده (`STAGES/33`، الحزمة والأداء).
 *
 * النافذة والنموذج والعارضان وكاتب ZIP في قطعةٍ تُحمَّل بعد النقر لا عند فتح الصفحة، فلا يدفع من لا يصدّر
 * حزمةً ثمنها. وهذا الملفّ لا يستورد منها إلا أنواعها.
 *
 * **وفشل التحميل يُقال:** قطعةٌ مفقودة بعد تحديثٍ جزئي كانت ستجعل النقر بلا أثر — زرٌّ صامت ممنوع.
 */

import { useEffect, useState } from 'preact/hooks'

import { Banner, Button } from '@/ui/components'

import sheet from '../export/export.module.css'

import type { HandoffDialogProps } from './HandoffDialog'
import type { ComponentType, JSX } from 'preact'

export function HandoffLauncher(props: HandoffDialogProps): JSX.Element | null {
  const [Dialog, setDialog] = useState<ComponentType<HandoffDialogProps> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    import('./HandoffDialog').then(
      (m) => {
        if (live) setDialog(() => m.HandoffDialog)
      },
      () => {
        if (live) setFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [])

  if (Dialog) return <Dialog {...props} />
  if (!failed) return null
  return (
    <div class={sheet.scrim} role="alertdialog" aria-modal="true" aria-label="حزمة التسليم">
      <div class={sheet.modal}>
        <div class={sheet.body}>
          <Banner tone="danger">
            تعذّر فتح حزمة التسليم — أعد تحميل الصفحة ثمّ حاول مرّةً أخرى.
          </Banner>
        </div>
        <footer class={sheet.actions}>
          <Button variant="secondary" size="l" onClick={props.onClose}>
            إغلاق
          </Button>
        </footer>
      </div>
    </div>
  )
}
