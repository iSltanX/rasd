import { crc32 as nodeCrc32 } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { crc32, safeEntryName, writeZip } from '@/modules/export/zip'

import { unzip } from '../../../helpers/unzip'

/**
 * كاتب الحزمة (ADR 0037): ZIP بلا ضغط يُفكّ بأداة قياسية، حتميّ، ولا يكتب اسمًا يخرج من مجلّده.
 */

const AT = Date.UTC(2026, 8, 30, 12, 0, 0)
const text = (s: string) => new TextEncoder().encode(s)

function zipped(entries: { name: string; bytes: Uint8Array }[], at = AT): Uint8Array {
  const result = writeZip(entries, at)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe('writeZip', () => {
  it('تفكّه `unzip` بلا خطأ، بالأسماء والترتيب والمحتوى نفسه', () => {
    const random = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7919) % 251)
    const entries = [
      { name: 'rasd-handoff.md', bytes: text('# حزمة\n') },
      { name: 'rasd-handoff.json', bytes: text('{"schema":"rasd.handoff/1"}\n') },
      { name: 'images/issue-01.png', bytes: random },
      { name: 'empty.txt', bytes: new Uint8Array() },
    ]
    const out = unzip(zipped(entries))
    try {
      expect(out.test).toContain('No errors detected')
      expect(out.names).toEqual(entries.map((e) => e.name))
      for (const e of entries) expect(new Uint8Array(out.read(e.name))).toEqual(e.bytes)
    } finally {
      out.dispose()
    }
  })

  it('الأسماء العربية تُقرأ عربيةً — بتّ UTF-8 مضبوط', () => {
    const out = unzip(zipped([{ name: 'دليل/الصفحة.md', bytes: text('نصّ') }]))
    try {
      expect(out.utf8Names()).toEqual(['دليل/الصفحة.md'])
    } finally {
      out.dispose()
    }
  })

  it('حتميّ: المدخل والزمن نفسهما يعطيان البايتات نفسها، وزمنٌ آخر يغيّرها', () => {
    const entries = [{ name: 'a.txt', bytes: text('a') }]
    expect(zipped(entries)).toEqual(zipped(entries))
    expect(zipped(entries, AT + 60_000)).not.toEqual(zipped(entries))
  })

  it('بلا ضغط: حجم الحزمة مجموع الملفّات ورؤوسها بالضبط، ولا تعليق ولا حقل إضافي', () => {
    const bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 256)
    const out = zipped([{ name: 'x.bin', bytes }])
    expect(out.length).toBe(30 + 5 + 1000 + 46 + 5 + 22)
    // خاتمة الدليل: طول التعليق صفر.
    expect(out[out.length - 2]).toBe(0)
    expect(out[out.length - 1]).toBe(0)
  })

  it('الحزمة الفارغة ملفٌّ صالح', () => {
    const out = zipped([])
    expect(out.length).toBe(22)
  })

  it('يرفض ولا يكتب: اسمًا يخرج من المجلّد، أو مطلقًا، أو مكرّرًا', () => {
    for (const name of [
      '../x',
      'a/../../x',
      '/etc/x',
      'a\\b',
      '',
      'a//b',
      './a',
      'a/',
      'x\u0000y',
    ]) {
      expect(writeZip([{ name, bytes: text('x') }], AT).ok, JSON.stringify(name)).toBe(false)
      expect(safeEntryName(name)).toBe(false)
    }
    const twice = writeZip(
      [
        { name: 'a.txt', bytes: text('1') },
        { name: 'a.txt', bytes: text('2') },
      ],
      AT,
    )
    expect(twice.ok).toBe(false)
    expect(safeEntryName('images/issue-01.png')).toBe(true)
  })
})

describe('crc32', () => {
  it('يطابق CRC-32 من zlib على مدخلات متنوّعة', () => {
    const samples = [
      new Uint8Array(),
      text('123456789'),
      text('حزمة التسليم'),
      Uint8Array.from({ length: 4096 }, (_, i) => (i * 31) % 256),
    ]
    for (const s of samples) expect(crc32(s)).toBe(nodeCrc32(s))
    expect(crc32(text('123456789'))).toBe(0xcbf43926)
  })
})
