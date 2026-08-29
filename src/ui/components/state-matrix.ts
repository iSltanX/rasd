/**
 * مصفوفة الحالات الأربع عشرة على الأسطح الثمانية — من `32 — Developer Handoff`.
 *
 * نصّ العقد: «نقطة مملوءة تعني أن الحالة موجودة ومصمَّمة. نقطة فارغة تعني أنها
 * غير منطبقة — لا أنها نُسيت». هذا الملف هو التطبيق العملي لتلك الجملة: كل
 * خلية فارغة تحمل سببًا مكتوبًا، لا غيابًا صامتًا.
 */

export const STATES = [
  'default',
  'hover',
  'pressed',
  'focused',
  'selected',
  'disabled',
  'loading',
  'processing',
  'success',
  'warning',
  'error',
  'empty',
  'permission',
  'offline',
] as const

export type MatrixState = (typeof STATES)[number]

export const SURFACES = [
  'Button',
  'Icon button',
  'Input',
  'Tool card',
  'Capture flow',
  'Library grid',
  'Colour panel',
  'Compare panel',
] as const

export type MatrixSurface = (typeof SURFACES)[number]

export interface CellStatus {
  readonly applicable: boolean
  /** إلزامي عندما applicable = false. */
  readonly reason?: string
}

/**
 * الأسطح الأربعة المبنيّة في هذه المرحلة (مكوّنات مفردة). الأربعة الباقية
 * (Capture flow · Library grid · Colour panel · Compare panel) شاشات مركَّبة
 * تُبنى في مراحل لاحقة — كل حالاتها `applicable: false` بسبب موحَّد.
 */
const FUTURE_SURFACE_REASON = (surface: MatrixSurface, phase: number): CellStatus => ({
  applicable: false,
  reason: `${surface} شاشة مركَّبة لا مكوّن مفرد — تُبنى في المرحلة ${phase} وتحمل مصفوفتها الخاصة حينها.`,
})

export const STATE_MATRIX: Record<MatrixSurface, Record<MatrixState, CellStatus>> = {
  Button: {
    default: { applicable: true },
    hover: { applicable: true },
    pressed: { applicable: true },
    focused: { applicable: true },
    disabled: { applicable: true },
    loading: { applicable: true },
    selected: {
      applicable: false,
      reason: 'الزرّ فعل لحظي — لا حالة "محدَّد" مستمرّة في تصميم Figma.',
    },
    processing: {
      applicable: false,
      reason: 'يقابله Loading في محاور Figma — لا خليّتان لمفهوم واحد.',
    },
    success: { applicable: false, reason: 'نتيجة الفعل تُعرض عبر Toast لا عبر تغيّر شكل الزرّ.' },
    warning: {
      applicable: false,
      reason: 'نتيجة الفعل تُعرض عبر Toast/Banner لا عبر تغيّر شكل الزرّ.',
    },
    error: {
      applicable: false,
      reason: 'نتيجة الفعل تُعرض عبر Toast/Banner لا عبر تغيّر شكل الزرّ.',
    },
    empty: { applicable: false, reason: 'لا محتوى للزرّ ليكون فارغًا.' },
    permission: { applicable: false, reason: 'حالة صلاحية خاصة بسطح كامل (النافذة) لا بزرّ مفرد.' },
    offline: { applicable: false, reason: 'حالة اتصال خاصة بسطح كامل لا بزرّ مفرد.' },
  },
  'Icon button': {
    default: { applicable: true },
    hover: { applicable: true },
    pressed: { applicable: true },
    focused: { applicable: true },
    selected: { applicable: true },
    disabled: { applicable: true },
    loading: {
      applicable: false,
      reason:
        'غير معرَّف في محاور Icon Button بـFigma — الأزرار الأيقونية لا تحمل حالة تحميل خاصة بها.',
    },
    processing: { applicable: false, reason: 'غير معرَّف في محاور Figma.' },
    success: { applicable: false, reason: 'نتيجة الفعل تُعرض عبر Toast لا عبر شكل الزرّ.' },
    warning: { applicable: false, reason: 'نتيجة الفعل تُعرض عبر Toast لا عبر شكل الزرّ.' },
    error: { applicable: false, reason: 'نتيجة الفعل تُعرض عبر Toast لا عبر شكل الزرّ.' },
    empty: { applicable: false, reason: 'لا محتوى ليكون فارغًا.' },
    permission: { applicable: false, reason: 'حالة صلاحية خاصة بسطح كامل لا بزرّ مفرد.' },
    offline: { applicable: false, reason: 'حالة اتصال خاصة بسطح كامل لا بزرّ مفرد.' },
  },
  Input: {
    default: { applicable: true },
    hover: { applicable: true },
    focused: { applicable: true },
    error: { applicable: true },
    disabled: { applicable: true },
    pressed: { applicable: false, reason: 'حقل نصّي لا يُضغَط — التركيز (focused) يغطّي التفاعل.' },
    selected: { applicable: false, reason: 'تحديد النص داخل الحقل سلوك متصفح أصلي لا حالة مكوّن.' },
    loading: { applicable: false, reason: 'غير معرَّف في محاور Figma لهذا المكوّن.' },
    processing: { applicable: false, reason: 'غير معرَّف في محاور Figma.' },
    success: {
      applicable: false,
      reason: 'التحقّق الناجح لا يغيّر شكل الحقل في هذا التصميم — الغياب هو النجاح.',
    },
    warning: { applicable: false, reason: 'غير معرَّف؛ الخطأ (error) هو المستوى الوحيد المصمَّم.' },
    empty: { applicable: false, reason: 'الحقل الفارغ هو الحالة default — لا خليّة منفصلة.' },
    permission: { applicable: false, reason: 'حالة صلاحية خاصة بسطح كامل لا بحقل مفرد.' },
    offline: { applicable: false, reason: 'حالة اتصال خاصة بسطح كامل لا بحقل مفرد.' },
  },
  'Tool card': {
    default: { applicable: true },
    hover: { applicable: true },
    pressed: { applicable: true },
    focused: { applicable: true },
    selected: { applicable: true },
    disabled: { applicable: true },
    loading: { applicable: false, reason: 'غير معرَّف في محاور Figma لهذا المكوّن.' },
    processing: { applicable: false, reason: 'غير معرَّف في محاور Figma.' },
    success: {
      applicable: false,
      reason: 'نتيجة الفعل تُعرض في الوضع الذي تفتحه البطاقة لا في شكلها.',
    },
    warning: {
      applicable: false,
      reason: 'نتيجة الفعل تُعرض في الوضع الذي تفتحه البطاقة لا في شكلها.',
    },
    error: {
      applicable: false,
      reason: 'نتيجة الفعل تُعرض في الوضع الذي تفتحه البطاقة لا في شكلها.',
    },
    empty: { applicable: false, reason: 'البطاقة تحمل محتوًى ثابتًا دائمًا — لا حالة فراغ.' },
    permission: { applicable: false, reason: 'حالة صلاحية خاصة بسطح كامل لا بالبطاقة المفردة.' },
    offline: { applicable: false, reason: 'حالة اتصال خاصة بسطح كامل لا بالبطاقة المفردة.' },
  },
  'Capture flow': Object.fromEntries(
    STATES.map((s) => [s, FUTURE_SURFACE_REASON('Capture flow', 8)]),
  ) as Record<MatrixState, CellStatus>,
  'Library grid': Object.fromEntries(
    STATES.map((s) => [s, FUTURE_SURFACE_REASON('Library grid', 18)]),
  ) as Record<MatrixState, CellStatus>,
  'Colour panel': Object.fromEntries(
    STATES.map((s) => [s, FUTURE_SURFACE_REASON('Colour panel', 13)]),
  ) as Record<MatrixState, CellStatus>,
  'Compare panel': Object.fromEntries(
    STATES.map((s) => [s, FUTURE_SURFACE_REASON('Compare panel', 16)]),
  ) as Record<MatrixState, CellStatus>,
}
