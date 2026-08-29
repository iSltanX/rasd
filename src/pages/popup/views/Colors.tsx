import { KeyCap } from '@/ui/TechnicalValue'

import styles from './Colors.module.css'

import type { JSX } from 'preact'

export interface ColorsProps {
  onExit: () => void
}

/**
 * `colors` — وضع اختيار اللون نشط على هذا التبويب الآن.
 *
 * لوحة القيم الأربع (HEX·RGB·HSL·OKLCH) ولوحة ألوان الصفحة في `13 —
 * Extension Popup` تحتاج عيّنة بكسل فعلية — محرّك اللون في المرحلة 13.
 * هذه الحالة تُثبت الوضع الحيّ وحده الآن؛ الأداة نفسها (المرحلة 13) تملأ
 * اللوحة حين تُبنى، بلا حاجة لتغيير هذا الملفّ.
 */
export function Colors({ onExit }: ColorsProps): JSX.Element {
  return (
    <div class={styles.state}>
      <p class={styles.title}>وضع اختيار اللون مُفعّل</p>
      <p class={styles.sub}>مرّر فوق أي نقطة في الصفحة والتقط لونها</p>
      <button type="button" class={styles.exit} onClick={onExit}>
        <KeyCap>Esc</KeyCap>
        <span>إنهاء الاختيار</span>
      </button>
    </div>
  )
}
