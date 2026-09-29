import { Icon } from '@/ui/icons/Icon'

import styles from '../Popup.module.css'

import type { JSX } from 'preact'

export interface FooterProps {
  version: string
  onOpenLibrary?: () => void
}

/**
 * تذييل ثابت — رقم النسخة، ورابط المكتبة.
 *
 * الإعدادات تعيش في زرّ الترويسة لا هنا: هكذا رسمها `13 — Extension Popup`
 * حرفيًا، خلافًا لنصّ الخطة الذي يصفهما معًا في التذييل. النصّ العربي في
 * `Docs/Engineering.md` تعليقًا لا تصميمًا مُلزمًا؛ الإطار المصمَّم يحسم.
 */
export function Footer({ version, onOpenLibrary }: FooterProps): JSX.Element {
  return (
    <footer class={styles.footer}>
      {/* رقم النسخة قيمة تقنية بحتة — أرقام غربية دائمًا بلا حاجة إلى `formatMeasure`. */}
      <span class={styles.version}>v{version}</span>
      <button type="button" class={styles.footerLink} onClick={onOpenLibrary}>
        <span>المكتبة</span>
        <Icon name="folder" size="xs" />
      </button>
    </footer>
  )
}
