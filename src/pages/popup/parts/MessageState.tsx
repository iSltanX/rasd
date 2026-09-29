import { Button } from '@/ui/components/Button/Button'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './MessageState.module.css'

import type { ComponentChildren, JSX } from 'preact'

export interface MessageStateAction {
  label: string
  onClick: () => void
  icon?: IconName
}

export interface MessageStateProps {
  /** أيقونة الحامل — أو شعار الجولة الأولى يمرَّر في `badge`. */
  icon?: IconName
  /** درجة الحامل الدلالية: السطح والحدّ ولون الأيقونة. */
  tone: 'danger' | 'warning' | 'info' | 'brand'
  /** محتوى الحامل بدل الأيقونة — للجولة الأولى وحدها (الشعار). */
  badge?: ComponentChildren
  title: string
  /** فقرة الوصف، أو فقرتان. */
  children: ComponentChildren
  primary: MessageStateAction
  /** `primary` لما يدفع نحو قيمة المنتج، و`secondary` لإجراء إداري أو تعافٍ. */
  primaryVariant?: 'primary' | 'secondary'
  secondary?: MessageStateAction | undefined
  /** صفّ تلميح أسفل الإجراءين. */
  hint?: ComponentChildren
}

const TONE_CLASS: Record<MessageStateProps['tone'], string> = {
  danger: styles.toneDanger!,
  warning: styles.toneWarning!,
  info: styles.toneInfo!,
  brand: styles.toneBrand!,
}

/**
 * قالب حالات الرسالة في `13 — Extension Popup`: الجولة الأولى والإذن وانقطاع الاتصال
 * والمنع والخطأ والإلغاء. بنية واحدة حرفيًّا — حامل أيقونة مربّع بحدّ درجته، وعنوان
 * `Arabic/Heading/S`، ووصف، وزرّ كبير بعرض السطر، وزرّ شبحيّ تحته — فلا ينحرف زرّ
 * واحد عن أخواته لاحقًا بلا قصد.
 */
export function MessageState({
  icon,
  tone,
  badge,
  title,
  children,
  primary,
  primaryVariant = 'primary',
  secondary,
  hint,
}: MessageStateProps): JSX.Element {
  return (
    <div class={styles.state}>
      <span class={`${styles.holder} ${TONE_CLASS[tone]}`} aria-hidden="true">
        {badge ?? (icon ? <Icon name={icon} size="lg" /> : null)}
      </span>
      <div class={styles.text}>
        <h2 class={`${styles.title} t-arabic-heading-s`}>{title}</h2>
        <div class={`${styles.desc} t-arabic-ui-s`}>{children}</div>
      </div>
      <Button
        variant={primaryVariant}
        size="l"
        class={styles.action}
        onClick={primary.onClick}
        {...(primary.icon === undefined ? {} : { icon: primary.icon })}
      >
        {primary.label}
      </Button>
      {secondary ? (
        <Button variant="ghost" size="l" class={styles.action} onClick={secondary.onClick}>
          {secondary.label}
        </Button>
      ) : null}
      {hint ? <p class={`${styles.hint} t-arabic-ui-xs`}>{hint}</p> : null}
    </div>
  )
}
