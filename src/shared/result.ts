/**
 * `Result` — الأخطاء قيمة لا استثناء.
 *
 * حدود الإضافة (رسائل، تخزين، صلاحيات) تفشل كثيرًا ولأسباب متوقّعة: الـservice
 * worker مات، التبويب أُغلق، الحصة امتلأت، المستخدم رفض. الاستثناء يخفي هذه
 * الحالات خلف `try/catch` عام؛ `Result` يجعلها جزءًا من النوع فلا يمكن نسيانها.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E = RasdError> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

/** رموز الأخطاء المعروفة. كل واحد يقابل حالة واجهة مصمَّمة. */
export type RasdErrorCode =
  | 'timeout' // انتهت المهلة قبل الردّ
  | 'no-receiver' // لا مستقبِل للرسالة (SW نائم أو الصفحة أُغلقت)
  | 'disconnected' // انقطعت القناة أثناء العمل
  | 'handler-failed' // المستقبِل استقبل ورمى
  | 'not-injectable' // الصفحة مقيّدة — انظر `restricted.ts`
  | 'permission-denied' // المستخدم رفض صلاحية
  | 'quota-exceeded' // التخزين ممتلئ
  | 'incognito-blocked' // الحفظ ممنوع في التصفّح الخاص
  | 'not-found' // سجلّ غير موجود
  | 'invalid-data' // بيانات لا تطابق المخطّط
  | 'migration-failed' // ترحيل قاعدة البيانات فشل
  | 'cancelled' // ألغى المستخدم
  | 'unknown'

export interface RasdError {
  readonly code: RasdErrorCode
  /** رسالة عربية صالحة للعرض مباشرة. */
  readonly message: string
  /** تفصيل تقني للسجلّ — لا يُعرض للمستخدم. */
  readonly detail?: string
}

const MESSAGES: Record<RasdErrorCode, string> = {
  timeout: 'انتهت المهلة قبل وصول الردّ.',
  'no-receiver': 'تعذّر الوصول إلى الجزء المسؤول من الإضافة.',
  disconnected: 'انقطع الاتصال أثناء تنفيذ العملية.',
  'handler-failed': 'فشلت العملية أثناء التنفيذ.',
  'not-injectable': 'لا يمكن العمل داخل هذه الصفحة.',
  'permission-denied': 'لم تُمنح الصلاحية المطلوبة.',
  'quota-exceeded': 'مساحة التخزين ممتلئة. احذف أو أرشِف بعض اللقطات.',
  'incognito-blocked': 'الحفظ معطَّل في التصفّح الخاص.',
  'not-found': 'العنصر غير موجود.',
  'invalid-data': 'البيانات غير صالحة.',
  'migration-failed': 'تعذّرت ترقية قاعدة البيانات المحلية.',
  cancelled: 'أُلغيت العملية.',
  unknown: 'حدث خطأ غير متوقّع.',
}

/** يبني خطأً برسالته العربية الافتراضية. */
export function rasdError(code: RasdErrorCode, detail?: string): RasdError {
  return detail === undefined
    ? { code, message: MESSAGES[code] }
    : { code, message: MESSAGES[code], detail }
}

export const errWith = (code: RasdErrorCode, detail?: string): Err<RasdError> =>
  err(rasdError(code, detail))

/**
 * خطأ برسالة **محدَّدة** تتجاوز الرسالة الافتراضية للرمز.
 *
 * الرسالة الافتراضية تصف صنف العطل («لم تُمنح الصلاحية المطلوبة»)، وهو ما
 * يكفي حين لا يملك المستدعي أكثر. لكن حين يعرف السبب بعينه — انتهت صلاحية
 * `activeTab` مقابل تجاوز حدّ الالتقاط، وكلاهما `permission-denied` — فإخفاء
 * ذلك خلف نصّ واحد يحرم المستخدم من الفعل الصحيح: الأوّل يحلّه بإعادة تشغيل
 * الأداة، والثاني بالانتظار لحظة.
 *
 * الرمز يبقى للتصنيف البرمجي، والرسالة للإنسان.
 */
export const errText = (code: RasdErrorCode, message: string, detail?: string): Err<RasdError> =>
  err(detail === undefined ? { code, message } : { code, message, detail })

/**
 * استثناء يحمل `RasdError` كاملًا.
 *
 * حدّ الرسائل يحوّل الرمي إلى ردّ خطأ عبر `toRasdError`، وهي لا تعرف من نصّ
 * الرمي إلا أنه نصّ — فتضعه في `detail` وتُلبس الردَّ رسالةَ الرمز العامّة.
 * النتيجة أن مستقبِلًا يعرف السبب بعينه («انتهت صلاحية الإذن») يُسلِّم إلى
 * المستخدم «فشلت العملية أثناء التنفيذ».
 *
 * هذا الحامل يعبر الحدّ سليمًا: `toRasdError` تتعرّف عليه وتُخرج ما بداخله
 * كما هو.
 */
export class RasdThrow extends Error {
  readonly rasd: RasdError

  constructor(error: RasdError) {
    super(error.message)
    this.name = 'RasdThrow'
    this.rasd = error
  }
}

/** يحوّل أي قيمة مرمية إلى `RasdError` — لا استثناء يفلت. */
export function toRasdError(thrown: unknown, fallback: RasdErrorCode = 'unknown'): RasdError {
  if (thrown instanceof RasdThrow) return thrown.rasd
  if (thrown instanceof Error) {
    const text = thrown.message
    // Chrome يبلّغ عن غياب المستقبِل بنصّ ثابت لا برمز.
    if (text.includes('Receiving end does not exist')) return rasdError('no-receiver', text)
    if (text.includes('message port closed')) return rasdError('disconnected', text)
    if (text.includes('QuotaExceeded') || thrown.name === 'QuotaExceededError') {
      return rasdError('quota-exceeded', text)
    }
    return rasdError(fallback, text)
  }
  return rasdError(fallback, String(thrown))
}

/** يشغّل عملية قد ترمي ويُرجع `Result`. */
export async function attempt<T>(
  fn: () => Promise<T> | T,
  fallback: RasdErrorCode = 'unknown',
): Promise<Result<T>> {
  try {
    return ok(await fn())
  } catch (thrown) {
    return err(toRasdError(thrown, fallback))
  }
}

/** يستخرج القيمة أو يُرجع بديلًا — للمسارات التي لا تهتمّ بالسبب. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}
