/**
 * سياسة الصلاحيات — بيانات خالصة بلا أي اعتماد على `chrome.*`.
 *
 * تُستورد من ثلاثة مواضع، وهي **المصدر الوحيد** للقوائم:
 *   1. `manifest.config.ts` — يبني البيان منها.
 *   2. `src/shared/permissions.ts` — الدوال وقت التشغيل.
 *   3. `scripts/verify-dist.mjs` — يقارن البيان المبنيّ بها.
 *
 * فلا تتسلّل صلاحية إلى البيان بصمت.
 */

/**
 * صلاحيات دائمة. المعيار: الإضافة بلا فائدة بدونها، **ولا تُظهر تحذيرًا عند التثبيت**.
 * `downloads` نُقلت إلى الاختيارية لأنها تُظهر «إدارة تنزيلاتك».
 */
export const REQUIRED_PERMISSIONS = [
  'activeTab',
  'scripting',
  'storage',
  'unlimitedStorage',
  'offscreen',
  'contextMenus',
  'alarms',
] as const

/** تُطلب عند أول حاجة فقط، من إيماءة المستخدم، مع شرح السبب. */
export const OPTIONAL_PERMISSIONS = ['tabs', 'downloads', 'desktopCapture'] as const

/** لا تُطلب عند التثبيت أبدًا — هي مصدر تحذير «قراءة وتغيير جميع بياناتك». */
export const OPTIONAL_HOST_PERMISSIONS = ['<all_urls>'] as const

/**
 * لن تُطلب أبدًا. `verify:dist` يُسقط البناء إن ظهرت أي منها في البيان.
 * إضافة واحدة منها قرار معماري يحتاج ADR، لا تعديل سطر.
 */
export const FORBIDDEN_PERMISSIONS = [
  'history',
  'cookies',
  'bookmarks',
  'webRequest',
  'webRequestBlocking',
  'management',
  'nativeMessaging',
  'debugger',
  'proxy',
  'privacy',
  'topSites',
  'browsingData',
] as const

export type RequiredPermission = (typeof REQUIRED_PERMISSIONS)[number]
export type OptionalPermission = (typeof OPTIONAL_PERMISSIONS)[number]
export type ForbiddenPermission = (typeof FORBIDDEN_PERMISSIONS)[number]

/** سبب كل صلاحية اختيارية بالعربية — تعرضه شاشة الصلاحيات (المرحلة 20). */
export const OPTIONAL_PERMISSION_RATIONALE: Record<OptionalPermission, string> = {
  tabs: 'لقراءة عنوان الصفحة وحجم نافذتها وحفظهما مع اللقطة.',
  downloads: 'لحفظ اللقطات والتقارير في مجلّد التنزيلات باسم تختاره.',
  desktopCapture: 'لالتقاط نافذة المتصفح كاملة، بما فيها شريط التبويبات.',
}

/** سبب كل صلاحية دائمة — يُنسخ حرفيًا إلى تبرير المتجر (المرحلة 27). */
export const REQUIRED_PERMISSION_RATIONALE: Record<RequiredPermission, string> = {
  activeTab:
    'للعمل على التبويب النشط بعد إيماءة صريحة منك — بديل صلاحية الوصول الدائم لكل المواقع.',
  scripting: 'لحقن أدوات الفحص في الصفحة عند طلبك، لا تلقائيًا.',
  storage: 'لحفظ إعداداتك محليًا.',
  unlimitedStorage: 'لأن اللقطة الواحدة قد تتجاوز حصة التخزين الافتراضية البالغة 10MB.',
  offscreen: 'لنسخ الصور إلى الحافظة ومعالجة Canvas الثقيلة — لا يستطيع الـservice worker ذلك.',
  contextMenus: 'لإتاحة أدوات رصد من قائمة الزر الأيمن.',
  alarms:
    'حارس يكتشف المهام الطويلة المعلَّقة وينهيها بحالة فشل — بديل مؤقّتات لا تنجو من إيقاف الـservice worker.',
}

export const HOST_PERMISSION_RATIONALE =
  'لإبقاء المرجع فوق الصفحة بعد إعادة التحميل، ولقراءة أوراق الأنماط الخارجية عند تتبّع متغيّر CSS.'
