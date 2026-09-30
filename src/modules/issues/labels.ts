/**
 * تسميات المشكلة — هنا لا في كل واجهة.
 *
 * الطبقة والنافذة والمكتبة والمحرّر تعرض الحالة نفسها ونوع الفحص نفسه وسبب «تحتاج تحققًا» نفسه، وأربع نسخ
 * يدوية تتباعد: يُضاف سببٌ فيظهر في المكتبة ويغيب عن الطبقة. وسابقتها `NOTE_TAG_LABEL` في المحرّر.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import {
  CONTRAST_PROPERTY,
  type CheckKind,
  type IssueCheck,
  type IssueRecord,
  type IssueStatus,
  type RecheckReason,
} from '@/shared/issue-schema'

export const STATUS_LABEL: Readonly<Record<IssueStatus, string>> = {
  open: 'مفتوحة',
  'needs-verification': 'تحتاج تحققًا',
  resolved: 'محلولة',
}

/** درجة الرقاقة لكل حالة — لونٌ واحد في كل موضع (`Docs/Design.md` §5، «المشكلة»). */
export const STATUS_TONE: Readonly<Record<IssueStatus, 'danger' | 'warning' | 'success'>> = {
  open: 'danger',
  'needs-verification': 'warning',
  resolved: 'success',
}

export const KIND_LABEL: Readonly<Record<CheckKind, string>> = {
  style: 'نمط',
  spacing: 'مسافة',
  colour: 'لون',
  contrast: 'تباين',
}

/** سطرٌ تحت المشكلة يقول لماذا لم يُحكم عليها. */
export const REASON_LABEL: Readonly<Record<RecheckReason, string>> = {
  missing: 'لم يُعثر على العنصر في آخر فحص',
  'host-missing': 'غاب المكوّن الذي يحتوي العنصر في آخر فحص',
  'invalid-selector': 'المحدِّد لم يعد صالحًا في هذه الصفحة',
  multiple: 'المحدِّد يطابق أكثر من عنصر في آخر فحص',
  fingerprint: 'تغيّر نصّ العنصر أو وسمه فتغيّرت بصمته — تحقّق ثم غيّر الحالة',
  'closed-shadow': 'العنصر داخل مكوّن مغلق لا تصل إليه الإضافة',
  unlaid: 'العنصر غير معروض الآن فقيمته غير محسوبة',
  animating: 'حركة جارية على العنصر وقت الفحص',
  'background-image': 'خلفية العنصر صورة أو تدرّج — التباين تقريبي',
  frame: 'العنصر داخل إطار من موقع آخر',
  unreadable: 'تعذّرت قراءة القيمة أو مقارنتها',
  budget: 'لم يتّسع وقت الجولة لفحصها — أعد الفحص',
}

const SPACING_LABEL: Readonly<Record<string, string>> = {
  'gap-top': 'الفجوة (أعلى)',
  'gap-right': 'الفجوة (يمين)',
  'gap-bottom': 'الفجوة (أسفل)',
  'gap-left': 'الفجوة (يسار)',
  dx: 'الفرق الأفقي',
  dy: 'الفرق الرأسي',
}

/** اسم الخاصية المعروض: المسافة بالعربية، والتباين زوجه، وخصائص CSS كما هي (إنجليزية تقنية). */
export function propertyLabel(check: Pick<IssueCheck, 'kind' | 'property'>): string {
  if (check.kind === 'spacing') return SPACING_LABEL[check.property] ?? check.property
  if (check.kind === 'contrast') return 'color / background'
  return check.property
}

/** القيمة كما تُعرض: التباين بصيغته `3.68 : 1`، وما عداه كما هو. */
export function displayValue(kind: CheckKind, value: string | null): string {
  if (value === null) return '—'
  return kind === 'contrast' ? `${value} : 1` : value
}

/** المتوقَّعة كما تُعرض: التباين حدٌّ أدنى `≥ 4.5 : 1`. */
export function displayExpected(check: Pick<IssueCheck, 'kind' | 'expected'>): string {
  return check.kind === 'contrast' ? `≥ ${check.expected} : 1` : check.expected
}

/** السماح كما يُعرض — بالبكسل للأطوال، وبـΔE للألوان، ولا شيء للتباين. */
export function displayTolerance(check: Pick<IssueCheck, 'kind' | 'tolerance'>): string {
  if (check.kind === 'contrast') return '—'
  if (check.kind === 'colour') return `ΔE ${check.tolerance}`
  return `±${check.tolerance}px`
}

/** عناوين المستوى في فحص التباين — كل مستوى بحدّه الأدنى من WCAG. */
export const CONTRAST_LEVELS: readonly { readonly label: string; readonly min: string }[] = [
  { label: 'نصّ عادي · AA', min: '4.5' },
  { label: 'نصّ كبير · AA', min: '3' },
  { label: 'نصّ عادي · AAA', min: '7' },
  { label: 'عنصر واجهة · AA', min: '3' },
]

/** سطر الوصف تحت العنوان: المحدِّد والخاصية — `.cta-btn · padding`. */
export function subjectLine(issue: Pick<IssueRecord, 'element' | 'check'>): string {
  const property =
    issue.check.kind === 'contrast' ? CONTRAST_PROPERTY.replace('/', ' · ') : issue.check.property
  return `${issue.element.selector} · ${issue.check.kind === 'spacing' ? 'gap' : property}`
}
