/**
 * حاوية النسخة الاحتياطية — ZIP بلا ضغط (الطريقة `0`)، يُبنى `Blob` من أجزاء ويُقرأ بشرائح (ADR 0039).
 *
 * **ولماذا لا `writeZip` من `modules/export/zip.ts` كما هو:** ذاك يبني الحزمة في `Uint8Array` واحدة، وحزمة
 * التسليم صغيرة. ومكتبةٌ بمئات الميغابايتات كانت ستُحمَّل مرّتين في ذاكرة الصفحة: البايتات ثمّ الحاوية. فهنا
 * تبقى الصور `Blob` كما خرجت من IndexedDB — أجزاءً في `new Blob([...])` لا تُنسخ — ولا يُقرأ منها إلا ما
 * يلزم لحساب CRC، صورةً صورة. والصيغة نفسها: رأسٌ محلّي لكل ملفّ، ثمّ دليلٌ مركزي، ثمّ خاتمة، وأسماء UTF-8.
 * و`crc32` و`safeEntryName` مستعارتان من هناك فلا تُكتبان مرّتين.
 *
 * **والقارئ لا يثق بالملفّ.** ما يختاره المستخدم قد يكون أيّ شيء: كل إزاحة تُقاس بحدود الملفّ قبل أن تُقرأ،
 * والاسم في الرأس المحلّي يطابق اسمه في الدليل، ولا ضغط ولا تشفير ولا اسمٌ يخرج من الحزمة ولا اسمٌ مكرّر.
 * و`STORE` يعني أن الحجم المعلَن هو الحجم على القرص: لا قنبلة فكّ ممكنة.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` — و`Blob` بدائيّة منصّة لا واجهة.
 */

import { crc32, safeEntryName } from '@/modules/export/zip'
import { errText, ok, type Result } from '@/shared/result'

/** ملفٌّ داخل الحاوية: نصٌّ أو بايتات صغيرة، أو `Blob` يبقى على حاله. */
export interface ArchiveEntry {
  readonly name: string
  readonly data: Uint8Array | Blob
}

/** سقف ZIP بلا امتداد Zip64 — ما فوقه يُرفض برسالة لا يُكتب ملفًّا تالفًا. */
export const MAX_ENTRIES = 0xffff
export const MAX_BYTES = 0xffffffff

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const LOCAL_HEADER = 30
const CENTRAL_HEADER = 46
const END_RECORD = 22
/** أطول تعليقٍ تسمح به الخاتمة — حدُّ البحث عنها من آخر الملفّ. */
const MAX_COMMENT = 0xffff
const UTF8_NAMES = 0x0800
const VERSION = 20

const encoder = new TextEncoder()

function dosTime(at: number): { readonly time: number; readonly date: number } {
  const d = new Date(Math.max(at, Date.UTC(1980, 0, 1)))
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  }
}

async function bytesOf(data: Uint8Array | Blob): Promise<Uint8Array> {
  return data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer())
}

const sizeOf = (data: Uint8Array | Blob): number =>
  data instanceof Uint8Array ? data.length : data.size

export interface BuildOptions {
  /** زمن كل ملفّ في الحاوية — يُمرَّر ولا يُقرأ هنا، فيبقى البناء حتميًّا. */
  readonly modified: number
  /** يُستدعى بعد حساب CRC لكل ملفّ — التقدّم في الواجهة. */
  readonly onEntry?: (done: number, total: number) => void
  /** الإلغاء بين ملفّين — لا يُترك ملفٌّ نصف مكتوب لأن لا شيء يُكتب قبل النهاية. */
  readonly signal?: AbortSignal | undefined
}

/**
 * يبني الحاوية `Blob` واحدًا. يرفض ولا يبني: اسمًا غير آمن أو مكرّرًا، أو ما جاوز حدّ ZIP بلا Zip64.
 * والإلغاء يُرجع `cancelled` لا خطأً.
 */
export async function buildArchive(
  entries: readonly ArchiveEntry[],
  options: BuildOptions,
): Promise<Result<Blob | 'cancelled'>> {
  if (entries.length > MAX_ENTRIES) {
    return errText('invalid-data', 'المكتبة أكبر من أن تُكتب في ملفٍّ واحد.', `${entries.length}`)
  }
  const seen = new Set<string>()
  let total = END_RECORD
  for (const entry of entries) {
    if (!safeEntryName(entry.name) || seen.has(entry.name)) {
      return errText('invalid-data', 'اسم ملفٍّ غير صالح داخل النسخة.', entry.name)
    }
    seen.add(entry.name)
    total += LOCAL_HEADER + CENTRAL_HEADER + encoder.encode(entry.name).length * 2
    total += sizeOf(entry.data)
  }
  if (total > MAX_BYTES) {
    return errText('invalid-data', 'المكتبة أكبر من أن تُكتب في ملفٍّ واحد.', `${total} bytes`)
  }

  const { time, date } = dosTime(options.modified)
  const parts: (Uint8Array<ArrayBuffer> | Blob)[] = []
  const directory: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (const [index, entry] of entries.entries()) {
    if (options.signal?.aborted) return ok('cancelled')
    const name = encoder.encode(entry.name)
    const size = sizeOf(entry.data)
    const crc = crc32(await bytesOf(entry.data))

    const local = new Uint8Array(LOCAL_HEADER + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, LOCAL, true)
    lv.setUint16(4, VERSION, true)
    lv.setUint16(6, UTF8_NAMES, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, LOCAL_HEADER)

    const central = new Uint8Array(CENTRAL_HEADER + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, CENTRAL, true)
    cv.setUint16(4, VERSION, true)
    cv.setUint16(6, VERSION, true)
    cv.setUint16(8, UTF8_NAMES, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, CENTRAL_HEADER)

    parts.push(local, entry.data instanceof Uint8Array ? copy(entry.data) : entry.data)
    directory.push(central)
    offset += local.length + size
    options.onEntry?.(index + 1, entries.length)
  }

  const directorySize = directory.reduce((sum, d) => sum + d.length, 0)
  const end = new Uint8Array(END_RECORD)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, END, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, directorySize, true)
  ev.setUint32(16, offset, true)

  return ok(new Blob([...parts, ...directory, end], { type: 'application/zip' }))
}

/** نسخةٌ على `ArrayBuffer` خالص — `BlobPart` لا يقبل مخزنًا مشتركًا في أنواع TS الحديثة. */
function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length)
  out.set(bytes)
  return out
}

// ─────────────────────────────────────────────────────────────────
// القراءة
// ─────────────────────────────────────────────────────────────────

/** ملفٌّ في الحاوية كما يصفه دليلها، بعد التحقّق من حدوده. */
export interface ArchiveFile {
  readonly name: string
  /** بداية البايتات في الملفّ الأصلي، بعد الرأس المحلّي. */
  readonly start: number
  readonly size: number
  readonly crc: number
}

export interface OpenArchive {
  readonly files: ReadonlyMap<string, ArchiveFile>
  /** شريحةٌ كسولة — لا تُقرأ البايتات حتى تُطلب. */
  slice(file: ArchiveFile, type?: string): Blob
  /** يقرأ الملفّ ويتحقّق من CRC — `null` إن لم يطابق. */
  read(file: ArchiveFile): Promise<Uint8Array | null>
}

/** كل رفضٍ هنا جوابٌ واحد للمستخدم: الملفّ ليس حاويةً يقرؤها رصد. والتفصيل للسجلّ. */
const notArchive = (detail: string) =>
  errText('invalid-data', 'الملفّ ليس نسخةً احتياطية صالحة.', detail)

async function readRange(file: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await file.slice(start, end).arrayBuffer())
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/**
 * يفتح الحاوية: يجد الخاتمة من آخر الملفّ، ثمّ يقرأ الدليل، ثمّ رأس كل ملفّ المحلّي. لا يقرأ بايتات
 * الملفّات نفسها — ذاك لـ`read` حين تُطلب.
 */
export async function openArchive(file: Blob): Promise<Result<OpenArchive>> {
  if (file.size < END_RECORD) return notArchive('أصغر من خاتمة ZIP')
  const tailStart = Math.max(0, file.size - END_RECORD - MAX_COMMENT)
  const tail = await readRange(file, tailStart, file.size)

  let endAt = -1
  for (let i = tail.byteLength - END_RECORD; i >= 0; i--) {
    if (
      tail.getUint32(i, true) === END &&
      i + END_RECORD + tail.getUint16(i + 20, true) === tail.byteLength
    ) {
      endAt = i
      break
    }
  }
  if (endAt < 0) return notArchive('لا خاتمة ZIP')

  const disk = tail.getUint16(endAt + 4, true)
  const directoryDisk = tail.getUint16(endAt + 6, true)
  const onDisk = tail.getUint16(endAt + 8, true)
  const count = tail.getUint16(endAt + 10, true)
  const directorySize = tail.getUint32(endAt + 12, true)
  const directoryAt = tail.getUint32(endAt + 16, true)
  const endOffset = tailStart + endAt
  if (disk !== 0 || directoryDisk !== 0 || onDisk !== count)
    return notArchive('حاوية متعدّدة الأقراص')
  if (directoryAt + directorySize > endOffset) return notArchive('الدليل خارج حدود الملفّ')

  const dir = await readRange(file, directoryAt, directoryAt + directorySize)
  const files = new Map<string, ArchiveFile>()
  let at = 0
  for (let n = 0; n < count; n++) {
    if (at + CENTRAL_HEADER > dir.byteLength || dir.getUint32(at, true) !== CENTRAL) {
      return notArchive(`مدخل الدليل ${n}`)
    }
    const flags = dir.getUint16(at + 8, true)
    const method = dir.getUint16(at + 10, true)
    const crc = dir.getUint32(at + 16, true)
    const packed = dir.getUint32(at + 20, true)
    const size = dir.getUint32(at + 24, true)
    const nameLength = dir.getUint16(at + 28, true)
    const extraLength = dir.getUint16(at + 30, true)
    const commentLength = dir.getUint16(at + 32, true)
    const localAt = dir.getUint32(at + 42, true)
    const nameEnd = at + CENTRAL_HEADER + nameLength
    if (nameEnd > dir.byteLength) return notArchive(`اسم المدخل ${n}`)
    // الطريقة 0 وحدها، وبلا تشفير (البتّ 0) — وأيّ بتٍّ غير UTF-8 علامةُ حاويةٍ لم يكتبها رصد.
    if (method !== 0 || packed !== size || (flags & ~UTF8_NAMES) !== 0) {
      return notArchive(`مدخل مضغوط أو مشفَّر: ${n}`)
    }
    let name: string
    try {
      name = utf8.decode(
        new Uint8Array(dir.buffer, dir.byteOffset + at + CENTRAL_HEADER, nameLength),
      )
    } catch {
      return notArchive(`اسمٌ ليس UTF-8: ${n}`)
    }
    if (!safeEntryName(name) || files.has(name)) return notArchive(`اسمٌ غير آمن أو مكرّر: ${name}`)

    if (localAt + LOCAL_HEADER > directoryAt) return notArchive(`رأسٌ محلّي خارج الحدود: ${name}`)
    const local = await readRange(file, localAt, localAt + LOCAL_HEADER)
    if (local.getUint32(0, true) !== LOCAL) return notArchive(`رأسٌ محلّي تالف: ${name}`)
    const localName = local.getUint16(26, true)
    const localExtra = local.getUint16(28, true)
    const start = localAt + LOCAL_HEADER + localName + localExtra
    if (localName !== nameLength || start + size > directoryAt) {
      return notArchive(`بيانات خارج الحدود: ${name}`)
    }
    const stored = await readRange(file, localAt + LOCAL_HEADER, localAt + LOCAL_HEADER + localName)
    const sameName = new Uint8Array(stored.buffer).every(
      (b, i) => b === dir.getUint8(at + CENTRAL_HEADER + i),
    )
    if (!sameName) return notArchive(`الاسم المحلّي يخالف الدليل: ${name}`)

    files.set(name, { name, start, size, crc })
    at = nameEnd + extraLength + commentLength
  }

  /*
   * **لا ملفّان على البايتات نفسها.** مدخلان يشيران إلى المنطقة ذاتها لا يُفكّان إلى أكبر منها (STORE)، لكنّ
   * خمسةً وستّين ألف مدخلٍ على منطقةٍ واحدة يطلب قراءتها خمسةً وستّين ألف مرّة. وما يكتبه رصد متتابعٌ لا يتداخل.
   */
  const ordered = [...files.values()].sort((a, b) => a.start - b.start)
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!
    if (ordered[i]!.start < previous.start + previous.size) {
      return notArchive(`ملفّان متداخلان: ${previous.name}`)
    }
  }

  return ok({
    files,
    slice: (entry, type) => file.slice(entry.start, entry.start + entry.size, type ?? ''),
    async read(entry) {
      const bytes = new Uint8Array(
        await file.slice(entry.start, entry.start + entry.size).arrayBuffer(),
      )
      return crc32(bytes) === entry.crc ? bytes : null
    },
  })
}
