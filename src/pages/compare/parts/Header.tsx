/**
 * الشريط العلوي — يطابق إطار Figma المرجعي `127:196` («compare / two-captures»):
 * زرّان يسارًا، عنوان وعنوان فرعي يمينًا.
 *
 * **الزرّان معطَّلان عمدًا — لا وظيفة مزيَّفة.** «تصدير التقرير» مؤجَّل صراحةً
 * إلى المرحلة 19 (`Rasd_Plan.md` جدول الاعتماديات)، و«التقط الفرق» غامض
 * الدلالة هنا (التقاطٌ حيّ جديد؟ خارج اعتماد §17 المعلَن: «لا تحتاج التقاطًا
 * حيًّا — تقرأ لقطتين محفوظتين»). يُبنيان بصريًّا مطابقين للمرجع مع تلميح
 * `title` يوضّح التأجيل، بدل حذفهما (يخالف المرجع البصري) أو تفعيلهما
 * (يخترع سلوكًا لم يُعتمَد).
 */

import { formatDimensions } from '@/shared/bidi'
import { Button } from '@/ui/components/Button/Button'
import { Icon } from '@/ui/icons/Icon'

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
        <div class={styles.titleBlock}>
          <h1 class={styles.title}>مقارنة لقطتين</h1>
          <p class={styles.subtitle}>
            {titleA} مقابل {titleB} · {formatDimensions(width, height)}
          </p>
        </div>
        <Icon name="split-view" size="md" class={styles.badgeIcon} />
      </div>

      <div class={styles.actions}>
        <span title="تصدير التقرير كملف — يُضاف في المرحلة 19.">
          <Button variant="secondary" size="s" icon="download" state="disabled">
            تصدير التقرير
          </Button>
        </span>
        <span title="التقاط لقطة جديدة للمقارنة — غير متاح من هذه الصفحة بعد.">
          <Button variant="secondary" size="s" icon="capture-area" state="disabled">
            التقط الفرق
          </Button>
        </span>
      </div>
    </header>
  )
}
