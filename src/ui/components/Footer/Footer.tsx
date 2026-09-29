import { AUTHOR_CREDIT, REPO_URL, SHOW_REPO_LINK, SITE_LABEL, SITE_URL } from '@/shared/links'
import { cx } from '@/ui/cx'

import styles from './Footer.module.css'

import type { JSX } from 'preact'

export type FooterLayout = 'inline' | 'stacked'

export interface FooterProps {
  /** `inline` سطر أسفل الصفحة، و`stacked` عمود في أسفل الشريط الجانبي. */
  layout?: FooterLayout
  /**
   * إظهار رابط المستودع. الافتراضي ثابت البناء `SHOW_REPO_LINK` — مخفيّ ما دام
   * المستودع خاصًّا. يُمرَّر صراحةً في المعرض والاختبار وحدهما.
   */
  showRepo?: boolean
  class?: string | undefined
}

/** الرابطان يفتحان في تبويب جديد بلا وصول إلى الصفحة الفاتحة ولا إرسال للمصدر. */
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

/**
 * `Footer` — 4 variant: التخطيط × المستودع. «تصميم وتطوير: سلطان» والموقع، والمستودع
 * خلف ثابت بناء قيمته الافتراضية «مخفيّ» فلا يُعرض رابط يعطي 404
 * (`Docs/Design.md` §7 القرار 18).
 */
export function Footer({
  layout = 'inline',
  showRepo = SHOW_REPO_LINK,
  class: className,
}: FooterProps): JSX.Element {
  return (
    <footer class={cx(styles.footer, styles[layout], className)}>
      <span class={styles.credit}>{AUTHOR_CREDIT}</span>
      <span class={styles.links}>
        <a class={cx(styles.link, styles.site)} href={SITE_URL} {...EXTERNAL}>
          <bdi dir="ltr">{SITE_LABEL}</bdi>
        </a>
        {showRepo ? (
          <a class={styles.link} href={REPO_URL} {...EXTERNAL}>
            المستودع
          </a>
        ) : null}
      </span>
    </footer>
  )
}
