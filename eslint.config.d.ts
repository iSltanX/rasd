/**
 * تصريح أنواع لإعداد اللنت — كي يستورده اختبار الحدود بأمان.
 *
 * `eslint.config.js` يبقى JavaScript خالصًا (تحمّله ESLint نفسها)، لكن
 * `tests/unit/architecture-boundaries.test.ts` يستورد منه **القاعدة
 * المطبَّقة فعلًا** لا نسخة منها — وهذا هو بيت القصيد: اختبار يفحص نسخة
 * ثانية من القاعدة يمرّ بينما القاعدة الحقيقية معطوبة.
 *
 * فالتصريح هنا يجعل الاستيراد مكتوب النوع بلا تحويل الإعداد إلى TypeScript
 * (وهو ما لا تقبله ESLint في `eslint.config.js` بلا محمِّل).
 */

/** منطقة حدود واحدة كما تقرؤها `import-x/no-restricted-paths`. */
export interface ArchitectureZone {
  readonly target: string
  readonly from: string
  readonly message: string
}

/** محدِّد AST واحد كما تقرؤه `no-restricted-syntax`. */
export interface RestrictedSelector {
  readonly selector: string
  readonly message: string
}

export const architectureZones: ArchitectureZone[]
export const restrictedSyntax: RestrictedSelector[]
export const encodeSelector: RestrictedSelector
export const ENCODE_ALLOWED: string[]

declare const config: unknown
export default config
