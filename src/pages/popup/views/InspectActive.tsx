import { KeyCap } from '@/ui/TechnicalValue'

import styles from './InspectActive.module.css'

import type { JSX } from 'preact'

export interface InspectActiveProps {
  onExit: () => void
}

/**
 * `inspect-active` — وضع الفحص نشط على هذا التبويب الآن.
 *
 * لوحة العنصر المحدَّد (المحدِّد، التخطيط، الخط، الحشوة) في `13 —
 * Extension Popup` تعرض بيانات عنصر مُحدَّد فعليًا — وهي بيانات محرّك
 * الفحص في المرحلتين 9 و11، غير موجودة بعد. هذه الحالة تُثبت الوضع الحيّ
 * الحقيقي وحده (`mode-manager` من المرحلة 6) بأمانة، بلا لوحة بيانات
 * مُختلَقة يبدو نسخ زرّها كأنه يعمل ولا يعمل.
 */
export function InspectActive({ onExit }: InspectActiveProps): JSX.Element {
  return (
    <div class={styles.state}>
      <p class={styles.title}>وضع الفحص مُفعّل</p>
      <p class={styles.sub}>مرّر فوق أي عنصر في الصفحة لفحصه</p>
      <button type="button" class={styles.exit} onClick={onExit}>
        <KeyCap>Esc</KeyCap>
        <span>إنهاء الفحص</span>
      </button>
    </div>
  )
}
