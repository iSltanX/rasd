/**
 * بطاقة من تفصيل المشكلة (`library / issue-detail`) وصفوف «الاسم: القيمة» فيها.
 *
 * البطاقة `<section>` بعنوانها `<h2>` فيُسمّى القسم لقارئ الشاشة، والصفوف `<dl>` حقيقية لا جدولٌ زائف.
 */

import { useId } from 'preact/hooks'

import { cx } from '@/ui/cx'

import styles from './IssueCard.module.css'

import type { ComponentChildren, JSX } from 'preact'

export interface DetailCardProps {
  title: string
  /** يمتدّ على عرض الشبكة كلّه — الخطوات والملاحظة. */
  wide?: boolean
  children: ComponentChildren
}

export function DetailCard({ title, wide = false, children }: DetailCardProps): JSX.Element {
  const id = useId()
  return (
    <section class={cx(styles.card, wide && styles.wide)} aria-labelledby={id}>
      <h2 id={id} class={cx(styles.title, 't-arabic-heading-xs')}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export function Facts({ children }: { children: ComponentChildren }): JSX.Element {
  return <dl class={styles.facts}>{children}</dl>
}

export function Fact({
  label,
  children,
}: {
  label: string
  children: ComponentChildren
}): JSX.Element {
  return (
    <div class={styles.fact}>
      <dt class={cx(styles.label, 't-arabic-ui-xs')}>{label}</dt>
      <dd class={cx(styles.value, 't-arabic-ui-s')}>{children}</dd>
    </div>
  )
}
