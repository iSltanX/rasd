/**
 * صيغة النسخة الاحتياطية — `rasd.backup` النسخة 1 (ADR 0039).
 *
 * ```text
 * rasd-backup-2026-09-30.zip
 * ├── manifest.json            الصيغة ونسختها · نسخة القاعدة · زمن النسخة · عدد كل مخزن
 * ├── stores/<المخزن>.json      سجلّات المخزن كما في القاعدة، والصورة مرجعٌ إلى ملفّ
 * └── files/<المخزن>/<n>.<ext>  بايتات كل صورة كما هي — تُفتح بأيّ عارض صور بعد فكّ الحاوية
 * ```
 *
 * **النسخة 1 تحمل كل مخزن في القاعدة 4** — ومنها مخزن المشكلات (3) والمناطق المستثناة في المراجع (4)،
 * فلا ترتفع الصيغة لأجلهما بعد نشرها (`STAGES/07`، الاعتماديتان 32 و34). وترحيلٌ لاحق يغيّر شكل سجلٍّ
 * قائم يُلزم الاستعادة بتطبيق خطوته على سجلّات النسخ الأقدم — لا رفضها.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import * as v from 'valibot'

/** اسم الصيغة — أوّل ما يُقرأ: ملفّ ZIP ليس نسخةً لأنه ZIP. */
export const BACKUP_FORMAT = 'rasd.backup'
/** نسخة الصيغة التي يكتبها هذا الإصدار ويقرؤها. ما فوقها «من إصدارٍ أحدث». */
export const BACKUP_VERSION = 1
/** أقدم نسخة قاعدة تحملها الصيغة — وُلدت عليها. */
export const FIRST_DATABASE = 4

export const MANIFEST_ENTRY = 'manifest.json'
export const storeEntry = (store: string): string => `stores/${store}.json`

/** سقف ملفّ JSON واحد في الحاوية — آلاف السجلّات أقلّ منه بكثير، وما فوقه لا يُحلَّل في الصفحة. */
export const MAX_JSON_BYTES = 64 * 1024 * 1024
/** سقف البيان — كائنٌ صغير لا يُقرأ منه أكبر من هذا. */
export const MAX_MANIFEST_BYTES = 64 * 1024

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/**
 * اسم ملفّ الصورة في الحاوية — **بترتيبه لا بمعرّفه**: المعرّف نصٌّ من القاعدة قد يحمل ما لا يصلح اسمَ
 * ملفّ، والترتيب رقمٌ لا يُساء. والامتداد من النوع كي تُفتح الصورة بعد الفكّ مباشرة.
 */
export function fileEntry(store: string, index: number, type: string): string {
  const ext = Object.hasOwn(EXTENSIONS, type) ? EXTENSIONS[type] : 'bin'
  return `files/${store}/${String(index).padStart(6, '0')}.${ext}`
}

const count = v.pipe(v.number(), v.integer(), v.minValue(0))

/** أقصى ما يقبله `Date` (±8.64e15ms) — زمنٌ فوقه يرمي عند أوّل عرضٍ له، لا عند قراءته. */
export const MAX_TIME = 8.64e15

/** لحظةٌ تصير تاريخًا: عددٌ منتهٍ بين بداية العصر وأقصى `Date`. */
export const TimestampSchema = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(MAX_TIME))

/**
 * البيان. **الصيغة ونسختها تُفحصان قبل أيّ حقل آخر** (`readManifest`): بيانٌ من إصدارٍ أحدث قد يحمل
 * حقولًا لا نعرفها، والجواب عنه «حدّث رصد» لا «ملفّ تالف».
 */
export const ManifestSchema = v.strictObject({
  format: v.literal(BACKUP_FORMAT),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  database: v.pipe(v.number(), v.integer(), v.minValue(1)),
  createdAt: TimestampSchema,
  app: v.pipe(v.string(), v.maxLength(64)),
  stores: v.record(v.string(), count),
})

export type Manifest = v.InferOutput<typeof ManifestSchema>

/** اسم الملفّ المقترَح بتاريخ اليوم المحلّي — ما يراه المستخدم في مجلّد التنزيلات. */
export function backupFilename(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `rasd-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`
}
