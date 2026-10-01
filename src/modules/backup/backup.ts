/**
 * النسخ الاحتياطي والاستعادة — المكتبة كلّها ملفًّا واحدًا، وعودتها منه (ADR 0039).
 *
 * **الاستعادة لا تكتب قبل أن يُتحقَّق من كل شيء:** الحاوية، ثمّ البيان، ثمّ كل سجلّ بمخطّطه، ثمّ كل صورة
 * بـCRC. وما يُكتب يُكتب في معاملة واحدة (`mergeLibrary`). فالملفّ التالف أو الناقص أو الأحدث لا يترك في
 * المكتبة سجلًّا واحدًا.
 *
 * **والنسخ لا يكتب ملفًّا لا يُستعاد:** يمرّ كل سجلٍّ بالمخطّط نفسه الذي ستمرّ به الاستعادة، فما لا يمرّ يُترك
 * ويُعدّ ويُعلَن — بدل نسخةٍ تُرفض كلّها يوم الحاجة إليها بسبب سجلٍّ واحد.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` — والقاعدة عبر `shared/storage` كما في `modules/compare`.
 */

import * as v from 'valibot'

import { crc32 } from '@/modules/export/zip'
import { err, ok, toRasdError, type RasdError, type Result } from '@/shared/result'
import {
  emptyCounts,
  keyOf,
  mergeLibrary,
  readLibrary,
  type LibraryRecords,
  type MergeReport,
  type StoreCounts,
} from '@/shared/storage/library'
import { DB_VERSION, STORE_NAMES, type StoreName } from '@/shared/storage/schema'

import { buildArchive, openArchive, type ArchiveEntry, type ArchiveFile } from './archive'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFilename,
  fileEntry,
  FIRST_DATABASE,
  MANIFEST_ENTRY,
  ManifestSchema,
  MAX_JSON_BYTES,
  MAX_MANIFEST_BYTES,
  storeEntry,
  type Manifest,
} from './format'
import { BACKUP_RECORDS, BLOB_STORES, BlobRefSchema, type BlobStore } from './records'

/**
 * لماذا تعذّر — أربعة أجوبة مختلفة للمستخدم، لا «فشل» واحد:
 * - `invalid` ليس نسخةً يقرؤها رصد (ليس ZIP، أو ليس صيغتنا، أو سجلٌّ لا يطابق مخطّطه).
 * - `newer` صنعه إصدارٌ أحدث من رصد — الحلّ تحديث رصد لا ملفٌّ آخر.
 * - `damaged` البنية سليمة والبايتات تغيّرت (CRC): نقلٌ منقطع أو قرصٌ تالف.
 * - `storage` القاعدة نفسها رفضت: الحصّة أو التصفّح الخاص أو عطلٌ في IndexedDB.
 */
export type BackupFailure =
  | { readonly kind: 'invalid'; readonly detail: string }
  | { readonly kind: 'newer'; readonly detail: string }
  | { readonly kind: 'damaged'; readonly detail: string }
  | { readonly kind: 'storage'; readonly error: RasdError }

const invalid = (detail: string) => err<BackupFailure>({ kind: 'invalid', detail })
const damaged = (detail: string) => err<BackupFailure>({ kind: 'damaged', detail })

export interface Progress {
  readonly done: number
  readonly total: number
}

export interface ProgressOptions {
  readonly onProgress?: ((progress: Progress) => void) | undefined
  readonly signal?: AbortSignal | undefined
}

/** `Blob` بالبطّة لا بـ`instanceof`: صورٌ من سياقٍ آخر (عامل، أو إطار) ليست من صنف هذا السياق. */
function isBlob(value: unknown): value is Blob {
  const b = value as Blob | null
  return (
    typeof b === 'object' &&
    b !== null &&
    typeof b.size === 'number' &&
    typeof b.type === 'string' &&
    typeof b.arrayBuffer === 'function' &&
    typeof b.slice === 'function'
  )
}

const isBlobStore = (store: StoreName): store is BlobStore =>
  (BLOB_STORES as readonly StoreName[]).includes(store)

const encoder = new TextEncoder()
const utf8 = new TextDecoder('utf-8', { fatal: true })

// ─────────────────────────────────────────────────────────────────
// النسخ
// ─────────────────────────────────────────────────────────────────

export type BackupOutcome =
  | { readonly kind: 'empty' }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'ready'
      readonly blob: Blob
      readonly filename: string
      readonly counts: StoreCounts
      /** سجلّاتٌ لم تمرّ بالمخطّط فلم تُنسخ — صفرٌ في المكتبة السليمة. */
      readonly skipped: StoreCounts
    }

export interface BackupOptions extends ProgressOptions {
  readonly now: number
  /** نسخة رصد التي صنعت الملفّ — للسجلّ في البيان، لا يُحكم بها. */
  readonly app: string
}

/**
 * يصنع النسخة من صورةٍ متّسقة للقاعدة. `empty` حين لا سجلّ في أيّ مخزن، و`cancelled` حين يُلغى —
 * والإلغاء لا يترك شيئًا: لا شيء يُكتب على القرص قبل أن يُسلَّم الملفّ.
 *
 * **ولا يرمي:** كل رفضٍ يعود `storage` — نافذةٌ تنتظر وعدًا رُفض كانت تبقى «تُجمع الصور» بلا مخرج
 * (المراجعة المستقلّة، `STAGES/07`).
 */
export async function createBackup(
  options: BackupOptions,
): Promise<Result<BackupOutcome, BackupFailure>> {
  try {
    return await build(options)
  } catch (thrown) {
    return err({ kind: 'storage', error: toRasdError(thrown) })
  }
}

async function build(options: BackupOptions): Promise<Result<BackupOutcome, BackupFailure>> {
  const read = await readLibrary()
  if (!read.ok) return err({ kind: 'storage', error: read.error })
  const library = read.value
  if (STORE_NAMES.every((name) => library[name].length === 0)) return ok({ kind: 'empty' })

  const counts = emptyCounts()
  const skipped = emptyCounts()
  const stores: ArchiveEntry[] = []
  const files: ArchiveEntry[] = []
  const images = BLOB_STORES.reduce((sum, name) => sum + library[name].length, 0)
  let seen = 0

  for (const name of STORE_NAMES) {
    const shaped: unknown[] = []
    let index = 0
    for (const record of library[name] as object[]) {
      let candidate: object = record
      let file: ArchiveEntry | null = null
      if (isBlobStore(name)) {
        if (options.signal?.aborted) return ok({ kind: 'cancelled' })
        const blob = (record as { blob?: unknown }).blob
        /*
         * **كل صورةٍ تُقرأ هنا مرّةً واحدة:** لـCRC الحاوية، ولتُعرف قابلةً للقراءة. صورةٌ فقد المتصفّح
         * ملفّها يرفض `arrayBuffer` قراءتها — فتُترك وتُعدّ كالسجلّ التالف، ولا تُسقط النسخة كلّها.
         */
        const bytes = isBlob(blob) ? await readBytes(blob) : null
        seen += 1
        options.onProgress?.({ done: seen, total: images })
        if (!isBlob(blob) || bytes === null) {
          skipped[name] += 1
          continue
        }
        const entry = fileEntry(name, index + 1, blob.type)
        candidate = { ...record, blob: { file: entry, type: blob.type, size: blob.size } }
        file = { name: entry, data: blob, crc: crc32(bytes) }
      }
      if (!v.is(BACKUP_RECORDS[name], candidate)) {
        skipped[name] += 1
        continue
      }
      shaped.push(candidate)
      if (file) {
        files.push(file)
        index += 1
      }
      counts[name] += 1
    }
    const json = encoder.encode(JSON.stringify(shaped))
    // ما لا تقبله الاستعادة لا يُكتب: السقف نفسه في الاتجاهين.
    if (json.length > MAX_JSON_BYTES) {
      return invalid(`${name}: ${json.length} bytes`)
    }
    stores.push({ name: storeEntry(name), data: json })
  }

  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    database: DB_VERSION,
    createdAt: options.now,
    app: options.app,
    stores: counts,
  }
  const head = [
    { name: MANIFEST_ENTRY, data: encoder.encode(JSON.stringify(manifest, null, 2)) },
    ...stores,
  ]

  const built = await buildArchive([...head, ...files], {
    modified: options.now,
    signal: options.signal,
  })
  if (!built.ok) return invalid(built.error.detail ?? built.error.message)
  if (built.value === 'cancelled') return ok({ kind: 'cancelled' })
  return ok({
    kind: 'ready',
    blob: built.value,
    filename: backupFilename(options.now),
    counts,
    skipped,
  })
}

async function readBytes(blob: Blob): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────
// القراءة والاستعادة
// ─────────────────────────────────────────────────────────────────

/** سجلّات الملفّ خامًا بمخزنها، قبل أن يُحكم عليها بمخطّط اليوم — ما تعمل عليه خطوات الترقية. */
export type RawRecords = Record<StoreName, unknown[]>

/**
 * خطوة كل ترحيلٍ بعد `FIRST_DATABASE` على سجلّات النسخ الأقدم — المفتاح نسخة القاعدة المستهدَفة كما في
 * `MIGRATIONS`. **تعمل على السجلّات الخام قبل التحقّق** لا بعده: سجلٌّ من قاعدةٍ أقدم لا يطابق مخطّط اليوم
 * بطبعه، وترقيته هي ما يجعله يطابقه (المراجعة المستقلّة، `STAGES/07`). القاعدة 4 أوّل ما تحمله الصيغة، فأولى
 * الخطوات 5؛ و`data-backup.test.ts` يُسقط البناء إن ارتفع `DB_VERSION` بلا خطوةٍ هنا — ولو كانت
 * «لا تغيير» (مخزنٌ جديد يُقرأ فارغًا من النسخ الأقدم).
 */
export const RECORD_UPGRADES: Readonly<Record<number, (records: RawRecords) => RawRecords>> = {
  // خطوة الترحيل 5 نفسها على الخام (ADR 0041): لكل دليلٍ `stepText: {}` و`updatedAt` زمن إنشائه، وما يحملهما
  // يبقى. ومخزن `templates` يُقرأ فارغًا من الملفّ الأقدم بلا خطوة.
  5: (records) => ({
    ...records,
    guides: records.guides.map((record) => {
      if (!record || typeof record !== 'object') return record
      const guide = record as Record<string, unknown>
      return {
        ...guide,
        stepText:
          typeof guide.stepText === 'object' && guide.stepText !== null ? guide.stepText : {},
        updatedAt: typeof guide.updatedAt === 'number' ? guide.updatedAt : guide.createdAt,
      }
    }),
  }),
  // الترحيل 6 أضاف مخزن مسودات البلاغ وحده (ADR 0050)، وهو ليس من المكتبة فلا يدخل الملفّ: لا تغيير في السجلّات.
  6: (records) => records,
}

export interface RestorePlan {
  readonly manifest: Manifest
  /** السجلّات جاهزةً للكتابة: الصور `Blob` شرائح كسولة من الملفّ نفسه. */
  readonly records: LibraryRecords
  readonly counts: StoreCounts
  /** مجموع بايتات الصور — ما يُعرض على بوّابة الحصّة قبل الكتابة. */
  readonly bytes: number
}

export interface ReadOptions extends ProgressOptions {
  /** للاختبار: خطوات ترقيةٍ وأقدم قاعدةٍ مقبولة بدل ما في هذا الإصدار. */
  readonly upgrades?: Readonly<Record<number, (records: RawRecords) => RawRecords>>
  readonly firstDatabase?: number
}

async function readJson(
  archive: { read(file: ArchiveFile): Promise<Uint8Array | null> },
  file: ArchiveFile,
  limit: number,
): Promise<Result<unknown, BackupFailure>> {
  if (file.size > limit) return invalid(`${file.name}: ${file.size} bytes`)
  const bytes = await archive.read(file)
  if (!bytes) return damaged(file.name)
  try {
    return ok(JSON.parse(utf8.decode(bytes)) as unknown)
  } catch {
    return invalid(`${file.name}: JSON`)
  }
}

/**
 * يقرأ الملفّ ويتحقّق منه كاملًا — **ولا يكتب شيئًا**. الناتج خطّةٌ تُعرض قبل الاستعادة (`data /
 * restore-preview`) ثمّ تُكتب بـ`restoreBackup`. والتقدّم يعدّ الصور التي فُحص CRC بايتاتها.
 *
 * **ولا يرمي:** ملفٌّ تتعذّر قراءته بعد اختياره (أُزيل من القرص، أو تغيّر) يعود `damaged`.
 */
export async function readBackup(
  file: Blob,
  options: ReadOptions = {},
): Promise<Result<RestorePlan | 'cancelled', BackupFailure>> {
  try {
    return await read(file, options)
  } catch {
    return damaged('تعذّرت قراءة الملفّ')
  }
}

async function read(
  file: Blob,
  options: ReadOptions,
): Promise<Result<RestorePlan | 'cancelled', BackupFailure>> {
  const upgrades = options.upgrades ?? RECORD_UPGRADES
  const firstDatabase = options.firstDatabase ?? FIRST_DATABASE

  const opened = await openArchive(file)
  if (!opened.ok) {
    const detail = opened.error.detail ?? opened.error.message
    return opened.error.code === 'not-found' ? damaged(detail) : invalid(detail)
  }
  const archive = opened.value

  const manifestFile = archive.files.get(MANIFEST_ENTRY)
  if (!manifestFile) return invalid('لا بيان')
  const rawManifest = await readJson(archive, manifestFile, MAX_MANIFEST_BYTES)
  if (!rawManifest.ok) return rawManifest

  // الصيغة ونسختها أوّلًا: بيانُ إصدارٍ أحدث يُجاب بـ«حدّث رصد» قبل أن يُحكم على حقوله.
  const head = rawManifest.value as Partial<Record<keyof Manifest, unknown>> | null
  if (!head || typeof head !== 'object' || head.format !== BACKUP_FORMAT) {
    return invalid('ليست صيغة rasd.backup')
  }
  if (typeof head.version === 'number' && head.version > BACKUP_VERSION) {
    return err({ kind: 'newer', detail: `الصيغة ${head.version}` })
  }
  if (typeof head.database === 'number' && head.database > DB_VERSION) {
    return err({ kind: 'newer', detail: `القاعدة ${head.database}` })
  }
  const parsed = v.safeParse(ManifestSchema, rawManifest.value)
  if (!parsed.success) return invalid('بيانٌ لا يطابق مخطّطه')
  const manifest = parsed.output
  if (manifest.database < firstDatabase) return invalid(`القاعدة ${manifest.database}`)

  const known = new Set<string>(STORE_NAMES)
  for (const name of Object.keys(manifest.stores)) {
    if (!known.has(name)) return invalid(`مخزنٌ لا يعرفه رصد: ${name}`)
  }

  // ١ — السجلّات خامًا، بعددها كما في البيان.
  let raw = Object.fromEntries(STORE_NAMES.map((n) => [n, []])) as unknown as RawRecords
  for (const name of STORE_NAMES) {
    const declared = manifest.stores[name]
    const entry = archive.files.get(storeEntry(name))
    if (declared === undefined || !entry) {
      // مخزنٌ أضافه ترحيلٌ بعد القاعدة التي صنعت الملفّ يُقرأ فارغًا؛ وغيابه من قاعدةٍ بنسختنا نقصٌ.
      if (manifest.database < DB_VERSION && declared === undefined && !entry) continue
      return invalid(`مخزنٌ ناقص: ${name}`)
    }
    const list = await readJson(archive, entry, MAX_JSON_BYTES)
    if (!list.ok) return list
    if (!Array.isArray(list.value) || list.value.length !== declared) {
      return invalid(`${name}: العدد يخالف البيان`)
    }
    raw = { ...raw, [name]: list.value as unknown[] }
  }

  // ٢ — الترقية على الخام، قبل التحقّق.
  for (let version = manifest.database + 1; version <= DB_VERSION; version++) {
    const step = upgrades[version]
    if (!step) return invalid(`لا ترقية لسجلّات القاعدة ${version}`)
    raw = step(raw)
  }

  // ٣ — كل سجلٍّ بمخطّط اليوم، والمفاتيح غير مكرّرة، والصور موجودةٌ بحجمها.
  const records = Object.fromEntries(STORE_NAMES.map((n) => [n, []])) as unknown as LibraryRecords
  const counts = emptyCounts()
  const pending: ArchiveFile[] = []
  const claimed = new Set<string>()
  let bytes = 0

  for (const name of STORE_NAMES) {
    const keys = new Set<string>()
    const list: object[] = []
    for (const [i, record] of (raw[name] ?? []).entries()) {
      if (!v.is(BACKUP_RECORDS[name], record)) return invalid(`${name}[${i}]`)
      const key = keyOf(name, record)
      if (keys.has(key)) return invalid(`${name}: مفتاحٌ مكرّر`)
      keys.add(key)

      if (isBlobStore(name)) {
        const ref = v.parse(BlobRefSchema, (record as { blob: unknown }).blob)
        const target = archive.files.get(ref.file)
        if (!ref.file.startsWith(`files/${name}/`) || !target || claimed.has(ref.file)) {
          return invalid(`${name}[${i}]: ملفّ الصورة`)
        }
        if (target.size !== ref.size) return invalid(`${ref.file}: الحجم`)
        claimed.add(ref.file)
        pending.push(target)
        bytes += target.size
        list.push({ ...record, blob: archive.slice(target, ref.type) })
      } else {
        list.push(record)
      }
    }
    ;(records as Record<StoreName, object[]>)[name] = list
    counts[name] = list.length
  }

  // ٤ — البايتات آخرًا: البنية كلّها سليمة قبل أن تُقرأ مئات الميغابايتات.
  for (const [i, target] of pending.entries()) {
    if (options.signal?.aborted) return ok('cancelled')
    if (!(await archive.read(target))) return damaged(target.name)
    options.onProgress?.({ done: i + 1, total: pending.length })
  }

  return ok({ manifest, records, counts, bytes })
}

/** يكتب الخطّة في معاملة واحدة — إضافةٌ لا استبدال (`mergeLibrary`). */
export async function restoreBackup(
  plan: RestorePlan,
): Promise<Result<MergeReport, BackupFailure>> {
  const merged = await mergeLibrary(plan.records, plan.bytes)
  if (!merged.ok) return err({ kind: 'storage', error: merged.error })
  return ok(merged.value)
}
