/**
 * الشريط العلوي — يطابق إطار Figma المرجعي `127:196` («compare / two-captures»):
 * الأيقونة فالعنوان فالسطر الفرعي في البداية، والزرّان في النهاية و«التقط الفرق» أساسيّهما.
 *
 * **الزرّان معطَّلان عمدًا وسببهما في نصّهما — لا وظيفة مزيَّفة.** «تصدير التقرير» وحفظ
 * صورة الفرق (`compare / diff-saved`) يصلان مع تقرير المقارنة في `STAGES/05`. و«· قريبًا»
 * في الزرّ نفسه كما في النافذة والمحرّر، لا تلميحٌ لا يراه إلا من يمرّ فوقه.
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
}

export function Header({ titleA, titleB, width, height }: HeaderProps): JSX.Element {
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
        <Button variant="secondary" size="m" icon="download" state="disabled">
          تصدير التقرير · قريبًا
        </Button>
        <Button variant="primary" size="m" icon="capture-area" state="disabled">
          التقط الفرق · قريبًا
        </Button>
      </div>
    </header>
  )
}
