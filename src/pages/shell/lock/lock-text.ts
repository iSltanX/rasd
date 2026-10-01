/**
 * نصوص القفل التي تتقاسمها نوافذه — المحاولات والمهلة بقاعدة العدد العربية (ADR 0043 §5).
 */
import { type LockError } from '@/modules/privacy/lock'
import { formatHuman, plural } from '@/shared/bidi'

/** المدّة بالدقائق مقرَّبةً إلى أعلى، مجرورةً بعد «مهلة» و«بعد»: «دقيقة» · «دقيقتين» · «٤ دقائق» · «١٦ دقيقة». */
export function minutesText(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes === 1) return 'دقيقة'
  if (minutes === 2) return 'دقيقتين'
  if (minutes <= 10) return `${formatHuman(minutes)} دقائق`
  return `${formatHuman(minutes)} دقيقة`
}

/** رسالة الخطأ تحت حقل الرمز، و`null` لما ليس خطأ رمز. */
export function codeErrorText(error: LockError, now: number): string | null {
  switch (error.kind) {
    case 'wrong-code':
      if (error.until !== null) {
        return `الرمز غير صحيح. أعد المحاولة بعد ${minutesText(error.until - now)}`
      }
      return `الرمز غير صحيح. بقيت ${plural(error.remaining, 'محاولة واحدة', 'محاولتان', 'محاولات')} قبل مهلة ${minutesText(error.next)}`
    case 'cooling-down':
      return `محاولاتٌ كثيرة خاطئة. أعد المحاولة بعد ${minutesText(error.until - now)}`
    case 'storage':
      return 'تعذّر التحقّق من الرمز الآن. أعد المحاولة بعد قليل'
    case 'too-short':
      return 'ثمانية أحرف على الأقل'
    default:
      return null
  }
}
