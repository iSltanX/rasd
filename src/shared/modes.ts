/**
 * مفردات أوضاع الطبقة داخل الصفحة — وحدة بيانات خالصة.
 *
 * تعيش في `shared/` لا في `content/` لأن ثلاثة أطراف تحتاجها: مدير الأوضاع
 * (`content/`)، وشريط الأدوات (`ui/overlay/`)، ونافذة الإضافة (المرحلة 7).
 * ولو سكنت في `content/` لاضطرّت `ui/` إلى الاستيراد من طبقة تشغيل — وهو
 * عكس اتجاه الاعتماد الصحيح.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها، ولا تلمس `chrome.*`.
 */

/** وضع واحد نشط في أي لحظة. `idle` يعني: الطبقة محقونة وصامتة. */
export const MODES = [
  'idle',
  'area',
  'element',
  'inspect',
  'measure',
  'colour',
  'compare',
  'issues',
] as const

export type Mode = (typeof MODES)[number]

/** الأوضاع التي تعرض أداة فعلية — كل شيء عدا `idle`. */
export const TOOL_MODES = MODES.filter((m) => m !== 'idle') as readonly Exclude<Mode, 'idle'>[]

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
}

/**
 * وصف كل وضع: التسمية العربية، والأيقونة، والمرحلة التي تبني أداته.
 *
 * المرحلة 6 تبني **الطبقة** لا الأدوات؛ لذلك يُذكر رقم المرحلة صراحةً حتى
 * لا يُقرأ وجود الوضع هنا على أنه وعد بأن الأداة تعمل الآن.
 */
export interface ModeMeta {
  readonly label: string
  readonly icon: string
  /** المرحلة التي تبني سلوك هذا الوضع فعليًا. */
  readonly builtIn: number
}

export const MODE_META: Record<Mode, ModeMeta> = {
  idle: { label: 'خامل', icon: 'close', builtIn: 6 },
  area: { label: 'تصوير منطقة', icon: 'capture-area', builtIn: 8 },
  element: { label: 'تصوير عنصر', icon: 'capture-element', builtIn: 9 },
  inspect: { label: 'فحص', icon: 'inspect', builtIn: 11 },
  measure: { label: 'قياس', icon: 'dimension-h', builtIn: 12 },
  colour: { label: 'لون', icon: 'eyedropper', builtIn: 13 },
  compare: { label: 'مقارنة', icon: 'split-view', builtIn: 16 },
  // «مشكلات هذه الصفحة» — لوحةٌ لا أداة رسم: لا درع، والصفحة تحتها تعمل (ADR 0031). `STAGES/32`.
  issues: { label: 'مشكلات الصفحة', icon: 'alert', builtIn: 32 },
}

/**
 * أوضاع الأدوات الأربعة القابلة لتعيين حرف اختصار مستقلّ — `§12.4`.
 *
 * هنا لا في `content/shortcuts.ts`: صفحة الإعدادات (`pages/`) تحتاج القائمة
 * والافتراضات لعرضها وتعديلها، ومدير الاختصارات (`content/`) يحتاجها لبناء
 * خريطة المفاتيح — و`content/` طبقة تشغيل تعيش داخل صفحة، لا مصدرًا تستورد
 * منه `pages/` (‏[ADR 0008](../../Docs/ADR/0008-geometry-in-shared.md) يفرض
 * الحدّ نفسه بين `modules/` و`content/`).
 */
export type ToolShortcutMode = 'inspect' | 'measure' | 'colour' | 'compare'

/** الحروف الافتراضية — تطابق خريطة `content/shortcuts.ts` حرفًا بحرف. */
export const DEFAULT_TOOL_KEYS: Readonly<Record<ToolShortcutMode, string>> = {
  inspect: 'KeyI',
  measure: 'KeyM',
  colour: 'KeyC',
  compare: 'KeyD',
}
