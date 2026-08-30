import { TechnicalValue } from '@/ui/TechnicalValue'

import { pageMetaFields, type BrowserSource } from '../page-meta'

import styles from './PageMeta.module.css'

import type { CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface PageMetaProps {
  readonly capture: CaptureRecord
  /** يُحقن في الاختبار؛ وفي المتصفّح `navigator`. */
  readonly nav?: BrowserSource
  readonly now?: number
}

/**
 * بيانات الصفحة في اللوحة الجانبية — خمسة حقول.
 *
 * **`<dl>` لا `<div>`**: هذه أزواج مصطلح/قيمة بالمعنى الحرفي، وقارئ الشاشة
 * يقرأها عندئذٍ «العنوان: كذا» لا نصًّا متجاورًا يخمّن القارئ ارتباطه.
 *
 * وكل قيمة لاتينية تمرّ من `<TechnicalValue>` — الرابط خاصّةً: رابطٌ غير
 * معزول داخل فقرة عربية تقفز أجزاؤه، فيُنسَخ مقلوبًا ويُفتح على صفحة أخرى.
 */
export function PageMeta({ capture, nav, now }: PageMetaProps): JSX.Element {
  const source: BrowserSource = nav ?? navigator
  const fields = pageMetaFields(capture, source, now)

  return (
    <dl class={styles.meta} data-page-meta="">
      {fields.map((field) => (
        <div key={field.key} class={styles.row} data-meta-field={field.key}>
          <dt class={styles.label}>{field.label}</dt>
          <dd class={styles.value}>
            {field.technical ? (
              <TechnicalValue kind={field.technical} variant="inherit" title={field.value}>
                {field.value}
              </TechnicalValue>
            ) : (
              field.value
            )}
            {field.note ? <span class={styles.note}>{field.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}
