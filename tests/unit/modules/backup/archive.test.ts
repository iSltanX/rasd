// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildArchive, openArchive, type ArchiveEntry } from '@/modules/backup/archive'
import { crc32 } from '@/modules/export/zip'

import { unzip } from '../../../helpers/unzip'

/**
 * حاوية النسخة: تُفكّ بأداة قياسية، ويقرؤها رصد كما كتبها، ويرفض قارئها كل ملفٍّ لا يطابق ما يكتبه كاتبها —
 * فالملفّ الذي يختاره المستخدم لا يُقرأ منه شيءٌ خارج حدوده (ADR 0039).
 */

const text = (s: string) => new TextEncoder().encode(s)
const AT = Date.UTC(2026, 8, 30, 12, 0, 0)

const ENTRIES: ArchiveEntry[] = [
  { name: 'manifest.json', data: text('{"format":"rasd.backup"}') },
  { name: 'stores/captures.json', data: text('[{"id":"c1","title":"السلّة"}]') },
  { name: 'files/blobs/000001.png', data: new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])]) },
  { name: 'files/blobs/000002.webp', data: new Blob([new Uint8Array(0)]) },
]

async function built(entries = ENTRIES): Promise<Uint8Array> {
  const result = await buildArchive(entries, { modified: AT })
  if (!result.ok || result.value === 'cancelled') throw new Error('build failed')
  return new Uint8Array(await result.value.arrayBuffer())
}

async function open(bytes: Uint8Array) {
  return openArchive(new Blob([bytes.slice()]))
}

describe('البناء', () => {
  it('يُفكّ بأداة قياسية، وCRC كل ملفّ صحيح', async () => {
    const bytes = await built()
    const z = unzip(bytes)
    try {
      expect(z.test).toMatch(/No errors detected/)
      expect(z.names).toEqual(ENTRIES.map((e) => e.name))
      expect([...z.read('files/blobs/000001.png')]).toEqual([137, 80, 78, 71, 1, 2, 3])
    } finally {
      z.dispose()
    }
  })

  it('حتميّ: المدخل نفسه والزمن نفسه يعطيان البايتات نفسها', async () => {
    expect(await built()).toEqual(await built())
  })

  it('يرفض اسمًا يخرج من الحاوية أو مكرّرًا، ولا يبني شيئًا', async () => {
    for (const name of ['../evil.png', '/abs.png', 'files//x.png']) {
      const r = await buildArchive([{ name, data: text('x') }], { modified: AT })
      expect(r.ok, name).toBe(false)
    }
    const dup = await buildArchive(
      [
        { name: 'a.json', data: text('1') },
        { name: 'a.json', data: text('2') },
      ],
      { modified: AT },
    )
    expect(dup.ok).toBe(false)
  })

  it('الإلغاء يُرجع `cancelled` لا خطأً', async () => {
    const controller = new AbortController()
    controller.abort()
    const r = await buildArchive(ENTRIES, { modified: AT, signal: controller.signal })
    expect(r.ok && r.value).toBe('cancelled')
  })

  it('يُبلغ التقدّم ملفًّا ملفًّا', async () => {
    const seen: string[] = []
    await buildArchive(ENTRIES, { modified: AT, onEntry: (d, t) => seen.push(`${d}/${t}`) })
    expect(seen).toEqual(['1/4', '2/4', '3/4', '4/4'])
  })
})

describe('القراءة', () => {
  it('تقرأ ما كُتب: الأسماء والأحجام والبايتات، وCRC يطابق', async () => {
    const r = await open(await built())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([...r.value.files.keys()]).toEqual(ENTRIES.map((e) => e.name))
    const png = r.value.files.get('files/blobs/000001.png')!
    expect(png.size).toBe(7)
    expect([...((await r.value.read(png)) ?? [])]).toEqual([137, 80, 78, 71, 1, 2, 3])
    const slice = r.value.slice(png, 'image/png')
    expect(slice.type).toBe('image/png')
    expect(slice.size).toBe(7)
    const empty = r.value.files.get('files/blobs/000002.webp')!
    expect((await r.value.read(empty))?.length).toBe(0)
  })

  it('بايتٌ تغيّر في ملفّ: الحاوية تُفتح، وقراءة ذلك الملفّ `null`', async () => {
    const bytes = await built()
    const r0 = await open(bytes)
    if (!r0.ok) throw new Error('open')
    const png = r0.value.files.get('files/blobs/000001.png')!
    bytes[png.start + 2] = (bytes[png.start + 2] ?? 0) ^ 0xff
    const r = await open(bytes)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(await r.value.read(r.value.files.get('files/blobs/000001.png')!)).toBeNull()
    expect(await r.value.read(r.value.files.get('manifest.json')!)).not.toBeNull()
  })

  it('يرفض ما ليس ZIP: فارغًا، ونصًّا، وحاويةً مقطوعة الذيل', async () => {
    expect((await openArchive(new Blob([]))).ok).toBe(false)
    expect((await openArchive(new Blob(['not a zip at all, just text']))).ok).toBe(false)
    const bytes = await built()
    expect((await open(bytes.slice(0, bytes.length - 10))).ok).toBe(false)
    expect((await open(bytes.slice(0, 40))).ok).toBe(false)
  })

  /** يعدّل حقلًا في الدليل المركزي للمدخل الأوّل ويعيد الحاوية. */
  async function patchCentral(offset: number, write: (view: DataView, at: number) => void) {
    const bytes = await built()
    const view = new DataView(bytes.buffer)
    const endAt = bytes.length - 22
    const directory = view.getUint32(endAt + 16, true)
    write(view, directory + offset)
    return open(bytes)
  }

  it('يرفض الضغط والتشفير وأيّ بتٍّ لا يكتبه رصد', async () => {
    expect((await patchCentral(10, (v, at) => v.setUint16(at, 8, true))).ok).toBe(false)
    expect((await patchCentral(8, (v, at) => v.setUint16(at, 0x0801, true))).ok).toBe(false)
    expect((await patchCentral(8, (v, at) => v.setUint16(at, 0x0808, true))).ok).toBe(false)
  })

  it('يرفض إزاحةً خارج الملفّ، وحجمًا يتجاوز الدليل', async () => {
    expect((await patchCentral(42, (v, at) => v.setUint32(at, 0xfffffff0, true))).ok).toBe(false)
    expect((await patchCentral(24, (v, at) => v.setUint32(at, 0x7fffffff, true))).ok).toBe(false)
  })

  it('يرفض اسمًا في الدليل يخالف اسم الرأس المحلّي', async () => {
    const bytes = await built()
    // الحرف الأوّل من اسم المدخل الأوّل في رأسه المحلّي: `m` ← `n`.
    bytes[30] = 'n'.charCodeAt(0)
    expect((await open(bytes)).ok).toBe(false)
  })

  it('يرفض مدخلين على البايتات نفسها', async () => {
    const bytes = await built()
    const view = new DataView(bytes.buffer)
    const endAt = bytes.length - 22
    const directory = view.getUint32(endAt + 16, true)
    // المدخل الثاني يشير إلى رأس الأوّل المحلّي.
    const firstName = view.getUint16(directory + 28, true)
    const second = directory + 46 + firstName
    view.setUint32(second + 42, 0, true)
    expect((await open(bytes)).ok).toBe(false)
  })

  it('يرفض اسمًا غير آمن في حاويةٍ كتبها غيرنا', async () => {
    const bytes = await built([{ name: 'aa/evil.png', data: text('x') }])
    // `aa/` ← `../` في الرأس المحلّي والدليل معًا: الحاوية متّسقة، والاسم وحده يخرج منها.
    const swap = (at: number) => {
      bytes[at] = '.'.charCodeAt(0)
      bytes[at + 1] = '.'.charCodeAt(0)
    }
    swap(30)
    const view = new DataView(bytes.buffer)
    swap(view.getUint32(bytes.length - 22 + 16, true) + 46)
    expect((await open(bytes)).ok).toBe(false)
  })

  it('crc32 المستعار يطابق القيمة المرجعية', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926)
  })
})
