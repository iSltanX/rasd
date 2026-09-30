/**
 * مخرجات لقطة المشكلة (`style-export/issue.ts`، ADR 0036 §2): `toCss` و`toTailwind` كما هما، ومعهما اختصارات
 * الصندوق التي تحفظها المشكلة — بجهاتها الفيزيائية كما كُتبت، ولا صنف يُخترَع لما لا يُقرأ.
 */
import { describe, expect, it } from 'vitest'

import { toCss, toTailwindText } from '@/modules/style-export/css'
import {
  issueCss,
  issueTailwind,
  issueTailwindText,
  mapShorthand,
} from '@/modules/style-export/issue'
import { toTailwind } from '@/modules/style-export/tailwind'
import { EMPTY_LIMITS, type InspectSnapshot, type StyleValue } from '@/shared/inspect-schema'

const used = (value: string): StyleValue => ({ value, reliability: 'used' })

const snapshot = (styles: Record<string, StyleValue>): InspectSnapshot => ({
  at: 1,
  tag: 'button',
  label: '.cta',
  selector: '.cta',
  unique: true,
  positional: false,
  inShadow: false,
  rect: { x: 0, y: 0, width: 10, height: 10, pageX: 0, pageY: 0 },
  styles,
  limits: { ...EMPTY_LIMITS, indexComplete: true },
})

const classes = (list: ReturnType<typeof mapShorthand>) =>
  list?.map((m) => (m.kind === 'untranslatable' ? `!${m.prop}` : m.cls))

describe('mapShorthand', () => {
  it('القيمة الواحدة أداةٌ واحدة، والمتناظرة محوران، والمختلفة جهاتٌ فيزيائية', () => {
    expect(classes(mapShorthand('padding', '16px', 16))).toEqual(['p-4'])
    expect(classes(mapShorthand('padding', '14px 24px', 16))).toEqual(['py-3.5', 'px-6'])
    expect(classes(mapShorthand('margin', '4px 8px 12px 16px', 16))).toEqual([
      'mt-1',
      'mr-2',
      'mb-3',
      'ml-4',
    ])
    // ثلاث قيم: اليسار يأخذ اليمين كما في CSS.
    expect(classes(mapShorthand('margin', '4px 8px 12px', 16))).toEqual([
      'mt-1',
      'mr-2',
      'mb-3',
      'ml-2',
    ])
  })

  it('الطول خارج السلّم صريحٌ بسببه — `mapSpacing` نفسه', () => {
    const [m] = mapShorthand('padding', '15px', 16) ?? []
    expect(m).toMatchObject({ kind: 'arbitrary', cls: 'p-[15px]' })
  })

  it('ما لا يُقرأ جهاتٍ يُعلَن متعذّرًا ولا يُخترَع له صنف', () => {
    expect(classes(mapShorthand('padding', '1px 2px 3px 4px 5px', 16))).toEqual(['!padding'])
    expect(classes(mapShorthand('padding', '', 16))).toEqual(['!padding'])
    expect(classes(mapShorthand('margin', 'auto', 16))).toEqual(['!m'])
  })

  it('الفجوة بقيمتيها، و`normal` لا شيء', () => {
    expect(mapShorthand('gap', 'normal', 16)).toEqual([])
    expect(classes(mapShorthand('gap', '8px', 16))).toEqual(['gap-2'])
    expect(classes(mapShorthand('gap', '8px 15px', 16))).toEqual(['gap-y-2', 'gap-x-[15px]'])
    expect(classes(mapShorthand('gap', '1px 2px 3px', 16))).toEqual(['!gap'])
  })

  it('الحواف صريحةٌ بقيمتها والمسافات شرطاتٌ سفلية، وما ليس اختصارًا `null`', () => {
    expect(classes(mapShorthand('border-radius', '8px 4px', 16))).toEqual(['rounded-[8px_4px]'])
    expect(mapShorthand('border-radius', '', 16)).toEqual([])
    expect(mapShorthand('padding-block-start', '16px', 16)).toBeNull()
  })
})

describe('issueCss', () => {
  it('مخرج `toCss` كما هو، ثمّ المسمّى خارج المجموعات بترتيب تسميته قبل القوس', () => {
    const snap = snapshot({
      'border-radius': used('8px'),
      padding: used('14px 24px'),
      'caret-color': used('red'),
      display: used('flex'),
    })
    const css = issueCss(snap, ['padding', 'border-radius', 'display'])
    expect(css).toBe('.cta {\n  display: flex;\n  padding: 14px 24px;\n  border-radius: 8px;\n}')
    // ما لم يُسمَّ يبقى خارجًا — قرار `toCss` نفسه.
    expect(css).not.toContain('caret-color')
  })

  it('بلا مسمّى — أو بمسمّى قيمته ابتدائية — هو `toCss` حرفًا', () => {
    const snap = snapshot({ display: used('flex'), gap: used('normal') })
    expect(issueCss(snap, [])).toBe(toCss(snap))
    expect(issueCss(snap, ['gap'])).toBe(toCss(snap))
  })
})

describe('issueTailwind و issueTailwindText', () => {
  it('ما ليس اختصارًا من `toTailwind` نفسه، ثمّ الاختصارات بعده بقوائمها الثلاث', () => {
    const styles = { width: '184px', padding: '14px 24px', margin: 'auto', 'border-radius': '8px' }
    const out = issueTailwind(styles, 16)
    expect(out.classes).toEqual(['w-46', 'py-3.5', 'px-6', 'rounded-[8px]'])
    expect(out.arbitrary.map((a) => a.cls)).toEqual(['rounded-[8px]'])
    expect(out.untranslatable.map((u) => u.prop)).toEqual(['m'])
    expect(out.target).toBe(toTailwind({}, 16).target)
  })

  it('بلا اختصارات هو نصّ `toTailwindText` نفسه', () => {
    const styles = { width: '184px', 'box-shadow': '0 1px 2px black' }
    const snap = snapshot(Object.fromEntries(Object.entries(styles).map(([k, v]) => [k, used(v)])))
    expect(issueTailwindText(issueTailwind(styles, 16))).toBe(toTailwindText(snap, 16))
  })
})
