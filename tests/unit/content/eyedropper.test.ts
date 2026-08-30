import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { contrastView, formatRows, variableView } from '@/content/colour-view'
import { createEyedropper } from '@/content/tools/eyedropper'
import { checkPair } from '@/modules/colour/contrast'
import { formatColour, fromPixel, readColour } from '@/modules/colour/formats'
import { tailwindNaming } from '@/modules/colour/tailwind'
import { ok, type Result } from '@/shared/result'

import type { Frame, Pixel, Sampler } from '@/content/sampler'
import type { PinnedColour } from '@/content/tools/eyedropper'

/**
 * اللقطة تُحقَن ولا تُلتقَط.
 *
 * `createImageBitmap` و`OffscreenCanvas` غير موجودين في happy-dom، والأهمّ
 * أنهما ليسا موضع الاختبار هنا: المنطق المفحوص هو **القرار** — من أين
 * تُؤخذ القيمة، ومتى يقع التثبيت، وكيف يُكتشف الاختلاف. ولذلك قَبِلت
 * `EyedropperOptions` عيّنةً بديلة منذ كُتبت، لا التفافًا على اختبار.
 */
function fakeSampler(pixel: Pixel | null): Sampler {
  const frame: Frame = { width: 100, height: 100, scaleX: 1, scaleY: 1, at: 0 }
  return {
    frame: () => frame,
    stale: false,
    refresh: (): Promise<Result<Frame>> => Promise.resolve(ok(frame)),
    invalidate: () => {},
    pixelAt: () => pixel,
    patchAt: () => (pixel ? Array.from({ length: 9 }, () => pixel) : null),
    dispose: () => {},
  }
}

const up = (x: number, y: number, alt = false) =>
  ({ clientX: x, clientY: y, altKey: alt }) as PointerEvent

/**
 * `elementsFromPoint` غير موجودة في happy-dom، فتُحقن على `document`
 * الحقيقي — السابقة نفسها في `element-hover.test.ts`.
 */
function stubHit(el: Element | null): void {
  const doc = document as unknown as { elementsFromPoint: () => Element[] }
  doc.elementsFromPoint = vi.fn(() => (el ? [el] : []))
}

/** عنصر بصندوق حقيقي — `pickAt` يستبعد ما لا مساحة له. */
function boxed(el: Element): Element {
  const rect = new DOMRect(0, 0, 200, 100)
  Object.defineProperty(el, 'getBoundingClientRect', { value: () => rect, configurable: true })
  Object.defineProperty(el, 'getClientRects', { value: () => [rect], configurable: true })
  return el
}

/** يبني عنصرًا بنمط، ويجعله ما يقع تحت المؤشِّر. */
function target(style: string): Element {
  document.body.innerHTML = `<div style="${style}"></div>`
  const el = boxed(document.body.firstElementChild!)
  stubHit(el)
  return el
}

beforeEach(() => {
  document.body.innerHTML = ''
  stubHit(null)
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'elementsFromPoint')
})

describe('التثبيت — من البكسل افتراضًا', () => {
  it('نقرة تثبّت لون البكسل لا القيمة المصرَّحة', () => {
    target('background-color: rgb(255, 0, 0)')
    const tool = createEyedropper({ sampler: fakeSampler({ r: 0, g: 0, b: 255, a: 255 }) })

    tool.onPointerUp(up(10, 10))
    const pinned = tool.state.pinned.peek()

    expect(pinned?.source).toBe('pixel')
    expect(pinned?.formats.hex).toBe('#0000ff')
  })

  it('**بلا بكسل لا تثبيت** — لا يُدَّعى لون قبل وصول اللقطة', () => {
    const tool = createEyedropper({ sampler: fakeSampler(null) })
    tool.onPointerUp(up(10, 10))
    expect(tool.state.pinned.peek()).toBeNull()
  })

  it('التثبيت يُبلَّغ مرّة واحدة بنفس القيمة المخزَّنة', () => {
    const onPin = vi.fn<(p: PinnedColour | null) => void>()
    const tool = createEyedropper({ sampler: fakeSampler({ r: 1, g: 2, b: 3, a: 255 }), onPin })
    tool.onPointerUp(up(5, 5))
    expect(onPin).toHaveBeenCalledTimes(1)
    expect(onPin.mock.calls[0]![0]).toBe(tool.state.pinned.peek())
  })

  it('المسح يُبلَّغ بـ`null` ويعيد الأداة إلى التتبّع', () => {
    const onPin = vi.fn<(p: PinnedColour | null) => void>()
    const tool = createEyedropper({ sampler: fakeSampler({ r: 1, g: 2, b: 3, a: 255 }), onPin })
    tool.onPointerUp(up(5, 5))
    tool.clear()
    expect(tool.state.pinned.peek()).toBeNull()
    expect(onPin).toHaveBeenLastCalledWith(null)
  })
})

describe('`⌥` — المصدر الآخر', () => {
  it('يبدّل القيمة إلى التصريح، ويحتفظ بالبكسل للمقارنة', () => {
    target('background-color: rgb(255, 0, 0)')
    const tool = createEyedropper({ sampler: fakeSampler({ r: 0, g: 0, b: 255, a: 255 }) })

    tool.onPointerUp(up(10, 10, true))
    const pinned = tool.state.pinned.peek()

    expect(pinned?.source).toBe('css')
    expect(pinned?.formats.hex).toBe('#ff0000')
    // البكسل لم يُفقَد — المصدران معًا هما المعلومة (`§6.4`).
    expect(pinned?.pixelReading.rgb).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('بلا تصريح لونيّ يبقى البكسل — لا يُلغى التثبيت', () => {
    const tool = createEyedropper({ sampler: fakeSampler({ r: 9, g: 9, b: 9, a: 255 }) })
    tool.onPointerUp(up(10, 10, true))
    // `document.body` يحمل `color` محسوبة دائمًا، فالمصدر قد يصير `css`؛
    // المهمّ أن التثبيت وقع ولم يُفقَد اللون.
    expect(tool.state.pinned.peek()).not.toBeNull()
  })
})

describe('كشف الاختلاف بين المصدرين', () => {
  it('بكسل يخالف الخلفية المعتمة يُعلَن اختلافًا', () => {
    target('background-color: rgb(255, 0, 0)')
    const tool = createEyedropper({ sampler: fakeSampler({ r: 0, g: 0, b: 255, a: 255 }) })
    tool.onPointerUp(up(10, 10))
    expect(tool.state.pinned.peek()?.mismatch).toBe(true)
  })

  it('بكسل يطابقها لا يُعلَن', () => {
    target('background-color: rgb(255, 0, 0)')
    const tool = createEyedropper({ sampler: fakeSampler({ r: 255, g: 0, b: 0, a: 255 }) })
    tool.onPointerUp(up(10, 10))
    expect(tool.state.pinned.peek()?.mismatch).toBe(false)
  })

  it('**`⌥` لا يُخفي الاختلاف** — المقارنة على البكسل لا على المعروض', () => {
    target('background-color: rgb(255, 0, 0)')
    const tool = createEyedropper({ sampler: fakeSampler({ r: 0, g: 0, b: 255, a: 255 }) })
    tool.onPointerUp(up(10, 10, true))
    // المعروض الآن هو التصريح نفسه؛ لو قُورن بذاته لقيل «لا اختلاف».
    expect(tool.state.pinned.peek()?.mismatch).toBe(true)
  })
})

describe('صفوف اللوحة', () => {
  const rowsOf = (css: string) => {
    const c = readColour(css)!
    return formatRows(c, formatColour(c), tailwindNaming(c))
  }

  it('الصيغ الخمس بالترتيب نفسه في `65:75`', () => {
    expect(rowsOf('#2b7fff').map((r) => r.label)).toEqual([
      'HEX',
      'RGB',
      'HSL',
      'OKLCH',
      'TAILWIND',
    ])
  })

  it('المعروض مضغوط والمنسوخ كامل', () => {
    const rgb = rowsOf('#3b82f6').find((r) => r.label === 'RGB')!
    expect(rgb.shown).toBe('59 130 246')
    expect(rgb.copy).toBe('rgb(59, 130, 246)')
  })

  it('اسم Tailwind المطابق بلا علامة تقريب', () => {
    const tw = rowsOf('#2b7fff').find((r) => r.label === 'TAILWIND')!
    expect(tw.shown).toBe('blue-500')
    expect(tw.note).toBeUndefined()
  })

  it('القريب يُسبَق بـ`≈` وتُذكر مسافته', () => {
    const tw = rowsOf('#3b82f6').find((r) => r.label === 'TAILWIND')!
    expect(tw.shown).toBe('≈ blue-500')
    expect(tw.note).toMatch(/^ΔE 0\.019/)
  })

  it('البعيد لا يُعطى اسمًا بل قيمة صريحة', () => {
    const tw = rowsOf('#7f3f9f').find((r) => r.label === 'TAILWIND')!
    expect(tw.shown).toBe('[#7f3f9f]')
    expect(tw.copy).toBe('[#7f3f9f]')
    expect(tw.note).toContain('لا اسم قريب')
  })
})

describe('شارة التباين — لا تكذب في الاتجاهين', () => {
  const view = (fg: string, bg: string, assumed = false) =>
    contrastView(checkPair('text-on-background', readColour(fg)!.rgb, readColour(bg)!.rgb), assumed)

  it('**3.68 ليست «فشلًا» مطلقًا**: تنجح للنصّ الكبير', () => {
    const v = view('#3b82f6', '#ffffff')
    expect(v.ratio).toBe('3.68 : 1')
    expect(v.level).toBe('fail')
    expect(v.badge).toBe('AA للنص الكبير فقط')
  })

  it('وما دون 3 يفشل مطلقًا', () => {
    expect(view('#aab4ff', '#ffffff').badge).toBe('دون AA')
  })

  it('AA وAAA تُعرضان كما هما', () => {
    expect(view('#767676', '#ffffff').badge).toBe('AA')
    expect(view('#595959', '#ffffff').badge).toBe('AAA')
  })

  it('الخلفية المفترَضة تُعلَن ولا تُدَّعى محسوبة', () => {
    expect(view('#000000', '#ffffff', true).against).toBe('على أبيض')
    expect(view('#000000', '#ffffff', false).against).toBe('على الخلفية المحسوبة')
  })

  it('غير المقروء يُحمل علمًا منفصلًا عن الفشل', () => {
    expect(view('#fdfdfd', '#ffffff').unreadable).toBe(true)
    expect(view('#3b82f6', '#ffffff').unreadable).toBe(false)
  })
})

describe('المتغيّر المعروض', () => {
  const pinnedWith = (declared: PinnedColour['declared']): PinnedColour =>
    ({
      declared,
    }) as PinnedColour

  it('بلا تتبّع لا متغيّر', () => {
    expect(variableView(pinnedWith([]))).toBeNull()
  })

  it('يُقدَّم متغيّر الخلفية على متغيّر النصّ', () => {
    const link = (name: string) => ({
      chain: [{ name, value: { state: 'value' as const, value: '' }, at: null, hops: 0 }],
      provenance: { kind: 'unverified' as const },
    })
    const view = variableView(
      pinnedWith([
        { prop: 'color', computed: '', reading: fromPixel(0, 0, 0), trace: link('--fg') },
        {
          prop: 'background-color',
          computed: '',
          reading: fromPixel(0, 0, 0),
          trace: link('--bg'),
        },
      ]),
    )
    expect(view?.name).toBe('--bg')
    // `unverified` يعني: الاسم معروف والموضع لا — يُقال ولا يُختلق.
    expect(view?.origin).toBeNull()
  })
})
