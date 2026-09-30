/**
 * منطق قسم البيانات — بلا JSX، نمط `context.ts` المجاور.
 *
 * الصفحة صفحة إضافة تملك التخزين (`AGENTS.md` §4): تقرأ القاعدة وتكتبها مباشرةً، والنسخ والاستعادة والحذف
 * تجري هنا لا في الخلفية — فمكتبةٌ بمئات الميغابايتات لا تعبر رسائل `chrome.runtime` مُرمَّزةً.
 */

import { TRASH_RETENTION_MS } from '@/modules/library/trash'
import { countText, formatHuman, plural, type CountForms } from '@/shared/bidi/numerals'
import { attempt } from '@/shared/result'
import { defaultSettings } from '@/shared/settings'
import {
  TRANSFERABLE_LEAVES,
  type DroppedSetting,
  type SettingChange,
} from '@/shared/settings/transfer'
import { libraryCounts, type StoreCounts } from '@/shared/storage/library'
import {
  persistenceState,
  requestPersistence,
  type PersistenceState,
} from '@/shared/storage/persistence'
import { quotaState, type QuotaState } from '@/shared/storage/quota'

import type { RestorePlan } from '@/modules/backup/backup'

/** مفتاح «آخر نسخة» — حالةُ هذا الجهاز، تُمحى مع «احذف كل البيانات» كسائر `chrome.storage.local`. */
const LAST_BACKUP_KEY = 'rasd:last-backup'

/**
 * آخر نسخةٍ سُلّمت، وكم سجلًّا تُرك منها. **الناقصة تُقال في تأكيد الحذف** لا تُعرض كأنها كاملة — من يحذف كل
 * شيءٍ متّكئًا عليها يفقد ما لم تحمله (المراجعة المستقلّة، `STAGES/07`).
 */
export interface LastBackup {
  readonly at: number
  readonly skipped: number
}

export async function readLastBackup(): Promise<LastBackup | null> {
  const read = await attempt(
    async () => (await chrome.storage.local.get(LAST_BACKUP_KEY))[LAST_BACKUP_KEY],
  )
  if (!read.ok) return null
  const value = read.value as Partial<LastBackup> | null | undefined
  return typeof value?.at === 'number' && typeof value.skipped === 'number'
    ? { at: value.at, skipped: value.skipped }
    : null
}

/** يسجّل نسخةً حُفظت. فشل التسجيل لا يُفشل النسخة: الملفّ عند المستخدم، والسطر معلومةٌ لا ضمان. */
export async function recordLastBackup(entry: LastBackup): Promise<void> {
  await attempt(() => chrome.storage.local.set({ [LAST_BACKUP_KEY]: entry }))
}

interface DownloadsApi {
  search(query: { id: number }): Promise<{ state?: string }[]>
  onChanged: {
    addListener(listener: (delta: { id: number; state?: { current?: string } }) => void): void
    removeListener(listener: (delta: { id: number; state?: { current?: string } }) => void): void
  }
}

/**
 * ينتظر تنزيلًا مُدارًا حتى يُحفظ أو يُقطع — **نافذة «حفظ باسم» قد تُلغى**، و`chrome.downloads.download`
 * يُرجع مُعرِّفه قبل أن يختار المستخدم شيئًا. فلا «النسخة جاهزة» ولا «آخر نسخة» قبل أن يُكتب الملفّ فعلًا.
 */
export function awaitDownload(downloadId: number): Promise<'complete' | 'interrupted'> {
  const downloads = (chrome as unknown as { downloads?: DownloadsApi }).downloads
  if (!downloads) return Promise.resolve('complete')
  return new Promise((resolve) => {
    let settled = false
    const finish = (state: 'complete' | 'interrupted') => {
      if (settled) return
      settled = true
      downloads.onChanged.removeListener(listener)
      resolve(state)
    }
    const listener = (delta: { id: number; state?: { current?: string } }) => {
      if (delta.id !== downloadId) return
      const state = delta.state?.current
      if (state === 'complete' || state === 'interrupted') finish(state)
    }
    downloads.onChanged.addListener(listener)
    // تنزيلٌ انتهى قبل أن يُسجَّل المستمع لا يطلق حدثًا بعده.
    void downloads
      .search({ id: downloadId })
      .then(([item]) => {
        if (item?.state === 'complete' || item?.state === 'interrupted') finish(item.state)
      })
      .catch(() => undefined)
  })
}

export interface DataOverview {
  /** `null` حين تعذّرت قراءة القاعدة — لا أصفار كاذبة. */
  readonly counts: StoreCounts | null
  readonly quota: QuotaState
  readonly persistence: PersistenceState
  readonly lastBackup: LastBackup | null
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

/** عزلٌ اتّجاهيٌّ بالمحرف الأوّل (FSI…PDI): قيمةٌ من الملفّ لا تقلب ما يليها في السطر، ولو حملت محرف قلب. */
const isolated = (text: string) => `\u2068${text}\u2069`

/** القيمة كما في الملفّ، قصيرةً ومعزولة — للعرض وحده. */
export function shownValue(value: unknown): string {
  if (typeof value === 'string')
    return isolated(value.length > 40 ? `${value.slice(0, 40)}…` : value)
  if (typeof value === 'number' || typeof value === 'boolean') return isolated(String(value))
  return kindOf(value)
}

const INCOGNITO_TEXT: Readonly<Record<string, string>> = {
  off: 'معطَّل',
  'no-save': 'يعمل بلا حفظ',
  allow: 'يعمل ويحفظ',
}

/** مدّة الاحتفاظ بكلماتها — «٣٠ يومًا» لا «٣٠ يوم» (`PrivacyTab.tsx`). */
function retentionText(days: number): string {
  if (days === 0) return 'بلا حذف'
  return days <= 10 ? plural(days, 'يوم', 'يومان', 'أيام') : `${formatHuman(days)} يومًا`
}

/** قيمة إعدادٍ للعرض في «ما سيتغيّر» — بكلماتها حيث لها كلمات، ومعزولةً حيث هي قيمةٌ تقنية. */
export function settingValueText(path: string, value: unknown): string {
  if (path === 'privacy.autoDeleteAfterDays' && typeof value === 'number')
    return retentionText(value)
  if (path === 'privacy.incognito' && typeof value === 'string') {
    return INCOGNITO_TEXT[value] ?? shownValue(value)
  }
  if (Array.isArray(value)) return count(value.length, 'sites')
  if (typeof value === 'boolean') return value ? 'مفعَّل' : 'معطَّل'
  return shownValue(value)
}

export interface Warning {
  readonly tone: 'danger' | 'warning'
  readonly text: string
}

/**
 * ما لا يُعكَس في الاستيراد يُقال قبل الحفظ (المراجعة المستقلّة، `STAGES/07`): مدّةُ احتفاظٍ تقصر تحذف
 * نهائيًّا في الكنس التالي (`retention.ts`، كل ساعة)، و«*» يوقف رصد في كل موقع، و«يعمل ويحفظ» يكتب ما يُلتقط
 * في النوافذ الخاصّة على القرص.
 */
export function importWarnings(changes: readonly SettingChange[]): Warning[] {
  const warnings: Warning[] = []
  for (const { path, from, to } of changes) {
    if (path === 'privacy.autoDeleteAfterDays' && typeof to === 'number' && to > 0) {
      if (from === 0 || (typeof from === 'number' && to < from)) {
        warnings.push({
          tone: 'danger',
          text: `تصير مدّة الاحتفاظ ${retentionText(to)}: كل لقطةٍ غير مميّزة أقدم منها تُحذف نهائيًّا في الكنس التالي خلال ساعة — بلا مهملات ولا تراجع.`,
        })
      }
    }
    if (path === 'privacy.excludedSites' && Array.isArray(to) && to.includes('*')) {
      if (!(Array.isArray(from) && from.includes('*'))) {
        warnings.push({
          tone: 'warning',
          text: 'نمط «*» في المواقع المستثناة يوقف رصد في كل المواقع.',
        })
      }
    }
    if (path === 'privacy.incognito' && to === 'allow') {
      warnings.push({
        tone: 'warning',
        text: 'سيحفظ رصد ما تلتقطه في النوافذ الخاصّة على القرص كما في العادية.',
      })
    }
  }
  return warnings
}

/**
 * ما سيكنسه الحذف الدوري من لقطات الملفّ بعد الاستعادة — `createdAt` يُستعاد كما كان، فنسخةٌ قديمة تحت
 * مدّة احتفاظٍ مفعّلة تُكنس في الساعة التالية، وما في مهملاتها منذ أكثر من ثلاثين يومًا يُطهَّر عند فتح
 * المكتبة (المراجعة المستقلّة، `STAGES/07`).
 */
export function restoreWarnings(
  plan: RestorePlan,
  retentionDays: number,
  now: number,
): { readonly retention: number; readonly trash: number } {
  let retention = 0
  let trash = 0
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000
  for (const capture of plan.records.captures) {
    if (retentionDays > 0 && capture.createdAt < cutoff && !capture.favorite) retention += 1
    else if (capture.trashedAt !== null && now - capture.trashedAt >= TRASH_RETENTION_MS) trash += 1
  }
  return { retention, trash }
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

/** «آخر نسخة: …» في تأكيد الحذف — والناقصة تُقال ناقصة. */
export function lastBackupText(last: LastBackup | null, now = Date.now()): string {
  if (last === null) return 'آخر نسخة: لم تُؤخذ نسخة بعد'
  const d = new Date(last.at)
  const today = new Date(now)
  const sameDay = d.toDateString() === today.toDateString()
  const date = new Intl.DateTimeFormat(
    HUMAN_LOCALE,
    sameDay ? { timeStyle: 'short' } : { dateStyle: 'long' },
  )
  const when = `آخر نسخة: ${sameDay ? 'اليوم ' : ''}${date.format(d)}`
  return last.skipped > 0
    ? `${when} — ناقصة: ${formatHuman(last.skipped)} من السجلّات التالفة لم تُنسخ`
    : when
}

/** تاريخ النسخة في معاينة الاستعادة — «١٢ سبتمبر ٢٠٢٦». */
export function backupDateText(at: number): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(HUMAN_LOCALE, { dateStyle: 'long' }).format(d)
}
