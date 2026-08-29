import { Button } from '@/ui/components/Button/Button'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './MessageState.module.css'

import type { ComponentChildren, JSX } from 'preact'

export interface MessageStateAction {
  label: string
  onClick?: () => void
  icon?: IconName
}

export interface MessageStateProps {
  icon: IconName
  /** لون دائرة الأيقونة الدلالي — كل حالة من الأربع لها معنى مختلف. */
  tone: 'danger' | 'warning' | 'brand' | 'neutral'
  title: string
  /** فقرة الوصف — قد تكون أكثر من سطر. */
  children: ComponentChildren
  primary: MessageStateAction
  /**
   * ثلاث حالات (`first-run`·`permission`·`offline`) تستعمل زرًّا مصمتًا
   * بلون العلامة (`text/on-brand` في Figma)؛ `restricted` وحدها تستعمل
   * لونًا ثانويًا محايدًا (`text/primary`) لأن إجراءها إداري لا دافع نحو
   * قيمة المنتج. الفرق مصدره الملفّ نفسه، لا اختيار هنا.
   */
  primaryVariant?: 'primary' | 'secondary'
  secondary?: MessageStateAction
  /** صفّ تلميح إضافي أسفل الإجراءات — يُستعمل في «الجولة الأولى» للاختصار. */
  hint?: ComponentChildren
}

const TONE_CLASS: Record<MessageStateProps['tone'], string> = {
  danger: styles.toneDanger!,
  warning: styles.toneWarning!,
  brand: styles.toneBrand!,
  neutral: styles.toneNeutral!,
}

/**
 * القالب المشترك بين `first-run` و`permission` و`offline` و`restricted`.
 *
 * الأربعة في `13 — Extension Popup` تشترك بنية واحدة حرفيًا: دائرة أيقونة،
 * عنوان 19px، فقرة وصف، زرّ رئيسي بلون العلامة، ورابط ثانوي — فبناء قالب
 * واحد بدل أربع بطاقات شبه متطابقة يمنع أن ينحرف زرّ إغلاق واحد عن باقيها
 * لاحقًا بلا قصد.
 */
export function MessageState({
  icon,
  tone,
  title,
  children,
  primary,
  primaryVariant = 'primary',
  secondary,
  hint,
}: MessageStateProps): JSX.Element {
  return (
    <div class={styles.state}>
      <span class={`${styles.badge} ${TONE_CLASS[tone]}`}>
        <Icon name={icon} size="lg" />
      </span>
      <h2 class={styles.title}>{title}</h2>
      <p class={styles.desc}>{children}</p>
      <Button
        variant={primaryVariant}
        size="m"
        class={styles.primary}
        onClick={primary.onClick ?? (() => undefined)}
        {...(primary.icon === undefined ? {} : { icon: primary.icon })}
      >
        {primary.label}
      </Button>
      {secondary ? (
        <button
          type="button"
          class={styles.secondary}
          onClick={secondary.onClick ?? (() => undefined)}
        >
          {secondary.label}
        </button>
      ) : null}
      {hint ? <p class={styles.hintRow}>{hint}</p> : null}
    </div>
  )
}
