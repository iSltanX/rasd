import { inflateSync } from 'node:zlib'

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFNumber,
  type PDFRawStream,
} from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { buildPdf, type PdfInput, type PdfMetadata } from '@/modules/export/pdf'
import { fullPageWindow, pageBox, planImagePages } from '@/modules/export/pdf-layout'

import { decodePredicted, makePng, rawPixels } from '../../../helpers/make-png'

import type { ExportBytes } from '@/modules/editor/bake'

/**
 * مولِّد PDF — **يُفكّ الملفّ فعليًّا**، لا يُقرأ توقيعه وحده (معيار القبول في `STAGES/05`).
 *
 * ثلاث طبقات من الدليل: التوقيع والذيل، ثمّ تحليل `pdf-lib` نفسها للبنية (صفحات، مقاسات، قواميس)، ثمّ فكّ
 * تيّار الصورة بمرشِّحات PNG الخمسة إلى بكسلاتٍ تُطابَق بالأصل بايتًا بايتًا. والثالثة وحدها تقول إن
 * القارئ سيرسم ما خرج من البوّابة.
 */

const W = 40
const H = 30
const pattern = (x: number, y: number) => [(x * 7) % 256, (y * 11) % 256, (x * y) % 256] as const
const baked = (bytes: Uint8Array): ExportBytes =>
  new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' }) as unknown as ExportBytes

const A4 = pageBox('a4', 'portrait')

const META: PdfMetadata = {
  title: 'الواجهة — سطح المكتب',
  subject: 'https://shop.example/checkout?step=2',
  keywords: ['منصّة المتجر'],
  createdAt: new Date(Date.UTC(2026, 8, 30, 12, 0, 0)),
}

async function single(metadata: PdfMetadata | null = META): Promise<Uint8Array> {
  const png = makePng(W, H, pattern, { idatChunks: 3 })
  const [window] = await planImagePages(W, H, A4, 'single')
  const input: PdfInput = {
    images: [baked(png)],
    pages: [{ image: 0, box: A4, window: window! }],
    metadata,
  }
  const built = await buildPdf(input)
  if (!built.ok) throw new Error(built.error.message)
  return built.value
}

const latin1 = (bytes: Uint8Array): string => String.fromCharCode(...bytes)

/** قاموس الصورة وتيّارها — من أوّل صفحة، عبر موارد `XObject`. */
function firstImage(doc: PDFDocument): { dict: PDFDict; stream: PDFRawStream } {
  const resources = doc.getPage(0).node.Resources()!
  const xobjects = resources.lookup(PDFName.of('XObject'), PDFDict)
  const [name] = xobjects.keys()
  const stream = xobjects.lookup(name!) as PDFRawStream
  return { dict: stream.dict, stream }
}

const num = (dict: PDFDict, key: string): number =>
  (dict.lookup(PDFName.of(key)) as PDFNumber).asNumber()

describe('المولِّد: ملفّ PDF يُفتح فعلًا', () => {
  it('يبدأ بـ`%PDF-` وينتهي بـ`%%EOF`', async () => {
    const bytes = await single()
    expect(latin1(bytes.subarray(0, 5))).toBe('%PDF-')
    expect(latin1(bytes.subarray(bytes.length - 6)).trim()).toBe('%%EOF')
  })

  it('تحلّله `pdf-lib`: صفحة واحدة بمقاس A4 عمودي', async () => {
    const doc = await PDFDocument.load(await single())
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(595.28, 1)
    expect(height).toBeCloseTo(841.89, 1)
  })

  it('**الصورة تدخل كما خرجت من البوّابة**: `FlateDecode` بمرشِّح PNG وتيّار `IDAT` نفسه', async () => {
    const png = makePng(W, H, pattern, { idatChunks: 3 })
    const doc = await PDFDocument.load(await single())
    const { dict, stream } = firstImage(doc)
    expect(dict.lookup(PDFName.of('Subtype'))).toBe(PDFName.of('Image'))
    expect(dict.lookup(PDFName.of('Filter'))).toBe(PDFName.of('FlateDecode'))
    expect(dict.lookup(PDFName.of('ColorSpace'))).toBe(PDFName.of('DeviceRGB'))
    expect(num(dict, 'Width')).toBe(W)
    expect(num(dict, 'Height')).toBe(H)
    const parms = dict.lookup(PDFName.of('DecodeParms'), PDFDict)
    expect(num(parms, 'Predictor')).toBe(15)
    expect(num(parms, 'Colors')).toBe(3)
    expect(num(parms, 'Columns')).toBe(W)
    // لا مفتاح شفافية: السطح معتم بالقياس، والقناع كان سيعني فكّ البكسلات.
    expect(dict.has(PDFName.of('SMask'))).toBe(false)

    // التيّار = مقاطع `IDAT` الثلاثة متّصلة — لا إعادة ضغط.
    expect(Buffer.from(stream.contents).equals(Buffer.from(collectIdat(png)))).toBe(true)
  })

  it('**وتُفكّ إلى البكسلات الأصلية بلا فرق** — ما يرسمه القارئ هو ما خرج', async () => {
    const doc = await PDFDocument.load(await single())
    const { stream } = firstImage(doc)
    const decoded = decodePredicted(stream.contents, W, H, 3)
    expect(Buffer.from(decoded).equals(Buffer.from(rawPixels(W, H, pattern)))).toBe(true)
  })

  it('متعدّد الصفحات: الصورة مضمَّنة **مرّةً واحدة**، وكل صفحة تقصّ نافذتها', async () => {
    const tall = 1200
    const png = makePng(W, tall, pattern)
    const box = pageBox('a4', 'landscape')
    const windows = await planImagePages(W, tall, box, 'multi')
    expect(windows.length).toBeGreaterThan(1)
    const built = await buildPdf({
      images: [baked(png)],
      pages: windows.map((window) => ({ image: 0, box, window })),
      metadata: null,
    })
    if (!built.ok) throw new Error(built.error.message)
    const doc = await PDFDocument.load(built.value)
    expect(doc.getPageCount()).toBe(windows.length)
    expect(doc.getPage(0).getSize().width).toBeCloseTo(841.89, 1)

    const refs = new Set<string>()
    doc.getPages().forEach((page) => {
      const xobjects = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict)
      for (const key of xobjects.keys()) refs.add(String(xobjects.get(key)))
    })
    expect(refs.size).toBe(1)

    // كل صفحة تحمل مستطيل قصّ (`re W n`) قبل رسم الصورة — وإلا ظهر ذيل الصفحة التالية أسفلها.
    for (const page of doc.getPages()) {
      const contents = page.node.Contents()
      const stream = (
        contents instanceof PDFArray ? doc.context.lookup(contents.get(0)) : contents
      ) as PDFRawStream
      const flate = stream.dict.lookup(PDFName.of('Filter')) === PDFName.of('FlateDecode')
      const text = latin1(flate ? inflateSync(stream.contents) : stream.contents)
      expect(text).toMatch(/re\s+W\s+n/)
      expect(text).toMatch(/Do/)
    }
  })

  it('صفحة نصّية تملأ الصفحة كلّها بلا هامش', async () => {
    const png = makePng(119, 168, pattern)
    const box = pageBox('a4', 'portrait')
    const built = await buildPdf({
      images: [baked(png)],
      pages: [{ image: 0, box, window: fullPageWindow(box, 119, 168) }],
      metadata: null,
    })
    expect(built.ok).toBe(true)
  })

  it('**يرفض صورةً بقناة شفافية باسمها** — لا يسقط إلى فكّ البكسلات', async () => {
    const png = makePng(W, H, pattern, { colourType: 6 })
    const [window] = await planImagePages(W, H, A4, 'single')
    const built = await buildPdf({
      images: [baked(png)],
      pages: [{ image: 0, box: A4, window: window! }],
      metadata: null,
    })
    expect(built.ok).toBe(false)
    if (!built.ok) expect(built.error.detail).toContain('RGB')
  })

  it('ويرفض صفحةً تشير إلى صورة غير موجودة', async () => {
    const [window] = await planImagePages(W, H, A4, 'single')
    const built = await buildPdf({
      images: [],
      pages: [{ image: 0, box: A4, window: window! }],
      metadata: null,
    })
    expect(built.ok).toBe(false)
  })
})

describe('البيانات الوصفية العربية', () => {
  it('حين لا حذف: العنوان والموضوع والكلمات عربيةً كما هي، والمنشئ «رصد»، واللغة `ar`', async () => {
    const doc = await PDFDocument.load(await single(), { updateMetadata: false })
    expect(doc.getTitle()).toBe(META.title)
    expect(doc.getSubject()).toBe(META.subject)
    expect(doc.getKeywords()).toBe('منصّة المتجر')
    expect(doc.getCreator()).toBe('رصد')
    expect(doc.getProducer()).toBe('رصد')
    expect(doc.getCreationDate()?.getTime()).toBe(META.createdAt.getTime())
    expect(String(doc.catalog.lookup(PDFName.of('Lang')))).toContain('ar')
  })

  it('**والحذف كامل**: لا قاموس `Info` في الملفّ أصلًا — لا منشئ ولا تاريخ', async () => {
    const bytes = await single(null)
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(doc.context.trailerInfo.Info).toBeUndefined()
    expect(doc.getTitle()).toBeUndefined()
    expect(doc.getCreator()).toBeUndefined()
    expect(doc.getProducer()).toBeUndefined()
    expect(doc.getCreationDate()).toBeUndefined()
    expect(latin1(bytes)).not.toMatch(/\/Info\b/)
  })
})

/**
 * **الاختبار الأمني على البايتات** — لا على ما تُعيده `pdf-lib` بعد التحليل.
 *
 * نصٌّ في PDF قد يُكتب حرفيًّا `(...)` أو بالنظام الستّ عشري `<FEFF...>` بـUTF-16، أو UTF-8 في تيّار. فالفاحص يبحث
 * بالأشكال كلّها. والملفّ يُحفظ بلا تيّارات كائنات مضغوطة، فلا قاموس يختبئ داخل `FlateDecode` عن الفحص.
 */
function traces(bytes: Uint8Array, needle: string): string[] {
  const hay = latin1(bytes)
  const utf8 = latin1(new TextEncoder().encode(needle))
  const utf16 = [...needle]
    .flatMap((ch) => {
      const code = ch.codePointAt(0)!
      const units =
        code > 0xffff
          ? [0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff)]
          : [code]
      return units
    })
    .map((u) => u.toString(16).padStart(4, '0'))
    .join('')
  const utf16Raw = utf16.replace(/(..)/g, (h) => String.fromCharCode(Number.parseInt(h, 16)))
  const found: string[] = []
  if (hay.includes(utf8)) found.push('utf8')
  if (hay.includes(utf16Raw)) found.push('utf16')
  if (hay.toUpperCase().includes(utf16.toUpperCase())) found.push('utf16-hex')
  return found
}

describe('الاختبار الأمني: لا أثر للرابط ولا العنوان ولا اسم المشروع', () => {
  const secrets = {
    url: META.subject,
    host: 'shop.example',
    title: META.title,
    project: 'منصّة المتجر',
  }

  it('**مع تفعيل الحذف**: صفرُ أثرٍ لكلٍّ منها بأي ترميز', async () => {
    const bytes = await single(null)
    for (const [name, value] of Object.entries(secrets)) {
      expect({ name, found: traces(bytes, value) }).toEqual({ name, found: [] })
    }
  })

  it('**ويحمرّ عند تعطيل الحذف** — الفاحص نفسه يجد كلًّا منها، فليس أعمى', async () => {
    const bytes = await single(META)
    for (const [name, value] of Object.entries(secrets)) {
      expect({ name, found: traces(bytes, value).length > 0 }).toEqual({ name, found: true })
    }
  })
})

/** تيّار `IDAT` المتّصل — يُقرأ هنا مستقلًّا عن قارئ الإنتاج. */
function collectIdat(png: Uint8Array): Uint8Array {
  const parts: number[] = []
  let at = 8
  while (at + 8 <= png.length) {
    const size =
      ((png[at]! << 24) | (png[at + 1]! << 16) | (png[at + 2]! << 8) | png[at + 3]!) >>> 0
    const type = latin1(png.subarray(at + 4, at + 8))
    if (type === 'IDAT') parts.push(...png.subarray(at + 8, at + 8 + size))
    at += 12 + size
  }
  return Uint8Array.from(parts)
}
