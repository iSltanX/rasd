import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './InspectTool.module.css'

import type { JSX } from 'preact'

export interface InspectToolProps {
  icon: IconName
  label: string
  /** توكن لون الأيقونة الدلالي — كل أداة من `group-inspect` لها لونها في Figma. */
  tone: 'compare' | 'colors' | 'measure' | 'inspect'
  onClick?: () => void
  disabled?: boolean
}

const TONE_CLASS: Record<InspectToolProps['tone'], string> = {
  compare: styles.toneCompare!,
  colors: styles.toneColors!,
  measure: styles.toneMeasure!,
  inspect: styles.toneInspect!,
}

/** أداة في `group-inspect` — أربع بطاقات مربَّعة تقريبًا، أيقونة ملوَّنة فوق تسمية. */
export function InspectTool({
  icon,
  label,
  tone,
  onClick,
  disabled,
}: InspectToolProps): JSX.Element {
  return (
    <button
      type="button"
      class={`${styles.tool} ${TONE_CLASS[tone]}`}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size="md" class={styles.icon} />
      <span class={styles.label}>{label}</span>
    </button>
  )
}
