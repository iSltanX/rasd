import { Icon, type IconName } from '@/ui/icons/Icon'
import { KeyCap } from '@/ui/TechnicalValue'

import styles from './CaptureCard.module.css'

import type { JSX } from 'preact'

export interface CaptureCardProps {
  /** الحرف الوحيد المطبوع على شارة الاختصار: `⇧⌘` + هذا الحرف. */
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
 * الأيقونة في بداية السطر العلوي (يمينًا) ومكوّن `KeyCap` في نهايته، ثم العنوان والوصف
 * — كما في الإطار. بنية تختلف عن `ToolCard` المشترك، فبُنيت هنا لا بإعادة تشكيله.
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
        <Icon name={icon} size="md" class={styles.icon} />
        <KeyCap>{shortcutKey}</KeyCap>
      </span>
      <span class={styles.body}>
        <span class={styles.title}>{title}</span>
        <span class={styles.hint}>{hint}</span>
      </span>
    </button>
  )
}
