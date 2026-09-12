/**
 * ذاكرة قرار الصلاحية — **للجلسة لا للأبد، وللرفض لا للعطل**.
 *
 * نصّ الوحدة 19.1: «عند الرفض تدهورٌ إلى `<a download>` … ولا يُعاد السؤال
 * في الجلسة نفسها». وهذا الملفّ يُنفّذ «الجلسة نفسها» بمعناها الحرفي.
 *
 * **ولماذا `chrome.storage.session` لا متغيّرٌ في الوحدة:** متغيّرٌ يعيش مع
 * الصفحة، وصفحةُ المحرر تُعاد تحميلها بالتنقّل وبـF5 — فالرفض كان يُنسى بعد
 * ثوانٍ ويُعاد السؤال، وهو عين ما يمنعه النصّ. و`storage.session` يُمحى عند
 * إغلاق المتصفّح ولا يُكتب على القرص، فهو المطابق لـ«الجلسة» بلا أثرٍ دائم
 * يخالف سياسة الخصوصية.
 *
 * **ولا يُخزَّن إلّا الرفض.** المنح يُقرأ من `chrome.permissions.contains`
 * وهو المصدر الحقيقي؛ ونسخُه هنا كان يُنشئ مصدرًا ثانيًا يتقادم حين يسحب
 * المستخدم الصلاحية من إعدادات المتصفّح.
 *
 * وهذا **أوّل استعمال لـ`chrome.storage.session` في المستودع**. والبديل عند
 * غيابه (بيئة اختبار، أو متصفّح بلا الحقل) ذاكرةٌ في الوحدة: أضعف، لكنها
 * تُبقي السلوك صحيحًا داخل الصفحة الواحدة بدل أن ترمي.
 */

const KEY = 'export.downloadsRefused'

/** الاحتياطي حين لا يوجد `storage.session` — نطاقه الصفحة لا الجلسة. */
let inMemory = false

interface SessionArea {
  get(keys: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

function sessionArea(): SessionArea | null {
  const area = (chrome as { storage?: { session?: unknown } }).storage?.session
  return (area as SessionArea | undefined) ?? null
}

/** هل رُفضت صلاحية التنزيل في هذه الجلسة؟ */
export async function downloadsRefused(): Promise<boolean> {
  const area = sessionArea()
  if (!area) return inMemory
  try {
    const bag = await area.get(KEY)
    return bag[KEY] === true
  } catch {
    // قراءةٌ فاشلة ليست رفضًا — السؤال أهون من ابتلاع قرار لم يُتَّخذ.
    return inMemory
  }
}

/** يسجّل رفضًا صريحًا من المستخدم. لا يُستدعى على الأعطال التقنية. */
export async function rememberRefusal(): Promise<void> {
  inMemory = true
  const area = sessionArea()
  if (!area) return
  try {
    await area.set({ [KEY]: true })
  } catch {
    // الاحتياطي في الذاكرة كُتب أعلاه؛ الفشل هنا يُضيّق النطاق لا يُبطله.
  }
}

/** للاختبار وحده: يُعيد الاحتياطي إلى حاله. */
export function resetRefusalMemory(): void {
  inMemory = false
}
