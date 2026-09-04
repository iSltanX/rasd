import { describe, expect, it } from 'vitest'

import { deltaEReadings } from '@/modules/colour/distance'
import { formatColour, readColour, type ColourReading } from '@/modules/colour/formats'
import {
  darken,
  desaturate,
  generateScale,
  lighten,
  saturate,
  SCALE_STEPS,
} from '@/modules/colour/scale'

const c = (css: string): ColourReading => {
  const r = readColour(css)
  if (!r) throw new Error(`لون غير صالح في الاختبار: ${css}`)
  return r
}

// درجات فعلية من `public/assets/tokens.css` — تُستعمل كأرضية حقيقية، لا
// ألوان اصطناعية، تمامًا كما تفعل `tailwind.test.ts` بلوحة Tailwind.
const SIGNAL_500 = '#00a895'
const INFO_500 = '#1592ff'
const INFO_100 = '#e0efff'
const INFO_950 = '#001f41'

describe('SCALE_STEPS — ثابتة ومرتّبة', () => {
  it('11 درجة من 50 إلى 950 بالترتيب نفسه', () => {
    expect(SCALE_STEPS).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950])
  })
})

describe('سلّم 50→950 مُتّسق الإضاءة، ونقاط النهاية صحيحة', () => {
  it('الإضاءة رتيبة تنازليًّا عبر الدرجات الإحدى عشرة، من لون توكنز حقيقي', () => {
    const stops = generateScale(c(SIGNAL_500))
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]!.oklch.l).toBeLessThan(stops[i - 1]!.oklch.l)
    }
  })

  it('الإضاءة رتيبة أيضًا من لون عشوائي لا ينتمي إلى اللوحة', () => {
    const stops = generateScale(c('#3355ff'))
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]!.oklch.l).toBeLessThan(stops[i - 1]!.oklch.l)
    }
  })

  it('الدرجات مطابقة لـ`SCALE_STEPS` بالترتيب نفسه', () => {
    const stops = generateScale(c(SIGNAL_500))
    expect(stops.map((s) => s.step)).toEqual(SCALE_STEPS)
  })

  it('الطرفان يطابقان طرفي الشبكة المشتركة حين لا يقع الأساس عندهما', () => {
    // SIGNAL_500 إضاءته قريبة من درجة 500 (65.5%)، فطرفا السلّم (50 و950)
    // يُبنيان من الشبكة المشتركة نفسها لا من الأساس — القيم مقيسة من
    // `tokens.css` (انظر ترويسة `scale.ts`).
    const stops = generateScale(c(SIGNAL_500))
    expect(stops[0]!.oklch.l).toBeCloseTo(0.97525, 3)
    expect(stops[stops.length - 1]!.oklch.l).toBeCloseTo(0.24077, 3)
  })

  it('سلّم من درجة تقع بالفعل على حافة sRGB يبقى بالكامل داخل المدى', () => {
    // كل درجة في `tokens.css` هي حافة sRGB بالتعريف (مُثبَت في ترويسة
    // `scale.ts`)، فنسبة التشبّع هنا تساوي 1 تقريبًا، والسلّم الناتج
    // يُعيد إنتاج ذلك السلوك: حافة كل درجة، لا خروجًا عن المدى.
    const stops = generateScale(c(INFO_500))
    for (const stop of stops) expect(stop.inSrgb).toBe(true)
  })

  it('يعيد إنتاج درجات عائلة `info` الفعلية بدقّة إدراكية عالية', () => {
    const stops = generateScale(c(INFO_500))
    const at = (step: number) => stops.find((s) => s.step === step)!

    expect(deltaEReadings(c(at(100).hex), c(INFO_100))).toBeLessThan(0.01)
    expect(deltaEReadings(c(at(950).hex), c(INFO_950))).toBeLessThan(0.01)
  })
})

describe('إسناد الأساس — بأقرب درجة بإضاءته، لا عند 500 دائمًا', () => {
  it('لون فاتح جدًّا (أبيض خالص) يُسنَد إلى الدرجة 50', () => {
    const base = c('#ffffff')
    const stops = generateScale(base)
    expect(stops[0]!.step).toBe(50)
    expect(stops[0]!.oklch.l).toBeCloseTo(base.oklch.l, 6)
    expect(stops[0]!.hex.toLowerCase()).toBe('#ffffff')
    // وباقي السلّم يُبنى من الشبكة المشتركة، فيظلّ يهبط دون أن ينزاح
    // بأكمله نحو الغامق بسبب أساسه الفاتح جدًّا.
    expect(stops[stops.length - 1]!.oklch.l).toBeCloseTo(0.24077, 3)
  })

  it('لون غامق جدًّا (أسود خالص) يُسنَد إلى الدرجة 950', () => {
    const base = c('#000000')
    const stops = generateScale(base)
    const last = stops[stops.length - 1]!
    expect(last.step).toBe(950)
    expect(last.oklch.l).toBeCloseTo(base.oklch.l, 6)
    expect(last.hex.toLowerCase()).toBe('#000000')
    expect(stops[0]!.oklch.l).toBeCloseTo(0.97525, 3)
  })

  it('لون متوسط الإضاءة يُسنَد إلى أقرب درجة، حاملًا إضاءته الفعلية لا إضاءة الشبكة', () => {
    const base = c(SIGNAL_500)
    const stops = generateScale(base)
    const anchor = stops.find((s) => s.step === 500)!
    expect(anchor.oklch.l).toBeCloseTo(base.oklch.l, 6)
    expect(anchor.oklch.c).toBeCloseTo(base.oklch.c, 6)
    expect(anchor.hex.toLowerCase()).toBe(formatColour(base).hex.toLowerCase())
  })
})

describe('التشبّع عند الحدود — رماديّ خالص وخروج عن مدى sRGB', () => {
  it('رماديّ خالص ينتج سلّمًا رماديًّا بالكامل (c = 0 في كل درجة)', () => {
    const stops = generateScale(c('#808080'))
    for (const stop of stops) expect(stop.oklch.c).toBeCloseTo(0, 6)
  })

  it('لون خارج مدى sRGB (P3) يُنتج درجات خارج المدى أيضًا، مُعلَنة لا مخفيّة', () => {
    // نفس المثال الذي توثّقه ترويسة `formats.ts` كلون خارج sRGB فعليًّا.
    const base = c('oklch(70% 0.4 150)')
    expect(base.inSrgb).toBe(false)

    const stops = generateScale(base)
    const outOfGamut = stops.filter((s) => !s.inSrgb)
    // نسبة تشبّع الأساس هنا أعلى من 1 (تشبّعه يتجاوز حافة sRGB عند
    // إضاءته)، فالتشبّع المطلوب عند أغلب الدرجات الأخرى يتجاوز حافتها هي
    // أيضًا — ولا يُخفى ذلك في `inSrgb`.
    expect(outOfGamut.length).toBeGreaterThan(SCALE_STEPS.length / 2)
  })
})

describe('lighten/darken — قناة الإضاءة فقط، والتشبّع والزاوية ثابتان', () => {
  it('lighten يزيد الإضاءة بخطوة معقولة (فجوة درجة واحدة على الشبكة تقريبًا)', () => {
    const base = c(SIGNAL_500)
    const out = lighten(base)
    const delta = out.oklch.l - base.oklch.l
    expect(delta).toBeGreaterThan(0.07)
    expect(delta).toBeLessThan(0.09)
    expect(out.oklch.c).toBeCloseTo(base.oklch.c, 4)
    expect(out.oklch.h).toBeCloseTo(base.oklch.h, 3)
  })

  it('darken نظير lighten بالاتجاه المعاكس', () => {
    const base = c(SIGNAL_500)
    const out = darken(base)
    const delta = base.oklch.l - out.oklch.l
    expect(delta).toBeGreaterThan(0.07)
    expect(delta).toBeLessThan(0.09)
    expect(out.oklch.c).toBeCloseTo(base.oklch.c, 4)
  })

  it('amount مخصّص يُستعمل حرفيًّا بدل الافتراضي', () => {
    const base = c(SIGNAL_500)
    const out = lighten(base, 0.05)
    expect(out.oklch.l - base.oklch.l).toBeCloseTo(0.05, 3)
  })

  it('الإضاءة تُقصّ عند 1 — أبيض خالص لا يزداد فتحًا', () => {
    const out = lighten(c('#ffffff'))
    expect(out.oklch.l).toBeCloseTo(1, 6)
  })

  it('الإضاءة تُقصّ عند 0 — أسود خالص لا يزداد غمقًا', () => {
    const out = darken(c('#000000'))
    expect(out.oklch.l).toBeCloseTo(0, 6)
  })
})

describe('saturate/desaturate — نسبيّان من التشبّع الحالي، والرماديّ محايد أمام كليهما', () => {
  it('saturate يضرب التشبّع في (1 + amount)', () => {
    const base = c(SIGNAL_500)
    const out = saturate(base)
    expect(out.oklch.c).toBeCloseTo(base.oklch.c * 1.2, 4)
    expect(out.oklch.l).toBeCloseTo(base.oklch.l, 4)
    expect(out.oklch.h).toBeCloseTo(base.oklch.h, 3)
  })

  it('desaturate يضرب التشبّع في (1 − amount)', () => {
    const base = c(SIGNAL_500)
    const out = desaturate(base)
    expect(out.oklch.c).toBeCloseTo(base.oklch.c * 0.8, 4)
  })

  it('amount مخصّص يُستعمل حرفيًّا', () => {
    const base = c(SIGNAL_500)
    expect(saturate(base, 0.5).oklch.c).toBeCloseTo(base.oklch.c * 1.5, 4)
    expect(desaturate(base, 0.5).oklch.c).toBeCloseTo(base.oklch.c * 0.5, 4)
  })

  it('رماديّ خالص محايد أمام saturate — لا زاوية تُخترَع من عدم', () => {
    const out = saturate(c('#808080'))
    expect(out.oklch.c).toBeCloseTo(0, 6)
  })

  it('رماديّ خالص محايد أمام desaturate أيضًا', () => {
    const out = desaturate(c('#808080'))
    expect(out.oklch.c).toBeCloseTo(0, 6)
  })

  it('التشبّع لا يهبط تحت الصفر مهما تجاوزت amount الواحد', () => {
    const out = desaturate(c(SIGNAL_500), 2)
    expect(out.oklch.c).toBe(0)
  })
})
