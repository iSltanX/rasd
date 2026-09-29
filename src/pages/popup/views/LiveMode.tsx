import { Button } from '@/ui/components/Button/Button'
import { KeyCap } from '@/ui/TechnicalValue'

import styles from './LiveMode.module.css'

import type { JSX } from 'preact'

export interface LiveModeProps {
  tone: 'inspect' | 'colors'
  title: string
  hint: string
  exitLabel: string
  onExit: () => void
}

/**
 * `popup / inspect-active` و`popup / colors` — أداة حيّة تعمل على هذا التبويب الآن.
 *
 * اللافتة من الإطار: نقطة ونصّ بلون الأداة، و`Esc` في نهاية السطر. **وبطاقة العنصر
 * وقيم اللون المرسومتان تحتها لا تُعرضان هنا:** بياناتهما في لوح الطبقة داخل الصفحة،
 * والنافذة تُغلق عند أوّل نقرة على الصفحة فلا ترى تمريرًا ولا التقاطًا — نقلهما يحتاج
 * محرّكًا لا يُبنى في مرحلة تصميم. الفرق مكتوب في `Docs/Design.md`.
 */
export function LiveMode({ tone, title, hint, exitLabel, onExit }: LiveModeProps): JSX.Element {
  return (
    <div class={styles.state}>
      <div class={`${styles.banner} ${tone === 'inspect' ? styles.inspect : styles.colors}`}>
        <span class={styles.label}>
          <span class={styles.dot} aria-hidden="true" />
          <span class="t-arabic-ui-xs-strong">{title}</span>
        </span>
        <KeyCap>Esc</KeyCap>
      </div>
      <p class={`${styles.hint} t-arabic-ui-xs`}>{hint}</p>
      <Button variant="secondary" size="m" class={styles.exit} onClick={onExit}>
        {exitLabel}
      </Button>
    </div>
  )
}
