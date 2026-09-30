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

import { err, ok, type RasdError, type Result } from '@/shared/result'
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
 */
export async function createBackup(
  options: BackupOptions,
): Promise<Result<BackupOutcome, BackupFailure>> {
  const read = await readLibrary()
  if (!read.ok) return err({ kind: 'storage', error: read.error })
  const library = read.value
  if (STORE_NAMES.every((name) => library[name].length === 0)) return ok({ kind: 'empty' })

  const counts = emptyCounts()
  const skipped = emptyCounts()
  const stores: ArchiveEntry[] = []
  const files: ArchiveEntry[] = []

  for (const name of STORE_NAMES) {
    const shaped: unknown[] = []
    let index = 0
    for (const record of library[name] as object[]) {
      let candidate: object = record
      let file: ArchiveEntry | null = null
      if (isBlobStore(name)) {
        const blob = (record as { blob?: unknown }).blob
        if (!isBlob(blob)) {
          skipped[name] += 1
          continue
        }
        const entry = fileEntry(name, index + 1, blob.type)
        candidate = { ...record, blob: { file: entry, type: blob.type, size: blob.size } }
        file = { name: entry, data: blob }
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
    onEntry: (done) => {
      if (done > head.length) {
        options.onProgress?.({ done: done - head.length, total: files.length })
      }
    },
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

// ─────────────────────────────────────────────────────────────────
// القراءة والاستعادة
// ─────────────────────────────────────────────────────────────────

/**
 * خطوة كل ترحيلٍ بعد `FIRST_DATABASE` على سجلّات النسخ الأقدم — المفتاح نسخة القاعدة المستهدَفة كما في
 * `MIGRATIONS`. فارغٌ اليوم لأن القاعدة 4 هي أوّل ما تحمله الصيغة؛ و`backup.test.ts` يُسقط البناء إن ارتفع
 * `DB_VERSION` بلا خطوةٍ هنا — ولو كانت الخطوة «لا تغيير» (مخزنٌ جديد يُقرأ فارغًا من النسخ الأقدم).
 */
export const RECORD_UPGRADES: Readonly<
  Record<number, (records: LibraryRecords) => LibraryRecords>
> = {}

export interface RestorePlan {
  readonly manifest: Manifest
  /** السجلّات جاهزةً للكتابة: الصور `Blob` شرائح كسولة من الملفّ نفسه. */
  readonly records: LibraryRecords
  readonly counts: StoreCounts
  /** مجموع بايتات الصور — ما يُعرض على بوّابة الحصّة قبل الكتابة. */
  readonly bytes: number
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
 */
export async function readBackup(
  file: Blob,
  options: ProgressOptions = {},
): Promise<Result<RestorePlan | 'cancelled', BackupFailure>> {
  const opened = await openArchive(file)
  if (!opened.ok) return invalid(opened.error.detail ?? opened.error.message)
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
  if (manifest.database < FIRST_DATABASE) return invalid(`القاعدة ${manifest.database}`)

  const known = new Set<string>(STORE_NAMES)
  for (const name of Object.keys(manifest.stores)) {
    if (!known.has(name)) return invalid(`مخزنٌ لا يعرفه رصد: ${name}`)
  }

  const records = Object.fromEntries(STORE_NAMES.map((n) => [n, []])) as unknown as LibraryRecords
  const counts = emptyCounts()
  const pending: ArchiveFile[] = []
  const claimed = new Set<string>()
  let bytes = 0

  for (const name of STORE_NAMES) {
    const declared = manifest.stores[name]
    const entry = archive.files.get(storeEntry(name))
    if (declared === undefined || !entry) {
      // مخزنٌ أضافه ترحيلٌ بعد القاعدة التي صنعت الملفّ يُقرأ فارغًا؛ وغيابه من قاعدةٍ بنسختنا نقصٌ.
      if (manifest.database < DB_VERSION && declared === undefined && !entry) continue
      return invalid(`مخزنٌ ناقص: ${name}`)
    }
    const raw = await readJson(archive, entry, MAX_JSON_BYTES)
    if (!raw.ok) return raw
    if (!Array.isArray(raw.value) || raw.value.length !== declared) {
      return invalid(`${name}: العدد يخالف البيان`)
    }

    const keys = new Set<string>()
    const list: object[] = []
    for (const [i, record] of (raw.value as unknown[]).entries()) {
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

  // البايتات آخرًا: البنية كلّها سليمة قبل أن تُقرأ مئات الميغابايتات.
  for (const [i, target] of pending.entries()) {
    if (options.signal?.aborted) return ok('cancelled')
    if (!(await archive.read(target))) return damaged(target.name)
    options.onProgress?.({ done: i + 1, total: pending.length })
  }

  let upgraded = records
  for (let version = manifest.database + 1; version <= DB_VERSION; version++) {
    const step = RECORD_UPGRADES[version]
    if (!step) return invalid(`لا ترقية لسجلّات القاعدة ${version}`)
    upgraded = step(upgraded)
  }

  return ok({ manifest, records: upgraded, counts, bytes })
}

/** يكتب الخطّة في معاملة واحدة — إضافةٌ لا استبدال (`mergeLibrary`). */
export async function restoreBackup(
  plan: RestorePlan,
): Promise<Result<MergeReport, BackupFailure>> {
  const merged = await mergeLibrary(plan.records, plan.bytes)
  if (!merged.ok) return err({ kind: 'storage', error: merged.error })
  return ok(merged.value)
}
