/**
 * روابط المؤلّف والمستودع — مصدر واحد للتذييل وصفحة «عن رصد».
 *
 * `shared/` طبقة قاعدية بلا `chrome.*`، فيستوردها المعرض والاختبار أيضًا.
 */

export const AUTHOR_CREDIT = 'تصميم وتطوير: سلطان'

export const SITE_URL = 'https://www.bysltan.com'
/** ما يُعرض من الرابط: النطاق بلا بروتوكول ولا `www`. */
export const SITE_LABEL = 'bysltan.com'

export const REPO_URL = 'https://github.com/iSltanX/rasd'

/**
 * **ثابت بناء، قيمته الافتراضية «مخفيّ».** المستودع خاصّ اليوم، ورابطه يعطي زائرًا غير
 * مسجَّل 404 — ولا يُعرض في الواجهة رابط يعطي 404 (`AGENTS.md` §7). يُظهره
 * `VITE_RASD_SHOW_REPO=1 pnpm build` بعد أن يعيد الرابط 200 لزائر غير مسجَّل، بقرار
 * المالك في `STAGES/28`. Vite يستبدل القيمة وقت البناء، فالنسخة المخفيّة لا تحمل الشرط.
 */
export const SHOW_REPO_LINK: boolean = import.meta.env.VITE_RASD_SHOW_REPO === '1'

/**
 * **صفحات رصد في موقع المالك** — سياسة الخصوصية والدعم وما بعد الإزالة (`STAGES/28`، نصوصها في
 * `Docs/Store/owner-pages.md`).
 *
 * **ثابتٌ ملتزَم لا متغيّر بيئة، قيمته «غير منشورة».** الصفحات لا توجد بعد، ولا يُعرض في الواجهة رابطٌ يعطي
 * 404 ولا يُفتح بعد الإزالة (`AGENTS.md` §7). يُقلب `true` بالتزامٍ بعد أن يعيد كلٌّ من الروابط الثلاثة 200 لزائرٍ
 * غير مسجَّل — وبالتزامٍ لا بمتغيّر بناء كي لا تُشحن حزمة الإصدار بقيمةٍ نسيها أمر البناء.
 */
export const OWNER_PAGES_LIVE: boolean = false

export const PRIVACY_POLICY_URL = 'https://www.bysltan.com/rasd/privacy'
export const SUPPORT_URL = 'https://www.bysltan.com/rasd/support'

/**
 * صفحة ما بعد الإزالة — تسأل سؤالًا واحدًا اختياريًّا. بلا معرّف ولا نسخة ولا مصدر في الرابط: يفتحه
 * المتصفّح بعد الإزالة كما هو، فلا يعرف الموقع من الزائر إلا ما يعرفه من أيّ زائر.
 */
export const UNINSTALL_SURVEY_URL = 'https://www.bysltan.com/rasd/uninstall'
