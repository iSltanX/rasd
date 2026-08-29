/**
 * إدارة حصّة التخزين.
 *
 * لقطة صفحة كاملة قد تبلغ عشرات الميغابايت. الامتلاء الصامت يعني فقدان عمل
 * المستخدم بلا تفسير، لذلك تُقاس الحصّة **قبل** كل كتابة كبيرة.
 */

import { errWith, ok, type Result } from '../result'

/** حدّ التحذير: تُعرض لافتة تقترح الأرشفة. */
export const WARN_RATIO = 0.8
/** حدّ المنع: تُرفض الكتابة برسالة صريحة. */
export const BLOCK_RATIO = 0.95

export type QuotaLevel = 'ok' | 'warn' | 'block'

export interface QuotaState {
  usageBytes: number
  quotaBytes: number
  ratio: number
  level: QuotaLevel
}

export function levelFor(ratio: number): QuotaLevel {
  if (ratio >= BLOCK_RATIO) return 'block'
  if (ratio >= WARN_RATIO) return 'warn'
  return 'ok'
}

/** يقرأ الحالة الحالية. غياب الواجهة يُعامَل كحصّة مفتوحة لا كخطأ. */
export async function quotaState(): Promise<QuotaState> {
  const estimate = await navigator.storage?.estimate?.().catch(() => null)
  const usageBytes = estimate?.usage ?? 0
  const quotaBytes = estimate?.quota ?? 0
  const ratio = quotaBytes > 0 ? usageBytes / quotaBytes : 0
  return { usageBytes, quotaBytes, ratio, level: levelFor(ratio) }
}

/**
 * بوّابة ما قبل الكتابة.
 *
 * `incomingBytes` يُحتسب ضمن النسبة حتى لا تنجح كتابة تتجاوز الحدّ بمفردها.
 */
export async function assertWritable(incomingBytes = 0): Promise<Result<QuotaState>> {
  const state = await quotaState()
  if (state.quotaBytes === 0) return ok(state)

  const projected = (state.usageBytes + incomingBytes) / state.quotaBytes
  if (projected >= BLOCK_RATIO) {
    const used = Math.round(projected * 100)
    return errWith('quota-exceeded', `الاستخدام المتوقّع ${used}% من الحصّة`)
  }
  return ok(state)
}
