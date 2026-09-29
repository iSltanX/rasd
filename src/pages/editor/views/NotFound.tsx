import { ErrorMessage } from '@/ui/components/ErrorMessage/ErrorMessage'
import { Spinner } from '@/ui/components/Spinner/Spinner'

import { hrefFor } from '../../shell/library-views'

import styles from './NotFound.module.css'

import type { JSX } from 'preact'

export interface NotFoundProps {
  readonly message: string
  readonly tone: 'loading' | 'error'
}

/**
 * التحميل وتعذّر الفتح — `editor / not-found` (`303:23473`): بطاقة الخطأ في وسط المسرح.
 * «أعد المحاولة» يعيد التحميل، والعودة إلى المكتبة فعلٌ ثانٍ لأن اللقطة قد تكون حُذفت. و«أبلغ
 * عن المشكلة» لا يُعرض قبل محرّكه في `STAGES/13`.
 */
export function NotFound({ message, tone }: NotFoundProps): JSX.Element {
  return (
    <main
      class={styles.page}
      data-editor-state={tone === 'loading' ? 'loading' : 'not-found'}
      aria-busy={tone === 'loading' ? 'true' : undefined}
    >
      {tone === 'loading' ? (
        <p class={`${styles.loading} t-arabic-ui-s`}>
          <Spinner size="s" tone="brand" />
          {message}
        </p>
      ) : (
        <div class={styles.card}>
          <ErrorMessage
            layout="page"
            title="تعذّر فتح اللقطة"
            body={
              <>
                {message}{' '}
                <a class={styles.link} href={hrefFor({ kind: 'all' })}>
                  افتح المكتبة
                </a>
              </>
            }
            onRetry={() => window.location.reload()}
          />
        </div>
      )}
    </main>
  )
}
