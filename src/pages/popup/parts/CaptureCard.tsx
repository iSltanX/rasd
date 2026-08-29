import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './CaptureCard.module.css'

import type { JSX } from 'preact'

export interface CaptureCardProps {
  /** الحرف الوحيد المطبوع على شارة الاختصار داخل الصفحة: `⌥⇧` + هذا الحرف. */
  shortcutKey: string
  icon: IconName
  title: string
  hint: string
  onClick?: () => void
  disabled?: boolean
}

/**
 * بطاقة أداة التقاط في `group-capture` — شبكة 2×2.
 *
 * بنية Figma مختلفة عن مكوّن `ToolCard` المشترك: شارة حرف الاختصار مجاورة
 * للأيقونة أعلى البطاقة، ثم عنوان ووصف تحتها — لا أيقونة مركزية ونصّ واحد.
 * لذلك بُنيت بطاقة خاصّة هنا بدل إعادة تشكيل `ToolCard` لحالة لا تخصّه.
 */
export function CaptureCard({
  shortcutKey,
  icon,
  title,
  hint,
  onClick,
  disabled,
}: CaptureCardProps): JSX.Element {
  return (
    <button type="button" class={styles.card} onClick={onClick} disabled={disabled}>
      <span class={styles.top}>
        <kbd class={styles.key}>{shortcutKey}</kbd>
        <Icon name={icon} size="md" class={styles.icon} />
      </span>
      <span class={styles.body}>
        <span class={styles.title}>{title}</span>
        <span class={styles.hint}>{hint}</span>
      </span>
    </button>
  )
}
