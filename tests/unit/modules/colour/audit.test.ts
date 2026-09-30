import { describe, expect, it } from 'vitest'

import {
  bandOf,
  bySeverity,
  CANVAS,
  floorRatio,
  isLargeText,
  layerStep,
  paintOver,
  within,
  type Backdrop,
} from '@/modules/colour/audit'
import { flatten, type Layer } from '@/modules/colour/composite'
import { contrastRatio } from '@/modules/colour/contrast'

/**
 * التراكب الشفّاف على عيّنات معروفة القيمة (`STAGES/14`، معيار القبول الأوّل).
 *
 * القيم محسوبة يدويًّا من `source-over` وشفافية المجموعة، لا مأخوذة من المخرَج — بألفا ثماني البتّات كما
 * يرسمها Chrome: `0.5` تُخزَّن `128/255`، فأسود بنصف شفافية فوق أبيض `255 × 127/255 = 127`، ونسبة `#7f7f7f` على
 * الأبيض `4.00`. والبكسل نفسه مقيسٌ في Chrome حقيقي في `verify:colour`.
 */

const L = (r: number, g: number, b: number, alpha = 1): Layer => ({ rgb: { r, g, b }, alpha })
const WHITE = { r: 255, g: 255, b: 255 }
const GREY_127 = { r: 127, g: 127, b: 127 }

/** مكدّسٌ من الأبعد إلى الأقرب: `[خلفية, شفافية]` لكل عنصر، فوق السطح الأبيض. */
function chainOf(steps: readonly (readonly [Layer | null, number])[]): Backdrop {
  return steps.reduce<Backdrop>((outer, [bg, o]) => within(outer, layerStep(bg, o)), CANVAS)
}

describe('التراكب — عيّنات معروفة القيمة', () => {
  it('أسود معتم على السطح الأبيض = 21 : 1', () => {
    const chain = chainOf([[L(255, 255, 255), 1]])
    const fg = paintOver(chain, L(0, 0, 0))
    expect(fg).toEqual({ r: 0, g: 0, b: 0 })
    expect(paintOver(chain, null)).toEqual(WHITE)
    expect(contrastRatio(fg, WHITE)).toBe(21)
  })

  it('صفحةٌ بلا خلفية أصلًا: الأبيض يُوضع تحتها لا يُفترض أسود', () => {
    const chain = chainOf([[null, 1]])
    expect(paintOver(chain, null)).toEqual(WHITE)
  })

  it('نصٌّ أسود بنصف شفافية على الأبيض يُرسم 127 ونسبته 4.00', () => {
    const chain = chainOf([[L(255, 255, 255), 1]])
    const fg = paintOver(chain, L(0, 0, 0, 0.5))
    expect(fg).toEqual(GREY_127)
    expect(floorRatio(contrastRatio(fg, WHITE))).toBe('4.00')
  })

  it('الألفا بثماني بتّات: `0.3` تُرسم `77/255` فأسودها فوق الأبيض 178 لا 178.5', () => {
    const chain = chainOf([[L(255, 255, 255), 1]])
    expect(paintOver(chain, L(0, 0, 0, 0.3))).toEqual({ r: 178, g: 178, b: 178 })
  })

  it('طبقةٌ سوداء بنصف شفافية تحت نصٍّ أبيض: الخلفية 127 والنسبة نفسها', () => {
    const chain = chainOf([
      [L(255, 255, 255), 1],
      [L(0, 0, 0, 0.5), 1],
    ])
    expect(paintOver(chain, null)).toEqual(GREY_127)
    expect(paintOver(chain, L(255, 255, 255))).toEqual(WHITE)
  })

  it('طبقتان نصف شفّافتين: أحمر فوق أزرق فوق أبيض = (191, 64, 127)', () => {
    // بألفا 128/255: الأزرق فوق الأبيض (127, 127, 255)، ثمّ الأحمر فوقه (191, 63.25, 127).
    const chain = chainOf([
      [null, 1],
      [L(0, 0, 255, 0.5), 1],
      [L(255, 0, 0, 0.5), 1],
    ])
    expect(paintOver(chain, null)).toEqual({ r: 191, g: 63, b: 127 })
  })

  it('`opacity` تخفت المجموعة كلّها: خلفية سوداء معتمة بنصف شفافية تُرى 128 لا أسود', () => {
    // الأب أبيض، والعنصر خلفيته سوداء معتمة و`opacity: 0.5`، ونصّه أبيض.
    const chain = chainOf([
      [L(255, 255, 255), 1],
      [L(0, 0, 0), 0.5],
    ])
    const bg = paintOver(chain, null)
    const fg = paintOver(chain, L(255, 255, 255))
    expect(bg).toEqual(GREY_127)
    // النصّ الأبيض فوق الأسود داخل المجموعة أبيض، ثمّ يخفت فوق الأبيض فيبقى أبيض.
    expect(fg).toEqual(WHITE)
    // «أوّل معتم» يقف عند الأسود فيقول 21 — والمرسوم 4.00.
    expect(floorRatio(contrastRatio(fg, bg))).toBe('4.00')
  })

  it('`opacity` على جدٍّ بعيد تخفت النصّ وخلفيته القريبة معًا', () => {
    // الجذر أسود، والجدّ `opacity: 0.5` بلا خلفية، والعنصر أبيض معتم ونصّه أسود: الأبيض يخفت إلى 128/255
    // فوق الأسود فيُرسم 128.
    const chain = chainOf([
      [L(0, 0, 0), 1],
      [null, 0.5],
      [L(255, 255, 255), 1],
    ])
    expect(paintOver(chain, null)).toEqual({ r: 128, g: 128, b: 128 })
    expect(paintOver(chain, L(0, 0, 0))).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('يطابق `flatten` بلا `opacity` على مكدّسات عشوائية بألفا ثماني البتّات (±1 لتقريب `over` الوسيط)', () => {
    // مولّدٌ ثابت البذرة — النتيجة لا تتبدّل بين جولتين.
    let seed = 0x5eed
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    for (let n = 0; n < 500; n++) {
      const layers = Array.from({ length: 1 + Math.floor(rand() * 4) }, () =>
        L(
          Math.floor(rand() * 256),
          Math.floor(rand() * 256),
          Math.floor(rand() * 256),
          Math.round(rand() * 255) / 255,
        ),
      )
      const ours = paintOver(chainOf(layers.map((l) => [l, 1] as const)), null)
      const theirs = flatten(layers).colour.rgb
      expect(Math.abs(ours.r - theirs.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(ours.g - theirs.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(ours.b - theirs.b)).toBeLessThanOrEqual(1)
    }
  })

  it('شفافيةٌ خارج المدى تُقصّ لا تُكسر: ألفا 2 معتمة و−1 شفّافة', () => {
    const chain = chainOf([
      [L(255, 255, 255), 1],
      [L(0, 0, 0, 2), -1],
    ])
    expect(paintOver(chain, null)).toEqual(WHITE)
  })
})

describe('isLargeText — حدّ النصّ الكبير في WCAG', () => {
  it.each([
    [24, 400, true],
    [23.9, 400, false],
    [18.6667, 700, true],
    [18.6667, 600, false],
    [18, 700, false],
    [32, 100, true],
  ])('%spx بوزن %s ⟵ %s', (px, weight, large) => {
    expect(isLargeText(px, weight)).toBe(large)
  })
})

describe('bandOf — الشرائح الثلاث', () => {
  it('دون 3 يسقط كل نصّ، كبيرًا كان أو عاديًّا', () => {
    expect(bandOf(2.99, false)).toBe('below-3')
    expect(bandOf(2.99, true)).toBe('below-3')
  })

  it('بين 3 و4.5 يسقط العادي وحده', () => {
    expect(bandOf(3.4, false)).toBe('below-4.5')
    expect(bandOf(3.4, true)).toBe('pass')
  })

  it('المقارنة على غير المقرَّب: 4.4999 يسقط و4.5 يمرّ', () => {
    expect(bandOf(4.4999, false)).toBe('below-4.5')
    expect(bandOf(4.5, false)).toBe('pass')
  })
})

describe('bySeverity — الأخطر أوّلًا', () => {
  it('الشريحة ثمّ النسبة ثمّ ترتيب المستند، و«تعذّر الحساب» آخرًا', () => {
    const list = [
      { severity: 'unknown', ratio: null, order: 0 },
      { severity: 'below-4.5', ratio: 3.9, order: 1 },
      { severity: 'below-3', ratio: 2.6, order: 2 },
      { severity: 'below-3', ratio: 2.1, order: 3 },
      { severity: 'below-4.5', ratio: 3.9, order: 0 },
    ] as const
    expect([...list].sort(bySeverity).map((r) => `${r.severity}:${r.order}`)).toEqual([
      'below-3:3',
      'below-3:2',
      'below-4.5:0',
      'below-4.5:1',
      'unknown:0',
    ])
  })
})

describe('floorRatio', () => {
  it('يقصّ ولا يقرّب: 4.496 يُقرأ دون حدّه', () => {
    expect(floorRatio(4.496)).toBe('4.49')
    expect(floorRatio(21)).toBe('21.00')
    expect(floorRatio(2.1)).toBe('2.10')
  })
})
