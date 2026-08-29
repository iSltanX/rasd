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
export const MODES = ['idle', 'area', 'element', 'inspect', 'measure', 'colour', 'compare'] as const

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
}
