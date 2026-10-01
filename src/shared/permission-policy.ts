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

/**
 * **الخدمات الخارجية المسمّاة — القائمة الوحيدة لكل اتّصالٍ يخرج من رصد** ([ADR 0046](../../Docs/ADR/0046-named-network-services.md)).
 *
 * منها وحدها تُبنى ثلاثة أشياء، فلا يفترق أحدها عن الآخر:
 *   1. `connect-src` في سياسة أمن المحتوى (`extensionPagesCsp` أدناه، ويقرؤها `manifest.config.ts`).
 *   2. صلاحية المضيف الاختيارية لكلٍّ منها في `OPTIONAL_HOST_PERMISSIONS`.
 *   3. ما يسمح به مخرج الشبكة الواحد (`shared/egress.ts`) — وما سواه يُرفض قبل أن يُطلب.
 * و`verify:dist` يطابق البيان المبنيّ بها حرفًا: مصدرٌ في CSP ليس هنا يُسقط البناء.
 *
 * الأصل `https` بلا مسار ولا نجمة. **ومصدرٌ يُضاف هنا قرارٌ يحتاج ADR**، لا تعديل سطر — ونقطة استقبال
 * البلاغات (`STAGES/13`) هي الإضافة الوحيدة التي سبق إليها الـADR.
 */
export const NETWORK_SERVICES = [
  {
    id: 'github',
    origin: 'https://api.github.com',
    hostPattern: 'https://api.github.com/*',
    purpose:
      'لفتح Issue في مستودعك على GitHub حين تؤكّد ذلك — بعد أن تتّصل بنفسك وتوقف «الوضع المحلّي فقط».',
  },
] as const

export type NetworkServiceId = (typeof NETWORK_SERVICES)[number]['id']

/** أصول الخدمات المسمّاة — ما يُسمح به في `connect-src` بعد `'self'`، لا غيره. */
export const NETWORK_ORIGINS: readonly string[] = NETWORK_SERVICES.map((s) => s.origin)

/**
 * سياسة صفحات الإضافة — بلا `unsafe-eval` ولا `unsafe-inline`، والسكربت والكائنات من الإضافة وحدها، والاتّصال
 * بالإضافة **وبالخدمات المسمّاة وحدها**. الصفحة المضيفة تُعامَل كمصدر غير موثوق، وصفحاتنا لا تحمّل شيئًا من الشبكة.
 */
export function extensionPagesCsp(): string {
  return `script-src 'self'; object-src 'self'; connect-src ${["'self'", ...NETWORK_ORIGINS].join(' ')}`
}

/**
 * لا تُطلب عند التثبيت أبدًا. `<all_urls>` مصدر تحذير «قراءة وتغيير جميع بياناتك» ويُطلب لموقعٍ واحد عند الحاجة؛
 * وأنماط الخدمات المسمّاة تُطلب من إيماءة «اتّصل» وحدها، ومخرج الشبكة يشترطها.
 */
export const OPTIONAL_HOST_PERMISSIONS = [
  '<all_urls>',
  ...NETWORK_SERVICES.map((s) => s.hostPattern),
] as const

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

/**
 * سبب كل صلاحية اختيارية بالعربية — تعرضه شاشة الصلاحيات (الوحدة 20.3).
 *
 * **صُحِّحت نصّان منها في 20.3 على المقيس لا الموروث** — شرط نجاح الوحدة
 * نصُّه «كل صلاحية معروضة بسببها الحقيقي لا الموروث»، وهذه أوّل شاشة تعرض
 * هذه النصوص على مستخدم:
 *
 * - `tabs`: النصّ السابق وعد بـ«عنوان الصفحة **وحجم نافذتها**». والشطران
 *   منقوضان: العنوان يُقرأ بـ`activeTab` وحدها (‏`capture-service.ts`
 *   `tab.title`)، و«حجم النافذة» غير محفوظ أصلًا — أبعاد السجلّ مشتقّة من
 *   الصورة لا من النافذة (`storage/schema.ts`). فأُعيد على استعمالٍ مستقبليّ
 *   مُسمًّى، معلَّمًا بأنه غير مستعمَل اليوم.
 * - `desktopCapture`: ميزةٌ **أسقطتها الخطّة نفسها** (‏`Docs/Engineering.md §4`
 *   «يتجاوز حدود إضافة المتصفح») بينما يؤجّلها `Docs/ADR/permissions.md`
 *   إلى 1.1 — تناقضٌ يحسمه ملفّ الصلاحيات في الوحدة 25.1، ولا يجوز قبل
 *   حسمه أن تَعِد الشاشة بقدرة لا سطر كود لها (‏`§6` صفّ 122).
 */
export const OPTIONAL_PERMISSION_RATIONALE: Record<OptionalPermission, string> = {
  tabs: 'لقراءة بيانات التبويبات خارج التبويب النشط. لا يطلبها أي مسار اليوم.',
  downloads: 'لحفظ اللقطات والتقارير في مجلّد التنزيلات باسم تختاره.',
  desktopCapture: 'لالتقاط نافذة المتصفح كاملة — ميزة مؤجَّلة بلا تنفيذ اليوم، ولا يطلبها أي مسار.',
}

/**
 * **ما يتوقّف فعلًا عند رفض كل صلاحية اختيارية** — الحقل الذي طلبته `§11.5`
 * ولم يكن له مصدر واحد في المستودع قبل الوحدة 20.3.
 *
 * كلٌّ منها مقروءٌ من مسار التدهور الحقيقي لا مُصاغٌ تقديرًا؛ ونصّ `downloads`
 * منقول حرفيًّا عن `DEGRADE_NOTE` في `modules/export/download.ts` — المصدر
 * نفسه لا نسخةٌ منه تنحرف عنه لاحقًا.
 *
 * و`Record<OptionalPermission, string>` لا كائنٌ حرّ: الاتحاد مشتقّ من
 * `OPTIONAL_PERMISSIONS`، فصلاحيةٌ تُضاف بلا جملةٍ هنا تُسقط `pnpm typecheck`.
 * وهذا هو الحارس الحقيقي الوحيد ضدّ «صلاحية بلا سبب» — لا سكربت.
 */
export const OPTIONAL_PERMISSION_DENIAL: Record<OptionalPermission, string> = {
  tabs: 'لا شيء — لا ميزة في رصد تعتمد عليها اليوم.',
  downloads:
    'يذهب الملفّ إلى مجلّد التنزيلات الافتراضي مباشرةً — بلا اختيار مكانٍ ولا زرّ «افتح المجلّد».',
  desktopCapture: 'لا شيء — الميزة نفسها غير منفَّذة بعد.',
}

/** ما يتوقّف عند رفض صلاحية المضيف — مقروءٌ من `background/resume.ts`. */
export const HOST_PERMISSION_DENIAL =
  'يعمل المرجع داخل الجلسة ويزول بإعادة تحميل الصفحة أو الانتقال منها. ولا يتعطّل شيء آخر.'

/**
 * السبع الدائمة لا تُسحَب برمجيًّا — `chrome.permissions.remove` تعمل على
 * `optional_permissions` وحدها، وتوقيع `revokePermission` يمنع تمريرها
 * أصلًا. فالشاشة تعرضها بلا زرّ سحب، وهذا نصّ ما يعنيه ذلك للمستخدم.
 */
export const REQUIRED_PERMISSION_NOTE =
  'دائمة — لا يمكن سحبها وحدها؛ تُزال بإزالة الإضافة من صفحة الإضافات في المتصفّح.'

/** سبب كل صلاحية دائمة — يُنسخ حرفيًا إلى تبرير المتجر (المرحلة 27). */
export const REQUIRED_PERMISSION_RATIONALE: Record<RequiredPermission, string> = {
  activeTab:
    'للعمل على التبويب النشط بعد إيماءة صريحة منك — بديل صلاحية الوصول الدائم لكل المواقع.',
  scripting: 'لحقن أدوات الفحص في الصفحة عند طلبك، لا تلقائيًا.',
  storage: 'لحفظ إعداداتك محليًا.',
  unlimitedStorage: 'لأن اللقطة الواحدة قد تتجاوز حصة التخزين الافتراضية البالغة 10MB.',
  offscreen:
    'محجوزة لمعالجة الصور خارج خيط الصفحة — لا مستهلك لها في النسخة الحالية، ومصيرها يُحسم قبل المتجر.',
  contextMenus: 'لإتاحة أدوات رصد من قائمة الزر الأيمن.',
  alarms:
    'حارسٌ ينهي المهام الطويلة المعلَّقة، وكنّاسٌ ينفّذ «حذف السجلّ تلقائيًا» — كلاهما بديل مؤقّتات لا تنجو من إيقاف الـservice worker.',
}

/**
 * **صُحِّح في الوحدة 20.3 — والنصّ السابق كان يَعِد بقدرة نقضها القياس.**
 *
 * كان يقول «ولقراءة أوراق الأنماط الخارجية عند تتبّع متغيّر CSS». وقياس
 * المرحلة 11 نقض ذلك مرّتين (‏`Docs/Engineering.md §6` الصفّان 42 و43): `cssRules`
 * يرمي `SecurityError` **والصلاحية ممنوحة**، في عالمَي MAIN وISOLATED معًا —
 * المانع ترويسة CSP للورقة لا الصلاحية، والمنح لا يفتح الورقة.
 *
 * وأُجِّل تصحيحه إلى المرحلة 25 في `Docs/ADR/permissions.md`، ثمّ قدّمته
 * الوحدة 20.3 لأنها **أوّل من يعرض هذا النصّ على مستخدم**: وحدةٌ شرطُ نجاحها
 * «بسببها الحقيقي لا الموروث» لا يجوز أن تكون هي نفسها ناقلةَ الوعد المنقوض.
 * وأُعيد بناؤه على المبرِّر الصامد وحده — بقاء المرجع بعد إعادة التحميل، وهو
 * ما يفعله `background/resume.ts` فعلًا. (‏`§6` صفّ 123.)
 */
export const HOST_PERMISSION_RATIONALE =
  'لإبقاء مرجع المقارنة فوق الصفحة بعد إعادة تحميلها — تُطلب لموقع واحد عند الحاجة، لا لكل المواقع.'
