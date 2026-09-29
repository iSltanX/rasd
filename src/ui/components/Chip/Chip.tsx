import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './Chip.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type ChipTone =
  | 'neutral'
  | 'brand'
  | 'capture'
  | 'annotate'
  | 'inspect'
  | 'measure'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'compare'
  | 'colors'
export type ChipStyleVariant = 'soft' | 'solid'

export interface ChipProps {
  children: ComponentChildren
  tone?: ChipTone
  style?: ChipStyleVariant
  /** أيقونة مكان النقطة. */
  icon?: IconName
  /**
   * النقطة تحمل المعنى حين يضيق المكان عن النصّ (وصف المكوّن في Figma)، فهي ظاهرة
   * افتراضيًّا. تُخفى حين تحلّ محلّها أيقونة، أو حين يكون النصّ وحده هو المعنى.
   */
  dot?: boolean
  onRemove?: () => void
  class?: string | undefined
}

/**
 * `Chip` — 24 variant: 12 درجة × 2 نمط، كما في `12 — Components`.
 *
 * يحتضن نصّه (كان بعرض ثابت يقصّ النصّ). النقطة أوّلًا في ترتيب القراءة: تقف يمين
 * النصّ في RTL كما في الإطار. `soft` سطح الدرجة وحدّها ونصّها، و`solid` لونها الصلب
 * ونصّ معاكس — ويُحجز لحالة نشطة واحدة في السطح.
 */
export function Chip({
  children,
  tone = 'neutral',
  style: styleVariant = 'soft',
  icon,
  dot = icon === undefined,
  onRemove,
  class: className,
}: ChipProps): JSX.Element {
  return (
    <span
      class={cx(styles.chip, styles[`tone-${tone}`], styles[`style-${styleVariant}`], className)}
    >
      {icon ? <Icon name={icon} size="xs" /> : null}
      {dot ? <span class={styles.dot} aria-hidden="true" /> : null}
      <span class={styles.label}>{children}</span>
      {onRemove ? (
        <button type="button" class={styles.remove} onClick={onRemove} aria-label="إزالة الوسم">
          <Icon name="close" size="xs" />
        </button>
      ) : null}
    </span>
  )
}
