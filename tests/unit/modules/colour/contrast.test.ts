import { describe, expect, it } from 'vitest'

import {
  apcaLc,
  apcaLuminance,
  checkPair,
  contrastRatio,
  formatLc,
  formatRatio,
  relativeLuminance,
  UNREADABLE_RATIO,
  wcagVerdict,
  WCAG_THRESHOLDS,
} from '@/modules/colour/contrast'
import { readColour } from '@/modules/colour/formats'

/**
 * متجهات مرجعية لا أرقام مخترَعة.
 *
 * WCAG: المتجهات محسوبة من نصّ المواصفة نفسه ومُتحقَّق منها بثلاثة تنفيذات
 * مستقلّة متطابقة (تنفيذ مرجعي بـPython، و`axe-core@4.13.0`،
 * و`culori@4.0.2`).
 *
 * APCA: المتجهات التسعة المنشورة في التنفيذ المرجعي `apca-w3@0.1.9`
 * (`test/index.js`)، ونصّها هناك: «These exercise all the important
 * constants». وهي **متجهات تنفيذ مرجعي لا مواصفة** — انظر رأس
 * `contrast.ts`.
 */

const rgb = (hex: string) => {
  const c = readColour(hex)
  if (!c) throw new Error(`لون غير صالح في الاختبار: ${hex}`)
  return c.rgb
}

describe('WCAG — الإضاءة النسبية', () => {
  it('الأسود صفر والأبيض واحد بالضبط', () => {
    expect(relativeLuminance(rgb('#000000'))).toBe(0)
    expect(relativeLuminance(rgb('#ffffff'))).toBeCloseTo(1, 12)
  })

  it('الأوّليات تعطي معاملاتها نفسها — المعاملات تجمع إلى 1', () => {
    expect(relativeLuminance(rgb('#ff0000'))).toBeCloseTo(0.2126, 12)
    expect(relativeLuminance(rgb('#00ff00'))).toBeCloseTo(0.7152, 12)
    expect(relativeLuminance(rgb('#0000ff'))).toBeCloseTo(0.0722, 12)
  })

  it('الفرع الخطّي مُغطّى — البايت 10 يسلكه و11 لا يسلكه', () => {
    // (10/255)/12.92 — لو سلك فرع القوّة لاختلف الرقم.
    expect(relativeLuminance(rgb('#0a0a0a'))).toBeCloseTo(0.003035269835488375, 12)
  })
})

describe('WCAG — نسبة التباين على متجهات يقينية', () => {
  const vectors: [string, string, number][] = [
    ['#000000', '#ffffff', 21],
    ['#ffffff', '#ffffff', 1],
    ['#000000', '#000000', 1],
    ['#ff0000', '#000000', 5.252],
    ['#0000ff', '#000000', 2.444],
    ['#00ffff', '#000000', 16.748],
    ['#ff00ff', '#000000', 6.696],
    ['#ff0000', '#ffffff', 3.998476770753999],
    ['#00ff00', '#ffffff', 1.372190277051751],
    ['#0000ff', '#ffffff', 8.592471358428805],
    ['#767676', '#ffffff', 4.542224959605253],
    ['#595959', '#ffffff', 7.004729208035935],
    ['#808080', '#ffffff', 3.949439648049116],
    ['#2563eb', '#ffffff', 5.168555560022562],
    ['#0a0a0a', '#000000', 1.060705396709767],
  ]

  for (const [a, b, expected] of vectors) {
    it(`${a} على ${b} = ${expected}`, () => {
      expect(contrastRatio(rgb(a), rgb(b))).toBeCloseTo(expected, 10)
    })
  }

  it('النسبة متماثلة — الترتيب لا يغيّرها (بخلاف APCA)', () => {
    expect(contrastRatio(rgb('#767676'), rgb('#ffffff'))).toBeCloseTo(
      contrastRatio(rgb('#ffffff'), rgb('#767676')),
      12,
    )
  })
})

describe('WCAG — الحكم والعتبات', () => {
  it('عتبات النصّ العادي 4.5 و7', () => {
    expect(WCAG_THRESHOLDS['normal-text']).toEqual({ aa: 4.5, aaa: 7 })
  })

  it('عتبات النصّ الكبير 3 و4.5', () => {
    expect(WCAG_THRESHOLDS['large-text']).toEqual({ aa: 3, aaa: 4.5 })
  })

  it('عناصر الواجهة: AA عند 3 و**لا AAA** — لا تُخترَع', () => {
    expect(WCAG_THRESHOLDS['non-text']).toEqual({ aa: 3, aaa: null })
    expect(wcagVerdict(rgb('#000000'), rgb('#ffffff'), 'non-text').level).toBe('AA')
  })

  it('حدود الرماديات على الأبيض — آخر ناجح وأوّل فاشل', () => {
    expect(wcagVerdict(rgb('#767676'), rgb('#ffffff')).level).toBe('AA')
    expect(wcagVerdict(rgb('#777777'), rgb('#ffffff')).level).toBe('fail')
    expect(wcagVerdict(rgb('#595959'), rgb('#ffffff')).level).toBe('AAA')
    expect(wcagVerdict(rgb('#5a5a5a'), rgb('#ffffff')).level).toBe('AA')
  })

  it('**مصيدة التقريب**: ما يُعرض 3.0 قد يفشل 3:1', () => {
    // 2.9979745649 — يُعرض «3.00» ويفشل. المقارنة على غير المقرَّب.
    const v = wcagVerdict(rgb('#000000'), rgb('#595959'), 'non-text')
    expect(formatRatio(v.ratio)).toBe('3.00 : 1')
    expect(v.level).toBe('fail')
  })

  it('مصيدة التقريب عند 4.5 و7 كذلك', () => {
    expect(wcagVerdict(rgb('#070707'), rgb('#777777')).level).toBe('fail')
    expect(wcagVerdict(rgb('#242424'), rgb('#aeaeae')).level).toBe('AA')
  })
})

describe('APCA — المتجهات المرجعية التسعة من apca-w3 0.1.9', () => {
  const vectors: [string, string, number][] = [
    ['#888888', '#ffffff', 63.056469930209424],
    ['#ffffff', '#888888', -68.54146436644962],
    ['#000000', '#aaaaaa', 58.146262578561334],
    ['#aaaaaa', '#000000', -56.24113336839742],
    ['#112233', '#ddeeff', 91.66830811481631],
    ['#ddeeff', '#112233', -93.06770049484275],
    ['#112233', '#444444', 8.32326136957393],
    ['#444444', '#112233', -7.526878460278154],
  ]

  for (const [text, bg, expected] of vectors) {
    it(`نصّ ${text} على ${bg} = ${expected}`, () => {
      expect(apcaLc(rgb(text), rgb(bg))).toBeCloseTo(expected, 10)
    })
  }
})

describe('APCA — الخصائص البنيوية', () => {
  it('الأبيض يعطي Y أكبر من 1 — المعاملات لا تجمع إلى 1', () => {
    expect(apcaLuminance(rgb('#ffffff'))).toBeGreaterThan(1)
    expect(apcaLuminance(rgb('#ffffff'))).toBeCloseTo(1.0000001, 7)
  })

  it('التوقيع ينقلب بانقلاب الترتيب', () => {
    const a = apcaLc(rgb('#888888'), rgb('#ffffff'))
    const b = apcaLc(rgb('#ffffff'), rgb('#888888'))
    expect(Math.sign(a)).toBe(-Math.sign(b))
  })

  it('**اللاتماثل**: المقدار نفسه يتغيّر لا الإشارة وحدها', () => {
    const a = Math.abs(apcaLc(rgb('#888888'), rgb('#ffffff')))
    const b = Math.abs(apcaLc(rgb('#ffffff'), rgb('#888888')))
    expect(Math.abs(a - b)).toBeCloseTo(5.484994, 5)
    expect(a).not.toBeCloseTo(b, 3)
  })

  it('لون على نفسه يعطي صفرًا (deltaYmin)', () => {
    expect(apcaLc(rgb('#3b82f6'), rgb('#3b82f6'))).toBe(0)
    expect(apcaLc(rgb('#000000'), rgb('#010101'))).toBe(0)
  })

  it('القصّ اللَيِّن للأسود يُفعَّل تحت العتبة 0.022 لا فوقها', () => {
    // ‎#333333‎ تحت العتبة و‎#343434‎ فوقها — قيمتان مختلفتان يُثبتان الفرع.
    expect(apcaLc(rgb('#333333'), rgb('#ffffff'))).toBeCloseTo(98.670795734182221, 8)
    expect(apcaLc(rgb('#343434'), rgb('#ffffff'))).toBeCloseTo(98.350581422565952, 8)
  })

  it('`loClip` انقطاع لا تدرّج — بايت واحد يقفز من صفر إلى 7.7', () => {
    expect(apcaLc(rgb('#b7b7b7'), rgb('#c8c8c8'))).toBe(0)
    expect(apcaLc(rgb('#b6b6b6'), rgb('#c8c8c8'))).toBeCloseTo(7.675045, 5)
  })

  it('`loClip` في القطبية المعكوسة انقطاع أيضًا — بايت واحد يقفز من صفر إلى -7.5', () => {
    // نصّ أفتح من خلفيته: الفرع الثاني من الخوارزمية بعتبته الخاصّة.
    expect(apcaLc(rgb('#575757'), rgb('#404040'))).toBe(0)
    expect(apcaLc(rgb('#585858'), rgb('#404040'))).toBeCloseTo(-7.514964, 5)
  })

  it('قناة خارج 0..255 تُجاوز المدى فيعطي التباين صفرًا لا رقمًا كاذبًا', () => {
    // Y للقناة 300 يساوي ≈1.48 — فوق سقف 1.1 الذي يقبل الأبيض نفسه (1.0000001).
    const beyond = { r: 300, g: 300, b: 300 }
    expect(apcaLc(beyond, rgb('#ffffff'))).toBe(0)
    expect(apcaLc(rgb('#000000'), beyond)).toBe(0)
    // والأبيض الفعلي لا يقع في الفرع نفسه: ما زال يعطي تباينه الكامل.
    expect(apcaLc(rgb('#000000'), rgb('#ffffff'))).toBeGreaterThan(100)
  })

  it('الحدود القصوى دون ±127', () => {
    expect(apcaLc(rgb('#000000'), rgb('#ffffff'))).toBeCloseTo(106.040673212688617, 8)
    expect(apcaLc(rgb('#ffffff'), rgb('#000000'))).toBeCloseTo(-107.884733183098476, 8)
  })
})

describe('التنسيق — أرقام غربية دائمًا (§3.5)', () => {
  it('النسبة بخانتين ولاحقة `: 1`', () => {
    expect(formatRatio(4.542224959605253)).toBe('4.54 : 1')
  })

  it('Lc بخانة واحدة', () => {
    expect(formatLc(63.056469930209424)).toBe('Lc 63.1')
    expect(formatLc(-68.54146436644962)).toBe('Lc -68.5')
  })

  it('لا أرقام هندية في أي مخرَج', () => {
    expect(formatRatio(21)).not.toMatch(/[٠-٩]/)
    expect(formatLc(106)).not.toMatch(/[٠-٩]/)
  })
})

describe('checkPair — الأزواج الثلاثة في §6.13', () => {
  it('نصّ على خلفية يُحكَم بعتبة النصّ العادي', () => {
    const c = checkPair('text-on-background', rgb('#767676'), rgb('#ffffff'))
    expect(c.wcag.target).toBe('normal-text')
    expect(c.wcag.level).toBe('AA')
  })

  it('أيقونة على خلفية تُحكَم بعتبة عناصر الواجهة (3:1)', () => {
    const c = checkPair('icon-on-background', rgb('#949494'), rgb('#ffffff'))
    expect(c.wcag.target).toBe('non-text')
    expect(c.wcag.level).toBe('AA')
  })

  it('حدّ على محيطه يُحكَم بعتبة عناصر الواجهة كذلك', () => {
    expect(checkPair('border-on-surround', rgb('#000'), rgb('#fff')).wcag.target).toBe('non-text')
  })

  it('كل زوج يحمل Lc إلى جانب حكم WCAG', () => {
    const c = checkPair('text-on-background', rgb('#888888'), rgb('#ffffff'))
    expect(c.lc).toBeCloseTo(63.056469930209424, 8)
  })

  it('التنبيه إلى «غير المقروء» منفصل عن الفشل', () => {
    // فشل عادي لكنه مقروء.
    expect(checkPair('text-on-background', rgb('#999999'), rgb('#ffffff')).unreadable).toBe(false)
    // شبه معدوم.
    const dead = checkPair('text-on-background', rgb('#fdfdfd'), rgb('#ffffff'))
    expect(dead.unreadable).toBe(true)
    expect(dead.wcag.ratio).toBeLessThan(UNREADABLE_RATIO)
  })
})
