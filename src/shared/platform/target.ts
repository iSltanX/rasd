/**
 * هدف البناء — ثابتٌ يقرّره البناء لا وقت التشغيل.
 *
 * هدفان لا غير: `chromium` (Chrome وEdge وBrave وOpera وVivaldi) و`firefox`. وهما وحدهما يحكمان البيان
 * ومجلّد الخرج والحزمة (`Docs/Browsers/Architecture.md` §4.1). والمتصفّح الفعلي شيءٌ آخر يُكتشف وقت التشغيل.
 *
 * **لا يُستورد خارج `src/shared/platform/`** — يمنعه `tests/unit/platform-isolation.test.ts`. ومن احتاج الفرق فيسأل
 * عن القدرة (`capabilities.ts`) قبل أن يسأل عن الهدف.
 *
 * القيمة تأتي من `define` في `vite.config.ts` (من `RASD_TARGET`، ويرفض ما ليس هدفًا). وغيابها — الاختبارات والتطوير
 * بلا تحديد — يعني `chromium`، كما كان قبل أن يُعرَف هدفٌ ثانٍ. وما سوى `firefox` يرجع إلى `chromium` عمدًا: قيمةٌ
 * مجهولة لا تُنتج ثالثًا صامتًا.
 */
export type BuildTarget = 'chromium' | 'firefox'

declare global {
  interface ImportMetaEnv {
    readonly VITE_RASD_TARGET?: string
  }
}

export const TARGET: BuildTarget =
  import.meta.env.VITE_RASD_TARGET === 'firefox' ? 'firefox' : 'chromium'
