import { formatPercent } from '@/shared/bidi'
import { ProgressBar } from '@/ui/components/ProgressBar/ProgressBar'
import { KeyCap } from '@/ui/TechnicalValue'

import styles from './Capturing.module.css'

import type { JSX } from 'preact'

export interface CapturingProps {
  kind: string
  done: number
  total: number
  onCancel: () => void
}

/**
 * `capturing` — تقدّم تجميع البلاطات أثناء الالتقاط الكامل.
 *
 * محرّك الالتقاط الفعلي (تجميع البلاطات وحساب الارتفاع الكلّي) يصل في
 * المرحلتين 8 و10؛ هذه الحالة تعرض `session.job` كما هو — رقمين حقيقيين
 * حين تصلها مهمّة فعلية، لا نصًّا توضيحيًا مزيَّفًا الآن.
 */
export function Capturing({ kind, done, total, onCancel }: CapturingProps): JSX.Element {
  const fraction = total > 0 ? done / total : 0

  return (
    <div class={styles.state}>
      <p class={styles.title}>جارٍ الالتقاط</p>
      <p class={styles.sub}>{kind}</p>

      <div class={styles.progress}>
        <ProgressBar value={fraction * 100} label="تقدّم الالتقاط" />
        <span class={styles.percent}>{formatPercent(fraction)}</span>
      </div>

      <button type="button" class={styles.cancel} onClick={onCancel}>
        <KeyCap>Esc</KeyCap>
        <span>إلغاء الالتقاط</span>
      </button>
    </div>
  )
}
