/**
 * مؤشِّر استخدام التخزين — «إدارة الحصة» في نصّ المرحلة 18.
 *
 * منطق العتبتين (تحذير 80%، منع 95%) مبنيّ منذ المرحلة 3 في
 * `shared/storage/quota.ts` — هذا المكوّن **عرضٌ فقط** لما تُرجعه `QuotaState`،
 * لا يعيد حساب شيء. حجم التخزين **غربيّ** (`formatBytes`) لا هنديّ — قياسٌ
 * تقني لا عدٌّ بشري، وفق §3.5.
 */

import { formatBytes, formatPercent } from '@/shared/bidi/numerals'
import { ProgressBar } from '@/ui/components/ProgressBar/ProgressBar'
import { cx } from '@/ui/cx'

import styles from './QuotaIndicator.module.css'

import type { QuotaState } from '@/shared/storage/quota'
import type { JSX } from 'preact'

export interface QuotaIndicatorProps {
  state: QuotaState
}

const LEVEL_HINT: Record<QuotaState['level'], string> = {
  ok: '',
  warn: 'اقترب التخزين من الامتلاء — فكِّر في الأرشفة أو الحذف.',
  block: 'التخزين ممتلئ تقريبًا — احذف أو أرشِف قبل المتابعة.',
}

export function QuotaIndicator({ state }: QuotaIndicatorProps): JSX.Element | null {
  // لا حدّ مُبلَّغ (متصفّح لا يدعم `navigator.storage.estimate`) — لا شيء يُعرض بدل رقم مضلِّل.
  if (state.quotaBytes === 0) return null

  const percent = formatPercent(state.ratio)
  const label = `الاستخدام ${percent} — ${formatBytes(state.usageBytes)} من ${formatBytes(state.quotaBytes)}`

  return (
    <div class={cx(styles.wrap, styles[`level-${state.level}`])} title={label}>
      <ProgressBar value={state.ratio * 100} label={label} class={styles.bar} />
      <span class={styles.text}>
        {formatBytes(state.usageBytes)} / {formatBytes(state.quotaBytes)}
      </span>
      {state.level !== 'ok' ? <span class={styles.hint}>{LEVEL_HINT[state.level]}</span> : null}
    </div>
  )
}
