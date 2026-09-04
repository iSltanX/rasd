import { describe, expect, it } from 'vitest'

import { deltaE, deltaEReadings, oklabOf, oklabOfBytes } from '@/modules/colour/distance'
import { readColour } from '@/modules/colour/formats'

const read = (css: string) => {
  const r = readColour(css)
  if (!r) throw new Error(`تعذّرت قراءة ${css}`)
  return r
}

describe('deltaE — الخصائص الرياضية', () => {
  it('صفر للّون مع نفسه', () => {
    const lab = oklabOfBytes(43, 127, 255)
    expect(deltaE(lab, lab)).toBe(0)
  })

  it('متماثل — المسافة لا تتغيّر بعكس الطرفين', () => {
    const a = oklabOfBytes(220, 30, 30)
    const b = oklabOfBytes(30, 190, 60)
    expect(deltaE(a, b)).toBeCloseTo(deltaE(b, a), 12)
  })

  it('موجب لكل لونين مختلفين', () => {
    expect(deltaE(oklabOfBytes(0, 0, 0), oklabOfBytes(255, 255, 255))).toBeGreaterThan(0)
  })

  it('يحترم متباينة المثلّث', () => {
    const a = oklabOfBytes(255, 0, 0)
    const b = oklabOfBytes(0, 255, 0)
    const c = oklabOfBytes(0, 0, 255)
    expect(deltaE(a, c)).toBeLessThanOrEqual(deltaE(a, b) + deltaE(b, c) + 1e-12)
  })
})

describe('deltaE — السلوك الإدراكي', () => {
  it('لونان متقاربان أقرب من لونين متباعدين', () => {
    const near = deltaEReadings(read('#3b82f6'), read('#2b7fff'))
    const far = deltaEReadings(read('#3b82f6'), read('#f59e0b'))
    expect(near).toBeLessThan(far)
  })

  it('الأبيض والأسود من أبعد ما يكون في المدى', () => {
    const bw = deltaEReadings(read('#ffffff'), read('#000000'))
    // الإضاءة وحدها تقطع المدى الكامل 0→1، فالمسافة لا تقلّ عنه.
    expect(bw).toBeGreaterThanOrEqual(1)
  })

  it('الرمادي بلا زاوية لون: محوراه صفران', () => {
    const grey = oklabOf(read('#808080'))
    expect(Math.abs(grey.a)).toBeLessThan(1e-6)
    expect(Math.abs(grey.b)).toBeLessThan(1e-6)
  })
})

describe('oklabOf — يقيس ما يُرسَم لا الإحداثيات الخام', () => {
  it('لون خارج مدى sRGB يُقاس من بايتاته المقصوصة', () => {
    // `oklch(70% 0.4 150)` خارج المدى — `readColour` تعلن ذلك في `inSrgb`.
    const wide = read('oklch(70% 0.4 150)')
    expect(wide.inSrgb).toBe(false)
    // والمسافة إلى لون بُني من بايتاته المعروضة نفسها = صفر، لأن كليهما
    // يُقاس من المعروض لا من الإحداثيات الحقيقية.
    const clipped = read(`rgb(${String(wide.rgb.r)} ${String(wide.rgb.g)} ${String(wide.rgb.b)})`)
    expect(deltaEReadings(wide, clipped)).toBeCloseTo(0, 10)
  })

  it('`oklabOfBytes` و`oklabOf` يتفقان على البايتات نفسها', () => {
    const viaBytes = oklabOfBytes(43, 127, 255)
    const viaReading = oklabOf(read('rgb(43 127 255)'))
    expect(deltaE(viaBytes, viaReading)).toBeCloseTo(0, 12)
  })
})
