import { describe, expect, it, vi } from 'vitest'

import { boxPassesForSigma } from '@/modules/editor/pixel-ops'
import {
  createRasterCache,
  isEffective,
  MAX_PATCH_BYTES,
  MIN_EFFECTIVE_SIGMA,
  patchKey,
  patchScaleFor,
  planPatch,
} from '@/modules/editor/raster-cache'
import { asNodeId, type RedactNode } from '@/modules/editor/scene'
import { deviceRect } from '@/shared/geometry'

const redact = (over: Partial<RedactNode> = {}): RedactNode => ({
  kind: 'redact',
  id: asNodeId('r1'),
  locked: false,
  rotation: 0,
  stroke: { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 1 },
  rect: deviceRect(100, 100, 472, 192),
  mode: 'blur',
  strength: 12,
  coverToken: 'status/danger/solid',
  ...over,
})

describe('**عتبة الفعالية — الحدّ الذي يمنع فشلًا مفتوحًا**', () => {
  it('العتبة تُشتقّ ولا تُكتب رقمًا مقتطعًا', () => {
    // `1.5/K`. وكتابتها 0.7978845608 تقع **تحتها** فتعطي d=1 أي لا شيء.
    expect(boxPassesForSigma(MIN_EFFECTIVE_SIGMA).some((p) => p.size > 1)).toBe(true)
    expect(boxPassesForSigma(0.7978845608).every((p) => p.size === 1)).toBe(true)
  })

  it('وσ دون العتبة غير فعّالة، وفوقها فعّالة', () => {
    expect(isEffective('blur', 0.5)).toBe(false)
    expect(isEffective('blur', 1)).toBe(true)
    expect(isEffective('pixelate', 1)).toBe(false)
    expect(isEffective('pixelate', 2)).toBe(true)
    expect(isEffective('cover', 0)).toBe(true)
  })
})

describe('**مقياس الرقعة — لا يُنزل الشدّة تحت أثرها**', () => {
  it('يتبع التكبير حين يسمح', () => {
    expect(patchScaleFor('blur', 40, 0.5)).toBe(0.5)
    expect(patchScaleFor('blur', 40, 1)).toBe(1)
  })

  it('ولا يتجاوز 1 مهما كبّر المستخدم — لا معنى لدقّة فوق المصدر', () => {
    expect(patchScaleFor('blur', 20, 4)).toBe(1)
  })

  it('**ويُرفَع حين يكون التكبير سيُلغي الضباب**', () => {
    // σ=2 عند تكبير 0.22: ‎2×0.22 = 0.44‎ ⇒ d=1 ⇒ هوية. المقياس يُرفَع.
    const naive = 2 * 0.2217
    expect(boxPassesForSigma(naive).every((p) => p.size === 1)).toBe(true)

    const scale = patchScaleFor('blur', 2, 0.2217)!
    expect(scale).toBeGreaterThan(0.2217)
    expect(isEffective('blur', 2 * scale)).toBe(true)
  })

  it('وللبكسلة كذلك — ضلعٌ دون اثنين لا يُبكسِل', () => {
    const scale = patchScaleFor('pixelate', 4, 0.125)!
    expect(Math.floor(4 * scale)).toBeGreaterThanOrEqual(2)
  })

  it('**وشدّةٌ لا أثر لها أصلًا تُرفَض** — تغطية معتمة لا معاينة كاذبة', () => {
    expect(patchScaleFor('blur', 0.4, 1)).toBeNull()
    expect(patchScaleFor('pixelate', 1, 1)).toBeNull()
  })

  it('والتغطية لا رقعة لها', () => {
    expect(patchScaleFor('cover', 0, 0.5)).toBe(1)
    expect(planPatch(redact({ mode: 'cover' }), 1)).toBeNull()
  })
})

describe('تخطيط الرقعة', () => {
  it('**الهامش نصف قطر النواة الكامل** لا `ceil(2σ)`', () => {
    const plan = planPatch(redact({ strength: 18 }), 1)!
    expect(plan.scale).toBe(1)
    // σ=18 ⇒ نصف القطر 50، لا 36.
    expect(plan.dest.x).toBe(50)
    expect(plan.width).toBe(472 + 100)
    expect(plan.height).toBe(192 + 100)
  })

  it('والعيّنة تتجاوز المنطقة بالهامش مقسومًا على المقياس', () => {
    const plan = planPatch(redact({ strength: 18 }), 0.5)!
    expect(plan.scale).toBe(0.5)
    expect(plan.strength).toBe(9)
    const m = plan.dest.x
    expect(plan.sample.x).toBeCloseTo(100 - m / 0.5, 6)
    expect(plan.sample.w).toBeCloseTo(472 + (2 * m) / 0.5, 6)
  })

  it('والبكسلة بلا هامش — لا انتشار خارج الخليّة', () => {
    const plan = planPatch(redact({ mode: 'pixelate', strength: 12 }), 1)!
    expect(plan.dest.x).toBe(0)
    expect(plan.width).toBe(472)
  })

  it('**ورقعةٌ فوق السقف تُرفَض** — التغطية أسلم من رقعة تلتهم الذاكرة', () => {
    // شدّة غير محدودة: σ=5000 ⇒ نصف قطر ضخم ⇒ رقعة بالغيغابايتات.
    expect(planPatch(redact({ strength: 5000, rect: deviceRect(0, 0, 100, 100) }), 1)).toBeNull()
  })

  it('والبايتات محسوبة لا مقدَّرة', () => {
    const plan = planPatch(redact({ strength: 18 }), 1)!
    expect(plan.bytes).toBe(572 * 292 * 4)
    expect(plan.bytes).toBeLessThan(MAX_PATCH_BYTES)
  })
})

describe('المفتاح', () => {
  it('**يتغيّر بكل ما يغيّر البكسلات**', () => {
    const node = redact()
    const plan = planPatch(node, 1)!
    const base = patchKey(node, plan, '7')

    expect(
      patchKey(redact({ strength: 13 }), planPatch(redact({ strength: 13 }), 1)!, '7'),
    ).not.toBe(base)
    expect(patchKey(node, planPatch(node, 0.5)!, '7')).not.toBe(base)
    expect(patchKey(redact({ rect: deviceRect(101, 100, 472, 192) }), plan, '7')).not.toBe(base)
    expect(patchKey(redact({ mode: 'pixelate', strength: 12 }), plan, '7')).not.toBe(base)
  })

  it('**وبصمة ما تحته جزء منه** — سهمٌ تحت الحجب يجب أن يُطمَس معه', () => {
    const node = redact()
    const plan = planPatch(node, 1)!
    expect(patchKey(node, plan, '1,2,')).not.toBe(patchKey(node, plan, '1,3,'))
  })

  it('ولا يعتمد على هوية الكائن — عقدتان متطابقتان مفتاحهما واحد', () => {
    const a = redact()
    const b = redact()
    expect(a).not.toBe(b)
    expect(patchKey(a, planPatch(a, 1)!, '3')).toBe(patchKey(b, planPatch(b, 1)!, '3'))
  })
})

describe('ذاكرة LRU بميزانية', () => {
  it('تُعيد ما خزّنته وتحسب بايتاته', () => {
    const cache = createRasterCache<string>(1000)
    expect(cache.put('a', 'A', 400)).toBe(true)
    expect(cache.get('a')).toBe('A')
    expect(cache.bytes).toBe(400)
  })

  it('**وتُخلي الأقدم استعمالًا لا الأقدم إدخالًا**', () => {
    const freed: string[] = []
    const cache = createRasterCache<string>(1000, (v) => freed.push(v))
    cache.put('a', 'A', 400)
    cache.put('b', 'B', 400)
    cache.get('a') // «أ» صارت الأحدث
    cache.put('c', 'C', 400)

    expect(cache.get('b')).toBeNull()
    expect(cache.get('a')).toBe('A')
    expect(freed).toEqual(['B'])
  })

  it('وتُحرّر ما تُخليه — القماش لا يُترك للجامع وحده', () => {
    const dispose = vi.fn()
    const cache = createRasterCache<string>(500, dispose)
    cache.put('a', 'A', 400)
    cache.put('b', 'B', 400)
    expect(dispose).toHaveBeenCalledWith('A')
  })

  it('**ورقعةٌ أكبر من السقف تُرفَض وتُحرَّر فورًا**', () => {
    const dispose = vi.fn()
    const cache = createRasterCache<string>(REDACT_BUDGET, dispose)
    expect(cache.put('big', 'B', MAX_PATCH_BYTES + 1)).toBe(false)
    expect(dispose).toHaveBeenCalledWith('B')
    expect(cache.size).toBe(0)
  })

  it('و`claim` يمنع إطلاق البناء نفسه في كل إطار', () => {
    const cache = createRasterCache<string>(1000)
    expect(cache.claim('a')).toBe(true)
    expect(cache.claim('a')).toBe(false)
    cache.put('a', 'A', 10)
    expect(cache.claim('a')).toBe(false) // موجودة الآن
  })

  it('و`release` يفكّ الحجز بعد فشل البناء', () => {
    const cache = createRasterCache<string>(1000)
    cache.claim('a')
    cache.release('a')
    expect(cache.claim('a')).toBe(true)
  })

  it('و`clear` يحرّر كل شيء', () => {
    const freed: string[] = []
    const cache = createRasterCache<string>(1000, (v) => freed.push(v))
    cache.put('a', 'A', 100)
    cache.put('b', 'B', 100)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.bytes).toBe(0)
    expect(freed.sort()).toEqual(['A', 'B'])
  })
})

const REDACT_BUDGET = 32 * 1024 * 1024
