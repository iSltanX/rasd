/**
 * التخزين الدائم — `navigator.storage.persist()` يطلب ألّا يمحو المتصفّح المكتبة عند ضيق المساحة.
 *
 * **يُطلب عند أوّل حفظ، من صفحة إضافة:** `persist()` معرَّفة للنافذة وحدها (`[Exposed=Window]`) — لا
 * يبلغها عامل الخلفية الذي يحفظ اللقطة. فتطلبه أوّل صفحةٍ تُفتح بعد الحفظ: المحرّر الذي يفتح بعد الالتقاط
 * (الافتراضي)، والمكتبة والإعدادات متى كانت المكتبة غير فارغة (`AppShell`). والطلب لا يُظهر سؤالًا في Chrome
 * — يقرّره المتصفّح بنفسه — فتكراره في كل صفحة لا يضايق أحدًا، ويبلغ القرار أوّل صفحة بعد أن يتغيّر.
 *
 * **والنتيجة تُعرض كما هي:** قِيس في Chrome على ملفّ تعريف جديد أنه يرفض الطلب لإضافةٍ بصلاحية
 * `unlimitedStorage` (`STAGES/07`، السجلّ). فالواجهة تقول «لم يمنحه المتصفّح» ولا تدّعي حمايةً لم تُمنح —
 * والنسخة الاحتياطية هي الحماية التي بيد المستخدم.
 */

/**
 * - `persisted` ممنوح · `denied` طُلب ورفضه المتصفّح · `not-requested` غير ممنوح ولم يُطلب في هذه الصفحة
 * - `unsupported` المتصفّح بلا الواجهة، أو رمت
 */
export type PersistenceState = 'persisted' | 'denied' | 'not-requested' | 'unsupported'

interface StorageManagerLike {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
}

function manager(): StorageManagerLike | null {
  return (globalThis.navigator as { storage?: StorageManagerLike } | undefined)?.storage ?? null
}

/** يقرأ الحالة بلا طلب. */
export async function persistenceState(): Promise<PersistenceState> {
  const storage = manager()
  if (!storage?.persisted) return 'unsupported'
  try {
    return (await storage.persisted()) ? 'persisted' : 'not-requested'
  } catch {
    return 'unsupported'
  }
}

/** يطلبه إن لم يكن ممنوحًا، ويُرجع ما قرّره المتصفّح. */
export async function requestPersistence(): Promise<PersistenceState> {
  const current = await persistenceState()
  if (current !== 'not-requested') return current
  const storage = manager()
  if (!storage?.persist) return 'unsupported'
  try {
    return (await storage.persist()) ? 'persisted' : 'denied'
  } catch {
    return 'unsupported'
  }
}
