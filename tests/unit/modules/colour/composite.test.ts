import { describe, expect, it } from 'vitest'

import { resolveBackground } from '@/modules/colour/background'
import {
  CANVAS_WHITE,
  compositeStack,
  flatten,
  layerOf,
  over,
  type Layer,
} from '@/modules/colour/composite'
import { readColour } from '@/modules/colour/formats'

/**
 * تركيب الشفافية — البند المنصوص: «طبقتان وثلاث طبقات».
 *
 * القيم المتوقَّعة محسوبة يدويًّا من `Co = Cs·αs + Cb·αb·(1−αs)` مقسومًا
 * على ألفا الناتج، لا مأخوذة من المخرَج.
 */

const L = (r: number, g: number, b: number, alpha = 1): Layer => ({ rgb: { r, g, b }, alpha })

describe('over — طبقتان', () => {
  it('مصدر معتم يحجب ما تحته تمامًا', () => {
    expect(over(L(255, 0, 0), L(0, 0, 255))).toEqual({ rgb: { r: 255, g: 0, b: 0 }, alpha: 1 })
  })

  it('مصدر شفّاف تمامًا لا يغيّر شيئًا', () => {
    expect(over(L(255, 0, 0, 0), L(0, 0, 255))).toEqual({ rgb: { r: 0, g: 0, b: 255 }, alpha: 1 })
  })

  it('أسود بنصف شفافية فوق أبيض يعطي الرماديّ المتوسّط', () => {
    // (0·0.5 + 255·1·0.5) / 1 = 127.5 → 128
    expect(over(L(0, 0, 0, 0.5), CANVAS_WHITE)).toEqual({
      rgb: { r: 128, g: 128, b: 128 },
      alpha: 1,
    })
  })

  it('ألفا الناتج يُجمع صحيحًا حين تكون الخلفية شبه شفّافة', () => {
    // 0.5 + 0.5·(1−0.5) = 0.75
    expect(over(L(0, 0, 0, 0.5), L(255, 255, 255, 0.5)).alpha).toBeCloseTo(0.75, 6)
  })

  it('القسمة على ألفا الناتج لازمة — بدونها يُظلم اللون زورًا', () => {
    // أبيض 0.5 فوق أبيض 0.5: الناتج يجب أن يبقى أبيض، لا أن يُظلم.
    const r = over(L(255, 255, 255, 0.5), L(255, 255, 255, 0.5))
    expect(r.rgb).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('طبقتان شفّافتان تمامًا تعطيان شفّافًا بلا NaN', () => {
    const r = over(L(10, 20, 30, 0), L(40, 50, 60, 0))
    expect(r.alpha).toBe(0)
    expect(Number.isNaN(r.rgb.r)).toBe(false)
  })
})

describe('compositeStack — ثلاث طبقات', () => {
  it('الترتيب من الأبعد إلى الأقرب', () => {
    // أبيض معتم، ثم أسود 0.5، ثم أسود 0.5 مرّة أخرى.
    // بعد الأولى: 128. بعد الثانية: (0·0.5 + 128·0.5) = 64.
    const r = compositeStack([CANVAS_WHITE, L(0, 0, 0, 0.5), L(0, 0, 0, 0.5)])
    expect(r.rgb).toEqual({ r: 64, g: 64, b: 64 })
    expect(r.alpha).toBe(1)
  })

  it('ثلاث طبقات ملوّنة — النتيجة لا تساوي أيًّا منها', () => {
    const r = compositeStack([CANVAS_WHITE, L(255, 0, 0, 0.5), L(0, 0, 255, 0.5)])
    expect(r.rgb).not.toEqual({ r: 255, g: 0, b: 0 })
    expect(r.rgb).not.toEqual({ r: 0, g: 0, b: 255 })
    // أحمر 0.5 على أبيض = (255,128,128)؛ ثم أزرق 0.5 عليه = (128,64,191)
    expect(r.rgb).toEqual({ r: 128, g: 64, b: 192 })
  })

  it('مكدّس فارغ يعطي شفّافًا لا أبيض — «لا أعرف» لا «أبيض»', () => {
    expect(compositeStack([])).toEqual({ rgb: { r: 0, g: 0, b: 0 }, alpha: 0 })
  })
})

describe('flatten — إغلاق السلسلة', () => {
  it('مكدّس معتم لا يفترض شيئًا', () => {
    const f = flatten([CANVAS_WHITE, L(255, 0, 0)])
    expect(f.assumedWhite).toBe(false)
    expect(f.colour.rgb).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('مكدّس غير معتم يُغلق بالأبيض **ويُعلن ذلك**', () => {
    const f = flatten([L(0, 0, 0, 0.5)])
    expect(f.assumedWhite).toBe(true)
    expect(f.colour.rgb).toEqual({ r: 128, g: 128, b: 128 })
  })

  it('مكدّس فارغ يعطي أبيض معلَنًا', () => {
    const f = flatten([])
    expect(f.assumedWhite).toBe(true)
    expect(f.colour.rgb).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('layerOf', () => {
  it('يحوّل قراءة لون إلى طبقة بحفظ الألفا', () => {
    const c = readColour('rgba(255, 0, 0, 0.25)')!
    expect(layerOf(c)).toEqual({ rgb: { r: 255, g: 0, b: 0 }, alpha: c.alpha })
  })
})

/**
 * الصعود في الشجرة — يحتاج DOM، وhappy-dom يكفيه: القيم تُحقَن عبر
 * `style` فيقرؤها `getComputedStyle` مباشرة بلا محرّك تخطيط.
 */
describe('resolveBackground — الصعود والتركيب', () => {
  function tree(styles: string[]): Element {
    document.body.innerHTML = ''
    let parent: HTMLElement = document.body
    let leaf: HTMLElement = document.body
    for (const s of styles) {
      const el = document.createElement('div')
      el.setAttribute('style', s)
      parent.appendChild(el)
      parent = el
      leaf = el
    }
    return leaf
  }

  it('يجد الخلفية على جدٍّ لا على العنصر نفسه', () => {
    const leaf = tree(['background-color: rgb(255, 0, 0)', '', ''])
    const w = resolveBackground(leaf, window)
    expect(w.colour.rgb).toEqual({ r: 255, g: 0, b: 0 })
    expect(w.assumedWhite).toBe(false)
  })

  it('يركّب طبقتين شبه شفّافتين في الطريق', () => {
    // جدّ أبيض معتم، ثم أسود 0.5 — النتيجة رماديّ.
    const leaf = tree([
      'background-color: rgb(255, 255, 255)',
      'background-color: rgba(0, 0, 0, 0.5)',
      '',
    ])
    const w = resolveBackground(leaf, window)
    expect(w.colour.rgb).toEqual({ r: 128, g: 128, b: 128 })
    expect(w.contributors).toHaveLength(2)
  })

  it('يتوقّف عند أوّل معتم — ما خلفه لا يُقرأ', () => {
    const leaf = tree(['background-color: rgb(0, 255, 0)', 'background-color: rgb(255, 0, 0)', ''])
    const w = resolveBackground(leaf, window)
    expect(w.colour.rgb).toEqual({ r: 255, g: 0, b: 0 })
    // الأخضر خلف الأحمر المعتم — لم يُسهم.
    expect(w.contributors).toHaveLength(1)
  })

  it('بلا خلفية في السلسلة كلّها: أبيض معلَن لا مُدَّعى', () => {
    const leaf = tree(['', '', ''])
    const w = resolveBackground(leaf, window)
    expect(w.assumedWhite).toBe(true)
    expect(w.colour.rgb).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('صورة خلفية في الطريق تُعلَن حدًّا لا تُبتلَع', () => {
    const leaf = tree(['background-image: linear-gradient(red, blue)', ''])
    expect(resolveBackground(leaf, window).sawImage).toBe(true)
  })

  it('`none` ليست صورة', () => {
    const leaf = tree(['background-image: none; background-color: rgb(1, 2, 3)'])
    expect(resolveBackground(leaf, window).sawImage).toBe(false)
  })
})
