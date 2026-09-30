import { describe, expect, it } from 'vitest'

import { identityCamera } from '@/modules/editor/camera'
import { type DrawContext } from '@/modules/editor/draw/shapes'
import {
  drawnLine,
  drawNote,
  drawPinNumber,
  drawText,
  fontString,
} from '@/modules/editor/draw/text'
import { type RenderStyle } from '@/modules/editor/renderer'
import {
  asNodeId,
  type FontSpec,
  type NoteNode,
  type NoteTag,
  type PinNode,
  type TextNode,
} from '@/modules/editor/scene'
import { isolateText } from '@/modules/editor/text-bidi'
import {
  createTextLayoutCache,
  type FontMetrics,
  type MeasureText,
  type TextLayoutCache,
} from '@/modules/editor/text-layout'
import { LRI, PDI, stripIsolates } from '@/shared/bidi'
import { devicePoint } from '@/shared/geometry'

import { createRecordingCtx, type RecordingCtx } from '../../../../helpers/recording-ctx'

/**
 * رسّامو النصّ والملاحظات والدبابيس بسياقٍ يسجّل النداءات.
 *
 * القياس والمقاييس محقونان خطّيَّين — كل محرف بعرض 10، وارتفاع السطر 23 —
 * كي يكون موضع كل سطر ونقطة ارتكازه **رقمًا يُحسَب بالعدّ** لا تقريبًا. وما
 * يُثبَت هنا هو القواعد الثلاث في ترويسة `text.ts`: الاتجاه صريح في كل رسم،
 * وسطرٌ كامل بنداء واحد، والتباعد صفر.
 */

const PALETTE = {
  'tool/annotate/solid': '#f0a',
  'tool/capture/solid': '#0fa',
  'tool/inspect/solid': '#a0f',
  'tool/measure/solid': '#af0',
  'tool/compare/solid': '#0af',
  'status/danger/solid': '#f00',
  'status/success/solid': '#0f0',
} as const

const STYLE: RenderStyle = {
  palette: PALETTE,
  selectionHex: '#00e3c9',
  handleHex: '#ffffff',
  redactOutlineHex: '#ffaba1',
  textFamily: 'Cairo',
  monoFamily: 'Geist Mono',
}

const font: FontSpec = { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 0 }
const fm: FontMetrics = { ascent: 18, descent: 5, lineHeight: 23 }
const measure: MeasureText = (line) => stripIsolates(line).length * 10

const base = { locked: false, rotation: 0, hidden: false } as const

const stroke = { colorToken: 'tool/capture/solid', widthPx: 2, dash: [], opacity: 0.6 } as const

const textNode = (over: Partial<TextNode> = {}): TextNode => ({
  ...base,
  kind: 'text',
  id: asNodeId('t'),
  stroke,
  at: devicePoint(100, 200),
  text: 'مرحبا',
  font,
  maxWidthPx: 0,
  align: 'start',
  dir: 'auto',
  ...over,
})

const noteNode = (over: Partial<NoteNode> = {}): NoteNode => ({
  ...base,
  kind: 'note',
  id: asNodeId('n'),
  stroke,
  at: devicePoint(10, 20),
  widthPx: 200,
  title: 'عنوان',
  body: 'شرح',
  tag: null,
  font,
  paddingPx: 12,
  pinId: null,
  ...over,
})

const pinNode = (over: Partial<PinNode> = {}): PinNode => ({
  ...base,
  kind: 'pin',
  id: asNodeId('p'),
  stroke,
  at: devicePoint(50, 60),
  shape: 'circle',
  ordinal: 12,
  noteId: null,
  radiusPx: 10,
  ...over,
})

function setup(options: Parameters<typeof createRecordingCtx>[0] = {}): {
  ctx: RecordingCtx
  d: DrawContext
  cache: TextLayoutCache
} {
  const ctx = createRecordingCtx(options)
  const cache = createTextLayoutCache(measure, () => fm)
  const d: DrawContext = {
    ctx,
    style: STYLE,
    camera: identityCamera,
    dpr: 1,
    interacting: false,
    layout: cache,
  }
  return { ctx, d, cache }
}

const callsNamed = (ctx: RecordingCtx, name: string) => ctx.calls.filter((c) => c.name === name)

// ═════════════════════════════ الخطّ ═════════════════════════════

describe('سلسلة الخطّ', () => {
  it('الوزن ثمّ الحجم بالبكسل ثمّ العائلة', () => {
    expect(fontString({ ...font, weight: 700, sizePx: 24 }, 'Geist Mono')).toBe(
      '700 24px Geist Mono',
    )
  })
})

// ═════════════════════════════ النصّ الحرّ ═════════════════════════════

describe('النصّ الحرّ', () => {
  it('**نصّ فارغ لا يترك أثرًا** — لا حتى `save`', () => {
    const { ctx, d, cache } = setup()
    drawText(d, textNode({ text: '' }), cache)
    expect(ctx.calls).toHaveLength(0)
  })

  it('**القواعد الثلاث تُضبَط صراحةً**: الاتجاه والتباعد وخطّ الأساس', () => {
    const { ctx, d, cache } = setup()
    drawText(d, textNode(), cache)

    expect(ctx.assigned('font')).toEqual(['400 16px Cairo'])
    expect(ctx.assigned('direction')).toEqual(['rtl'])
    // القاعدة الثالثة — يُضبَط ولا يُترك لما خلّفه رسمٌ سابق.
    expect(ctx.assigned('letterSpacing')).toEqual(['0px'])
    expect(ctx.assigned('textBaseline')).toEqual(['alphabetic'])
    // ولون العقدة وشفافيتها من خطّها.
    expect(ctx.assigned('fillStyle')).toEqual(['#0fa'])
    expect(ctx.assigned('globalAlpha')).toEqual([0.6])
    expect(ctx.names()[0]).toBe('save')
    expect(ctx.names().at(-1)).toBe('restore')
  })

  it('**النصّ اللاتيني يُرسم `ltr` صراحةً** — لا يرث `rtl` من المستند', () => {
    const { ctx, d, cache } = setup()
    drawText(d, textNode({ text: 'Hello' }), cache)
    expect(ctx.assigned('direction')).toEqual(['ltr'])
    // وبدايةُ السطر اللاتيني اليسار.
    expect(ctx.assigned('textAlign')).toEqual(['left'])
  })

  it('العربي يبدأ من اليمين: المحاذاة `right` والارتكاز عند حافّة العرض', () => {
    const { ctx, d, cache } = setup()
    // العرض المعلن 300 — الارتكاز على حافّته اليمنى لا على عرض السطر.
    drawText(d, textNode({ maxWidthPx: 300 }), cache)

    expect(ctx.assigned('textAlign')).toEqual(['right'])
    const [line, x, y] = callsNamed(ctx, 'fillText')[0]!.args
    expect(line).toBe('مرحبا')
    expect(x).toBe(100 + 300)
    // خطّ الأساس = أعلى العقدة + الصعود.
    expect(y).toBe(200 + fm.ascent)
  })

  it('وبلا عرض معلن يُرتكَز على عرض التخطيط نفسه', () => {
    const { ctx, d, cache } = setup()
    // «مرحبا» خمسة محارف بعرض 10.
    drawText(d, textNode({ maxWidthPx: 0 }), cache)
    expect(callsNamed(ctx, 'fillText')[0]?.args[1]).toBe(100 + 50)
  })

  it('`end` يعكس المحاذاة بحسب الاتّجاه: العربي `left` واللاتيني `right`', () => {
    const rtl = setup()
    drawText(rtl.d, textNode({ align: 'end', maxWidthPx: 300 }), rtl.cache)
    expect(rtl.ctx.assigned('textAlign')).toEqual(['left'])
    expect(callsNamed(rtl.ctx, 'fillText')[0]?.args[1]).toBe(100)

    const ltr = setup()
    drawText(ltr.d, textNode({ text: 'Hello', align: 'end', maxWidthPx: 300 }), ltr.cache)
    expect(ltr.ctx.assigned('textAlign')).toEqual(['right'])
    expect(callsNamed(ltr.ctx, 'fillText')[0]?.args[1]).toBe(400)
  })

  it('`center` يرتكز على منتصف العرض في الاتّجاهين', () => {
    for (const text of ['مرحبا', 'Hello']) {
      const { ctx, d, cache } = setup()
      drawText(d, textNode({ text, align: 'center', maxWidthPx: 300 }), cache)
      expect(ctx.assigned('textAlign')).toEqual(['center'])
      expect(callsNamed(ctx, 'fillText')[0]?.args[1]).toBe(250)
    }
  })

  it('**كل سطرٍ بنداء واحد**، والأسطر تتباعد بارتفاع السطر من مقاييس الخطّ', () => {
    const { ctx, d, cache } = setup()
    // «واحد» 40 و«اثنان» 50 — لا يجتمعان في عرض 60.
    drawText(d, textNode({ text: 'واحد اثنان', maxWidthPx: 60 }), cache)

    const drawn = callsNamed(ctx, 'fillText').map((c) => c.args)
    expect(drawn).toEqual([
      ['واحد', 160, 200 + fm.ascent],
      ['اثنان', 160, 200 + fm.ascent + fm.lineHeight],
    ])
  })

  it('**والمرسوم هو النصّ المعزول** — المقطع التقني بين محرفَي عزل', () => {
    const { ctx, d, cache } = setup()
    drawText(d, textNode({ text: 'اللون #3B82F6' }), cache)

    const drawn = String(callsNamed(ctx, 'fillText')[0]?.args[0])
    expect(drawn).toContain(LRI)
    expect(drawn).toContain(PDI)
    // وإزالة العزل تعيد النصّ المنطقي كما كُتب.
    expect(stripIsolates(drawn)).toBe('اللون #3B82F6')
  })
})

// ═════════════════════════════ الملاحظة ═════════════════════════════

describe('بطاقة الملاحظة', () => {
  it('البطاقة مستديرة بعرض العقدة، وارتفاعها من التخطيط زائد حشوتَي الأعلى والأسفل', () => {
    const { ctx, d, cache } = setup()
    drawNote(d, noteNode(), cache)

    // عنوان ومتن: سطران بارتفاع 23 لكلٍّ ⇒ 46 + 2×12.
    expect(callsNamed(ctx, 'roundRect')[0]?.args).toEqual([10, 20, 200, 46 + 24, 10])
    // والحدّ بلون الخطّ وسمكه، بلا تقطيع.
    expect(ctx.assigned('strokeStyle')).toEqual(['#0fa'])
    expect(ctx.assigned('lineWidth')).toEqual([2])
    expect(callsNamed(ctx, 'setLineDash')[0]?.args).toEqual([[]])
  })

  it('**البطاقة معتمة مهما كانت شفافية الخطّ** — النصّ فوقها يجب أن يبقى مقروءًا', () => {
    const { ctx, d, cache } = setup()
    drawNote(d, noteNode(), cache)
    expect(ctx.assigned('globalAlpha')).toEqual([1])
  })

  it('العنوان ثمّ المتن سطرًا سطرًا، بأصل الحشوة وخطّ الأساس من الصعود', () => {
    const { ctx, d, cache } = setup()
    drawNote(d, noteNode(), cache)

    // عربي: البداية اليمنى — يُرتكَز على حافّة العرض الداخلي (200 − 24 = 176).
    const x = 10 + 12 + 176
    const y0 = 20 + 12 + fm.ascent
    expect(callsNamed(ctx, 'fillText').map((c) => c.args)).toEqual([
      ['عنوان', x, y0],
      ['شرح', x, y0 + fm.lineHeight],
    ])
    expect(ctx.assigned('textAlign')).toEqual(['right'])
    expect(ctx.assigned('direction')).toEqual(['rtl'])
    expect(ctx.assigned('letterSpacing')).toEqual(['0px'])
  })

  it('**والبطاقة اللاتينية تبدأ من اليسار** عند أصل الحشوة', () => {
    const { ctx, d, cache } = setup()
    drawNote(d, noteNode({ title: 'Title', body: 'Body' }), cache)

    expect(ctx.assigned('direction')).toEqual(['ltr'])
    expect(ctx.assigned('textAlign')).toEqual(['left'])
    expect(callsNamed(ctx, 'fillText')[0]?.args[1]).toBe(10 + 12)
  })

  it('**بلا وسم لا تُرسم لوحة وسم** — بطاقةٌ واحدة وحدها', () => {
    const { ctx, d, cache } = setup()
    drawNote(d, noteNode({ tag: null }), cache)
    expect(callsNamed(ctx, 'roundRect')).toHaveLength(1)
    expect(callsNamed(ctx, 'fillText')).toHaveLength(2)
  })

  describe('الوسم', () => {
    const LABELS: Readonly<Record<NoteTag, string>> = {
      type: 'الخطّ',
      spacing: 'المسافات',
      token: 'الرموز',
    }

    it('يزيد ارتفاع البطاقة بارتفاع اللوحة وحشوتها', () => {
      const plain = setup()
      drawNote(plain.d, noteNode(), plain.cache)
      const tagged = setup()
      drawNote(tagged.d, noteNode({ tag: 'type' }), tagged.cache)

      const h = (r: RecordingCtx): number => callsNamed(r, 'roundRect')[0]!.args[3] as number
      // TAG_HEIGHT 18 + TAG_PADDING 6.
      expect(h(tagged.ctx) - h(plain.ctx)).toBe(24)
    })

    it('**عربي: اللوحة عند الطرف الأيمن** من البطاقة، بعرض النصّ المقيس زائد حشوتين', () => {
      // عرض التسمية المقيس 30 ⇒ عرض اللوحة 30 + 2×6 = 42.
      const { ctx, d, cache } = setup({ measure: () => 30 })
      drawNote(d, noteNode({ tag: 'type' }), cache)

      const height = 46 + 24 + 24
      const pill = callsNamed(ctx, 'roundRect')[1]?.args
      expect(pill).toEqual([10 + 200 - 12 - 42, 20 + height - 12 - 18, 42, 18, 5])
    })

    it('**واللاتيني: عند الطرف الأيسر** بعد الحشوة', () => {
      const { ctx, d, cache } = setup({ measure: () => 30 })
      drawNote(d, noteNode({ title: 'Title', body: 'Body', tag: 'spacing' }), cache)

      const pill = callsNamed(ctx, 'roundRect')[1]?.args as number[]
      expect(pill[0]).toBe(10 + 12)
      expect(pill[2]).toBe(42)
    })

    it('تسمية التصنيف من القاموس المشترك، بخطٍّ أصغر بخُمس، وتتوسّط لوحتها', () => {
      for (const tag of ['type', 'spacing', 'token'] as const) {
        const { ctx, d, cache } = setup({ measure: () => 30 })
        drawNote(d, noteNode({ tag }), cache)

        const label = callsNamed(ctx, 'fillText').at(-1)!
        expect(label.args[0]).toBe(LABELS[tag])
        // مركز اللوحة أفقيًّا، وخطّ الأساس عند 72% من ارتفاعها.
        const pill = callsNamed(ctx, 'roundRect')[1]!.args as number[]
        expect(label.args[1]).toBe(pill[0]! + pill[2]! / 2)
        expect(label.args[2]).toBeCloseTo(pill[1]! + 18 * 0.72, 9)
        // 16 × 0.8 = 12.8.
        expect(ctx.assigned('font').at(-1)).toBe('400 12.8px Cairo')
        expect(ctx.assigned('textAlign').at(-1)).toBe('center')
      }
    })

    it('اللوحة بشفافية 0.2 ثمّ التسمية معتمة — وإلّا غابت التسمية في خلفيتها', () => {
      const { ctx, d, cache } = setup()
      drawNote(d, noteNode({ tag: 'token' }), cache)
      // بطاقة 1 · لوحة الوسم 0.2 · تسميته 1.
      expect(ctx.assigned('globalAlpha')).toEqual([1, 0.2, 1])
    })
  })
})

// ═════════════════════════════ رقم الدبّوس ═════════════════════════════

describe('رقم الدبّوس', () => {
  it('**أرقام هندية** في مركز القرص، بخطٍّ عريض بنسبة 1.1 من نصف القطر', () => {
    const { ctx, d } = setup()
    drawPinNumber(d, pinNode({ ordinal: 12, radiusPx: 10 }))

    expect(callsNamed(ctx, 'fillText')[0]?.args).toEqual(['١٢', 50, 60])
    expect(ctx.assigned('font')).toEqual(['700 11px Cairo'])
    expect(ctx.assigned('textAlign')).toEqual(['center'])
    expect(ctx.assigned('textBaseline')).toEqual(['middle'])
    expect(ctx.assigned('letterSpacing')).toEqual(['0px'])
  })

  it('**معتم** حتى لو خفتت شفافية الدبّوس', () => {
    const { ctx, d } = setup()
    drawPinNumber(d, pinNode({ stroke: { ...stroke, opacity: 0.1 } }))
    expect(ctx.assigned('globalAlpha')).toEqual([1])
  })

  it('وحالته معزولة بـ`save`/`restore` كي لا تتسرّب إلى الرسم التالي', () => {
    const { ctx, d } = setup()
    drawPinNumber(d, pinNode())
    expect(ctx.names()).toEqual(['save', 'fillText', 'restore'])
  })
})

describe('النصّ المعزول للاختبار', () => {
  it('`drawnLine` هو العزل نفسه المستعمل في التخطيط', () => {
    const line = 'اللون #3B82F6'
    expect(drawnLine(line)).toBe(isolateText(line))
    expect(drawnLine(line)).not.toBe(line)
  })
})
