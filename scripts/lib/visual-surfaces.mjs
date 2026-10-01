/**
 * أسطح الانحدار البصري — **مصدر واحد** لما يُلتقط ولما يُقارَن (`STAGES/26`، ADR 0052).
 *
 * `scripts/design-shots.mjs` يقرؤه ليعرف أي لقطة يكتبها خطَّ أساس وأين، و`scripts/verify-visual.mjs`
 * ليعرف أي ملفّات يقارن وأي مجموعات مشاهد يشغّل، واختبار `tests/unit/visual-surfaces.test.ts` ليثبت أن
 * كل سطحٍ له خطّ أساس بالوضعين وأنّ لا صورة في المجلّد بلا سطح.
 *
 * **الأسماء القائمة لا تُغيَّر** (`AGENTS.md` §4): ما أخذته المرحلتان 05 و07 و08 و15 يبقى في مجلّده
 * (`phase-NN/`) باسمه، ومن الوضعين وضعه الذي كُتب به. والوضع الآخر وما لم يكن له خطّ أساس يُكتب في
 * `surfaces/<المعرّف>-<الوضع>.png`.
 */

export const MODES = ['dark', 'light']

/**
 * **منصّة خطوط الأساس.** كلّها أُخذت على macOS (`process.platform === 'darwin'`). تنعيم الحرف وتلميحه يختلفان
 * بين المنصّات حتى بالخطوط المحزومة نفسها، فمقارنة لقطة لينكس بخطّ أساس macOS تسقط على كل نصّ بلا عطل —
 * وهو الفشل الكاذب الذي بُنيت العتبات لتتحاشاه. فالمقارنة البكسلية على منصّة الأساس وحدها، وعلى غيرها
 * يعلنها الحارس صراحةً ولا يُسكتها (ويبقى فحصا القيم الحرفية والأرقام، وهما لا يتعلّقان بالمنصّة). وتغيير
 * هذا الثابت قرارٌ يُكتب في ADR 0052 مع خطوط الأساس التي تسنده.
 */
export const BASELINE_PLATFORM = 'darwin'

/**
 * @typedef {object} Surface
 * @property {string} id        معرّف ثابت — اسم الملفّ في `surfaces/`.
 * @property {string} frame     الإطار كما يسمّيه المشهد (`Docs/Design.md` §5).
 * @property {string} group     مجموعة المشاهد في `scripts/design-shots/`.
 * @property {string} [overlay] معرّف مشهد الطبقة فوق الصفحة (`RASD_OVERLAY_ONLY`).
 * @property {string} [scene]   جزء اسم المشهد في المكتبة (`RASD_SCENES`).
 * @property {Partial<Record<'dark' | 'light', string>>} [existing]  اسمه القائم لوضعٍ بعينه.
 * @property {Array<'dark' | 'light'>} [modes]  الأوضاع التي يُقارَن بها — الافتراضي الاثنان.
 */

/** @type {Surface[]} */
export const SURFACES = [
  {
    id: 'popup',
    frame: 'popup / default',
    group: 'popup',
    existing: { light: 'phase-07/popup-default-light-rtl.png' },
  },
  {
    id: 'area-select',
    frame: 'capture / area-select',
    group: 'overlay',
    overlay: 'capture-area',
    existing: { dark: 'phase-08/area-select-rtl.png' },
  },
  { id: 'measure', frame: 'measure / two-elements', group: 'overlay', overlay: 'measure-two' },
  {
    id: 'inspect',
    frame: 'inspect / element-selected',
    group: 'overlay',
    overlay: 'inspect-selected',
  },
  { id: 'colour', frame: 'colors / sampling', group: 'overlay', overlay: 'colour-sampling' },
  { id: 'compare', frame: 'compare / split-reference', group: 'overlay', overlay: 'compare-split' },
  {
    id: 'compare-viewports',
    frame: 'compare / viewports',
    group: 'overlay',
    overlay: 'compare-viewports',
  },
  {
    id: 'contrast-audit',
    frame: 'contrast-audit / results',
    group: 'overlay',
    overlay: 'audit-results',
  },
  {
    id: 'editor-text',
    frame: 'editor / text',
    group: 'editor',
    existing: { dark: 'phase-15/annotating-text-rtl.png' },
  },
  {
    id: 'editor-redact',
    frame: 'editor / redact',
    group: 'editor',
    modes: ['dark'],
    existing: { dark: 'phase-15/redact-blur-rtl.png' },
  },
  {
    id: 'editor-crop',
    frame: 'editor / crop',
    group: 'editor',
    modes: ['dark'],
    existing: { dark: 'phase-15/crop-square-rtl.png' },
  },
  { id: 'library', frame: 'library / grid', group: 'library', scene: 'library / grid' },
  { id: 'projects', frame: 'projects / overview', group: 'library', scene: 'projects / overview' },
  { id: 'settings', frame: 'settings / appearance', group: 'settings' },
  { id: 'privacy', frame: 'privacy / controls', group: 'settings' },
  { id: 'onboarding', frame: 'onboarding / step-1', group: 'onboarding' },
]

/**
 * لقطات ليست مشهدًا من المجموعات — صفحتا معاينةٍ لا تُبنيان في الإنتاج، تكتبهما `extraBaselines()`
 * في `design-shots.mjs`: المعرض بأوضاعه الأربعة، وشبكة حالات النافذة كاملة.
 */
export const EXTRA_BASELINES = [
  'phase-05/gallery-dark-ltr.png',
  'phase-05/gallery-dark-rtl.png',
  'phase-05/gallery-light-ltr.png',
  'phase-05/gallery-light-rtl.png',
  'phase-07/popup-states-dark-rtl.png',
]

/** الأوضاع التي يُقارَن بها سطح. */
export const modesOf = (surface) => surface.modes ?? MODES

/** مسار خطّ الأساس (نسبةً إلى `tests/visual-baselines/`) لسطحٍ ووضع. */
export const baselineFile = (surface, mode) =>
  surface.existing?.[mode] ?? `surfaces/${surface.id}-${mode}.png`

/** كل خطوط الأساس المقارَنة: `{ file, frame, mode }` — مشاهد الأسطح ثمّ الإضافية. */
export function allBaselines() {
  const list = []
  for (const surface of SURFACES) {
    for (const mode of modesOf(surface)) {
      list.push({ file: baselineFile(surface, mode), frame: surface.frame, mode, id: surface.id })
    }
  }
  for (const file of EXTRA_BASELINES) list.push({ file, frame: null, mode: null, id: file })
  return list
}

/** `frame|mode` ⇐ المسار — ما يقرؤه `design-shots.mjs` عند نسخ اللقطة. */
export function baselineShots() {
  /** @type {Record<string, string>} */
  const map = {}
  for (const b of allBaselines()) if (b.frame) map[`${b.frame}|${b.mode}`] = b.file
  return map
}

/** المجموعات التي تلزم لتلتقط كل الأسطح — بالأسماء التي يقبلها `--only=`. */
export const groupsNeeded = () => [...new Set(SURFACES.map((s) => s.group))]

/** معرّفات مشاهد الطبقة فوق الصفحة التي تلزم — `RASD_OVERLAY_ONLY`. */
export const overlayIds = () => SURFACES.filter((s) => s.overlay).map((s) => s.overlay)

/** أسماء مشاهد المكتبة التي تلزم — `RASD_SCENES`. */
export const sceneNames = () => SURFACES.filter((s) => s.scene).map((s) => s.scene)
