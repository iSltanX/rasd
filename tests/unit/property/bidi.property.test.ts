import { describe, expect, it } from 'vitest'

import {
  countText,
  FSI,
  formatBytes,
  formatDimensions,
  formatHuman,
  formatMeasure,
  formatPercent,
  formatRelativeTime,
  formatStorage,
  formatUnit,
  hasIsolates,
  isolate,
  LRI,
  mixed,
  NEVER_MIRROR,
  PDI,
  plural,
  RLI,
  shouldMirror,
  stripIsolates,
  type CountForms,
} from '@/shared/bidi'

import { fc } from './fc'

/**
 * خصائص `shared/bidi` — العزل والأرقام وعكس الأيقونات.
 *
 * العزل يُختبَر على نصوصٍ تخلط العربية باللاتينية والرموز **ومحارف العزل نفسها**: نصٌّ منسوخ من
 * صفحة قد يحملها أصلًا، فلا يصحّ أن تفترض الخاصّية مدخلًا نظيفًا. والأرقام صنفان لا يلتقيان:
 * القياس غربيّ يُعاد تحليله إلى قيمته، والعدّ هنديّ يُعاد فكّه إلى عدده.
 */

const ISOLATES = [LRI, RLI, FSI, PDI]

/** محرفٌ من نصٍّ واقعي: عربية، لاتينية، أرقام بنوعيها، رموز CSS، علامات اتجاه، ومحارف العزل. */
const char = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom('ر', 'ص', 'د', 'ا', 'ل', 'و', 'ن', ' ') },
  { weight: 3, arbitrary: fc.constantFrom('a', 'Z', '-', '_', '.', '#', ':', ';', '(', ')', '%') },
  { weight: 2, arbitrary: fc.constantFrom('0', '7', '٣', '٩', '×') },
  { weight: 1, arbitrary: fc.constantFrom(...ISOLATES, '‏', '‎') },
)
const text = fc.string({ unit: char, maxLength: 24 })
const cleanText = text.map(stripIsolates)

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const fromArabicDigits = (s: string): number =>
  Number([...s].map((d) => String(ARABIC_DIGITS.indexOf(d))).join(''))

/** مصفوفة قالب مركّبة — `mixed` لا تقرأ غير أجزائها المطبوخة. */
const template = (parts: readonly string[]): TemplateStringsArray =>
  Object.assign([...parts], { raw: [...parts] })

describe('العزل — isolate · stripIsolates · hasIsolates', () => {
  it('العزل ثمّ النزع يعيد النصّ منزوعًا، والعزل يلفّ النصّ بحاجزين لا غير', () => {
    fc.assert(
      fc.property(text, (s) => {
        const wrapped = isolate(s)
        expect(stripIsolates(wrapped)).toBe(stripIsolates(s))
        expect(wrapped.startsWith(LRI) && wrapped.endsWith(PDI)).toBe(true)
        expect(wrapped.length).toBe(s.length + 2)
      }),
    )
  })

  it('النزع متساوي القوّة، وما بعده لا يحمل عزلًا، وما لا عزل فيه لا يتغيّر', () => {
    fc.assert(
      fc.property(text, (s) => {
        const once = stripIsolates(s)
        expect(stripIsolates(once)).toBe(once)
        expect(hasIsolates(once)).toBe(false)
        expect(hasIsolates(isolate(s))).toBe(true)
        if (!ISOLATES.some((c) => s.includes(c))) expect(once).toBe(s)
      }),
    )
  })

  it('mixed يعزل كل قيمة بحاجزين، والنصّ بلا حواجز هو القالب مطبوخًا حرفيًّا', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(cleanText, cleanText), { maxLength: 6 }),
        cleanText,
        (pairs, tail) => {
          const parts = [...pairs.map(([part]) => part), tail]
          const values = pairs.map(([, value]) => value)
          const out = mixed(template(parts), ...values)

          const plain = parts.reduce((acc, part, i) => acc + part + (values[i] ?? ''), '')
          expect(stripIsolates(out)).toBe(plain)
          expect([...out].filter((c) => c === LRI).length).toBe(values.length)
          expect([...out].filter((c) => c === PDI).length).toBe(values.length)
        },
      ),
    )
  })
})

describe('القياس — أرقام غربية تُحلَّل إلى قيمتها', () => {
  const measure = fc.double({ min: -1e9, max: 1e9, noNaN: true })

  it('لا رقم هنديّ ولا فاصل آلاف، والتحليل يعيد القيمة إلى أربع خانات', () => {
    fc.assert(
      fc.property(measure, (v) => {
        const out = formatMeasure(v)
        expect(out).toMatch(/^-?\d+(\.\d{1,4})?$/u)
        expect(Math.abs(Number(out) - v)).toBeLessThanOrEqual(5e-5 + Math.abs(v) * 1e-15)
      }),
    )
  })

  it('العدد الصحيح يُكتب كما هو', () => {
    fc.assert(
      fc.property(fc.integer({ min: -(2 ** 40), max: 2 ** 40 }), (n) => {
        expect(formatMeasure(n)).toBe(String(n))
      }),
    )
  })

  it('الوحدة والبُعدان والنسبة المئوية مبنيّة على القياس نفسه لا منسّقٍ موازٍ', () => {
    fc.assert(
      fc.property(measure, measure, fc.constantFrom('px', 'rem', '%', ''), (w, h, unit) => {
        expect(formatUnit(w, unit)).toBe(`${formatMeasure(w)}${unit}`)
        const [left, right, ...rest] = formatDimensions(w, h).split(' × ')
        expect(rest).toEqual([])
        expect([left, right]).toEqual([formatMeasure(w), formatMeasure(h)])
      }),
    )
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (f) => {
        const out = formatPercent(f)
        expect(out.endsWith('%')).toBe(true)
        expect(Number(out.slice(0, -1))).toBeCloseTo(Math.round(f * 1000) / 10, 6)
      }),
    )
  })

  it('ما ليس عددًا منتهيًا يُعرض شَرطةً لا «NaN» ولا «∞»', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatMeasure(v)).toBe('—')
      expect(formatHuman(v)).toBe('—')
    }
  })
})

describe('الأحجام — العدد غربيّ، والتحويل لا يبتعد عن البايتات', () => {
  const bytes = fc.oneof(
    fc.integer({ min: 0, max: 4096 }),
    fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  )
  const KB = 1024

  const parse = (out: string, units: readonly string[]) => {
    const [num, unit] = out.split(' ')
    return { value: Number(num), power: units.indexOf(unit ?? '') }
  }

  it('formatBytes: الوحدة من الأربع، والعدد يعود إلى البايتات ضمن خطوة عرضه', () => {
    const units = ['بايت', 'كيلوبايت', 'ميغابايت', 'غيغابايت']
    fc.assert(
      fc.property(bytes, (b) => {
        const { value, power } = parse(formatBytes(b), units)
        expect(power).toBeGreaterThanOrEqual(0)
        if (power === 0) expect(value).toBe(b)
        else expect(Math.abs(value * KB ** power - b)).toBeLessThanOrEqual(0.05 * KB ** power)
      }),
    )
  })

  it('formatStorage: الوحدة من الخمس، والعدد يعود إلى البايتات ضمن خطوة عرضه', () => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    fc.assert(
      fc.property(bytes, (b) => {
        const { value, power } = parse(formatStorage(b), units)
        expect(power).toBeGreaterThanOrEqual(0)
        const step = power === 0 || value >= 10 ? 0.5 : 0.05
        expect(Math.abs(value * KB ** power - b)).toBeLessThanOrEqual(step * KB ** power)
      }),
    )
  })

  it('formatStorage يرفض السالب وما ليس منتهيًا', () => {
    fc.assert(
      fc.property(fc.double({ max: -Number.MIN_VALUE, noNaN: true }), (b) => {
        expect(formatStorage(b)).toBe('—')
      }),
    )
  })
})

describe('العدّ البشري — أرقام هندية تُفكّ إلى عددها', () => {
  const FORMS: CountForms = {
    one: 'لقطة واحدة',
    two: 'لقطتان',
    many: 'لقطات',
    accusative: 'لقطةً',
    singular: 'لقطة',
  }

  it('formatHuman لا يُخرج غير أرقام هندية، وفكّها يعيد العدد', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 ** 12 }), (n) => {
        const out = formatHuman(n)
        expect([...out].every((c) => ARABIC_DIGITS.includes(c))).toBe(true)
        expect(fromArabicDigits(out)).toBe(n)
      }),
    )
  })

  it('countText: الواحد والاثنان بلا رقم، وما سواهما عددُه أوّلًا ثمّ صيغةٌ من صيغه', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10 ** 7 }), (n) => {
        const out = countText(n, FORMS)
        if (n <= 2) {
          expect(out).toBe(
            n === 1 ? FORMS.one : n === 2 ? FORMS.two : `${formatHuman(0)} ${FORMS.singular}`,
          )
          return
        }
        const [digits, ...noun] = out.split(' ')
        expect(fromArabicDigits(digits ?? '')).toBe(n)
        expect([FORMS.many, FORMS.accusative, FORMS.singular]).toContain(noun.join(' '))
      }),
    )
  })

  it('countText: المعدود يتبع آخر رقمين — العدد وما يزيد عليه بمئة يأخذان الصيغة نفسها', () => {
    const noun = (n: number) => countText(n, FORMS).split(' ').slice(1).join(' ')
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 10 ** 6 }), (n) => {
        expect(noun(n + 100)).toBe(noun(n))
      }),
    )
  })

  it('plural: المفرد والمثنّى بلا رقم، وما سواهما يبدأ بعدده هنديًّا', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 ** 6 }), (n) => {
        const out = plural(n, 'دقيقة', 'دقيقتين', 'دقائق')
        if (n <= 2) {
          expect(out).toBe(n === 1 ? 'دقيقة' : 'دقيقتين')
          return
        }
        expect(out.startsWith(`${formatHuman(n)} `)).toBe(true)
        expect(out.endsWith(n <= 10 ? 'دقائق' : 'دقيقة')).toBe(true)
      }),
    )
  })

  it('formatRelativeTime: «الآن» قبل 45 ثانية، و«قبل …» بعدها، ولا رقم غربيّ أبدًا', () => {
    const now = 1_800_000_000_000
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 * 86_400_000 }), (elapsed) => {
        const out = formatRelativeTime(now - elapsed, now)
        expect(/[0-9]/u.test(out)).toBe(false)
        if (Math.round(elapsed / 1000) < 45) expect(out).toBe('الآن')
        else expect(out.startsWith('قبل ')).toBe(true)
      }),
    )
  })
})

describe('عكس الأيقونات في RTL', () => {
  const segment = fc.string({
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
    minLength: 1,
    maxLength: 8,
  })
  const DIRECTIONAL = [
    'arrow',
    'chevron',
    'back',
    'forward',
    'next',
    'prev',
    'undo',
    'redo',
    'indent',
    'align',
  ]

  it('ما في قائمة «لا يُعكس» لا يُعكس أبدًا، بالبادئة وبدونها', () => {
    for (const name of NEVER_MIRROR) {
      expect(shouldMirror(name)).toBe(false)
      expect(shouldMirror(`icon/${name}`)).toBe(false)
    }
  })

  it('البادئة `icon/` لا تغيّر الحكم على أي اسم', () => {
    fc.assert(
      fc.property(fc.array(segment, { minLength: 1, maxLength: 3 }), (parts) => {
        const name = parts.join('-')
        expect(shouldMirror(`icon/${name}`)).toBe(shouldMirror(name))
      }),
    )
  })

  it('اسمٌ فيه مقطعٌ اتجاهيّ كامل يُعكس ما لم يكن في قائمة «لا يُعكس»', () => {
    fc.assert(
      fc.property(
        fc.array(segment, { maxLength: 2 }),
        fc.constantFrom(...DIRECTIONAL),
        fc.array(segment, { maxLength: 2 }),
        (before, word, after) => {
          const name = [...before, word, ...after].join('-')
          expect(shouldMirror(name)).toBe(!NEVER_MIRROR.has(name))
        },
      ),
    )
  })
})
