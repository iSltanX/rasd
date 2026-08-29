/**
 * كاشف الصفحات المقيّدة.
 *
 * تُستدعى `isInjectable` **قبل أي محاولة حقن**. المتصفح يمنع الإضافات من
 * العمل داخل واجهاته الداخلية وصفحات المتجر وعارض PDF المدمج، ومحاولة الحقن
 * هناك ترمي خطأً غامضًا. معرفة السبب مسبقًا تسمح بعرض الحالة `popup / restricted`
 * برسالة تشرح لماذا — لا رسالة خطأ عامة.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

/** سبب منع الحقن — تعرضه الواجهة نصًّا مفهومًا. */
export type RestrictionReason =
  | 'browser-internal' // chrome:// · edge:// · about: وأخواتها
  | 'extension-page' // صفحة إضافة أخرى أو صفحتنا
  | 'web-store' // متجر الإضافات، القديم والجديد
  | 'pdf-viewer' // عارض PDF المدمج
  | 'view-source' // عرض المصدر
  | 'local-file' // file:// — يحتاج إذن «السماح بالوصول إلى روابط الملفات»
  | 'devtools' // صفحات أدوات المطوّر
  | 'invalid-url' // عنوان غير صالح أو فارغ

export type InjectionCheck =
  { readonly injectable: true } | { readonly injectable: false; readonly reason: RestrictionReason }

const ALLOWED: InjectionCheck = { injectable: true }
const deny = (reason: RestrictionReason): InjectionCheck => ({ injectable: false, reason })

/** مخطّطات داخلية للمتصفح — لا يعمل فيها أي content script. */
const INTERNAL_SCHEMES = new Set([
  'chrome:',
  'chrome-untrusted:',
  'edge:',
  'brave:',
  'opera:',
  'vivaldi:',
  'about:',
  'data:',
  'blob:',
  'javascript:',
])

/** مضيفو متجر الإضافات — الجديد والقديم. المتصفح يحمي كليهما. */
const WEB_STORE_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com'])

/**
 * هل يُسمح بحقن الشيفرة في هذا العنوان؟
 *
 * `undefined` أو عنوان غير صالح يُعامَل كمنع — الافتراض الآمن.
 */
export function checkInjectable(url: string | undefined | null): InjectionCheck {
  if (!url) return deny('invalid-url')

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return deny('invalid-url')
  }

  const scheme = parsed.protocol.toLowerCase()

  if (scheme === 'devtools:') return deny('devtools')
  if (scheme === 'view-source:') return deny('view-source')
  if (scheme === 'chrome-extension:' || scheme === 'moz-extension:') return deny('extension-page')
  if (INTERNAL_SCHEMES.has(scheme)) return deny('browser-internal')
  if (scheme === 'file:') return deny('local-file')

  if (scheme !== 'http:' && scheme !== 'https:') return deny('browser-internal')

  const host = parsed.hostname.toLowerCase()
  if (WEB_STORE_HOSTS.has(host)) {
    // النطاق القديم يحمي مسار ‎/webstore‎ فقط؛ الجديد محميّ كاملًا.
    if (host === 'chrome.google.com' && !parsed.pathname.startsWith('/webstore')) return ALLOWED
    return deny('web-store')
  }

  // عارض PDF المدمج يحلّ محلّ المستند، فلا يصل إليه content script.
  if (parsed.pathname.toLowerCase().endsWith('.pdf')) return deny('pdf-viewer')

  return ALLOWED
}

/** الشكل المختصر: هل يُسمح بالحقن؟ */
export function isInjectable(url: string | undefined | null): boolean {
  return checkInjectable(url).injectable
}

/** نصّ عربي يشرح سبب المنع — تعرضه حالة `popup / restricted`. */
export function restrictionMessage(reason: RestrictionReason): string {
  switch (reason) {
    case 'browser-internal':
      return 'لا تعمل الإضافات داخل صفحات المتصفح الداخلية.'
    case 'extension-page':
      return 'لا يمكن الفحص داخل صفحة إضافة أخرى.'
    case 'web-store':
      return 'يمنع المتصفح عمل الإضافات داخل متجر الإضافات.'
    case 'pdf-viewer':
      return 'عارض PDF المدمج لا يقبل الفحص. نزّل الملف وافتحه في محرّر.'
    case 'view-source':
      return 'صفحة عرض المصدر لا تقبل الفحص.'
    case 'local-file':
      return 'الملفات المحلية تحتاج تفعيل «السماح بالوصول إلى روابط الملفات» من صفحة الإضافات.'
    case 'devtools':
      return 'صفحات أدوات المطوّر لا تقبل الفحص.'
    case 'invalid-url':
      return 'تعذّرت قراءة عنوان هذه الصفحة.'
  }
}
