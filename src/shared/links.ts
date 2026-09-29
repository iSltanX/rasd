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
