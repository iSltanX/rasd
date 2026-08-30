import { describe, expect, it } from 'vitest'

import { asNodeId, type FontSpec, type NoteNode, type TextNode } from '@/modules/editor/scene'
import { isolateText, resolveDirection, segmentAtoms } from '@/modules/editor/text-bidi'
import {
  createTextLayoutCache,
  estimateMetrics,
  noteBox,
  wrapText,
  type FontMetrics,
  type MeasureText,
} from '@/modules/editor/text-layout'
import { LRI, PDI, stripIsolates } from '@/shared/bidi'
import { devicePoint } from '@/shared/geometry'

/**
 * النصّ العربي على Canvas.
 *
 * **القياس محقون لا حقيقي** — بيئة الاختبار بلا `measureText` بالقياس. وهذا
 * ليس تنازلًا: ما يُختبَر هنا هو **منطق اللفّ** (متى يُقطع السطر، وأين لا
 * يُقطع أبدًا)، ودقّةُ القياس تُقاس حيًّا في `verify-editor.mjs`.
 *
 * والمقياس المحقون خطّي — محرف واحد = عرض واحد — كي تكون العتبات قابلة
 * للحساب بالعدّ لا بالتقريب.
 */

const font: FontSpec = { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 0 }

/** كل محرف بعرض 10، ومحارف العزل صفرية — كما قِيس في المتصفّح. */
const measure: MeasureText = (line) => stripIsolates(line).length * 10

const fm: FontMetrics = { ascent: 18, descent: 5, lineHeight: 23 }

const textNode = (over: Partial<TextNode> = {}): TextNode => ({
  kind: 'text',
  id: asNodeId('t'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 },
  at: devicePoint(0, 0),
  text: 'مرحبا',
  font,
  maxWidthPx: 0,
  align: 'start',
  dir: 'auto',
  ...over,
})

const noteNode = (over: Partial<NoteNode> = {}): NoteNode => ({
  kind: 'note',
  id: asNodeId('n'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 },
  at: devicePoint(10, 20),
  widthPx: 200,
  title: 'عنوان',
  body: 'شرح قصير',
  tag: null,
  font,
  paddingPx: 12,
  pinId: null,
  ...over,
})

// ═════════════════════ التقطيع إلى ذرّات ═════════════════════

describe('المقاطع التقنية تُنتزَع ذرّاتٍ', () => {
  const atomsOf = (t: string) => segmentAtoms(t).map((a) => `${a.technical ? 'T' : '·'}${a.text}`)

  it('**قيمة سداسية ذرّة واحدة** — لا `#` ثم `3B82F6`', () => {
    expect(atomsOf('اللون #3B82F6')).toEqual(['·اللون', '· ', 'T#3B82F6'])
  })

  it('متغيّر CSS ذرّة واحدة — لا خمسة مقاطع', () => {
    expect(atomsOf('استعمل --color-primary هنا')).toEqual([
      '·استعمل',
      '· ',
      'T--color-primary',
      '· ',
      '·هنا',
    ])
  })

  it('المقاس بوحدته ذرّة', () => {
    expect(atomsOf('الحشوة 14px')).toEqual(['·الحشوة', '· ', 'T14px'])
  })

  it('المحدِّد والمسار والرابط ذرّات', () => {
    expect(segmentAtoms('button.cta-btn')[0]).toMatchObject({ technical: true })
    expect(segmentAtoms('src/shared/bidi')[0]).toMatchObject({ technical: true })
    expect(segmentAtoms('https://example.test/a?b=1')[0]).toMatchObject({ technical: true })
  })

  it('المسافات ذرّات قابلة للقطع، والكلمات لا', () => {
    const atoms = segmentAtoms('كلمة أخرى')
    expect(atoms.map((a) => a.breakable)).toEqual([false, true, false])
  })

  it('نصّ بلا مقاطع تقنية يبقى كلمات ومسافات', () => {
    expect(atomsOf('العنوان أكبر بدرجتين')).toEqual(['·العنوان', '· ', '·أكبر', '· ', '·بدرجتين'])
  })
})

describe('العزل يُركَّب على التقني وحده', () => {
  it('المقطع التقني محاط بمحارف العزل', () => {
    const out = isolateText('اللون #3B82F6')
    expect(out).toContain(LRI)
    expect(out).toContain(PDI)
    expect(out.indexOf(LRI)).toBeLessThan(out.indexOf('#'))
  })

  it('**ونزعُ العزل يعيد النصّ الأصلي حرفًا بحرف**', () => {
    for (const t of [
      'اللون #3B82F6',
      'الحشوة 14px 24px واللون #3B82F6',
      'بلا شيء تقني',
      'button.cta-btn يفقد 8px',
    ]) {
      expect(stripIsolates(isolateText(t))).toBe(t)
    }
  })

  it('الكلمات العادية بلا عزل', () => {
    expect(isolateText('كلمتان عاديتان')).toBe('كلمتان عاديتان')
  })

  it('العزل لا يُخزَّن في المشهد — يُركَّب لحظة الرسم', () => {
    // العقدة تحمل النصّ المنطقي؛ والرسم يمرّ من `isolateAtoms`.
    expect(textNode({ text: 'اللون #3B82F6' }).text).not.toContain(LRI)
  })
})

describe('حسم الاتجاه — لا يُترك للوراثة أبدًا', () => {
  it('عربي ⇒ rtl، ولاتيني ⇒ ltr', () => {
    expect(resolveDirection('مرحبا', 'auto')).toBe('rtl')
    expect(resolveDirection('Hello', 'auto')).toBe('ltr')
  })

  it('**أوّل محرف قويّ يحكم** — لا الأغلبية', () => {
    expect(resolveDirection('Hello مرحبا مرحبا مرحبا', 'auto')).toBe('ltr')
    expect(resolveDirection('مرحبا Hello Hello Hello', 'auto')).toBe('rtl')
  })

  it('**النصّ التقني الخالص يُحسم `ltr`** — `14px` فيه حروف لاتينية قويّة', () => {
    expect(resolveDirection('14px #3B82F6', 'auto')).toBe('ltr')
  })

  it('وما لا محرف قويّ فيه إطلاقًا يعود إلى العربية — لغة المنتج', () => {
    expect(resolveDirection('١٢٣ ٤٥٦', 'auto')).toBe('rtl')
    expect(resolveDirection('123 - 456', 'auto')).toBe('rtl')
    expect(resolveDirection('', 'auto')).toBe('rtl')
  })

  it('المصرَّح يفوز على الاشتقاق', () => {
    expect(resolveDirection('مرحبا', 'ltr')).toBe('ltr')
    expect(resolveDirection('Hello', 'rtl')).toBe('rtl')
  })
})

// ═════════════════════ اللفّ ═════════════════════

describe('**سطر القبول** — «الحشوة ‎14px 24px‎ واللون ‎#3B82F6‎»', () => {
  const LINE = 'الحشوة 14px 24px واللون #3B82F6'

  it('يُعرض بترتيب صحيح: المقاطع التقنية الثلاثة معزولة', () => {
    const atoms = segmentAtoms(LINE)
    const technical = atoms.filter((a) => a.technical).map((a) => a.text)
    expect(technical).toEqual(['14px', '24px', '#3B82F6'])
  })

  it('ويُلَفّ بلا قلب مقاطع — كل سطر يعود منطقيًّا كما كُتب', () => {
    const result = wrapText(LINE, 120, font, measure, fm)
    expect(result.lines.length).toBeGreaterThan(1)
    // ضمّ الأسطر المنطقية بمسافات يعيد الأصل.
    expect(result.lines.map((l) => l.logical).join(' ')).toBe(LINE)
  })

  it('**ولا يُكسَر `#3B82F6` أبدًا** مهما ضاق السطر', () => {
    for (const width of [400, 200, 120, 80, 40, 10]) {
      const result = wrapText(LINE, width, font, measure, fm)
      const joined = result.lines.map((l) => l.logical)
      // القيمة موجودة كاملةً في سطر واحد.
      expect(joined.some((l) => l.includes('#3B82F6'))).toBe(true)
      for (const line of joined) {
        if (line.includes('#3B82F6')) continue
        expect(line).not.toContain('#3B')
        expect(line).not.toContain('82F6')
      }
    }
  })

  it('والمرسوم هو المقيس — النصّ المعزول نفسه', () => {
    const result = wrapText(LINE, 120, font, measure, fm)
    for (const line of result.lines) {
      expect(stripIsolates(line.drawn)).toBe(line.logical)
      expect(line.width).toBe(measure(line.drawn, font))
    }
  })
})

describe('اللفّ — القواعد', () => {
  it('عرض صفر يعني: بلا لفّ', () => {
    const r = wrapText('واحد اثنان ثلاثة أربعة', 0, font, measure, fm)
    expect(r.lines).toHaveLength(1)
  })

  it('**لا قطع داخل كلمة عربية** — الكلمة تفيض ولا تُكسَر', () => {
    const r = wrapText('استرجاعية', 30, font, measure, fm)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]?.logical).toBe('استرجاعية')
    expect(r.overflow).toBe(true)
  })

  it('والفيض معلَن حدًّا لا مبتلَعًا', () => {
    expect(wrapText('كلمة قصيرة', 500, font, measure, fm).overflow).toBe(false)
    expect(wrapText('https://example.test/very/long/path', 40, font, measure, fm).overflow).toBe(
      true,
    )
  })

  it('القطع عند المسافات، والمسافات لا تظهر في طرفَي السطر', () => {
    const r = wrapText('واحد اثنان ثلاثة', 60, font, measure, fm)
    for (const line of r.lines) {
      expect(line.logical).toBe(line.logical.trim())
    }
  })

  it('الارتفاع = عدد الأسطر × ارتفاع السطر', () => {
    const r = wrapText('واحد اثنان ثلاثة أربعة خمسة', 60, font, measure, fm)
    expect(r.height).toBe(r.lines.length * fm.lineHeight)
  })

  it('نصّ فارغ يعطي صفر أسطر بلا رمي', () => {
    const r = wrapText('', 100, font, measure, fm)
    expect(r.lines).toHaveLength(0)
    expect(r.height).toBe(0)
  })

  it('**ارتفاع السطر من مقاييس الخطّ لا من محتواه**', () => {
    const withDescender = wrapText('ججج', 500, font, measure, fm)
    const without = wrapText('ااا', 500, font, measure, fm)
    expect(withDescender.height).toBe(without.height)
  })
})

// ═════════════════════ الذاكرة ═════════════════════

describe('ذاكرة التخطيط', () => {
  it('النتيجة نفسها للعقدة نفسها', () => {
    const cache = createTextLayoutCache(measure)
    const node = textNode({ text: 'اللون #3B82F6', maxWidthPx: 100 })
    expect(cache.get(node)).toBe(cache.get(node))
  })

  it('**المفتاح يشمل `letterSpacingPx`** — قياسٌ بإعداد آخر لا يُعاد استعماله', () => {
    const cache = createTextLayoutCache(measure)
    const a = textNode({ text: 'مرحبا Hello', maxWidthPx: 100 })
    const b = textNode({
      text: 'مرحبا Hello',
      maxWidthPx: 100,
      font: { ...font, letterSpacingPx: 0 },
    })
    // نفس الإعداد ⇒ نفس المدخل.
    expect(cache.get(a)).toBe(cache.get(b))
    // حجم مختلف ⇒ مدخل مختلف.
    const c = textNode({ text: 'مرحبا Hello', maxWidthPx: 100, font: { ...font, sizePx: 24 } })
    expect(cache.get(c)).not.toBe(cache.get(a))
  })

  it('`invalidate` يُفرغ — لأن الخطّ قد يجهز بعد أوّل قياس', () => {
    const cache = createTextLayoutCache(measure)
    cache.get(textNode())
    expect(cache.size).toBe(1)
    cache.invalidate()
    expect(cache.size).toBe(0)
  })

  it('مقاييس الخطّ تُشتقّ لكل حجم لا لكل مشهد', () => {
    const cache = createTextLayoutCache(measure, estimateMetrics)
    const small = cache.metrics({ ...font, sizePx: 10 })
    const large = cache.metrics({ ...font, sizePx: 72 })
    expect(large.lineHeight).toBeGreaterThan(small.lineHeight)
  })
})

describe('صندوق الملاحظة', () => {
  it('**الارتفاع محسوب لا مخزَّن** — ويكبر بكبر المتن', () => {
    const cache = createTextLayoutCache(measure)
    const short = noteBox(noteNode({ body: 'قصير' }), cache)
    const long = noteBox(
      noteNode({
        id: asNodeId('n2'),
        body: 'متن طويل جدًّا يمتدّ على عدّة أسطر متتالية بلا انقطاع',
      }),
      cache,
    )
    expect(long.height).toBeGreaterThan(short.height)
  })

  it('والعرض من العقدة، والموضع من نقطتها', () => {
    const cache = createTextLayoutCache(measure)
    const box = noteBox(noteNode(), cache)
    expect(box.width).toBe(200)
    expect(box.x).toBe(10)
    expect(box.y).toBe(20)
  })

  it('ملاحظة فارغة تبقى بارتفاع حشوتها لا صفرًا', () => {
    const cache = createTextLayoutCache(measure)
    const box = noteBox(noteNode({ title: '', body: '' }), cache)
    expect(box.height).toBe(24)
  })
})
