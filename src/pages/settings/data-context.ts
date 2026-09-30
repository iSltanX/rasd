/**
 * منطق قسم البيانات — بلا JSX، نمط `context.ts` المجاور.
 *
 * الصفحة صفحة إضافة تملك التخزين (`AGENTS.md` §4): تقرأ القاعدة وتكتبها مباشرةً، والنسخ والاستعادة والحذف
 * تجري هنا لا في الخلفية — فمكتبةٌ بمئات الميغابايتات لا تعبر رسائل `chrome.runtime` مُرمَّزةً.
 */

import { countText, type CountForms } from '@/shared/bidi/numerals'
import { attempt } from '@/shared/result'
import { defaultSettings } from '@/shared/settings'
import { TRANSFERABLE_LEAVES, type DroppedSetting } from '@/shared/settings/transfer'
import { libraryCounts, type StoreCounts } from '@/shared/storage/library'
import {
  persistenceState,
  requestPersistence,
  type PersistenceState,
} from '@/shared/storage/persistence'
import { quotaState, type QuotaState } from '@/shared/storage/quota'

/** مفتاح «آخر نسخة» — حالةُ هذا الجهاز، تُمحى مع «احذف كل البيانات» كسائر `chrome.storage.local`. */
const LAST_BACKUP_KEY = 'rasd:last-backup'

export async function readLastBackup(): Promise<number | null> {
  const read = await attempt(
    async () => (await chrome.storage.local.get(LAST_BACKUP_KEY))[LAST_BACKUP_KEY],
  )
  return read.ok && typeof read.value === 'number' ? read.value : null
}

/** يسجّل نسخةً سُلّمت. فشل التسجيل لا يُفشل النسخة: الملفّ عند المستخدم، والسطر معلومةٌ لا ضمان. */
export async function recordLastBackup(at: number): Promise<void> {
  await attempt(() => chrome.storage.local.set({ [LAST_BACKUP_KEY]: at }))
}

export interface DataOverview {
  /** `null` حين تعذّرت قراءة القاعدة — لا أصفار كاذبة. */
  readonly counts: StoreCounts | null
  readonly quota: QuotaState
  readonly persistence: PersistenceState
  readonly lastBackup: number | null
}

/**
 * ما يعرضه القسم. والتخزين الدائم **يُطلب هنا إن كانت في المكتبة سجلّات** (`persistence.ts`) — فالشارة
 * تقول ما قرّره المتصفّح للتوّ، لا «غير مفعَّل» لطلبٍ لم يُرسَل.
 */
export async function loadOverview(): Promise<DataOverview> {
  const [counts, quota, lastBackup] = await Promise.all([
    libraryCounts(),
    quotaState(),
    readLastBackup(),
  ])
  const hasData = counts.ok && Object.values(counts.value).some((n) => n > 0)
  const persistence = hasData ? await requestPersistence() : await persistenceState()
  return { counts: counts.ok ? counts.value : null, quota, persistence, lastBackup }
}

/** مرساة تنزيل لملفٍّ صغير — بلا صلاحية `downloads` (نمط `ExcludedSites.tsx`). */
export function downloadText(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // المرساة تبدأ التنزيل متزامنةً؛ والعنوان يُحرَّر في المهمّة التالية لا يُترك على عمر الصفحة.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// ─────────────────────────────────────────────────────────────────
// النصوص
// ─────────────────────────────────────────────────────────────────

const forms = (one: string, two: string, many: string, accusative: string, singular = accusative) =>
  ({ one, two, many, accusative, singular }) satisfies CountForms

export const FORMS = {
  captures: forms('لقطة واحدة', 'لقطتان', 'لقطات', 'لقطة'),
  projects: forms('مشروع واحد', 'مشروعان', 'مشاريع', 'مشروعًا', 'مشروع'),
  tags: forms('وسم واحد', 'وسمان', 'أوسمة', 'وسمًا', 'وسم'),
  palettes: forms('لوحة واحدة', 'لوحتان', 'لوحات', 'لوحة'),
  guides: forms('دليل واحد', 'دليلان', 'أدلّة', 'دليلًا', 'دليل'),
  references: forms('مرجع واحد', 'مرجعان', 'مراجع', 'مرجعًا', 'مرجع'),
  colors: forms('لون واحد', 'لونان', 'ألوان', 'لونًا', 'لون'),
  issues: forms('مشكلة واحدة', 'مشكلتان', 'مشكلات', 'مشكلة'),
  settings: forms('إعداد واحد', 'إعدادان', 'إعدادات', 'إعدادًا', 'إعداد'),
  sites: forms('موقع واحد', 'موقعان', 'مواقع', 'موقعًا', 'موقع'),
} as const

type Counted = keyof typeof FORMS

/** الصفر كلمةٌ لا رقم: «لا مشكلات» لا «٠ مشكلة». */
const NONE: Record<Counted, string> = {
  captures: 'لا لقطات',
  projects: 'لا مشاريع',
  tags: 'لا أوسمة',
  palettes: 'لا لوحات',
  guides: 'لا أدلّة',
  references: 'لا مراجع',
  colors: 'لا ألوان',
  issues: 'لا مشكلات',
  settings: 'لا شيء',
  sites: 'لا مواقع',
}

/** العدد بمعدوده بقاعدة العدد العربية، والصفر بكلمته. */
export function count(n: number, what: Counted): string {
  return n === 0 ? NONE[what] : countText(n, FORMS[what])
}

/** عدّان في صفٍّ واحد — «١٩ لوحة · ٥ أدلّة». */
export function pair(a: number, aWhat: Counted, b: number, bWhat: Counted): string {
  return `${count(a, aWhat)} · ${count(b, bWhat)}`
}

/** أسماء الإعدادات كما تعرضها أقسام الصفحة — لكل ورقةٍ تنتقل في ملفّ الإعدادات اسمٌ هنا. */
export const SETTING_LABELS: Readonly<Record<string, string>> = {
  'capture.format': 'الصيغة الافتراضية',
  'capture.quality': 'الجودة',
  'capture.scale': 'دقّة الالتقاط',
  'capture.openEditorAfter': 'افتح المحرّر بعد كل التقاط',
  'capture.copyToClipboard': 'انسخ اللقطة إلى الحافظة',
  'capture.delaySeconds': 'مهلة قبل الالتقاط',
  'capture.saveLocation': 'احفظ نسخة في مجلّد التنزيلات',
  'annotation.color': 'لون التعليق الافتراضي',
  'annotation.strokeWidth': 'سماكة الخطّ',
  'annotation.fontSize': 'حجم النصّ',
  'annotation.pinShape': 'شكل دبّوس الترقيم',
  'annotation.pinStart': 'أوّل رقم في الدبابيس',
  'colors.defaultFormat': 'صيغة النسخ الافتراضية',
  'colors.paletteSize': 'عدد ألوان اللوحة',
  'colors.hideNeutrals': 'أخفِ الألوان الحيادية',
  'colors.scaleSystem': 'نظام درجات اللون',
  'appearance.theme': 'وضع السمة',
  'appearance.language': 'لغة الواجهة',
  'appearance.density': 'كثافة العرض',
  'shortcuts.toolKeys.inspect': 'حرف أداة الفحص',
  'shortcuts.toolKeys.measure': 'حرف أداة القياس',
  'shortcuts.toolKeys.colour': 'حرف أداة الألوان',
  'shortcuts.toolKeys.compare': 'حرف أداة المقارنة',
  'privacy.incognito': 'سلوك رصد في التصفّح الخاص',
  'privacy.excludedSites': 'المواقع المستثناة',
  'privacy.localOnly': 'الوضع المحلّي فقط',
  'privacy.stripMetadataOnExport': 'احذف البيانات الوصفية عند التصدير',
  'privacy.autoDeleteAfterDays': 'مدّة الاحتفاظ باللقطات',
}

/** اسم ورقةٍ للعرض — ومفتاحٌ لا يعرفه رصد يُعرض كما كُتب في الملفّ. */
export function settingLabel(path: string): string {
  return SETTING_LABELS[path] ?? path
}

/** الأوراق بلا اسم — يُسقط الاختبار إن وُجدت (`data-context.test.ts`). */
export const UNLABELLED = TRANSFERABLE_LEAVES.filter((leaf) => !(leaf in SETTING_LABELS))

const TYPE_NAME: Record<string, string> = {
  string: 'نصّ',
  number: 'رقم',
  boolean: 'تشغيل أو إيقاف',
  object: 'مجموعة',
}

function kindOf(value: unknown): string {
  if (value === null) return 'فارغة'
  if (Array.isArray(value)) return 'قائمة'
  return TYPE_NAME[typeof value] ?? 'قيمة أخرى'
}

/** ما يطلبه الإعداد — من قيمته الافتراضية، وحرف الأداة وعنصر القائمة باسمهما. */
function expectedKind(path: string): string {
  if (path.startsWith('shortcuts.toolKeys.')) return 'حرف لاتيني'
  if (path === 'privacy.excludedSites') return 'نصّ'
  let node: unknown = defaultSettings()
  for (const segment of path.split('.')) node = (node as Record<string, unknown> | null)?.[segment]
  return kindOf(node)
}

/** القيمة كما في الملفّ، قصيرةً — للعرض وحده. */
export function shownValue(value: unknown): string {
  if (typeof value === 'string') return value.length > 40 ? `${value.slice(0, 40)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return kindOf(value)
}

/** سطر السبب تحت اسم الإعداد المُسقَط (`data / import-settings`). */
export function dropReasonText(dropped: DroppedSetting): string {
  const value = shownValue(dropped.received)
  switch (dropped.reason) {
    case 'option':
      return `القيمة في الملفّ «${value}»، وليست من خيارات رصد`
    case 'type':
      return `القيمة ${kindOf(dropped.received)}، والمطلوب ${expectedKind(dropped.path)}`
    case 'range':
      return `القيمة ${value} خارج المدى المسموح`
    case 'format':
      return 'القيمة بغير الشكل المطلوب — حرفٌ لاتيني واحد'
    case 'site':
      return `«${value}» ليس نمط موقعٍ يصلح`
    case 'unknown':
      return 'إعدادٌ لا يعرفه هذا الإصدار من رصد'
  }
}

/**
 * التاريخ والوقت عدٌّ بشري: أرقامٌ هندية صراحةً (`nu-arab`) — `ar` وحدها تعطي أرقامًا غربية في Chrome
 * (قِيس في `STAGES/07`)، والإطار يكتب «١٢ سبتمبر ٢٠٢٦».
 */
const HUMAN_LOCALE = 'ar-u-nu-arab'

/** «آخر نسخة: …» في تأكيد الحذف. */
export function lastBackupText(at: number | null, now = Date.now()): string {
  if (at === null) return 'آخر نسخة: لم تُؤخذ نسخة بعد'
  const d = new Date(at)
  const today = new Date(now)
  const sameDay = d.toDateString() === today.toDateString()
  const date = new Intl.DateTimeFormat(
    HUMAN_LOCALE,
    sameDay ? { timeStyle: 'short' } : { dateStyle: 'long' },
  )
  return `آخر نسخة: ${sameDay ? 'اليوم ' : ''}${date.format(d)}`
}

/** تاريخ النسخة في معاينة الاستعادة — «١٢ سبتمبر ٢٠٢٦». */
export function backupDateText(at: number): string {
  return new Intl.DateTimeFormat(HUMAN_LOCALE, { dateStyle: 'long' }).format(new Date(at))
}
