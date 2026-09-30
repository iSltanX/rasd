/**
 * الشريط العلوي — يطابق إطار Figma المرجعي `127:196` («compare / two-captures»):
 * الأيقونة فالعنوان فالسطر الفرعي في البداية، والزرّان في النهاية و«التقط الفرق» أساسيّهما.
 *
 * «تصدير التقرير» يفتح `compare / report`، و«التقط الفرق» يحفظ صورة الفرق لقطةً (`compare / diff-saved`).
 * وكلاهما معطَّلٌ حتى يُحسب الفرق — لا تقرير ولا صورة بلا نتيجة، والسبب في `title` وفي نصّ الشريط الجانبي
 * («جارٍ الحساب») معًا.
 */

import { formatDimensions } from '@/shared/bidi'
import { Button } from '@/ui/components/Button/Button'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import styles from './Header.module.css'

import type { JSX } from 'preact'

export interface HeaderProps {
  readonly titleA: string
  readonly titleB: string
  readonly width: number
  readonly height: number
  /** الفرق محسوب — الزرّان يعملان. */
  readonly ready: boolean
  readonly onReport: () => void
  readonly onCaptureDiff: () => void
}

export function Header({
  titleA,
  titleB,
  width,
  height,
  ready,
  onReport,
  onCaptureDiff,
}: HeaderProps): JSX.Element {
  return (
    <header class={styles.header}>
      <div class={styles.titleGroup}>
        <Icon name="split-view" size="md" class={styles.badgeIcon} />
        <div class={styles.titleBlock}>
          <h1 class={`${styles.title} t-arabic-ui-m-strong`}>مقارنة لقطتين</h1>
          <p class={`${styles.subtitle} t-arabic-ui-xs`}>
            {titleA} مقابل {titleB} ·{' '}
            <TechnicalValue kind="dimension" variant="inherit">
              {formatDimensions(width, height)}
            </TechnicalValue>
          </p>
        </div>
      </div>

      <div class={styles.actions}>
        <Button
          variant="secondary"
          size="m"
          icon="download"
          onClick={onReport}
          data-compare-report=""
          {...(ready ? {} : { state: 'disabled' as const })}
        >
          تصدير التقرير
        </Button>
        <Button
          variant="primary"
          size="m"
          icon="capture-area"
          onClick={onCaptureDiff}
          data-compare-capture-diff=""
          {...(ready ? {} : { state: 'disabled' as const })}
        >
          التقط الفرق
        </Button>
      </div>
    </header>
  )
}
