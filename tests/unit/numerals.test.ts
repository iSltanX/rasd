import { describe, expect, it } from 'vitest'

import {
  formatBytes,
  formatDimensions,
  formatHuman,
  formatMeasure,
  formatPercent,
  formatRatio,
  formatRelativeTime,
  formatUnit,
  plural,
} from '@/shared/bidi'

/**
 * الأرقام في رصد صنفان لا صنف واحد.
 *
 * عدّ بشري بأرقام هندية لأن النصّ عربي، وقياس بأرقام غربية لأن القيمة تُنسخ
 * إلى محرّر الكود. خلطهما يعني `padding: ١٤px` — وهو خطأ لا اختيار.
 */

const ARABIC_INDIC = /[٠-٩]/
const WESTERN = /[0-9]/

describe('formatHuman — أرقام هندية للعدّ البشري', () => {
  it.each([
    [0, '٠'],
    [1, '١'],
    [2, '٢'],
    [3, '٣'],
    [9, '٩'],
    [10, '١٠'],
    [42, '٤٢'],
    [248, '٢٤٨'],
    [1000, '١٠٠٠'],
    [123456, '١٢٣٤٥٦'],
  ])('%s → %s', (input, expected) => {
    expect(formatHuman(input)).toBe(expected)
  })

  it('يعالج السالب والكسر', () => {
    expect(formatHuman(-5)).toMatch(ARABIC_INDIC)
    expect(formatHuman(1.5)).toMatch(ARABIC_INDIC)
  })

  it.each([NaN, Infinity, -Infinity])('يعطي شرطة للقيمة غير المنتهية %s', (bad) => {
    expect(formatHuman(bad)).toBe('—')
  })

  it('لا يحوي رقمًا غربيًا أبدًا', () => {
    for (const n of [0, 7, 99, 1024, 987654]) {
      expect(formatHuman(n)).not.toMatch(WESTERN)
    }
  })
})

describe('formatMeasure — أرقام غربية للقياس', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [14, '14'],
    [900, '900'],
    [1440, '1440'],
    [-12, '-12'],
    [0.5, '0.5'],
    [4.82, '4.82'],
    [1.005, '1.005'],
    [16384, '16384'],
  ])('%s → %s', (input, expected) => {
    expect(formatMeasure(input)).toBe(expected)
  })

  it('بلا فواصل آلاف — القيمة تُنسخ إلى الكود', () => {
    expect(formatMeasure(123456)).toBe('123456')
  })

  it('لا يحوي رقمًا هنديًا أبدًا', () => {
    for (const n of [0, 7, 99, 1024, 987654, 1.5]) {
      expect(formatMeasure(n)).not.toMatch(ARABIC_INDIC)
    }
  })

  it.each([NaN, Infinity])('يعطي شرطة للقيمة غير المنتهية %s', (bad) => {
    expect(formatMeasure(bad)).toBe('—')
  })
})

describe('صيغ القياس المركّبة', () => {
  it('الأبعاد بعلامة ضرب رياضية لا حرف x', () => {
    expect(formatDimensions(1440, 900)).toBe('1440 × 900')
    expect(formatDimensions(1440, 900)).not.toContain('x')
  })

  it('الوحدة ملتصقة بالعدد', () => {
    expect(formatUnit(14)).toBe('14px')
    expect(formatUnit(1.5, 'rem')).toBe('1.5rem')
  })

  it('نسبة التباين', () => {
    expect(formatRatio(4.8234)).toBe('4.82 : 1')
    expect(formatRatio(3, 1)).toBe('3 : 1')
  })

  it('النسبة المئوية غربية', () => {
    expect(formatPercent(0.62)).toBe('62%')
    expect(formatPercent(0.0625)).toBe('6.3%')
  })

  it('حجم الملف: عدد غربي ووحدة عربية', () => {
    expect(formatBytes(512)).toBe('512 بايت')
    expect(formatBytes(4710)).toBe('4.6 كيلوبايت')
    expect(formatBytes(1024 * 1024 * 3)).toBe('3 ميغابايت')
    expect(formatBytes(4710)).toMatch(WESTERN)
    expect(formatBytes(4710)).not.toMatch(ARABIC_INDIC)
  })
})

describe('التصريف العربي — ثلاث صيغ لا صيغتان', () => {
  it('المفرد بلا رقم', () => {
    expect(plural(1, 'دقيقة', 'دقيقتين', 'دقائق')).toBe('دقيقة')
  })

  it('المثنّى بلا رقم — «دقيقتين» لا «٢ دقيقة»', () => {
    expect(plural(2, 'دقيقة', 'دقيقتين', 'دقائق')).toBe('دقيقتين')
    expect(plural(2, 'دقيقة', 'دقيقتين', 'دقائق')).not.toMatch(ARABIC_INDIC)
  })

  it('جمع القلّة من ٣ إلى ١٠', () => {
    expect(plural(3, 'دقيقة', 'دقيقتين', 'دقائق')).toBe('٣ دقائق')
    expect(plural(10, 'دقيقة', 'دقيقتين', 'دقائق')).toBe('١٠ دقائق')
  })

  it('ما فوق ١٠ يعود إلى المفرد', () => {
    expect(plural(11, 'دقيقة', 'دقيقتين', 'دقائق')).toBe('١١ دقيقة')
  })
})

describe('الزمن النسبي', () => {
  const now = 1_700_000_000_000
  it.each([
    [now - 5_000, 'الآن'],
    [now - 60_000, 'قبل دقيقة'],
    [now - 120_000, 'قبل دقيقتين'],
    [now - 180_000, 'قبل ٣ دقائق'],
    [now - 3_600_000, 'قبل ساعة'],
    [now - 7_200_000, 'قبل ساعتين'],
    [now - 86_400_000, 'قبل يوم'],
    [now - 172_800_000, 'قبل يومين'],
  ])('%s → %s', (at, expected) => {
    expect(formatRelativeTime(at, now)).toBe(expected)
  })
})
