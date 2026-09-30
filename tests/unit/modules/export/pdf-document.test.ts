import { describe, expect, it } from 'vitest'

import {
  DOC_FONTS,
  DOC_MARGIN,
  layoutDocument,
  wrapText,
  type DocBlock,
  type DocOp,
  type MeasureDoc,
} from '@/modules/export/pdf-document'
import { pageBox } from '@/modules/export/pdf-layout'

/**
 * تخطيط الصفحات النصّية — بقياسٍ ثابت: كل محرف نصفُ حجم خطّه.
 *
 * ما يُثبت هنا ما لا يراه الفحص الحيّ بسهولة: لا سطر يُسقط، ولا نصّ يفيض عن الصفحة، والصفحة الجديدة تبدأ
 * حين يجب لا قبله.
 */

const measure: MeasureDoc = (text, font) => [...text].length * DOC_FONTS[font].size * 0.5
const box = pageBox('a4', 'portrait')

const texts = (pages: readonly { ops: readonly DocOp[] }[]): string[] =>
  pages.flatMap((p) => p.ops.flatMap((op) => (op.kind === 'text' ? [op.text] : [])))

describe('لفّ الأسطر', () => {
  it('بالكلمات حين تتّسع', () => {
    // «body» حجمه 10 ⇒ المحرف 5 نقاط، والعرض 60 ⇒ 12 محرفًا للسطر.
    expect(wrapText('واحد اثنان ثلاثة أربعة', 60, 'body', measure)).toEqual([
      'واحد اثنان',
      'ثلاثة أربعة',
    ])
  })

  it('**وكلمةٌ أطول من السطر تُقطع بالمحارف** — رابطٌ لا يفيض خارج الورقة', () => {
    const url = 'https://shop.example/checkout/very/long/path'
    const lines = wrapText(url, 60, 'body', measure)
    expect(lines.join('')).toBe(url)
    expect(lines.every((l) => measure(l, 'body') <= 60)).toBe(true)
  })

  it('والأسطر الفارغة في المتن فواصل تُحفظ', () => {
    expect(wrapText('أ\n\nب', 200, 'body', measure)).toEqual(['أ', '', 'ب'])
  })
})

describe('الصفحات', () => {
  it('عنوانٌ وصفوف وبنود في صفحة واحدة حين تتّسع — بترتيبها', () => {
    const blocks: DocBlock[] = [
      { kind: 'title', text: 'تفاصيل اللقطة', sub: null },
      { kind: 'heading', text: 'بيانات الصفحة' },
      { kind: 'rows', rows: [{ label: 'الرابط', value: 'https://a.example/', mono: true }] },
      {
        kind: 'items',
        items: [
          {
            number: '١',
            title: 'الزرّ أصغر من التصميم',
            chip: { text: 'مفتوحة', tone: 'danger' },
            lines: [{ text: 'الآن 12px · المتوقَّع 16px', mono: false }],
          },
        ],
      },
    ]
    const pages = layoutDocument(blocks, box, measure)
    expect(pages).toHaveLength(1)
    expect(texts(pages)).toEqual([
      'تفاصيل اللقطة',
      'بيانات الصفحة',
      'الرابط',
      'https://a.example/',
      'الزرّ أصغر من التصميم',
      'الآن 12px · المتوقَّع 16px',
    ])
    const ops = pages[0]!.ops
    expect(ops.some((op) => op.kind === 'chip' && op.text === 'مفتوحة')).toBe(true)
    expect(ops.some((op) => op.kind === 'badge' && op.text === '١')).toBe(true)
  })

  it('**مئة بند تتدفّق على صفحات بلا سطرٍ مفقود ولا نصٍّ خارج الهامش**', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      number: String(i + 1),
      title: `ملاحظة ${i + 1}`,
      chip: null,
      lines: [{ text: `متن الملاحظة ${i + 1}`, mono: false }],
    }))
    const pages = layoutDocument([{ kind: 'items', items }], box, measure)
    expect(pages.length).toBeGreaterThan(1)
    const all = texts(pages)
    for (let i = 1; i <= 100; i++) {
      expect(all).toContain(`ملاحظة ${i}`)
      expect(all).toContain(`متن الملاحظة ${i}`)
    }
    for (const page of pages) {
      for (const op of page.ops) {
        if (op.kind !== 'text') continue
        expect(op.y).toBeGreaterThanOrEqual(DOC_MARGIN)
        expect(op.y).toBeLessThanOrEqual(box.height - DOC_MARGIN)
      }
    }
  })

  it('بندٌ أطول من صفحةٍ كاملة يُقسم على أسطره ولا يُقصّ', () => {
    const body = Array.from({ length: 80 }, (_, i) => `سطر ${i}`).join('\n')
    const pages = layoutDocument(
      [
        {
          kind: 'items',
          items: [
            { number: '١', title: 'طويلة', chip: null, lines: [{ text: body, mono: false }] },
          ],
        },
      ],
      box,
      measure,
    )
    expect(pages.length).toBeGreaterThan(1)
    expect(texts(pages).filter((t) => t.startsWith('سطر '))).toHaveLength(80)
  })

  it('السطر التقني يُكتب يساري الاتجاه، والعربي يميني', () => {
    const [page] = layoutDocument(
      [
        {
          kind: 'rows',
          rows: [
            { label: 'الرابط', value: 'https://a.example/', mono: true },
            { label: 'العنوان', value: 'الواجهة', mono: false },
          ],
        },
      ],
      box,
      measure,
    )
    const dirOf = (t: string) =>
      page!.ops.find((op) => op.kind === 'text' && op.text === t) as Extract<
        DocOp,
        { kind: 'text' }
      >
    expect(dirOf('https://a.example/').dir).toBe('ltr')
    expect(dirOf('الواجهة').dir).toBe('rtl')
  })
})
