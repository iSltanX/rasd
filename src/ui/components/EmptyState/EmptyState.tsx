import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './EmptyState.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type EmptyStateKind = 'no-captures' | 'no-results' | 'no-reference' | 'no-palette'

export interface EmptyStateProps {
  kind: EmptyStateKind
  action?: ComponentChildren
  class?: string | undefined
}

const CONTENT: Record<EmptyStateKind, { icon: IconName; title: string; hint: string }> = {
  'no-captures': {
    icon: 'capture-full',
    title: 'لا لقطات بعد',
    hint: 'ابدأ بالتقاط جزء من الصفحة أو الصفحة كاملة.',
  },
  'no-results': {
    icon: 'search',
    title: 'لا نتائج مطابقة',
    hint: 'جرّب كلمات بحث أو مرشِّحات مختلفة.',
  },
  'no-reference': {
    icon: 'overlay',
    title: 'لا مرجع محفوظ',
    hint: 'احفظ لقطة بوصفها مرجعًا لهذا المشروع.',
  },
  'no-palette': {
    icon: 'palette',
    title: 'لا لوحة ألوان بعد',
    hint: 'استخرج لوحة من الصفحة أو من لقطة محفوظة.',
  },
}

/** `Empty State` — 4 variant، واحد لكل سياق فراغ. */
export function EmptyState({ kind, action, class: className }: EmptyStateProps): JSX.Element {
  const content = CONTENT[kind]

  return (
    <div class={cx(styles.wrap, className)}>
      <span class={styles.iconWrap}>
        <Icon name={content.icon} size="xl" class={styles.icon} />
      </span>
      <p class={styles.title}>{content.title}</p>
      <p class={styles.hint}>{content.hint}</p>
      {action ? <div class={styles.action}>{action}</div> : null}
    </div>
  )
}
