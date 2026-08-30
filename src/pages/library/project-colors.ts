/**
 * لوحة ألوان المشاريع — ثمانية خيارات ثابتة (§10.2).
 *
 * **rasd-allow-literal-file** — الملفّ كلّه بيانات لونية خام لا قيم تصميم:
 * ثمانية خيارات يختار المستخدم منها لون مشروعه، لا ألوانًا تُرسَم من نظام
 * التصميم. القيم **مؤقّتة بلا إطار Figma مقابل بعد** — المشاريع ميزة لم
 * تُصمَّم بصريًا وقت كتابة هذا الملفّ؛ تُستبدَل بالقيم المعتمَدة حين يُرسَم
 * الإطار في المرحلة 26 (نفس وضع `no-projects` في `EmptyState.tsx`، انظر
 * تعليقها).
 *
 * ثمانيةٌ لا أكثر: تكفي للتمييز البصري بين مشاريع متجاورة في شبكة أو قائمة
 * دون أن تتحوّل اللوحة نفسها إلى قرار تصميم يحتاج بحثًا مستقلًّا.
 */

export interface ProjectColorOption {
  readonly value: string
  readonly label: string
}

export const PROJECT_COLORS: readonly ProjectColorOption[] = [
  { value: '#E5484D', label: 'أحمر' },
  { value: '#F76B15', label: 'برتقالي' },
  { value: '#FFB224', label: 'أصفر' },
  { value: '#30A46C', label: 'أخضر' },
  { value: '#12A594', label: 'تركواز' },
  { value: '#0090FF', label: 'أزرق' },
  { value: '#8E4EC6', label: 'بنفسجي' },
  { value: '#E93D82', label: 'وردي' },
]

export const DEFAULT_PROJECT_COLOR: string = PROJECT_COLORS[5]!.value
