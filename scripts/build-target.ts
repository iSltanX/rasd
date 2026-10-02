/**
 * هدف البناء من جهة الأدوات — مصدرٌ واحد تقرؤه `vite.config.ts` و`vite.content.config.ts` و`scripts/verify-dist.mjs`.
 *
 * هدفان: `chromium` (الافتراضي، ومجلّده `dist/` كما كان) و`firefox` (`dist-firefox/`). والمتغيّر `RASD_TARGET`
 * يختاره؛ وما ليس هدفًا يوقف البناء بدل أن يمرّ هدفًا ثالثًا صامتًا.
 *
 * وجهة الشيفرة وقت التشغيل ثابتٌ آخر في `src/shared/platform/target.ts`، لا يُستورد من هنا: ملفّه يقرأ
 * `import.meta.env` ولا يُفحَص بـ`tsconfig.node.json`. ويثبّت `tests/unit/build/manifest-targets.test.ts` أن القائمتين
 * واحدة.
 */

export type BuildTarget = 'chromium' | 'firefox'

/** مجلّد خرج كل هدف. `Record` يُسقط التصريف إن زيد هدفٌ بلا مجلّد. */
export const OUT_DIRS: Readonly<Record<BuildTarget, string>> = {
  chromium: 'dist',
  firefox: 'dist-firefox',
}

export const BUILD_TARGETS = Object.keys(OUT_DIRS) as readonly BuildTarget[]

export const DEFAULT_TARGET: BuildTarget = 'chromium'

export function isBuildTarget(value: unknown): value is BuildTarget {
  return typeof value === 'string' && Object.hasOwn(OUT_DIRS, value)
}

/**
 * الهدف من قيمة نصّية. الفراغ أو الغياب ⇐ الافتراضي؛ وما سواهما غير الهدفين ⇐ استثناء باسم القيمة والمسموح.
 * و`source` يسمّي مصدر القيمة في الرسالة (المتغيّر أو العلَم) كي لا يُنسب الخطأ إلى غير صاحبه.
 */
export function parseBuildTarget(raw: string | undefined, source = 'RASD_TARGET'): BuildTarget {
  if (raw === undefined || raw === '') return DEFAULT_TARGET
  if (isBuildTarget(raw)) return raw
  throw new Error(`${source} = «${raw}» ليس هدف بناء — المسموح: ${BUILD_TARGETS.join(' · ')}`)
}

/** الهدف ومجلّد خرجه من بيئة العملية. */
export function resolveBuildTarget(env: NodeJS.ProcessEnv = process.env): {
  readonly target: BuildTarget
  readonly outDir: string
} {
  const target = parseBuildTarget(env.RASD_TARGET)
  return { target, outDir: OUT_DIRS[target] }
}
