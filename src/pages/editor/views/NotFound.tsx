import type { JSX } from 'preact'

export interface NotFoundProps {
  readonly message: string
  readonly tone: 'loading' | 'error'
}

/**
 * حالة «لا لقطة» — **عرضٌ حقيقي لا خطأ صامت**.
 *
 * ثلاثة مسارات تصل هنا وكلٌّ منها بنصّه: عنوانٌ بلا معامل `capture`، ولقطة
 * حُذفت، وبايتات مفقودة. ودمجها في «تعذّر الفتح» واحدة يجعل المستخدم لا
 * يعرف أيفتح من مكان آخر أم يعيد الالتقاط.
 */
export function NotFound({ message, tone }: NotFoundProps): JSX.Element {
  return (
    <main data-editor-state={tone === 'loading' ? 'loading' : 'not-found'}>
      <p>{message}</p>
    </main>
  )
}
