import { Button } from '@/ui/components/Button/Button'
import { cx } from '@/ui/cx'

import styles from './ErrorMessage.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type ErrorMessageLayout = 'inline' | 'page'

export interface ErrorMessageProps {
  /** ما الذي حدث — جملة يفهمها المستخدم، لا رمز خطأ خام ولا لوم له. */
  title: string
  /** ما الخطوة الممكنة الآن. */
  body: ComponentChildren
  layout?: ErrorMessageLayout
  onRetry?: (() => void) | undefined
  retryLabel?: string
  /**
   * زرّ «أبلغ عن المشكلة» — يفتح نافذة البلاغ مملوءةً بالأداة ورمز الخطأ (`shared/report-link.ts`، ADR 0050).
   * يُعرض حين يمرّره المستدعي وحده، فلا زرّ صامت (`AGENTS.md` §4).
   */
  onReport?: (() => void) | undefined
  class?: string | undefined
}

/**
 * `Error Message` — 2 variant: داخل سطح (`inline`) أو صفحة كاملة (`page`). رسالة الخطأ
 * الموحَّدة: العنوان، والتفسير والخطوة الممكنة، والإجراءات في نهاية الكتلة.
 */
export function ErrorMessage({
  title,
  body,
  layout = 'inline',
  onRetry,
  retryLabel = 'أعد المحاولة',
  onReport,
  class: className,
}: ErrorMessageProps): JSX.Element {
  return (
    <div class={cx(styles.message, styles[layout], className)} role="alert">
      <p class={styles.title}>{title}</p>
      <div class={styles.body}>{body}</div>
      {onRetry || onReport ? (
        <div class={styles.actions}>
          {onRetry ? (
            <Button variant="secondary" size="s" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {onReport ? (
            <Button variant="ghost" size="s" onClick={onReport}>
              أبلغ عن المشكلة
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
