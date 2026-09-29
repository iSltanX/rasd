import { Icon } from '@/ui/icons/Icon'

import styles from '../Popup.module.css'

import type { JSX } from 'preact'

export interface FooterProps {
  version: string
  onOpenLibrary?: () => void
}

/**
 * تذييل ثابت — رابط المكتبة في بداية السطر (يمينًا)، ورقم النسخة في نهايته.
 *
 * الإعدادات تعيش في زرّ الترويسة لا هنا: هكذا رسمها `13 — Extension Popup`
 * حرفيًا، خلافًا لنصّ الخطة الذي يصفهما معًا في التذييل.
 */
export function Footer({ version, onOpenLibrary }: FooterProps): JSX.Element {
  return (
    <footer class={styles.footer}>
      <button type="button" class={styles.footerLink} onClick={onOpenLibrary}>
        <Icon name="folder" size="xs" />
        <span>المكتبة</span>
      </button>
      {/* رقم النسخة قيمة تقنية بحتة — أرقام غربية دائمًا بلا حاجة إلى `formatMeasure`. */}
      <span class={styles.version}>v{version}</span>
    </footer>
  )
}
