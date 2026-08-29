import { cx } from '@/ui/cx'

import styles from './Skeleton.module.css'

import type { JSX } from 'preact'

export type SkeletonKind = 'card' | 'row' | 'panel'

export interface SkeletonProps {
  kind: SkeletonKind
  class?: string | undefined
}

/**
 * `Skeleton` — 3 variant، مطابقة شكل ما تحلّ محلّه (المكتبة تحمّل بطاقات، لا
 * أشرطة عامة).
 */
export function Skeleton({ kind, class: className }: SkeletonProps): JSX.Element {
  return (
    <div class={cx(styles.skeleton, styles[`kind-${kind}`], className)} aria-hidden="true">
      {kind === 'card' ? (
        <>
          <div class={styles.thumb} />
          <div class={styles.line} style={{ inlineSize: '70%' }} />
          <div class={styles.line} style={{ inlineSize: '45%' }} />
        </>
      ) : null}
      {kind === 'row' ? (
        <>
          <div class={styles.avatar} />
          <div class={styles.rowLines}>
            <div class={styles.line} style={{ inlineSize: '60%' }} />
            <div class={styles.line} style={{ inlineSize: '35%' }} />
          </div>
        </>
      ) : null}
      {kind === 'panel' ? (
        <>
          <div class={styles.line} style={{ inlineSize: '40%' }} />
          <div class={styles.block} />
          <div class={styles.line} style={{ inlineSize: '80%' }} />
          <div class={styles.line} style={{ inlineSize: '55%' }} />
        </>
      ) : null}
    </div>
  )
}
