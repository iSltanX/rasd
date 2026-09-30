/**
 * كاتب الحزمة — ملفّ ZIP واحد بلا ضغط، يُفكّ بأي أداة قياسية (ADR 0037).
 *
 * **بلا ضغطٍ عمدًا، بثمنٍ مقيس:** الصور — جُلّ الحزمة — PNG مضغوطةٌ أصلًا فلا يكسب ضغطها إلا ٣٪ تقريبًا،
 * والنصّ يكسب كثيرًا لكنه صغير: حزمة عشرين مشكلة 685KB مخزّنةً و585KB مضغوطةً (ADR 0037). والفرق لا يشتري
 * اعتماديةً ولا مسارًا غير متزامن. والطريقة `0` (STORE) أبسط ما في مواصفة ZIP وأوسعه دعمًا: رأسٌ محلّي لكل
 * ملفّ، ثمّ دليلٌ مركزي، ثمّ خاتمة.
 *
 * **حتميّ:** المدخل نفسه والزمن نفسه يعطيان البايتات نفسها — لا زمن حاضر يُقرأ هنا، ولا حقل إضافي ولا تعليق.
 * فلا شيء في الحاوية يحمل ما لم يُطلب: لا رابط ولا عنوان ولا مسار من جهاز المستخدم.
 *
 * يعيده [06](../../../STAGES/06.md) لحزمة الدليل. `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { errText, ok, type Result } from '@/shared/result'

export interface ZipEntry {
  /** المسار داخل الحزمة بفواصل `/` — نسبيٌّ لا يخرج منها. */
  readonly name: string
  readonly bytes: Uint8Array
}

/** سقف ZIP بلا امتداد Zip64 — ما فوقه يُرفض برسالة لا يُكتب ملفًّا تالفًا. */
const MAX_ENTRIES = 0xffff
const MAX_BYTES = 0xffffffff

const LOCAL_HEADER = 30
const CENTRAL_HEADER = 46
const END_RECORD = 22

/** البتّ 11: الأسماء بـUTF-8 — فاسمٌ عربي يُقرأ عربيًّا لا رموزًا. */
const UTF8_NAMES = 0x0800
/** الإصدار 2.0 — ما يكفي الطريقة `0` والمجلّدات. */
const VERSION = 20

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 (IEEE 802.3) — ما يتحقّق به `unzip -t` من كل ملفّ. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/**
 * زمن MS-DOS من مكوّنات UTC — لا المنطقة المحلية: حزمتان من المدخل نفسه على جهازين تتطابقان بايتًا ببايت.
 * والمواصفة لا تعرف ما قبل 1980 فيُثبَّت عنده.
 */
function dosTime(at: number): { readonly time: number; readonly date: number } {
  const d = new Date(Math.max(at, Date.UTC(1980, 0, 1)))
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  }
}

/**
 * اسمٌ آمن داخل الحزمة: غير فارغ، بفواصل `/`، بلا بداية مطلقة ولا مقطع `..` ولا `.` — فلا يكتب فكّها
 * خارج مجلّده (Zip Slip) — وبلا محارف تحكّم.
 */
export function safeEntryName(name: string): boolean {
  if (!name || name.startsWith('/') || name.includes('\\')) return false
  // eslint-disable-next-line no-control-regex -- المقصود رفض محارف التحكّم نفسها
  if (/[\u0000-\u001f\u007f]/u.test(name)) return false
  return name.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

/**
 * يكتب الحزمة. `modified` زمن كل ملفّ فيها — يُمرَّر ولا يُقرأ هنا، فيبقى الكاتب حتميًّا.
 *
 * يرفض ولا يكتب: اسمًا غير آمن، أو اسمًا مكرّرًا، أو ما جاوز حدّ ZIP بلا Zip64.
 */
export function writeZip(entries: readonly ZipEntry[], modified: number): Result<Uint8Array> {
  if (entries.length > MAX_ENTRIES) {
    return errText('invalid-data', 'الحزمة أكبر من أن تُكتب ملفًّا واحدًا.', `${entries.length}`)
  }
  const encoder = new TextEncoder()
  const seen = new Set<string>()
  const named: { readonly name: Uint8Array; readonly bytes: Uint8Array; readonly crc: number }[] =
    []
  let total = END_RECORD
  for (const entry of entries) {
    if (!safeEntryName(entry.name)) {
      return errText('invalid-data', 'اسم ملفٍّ غير صالح داخل الحزمة.', entry.name)
    }
    if (seen.has(entry.name)) {
      return errText('invalid-data', 'اسمٌ مكرّر داخل الحزمة.', entry.name)
    }
    seen.add(entry.name)
    const name = encoder.encode(entry.name)
    total += LOCAL_HEADER + CENTRAL_HEADER + name.length * 2 + entry.bytes.length
    named.push({ name, bytes: entry.bytes, crc: crc32(entry.bytes) })
  }
  if (total > MAX_BYTES) {
    return errText('invalid-data', 'الحزمة أكبر من أن تُكتب ملفًّا واحدًا.', `${total} bytes`)
  }

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  const { time, date } = dosTime(modified)
  let at = 0
  const u16 = (v: number) => {
    view.setUint16(at, v, true)
    at += 2
  }
  const u32 = (v: number) => {
    view.setUint32(at, v >>> 0, true)
    at += 4
  }
  const bytes = (b: Uint8Array) => {
    out.set(b, at)
    at += b.length
  }

  const offsets: number[] = []
  for (const entry of named) {
    offsets.push(at)
    u32(0x04034b50)
    u16(VERSION)
    u16(UTF8_NAMES)
    u16(0) // الطريقة: STORE
    u16(time)
    u16(date)
    u32(entry.crc)
    u32(entry.bytes.length)
    u32(entry.bytes.length)
    u16(entry.name.length)
    u16(0) // لا حقل إضافي
    bytes(entry.name)
    bytes(entry.bytes)
  }

  const directory = at
  named.forEach((entry, i) => {
    u32(0x02014b50)
    u16(VERSION)
    u16(VERSION)
    u16(UTF8_NAMES)
    u16(0)
    u16(time)
    u16(date)
    u32(entry.crc)
    u32(entry.bytes.length)
    u32(entry.bytes.length)
    u16(entry.name.length)
    u16(0) // حقل إضافي
    u16(0) // تعليق
    u16(0) // القرص
    u16(0) // سمات داخلية
    u32(0) // سمات خارجية
    u32(offsets[i] ?? 0)
    bytes(entry.name)
  })

  const size = at - directory
  u32(0x06054b50)
  u16(0)
  u16(0)
  u16(named.length)
  u16(named.length)
  u32(size)
  u32(directory)
  u16(0) // لا تعليق على الحزمة

  return ok(out)
}
