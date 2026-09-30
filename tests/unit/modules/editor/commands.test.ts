import { describe, expect, it } from 'vitest'

import {
  applyPatch,
  applyPatches,
  coalesce,
  invertPatch,
  invertPatches,
  type Patch,
} from '@/modules/editor/commands'
import { asNodeId, type RectNode, type Scene } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { deviceRect } from '@/shared/geometry'

/**
 * الفرق — الوحدة التي يُبنى منها التاريخ.
 *
 * القاعدتان اللتان تحرسهما هذه الحالات: **لا `undo()` مكتوبة** (العكس يُلتقَط
 * لحظة التنفيذ)، و**الفهرس هو الفهرس لحظة تطبيق العملية** لا لحظة تسجيلها.
 */

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 3, dash: [], opacity: 1 } as const

function rect(id: string, x = 0): RectNode {
  return {
    kind: 'rect',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    rect: deviceRect(x, 0, 50, 50),
    radiusPx: 0,
    fill: 'none',
  }
}

function sceneOf(...nodes: RectNode[]): Scene {
  return { ...emptyScene({ captureId: 'cap', width: 800, height: 600, dpr: 2 }), nodes }
}

const ids = (scene: Scene): string[] => scene.nodes.map((n) => n.id)

/** يطبّق القائمة ثمّ عكسها ويتوقّع المشهد الأصلي حقلًا بحقل. */
function expectRoundTrip(scene: Scene, patches: readonly Patch[]): void {
  const after = applyPatches(scene, patches)
  expect(applyPatches(after, invertPatches(patches))).toEqual(scene)
}

describe('`applyPatch` — الإدراج', () => {
  it('يدرج في البداية والوسط والنهاية', () => {
    const scene = sceneOf(rect('a'), rect('b'))
    const insertAt = (index: number): string[] =>
      ids(applyPatch(scene, { op: 'insert', index, node: rect('x') }))
    expect(insertAt(0)).toEqual(['x', 'a', 'b'])
    expect(insertAt(1)).toEqual(['a', 'x', 'b'])
    // الفهرس المساوي للطول مسموح: إدراج في الأعلى.
    expect(insertAt(2)).toEqual(['a', 'b', 'x'])
  })

  it('**يرمي على فهرس خارج المدى ولا يتجاهله**', () => {
    const scene = sceneOf(rect('a'))
    expect(() => applyPatch(scene, { op: 'insert', index: -1, node: rect('x') })).toThrow(
      RangeError,
    )
    expect(() => applyPatch(scene, { op: 'insert', index: 2, node: rect('x') })).toThrow(RangeError)
  })

  it('رسالة الخطأ تذكر الفهرس المرفوض', () => {
    expect(() => applyPatch(sceneOf(), { op: 'insert', index: 5, node: rect('x') })).toThrow(/5/)
  })

  it('لا يعدّل المشهد الأصلي ولا مصفوفته، ويشارك العقد بالمرجع', () => {
    const a = rect('a')
    const scene = sceneOf(a)
    const before = scene.nodes
    const next = applyPatch(scene, { op: 'insert', index: 1, node: rect('x') })
    expect(scene.nodes).toBe(before)
    expect(scene.nodes).toHaveLength(1)
    expect(next.nodes[0]).toBe(a)
    expect(next).not.toBe(scene)
  })
})

describe('`applyPatch` — الحذف', () => {
  it('يحذف بالفهرس', () => {
    const scene = sceneOf(rect('a'), rect('b'), rect('c'))
    const next = applyPatch(scene, { op: 'remove', index: 1, node: rect('b') })
    expect(ids(next)).toEqual(['a', 'c'])
  })

  it('**يرمي على الفهرس السالب وعلى المساوي للطول** — الحذف أضيق من الإدراج', () => {
    const scene = sceneOf(rect('a'))
    expect(() => applyPatch(scene, { op: 'remove', index: -1, node: rect('a') })).toThrow(
      RangeError,
    )
    expect(() => applyPatch(scene, { op: 'remove', index: 1, node: rect('a') })).toThrow(RangeError)
  })

  it('لا يعدّل المشهد الأصلي', () => {
    const scene = sceneOf(rect('a'), rect('b'))
    applyPatch(scene, { op: 'remove', index: 0, node: rect('a') })
    expect(ids(scene)).toEqual(['a', 'b'])
  })
})

describe('`applyPatch` — الاستبدال', () => {
  it('يضع `after` في الفهرس ويترك الباقي بالمرجع نفسه', () => {
    const a = rect('a')
    const b = rect('b')
    const scene = sceneOf(a, b)
    const after = rect('b', 77)
    const next = applyPatch(scene, { op: 'replace', index: 1, before: b, after })
    expect(next.nodes[0]).toBe(a)
    expect(next.nodes[1]).toBe(after)
    expect(scene.nodes[1]).toBe(b)
  })

  it('يرمي على فهرس خارج المدى', () => {
    const a = rect('a')
    const scene = sceneOf(a)
    expect(() => applyPatch(scene, { op: 'replace', index: -1, before: a, after: a })).toThrow(
      RangeError,
    )
    expect(() => applyPatch(scene, { op: 'replace', index: 1, before: a, after: a })).toThrow(
      RangeError,
    )
  })
})

describe('`applyPatch` — النقل', () => {
  const four = (): Scene => sceneOf(rect('a'), rect('b'), rect('c'), rect('d'))

  it('إلى الأمام: الهدف هو الفهرس النهائي لا الأصلي', () => {
    expect(ids(applyPatch(four(), { op: 'move', from: 0, to: 2 }))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('إلى الخلف', () => {
    expect(ids(applyPatch(four(), { op: 'move', from: 3, to: 1 }))).toEqual(['a', 'd', 'b', 'c'])
  })

  it('من الفهرس إلى نفسه لا يغيّر الترتيب', () => {
    expect(ids(applyPatch(four(), { op: 'move', from: 2, to: 2 }))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('**يرمي إذا خرج أيٌّ من الطرفين عن المدى** — كلٌّ من الجهات الأربع', () => {
    const scene = four()
    for (const [from, to] of [
      [-1, 0],
      [4, 0],
      [0, -1],
      [0, 4],
    ] as const) {
      expect(() => applyPatch(scene, { op: 'move', from, to })).toThrow(RangeError)
    }
  })

  it('رسالة الخطأ تذكر الطرفين', () => {
    expect(() => applyPatch(four(), { op: 'move', from: 9, to: 1 })).toThrow(/9.*1/)
  })

  it('لا يعدّل المشهد الأصلي', () => {
    const scene = four()
    applyPatch(scene, { op: 'move', from: 0, to: 3 })
    expect(ids(scene)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('`applyPatch` — تغييرات الجذر', () => {
  it('الاقتصاص', () => {
    const crop = deviceRect(1, 2, 3, 4)
    const next = applyPatch(sceneOf(), {
      op: 'root',
      patch: { field: 'crop', before: null, after: crop },
    })
    expect(next.meta.crop).toEqual(crop)
  })

  it('نقطة بداية الترقيم', () => {
    const next = applyPatch(sceneOf(), {
      op: 'root',
      patch: { field: 'pinStart', before: 1, after: 9 },
    })
    expect(next.meta.pinStart).toBe(9)
  })

  it('شكل الدبّوس', () => {
    const next = applyPatch(sceneOf(), {
      op: 'root',
      patch: { field: 'pinShape', before: 'circle', after: 'pin' },
    })
    expect(next.meta.pinShape).toBe('pin')
  })

  it('يغيّر حقلًا واحدًا ويحفظ بقية الجذر وعقده', () => {
    const scene = sceneOf(rect('a'))
    const next = applyPatch(scene, {
      op: 'root',
      patch: { field: 'pinStart', before: 1, after: 5 },
    })
    expect(next.meta.pinShape).toBe(scene.meta.pinShape)
    expect(next.meta.crop).toBe(scene.meta.crop)
    expect(next.nodes).toBe(scene.nodes)
    expect(next.source).toBe(scene.source)
    expect(scene.meta.pinStart).toBe(1)
  })
})

describe('`invertPatch`', () => {
  const a = rect('a')
  const b = rect('b', 5)

  it('الإدراج ⇄ الحذف: العقدة تُحمَل كاملة لا معرّفًا', () => {
    expect(invertPatch({ op: 'insert', index: 2, node: a })).toEqual({
      op: 'remove',
      index: 2,
      node: a,
    })
    expect(invertPatch({ op: 'remove', index: 2, node: a })).toEqual({
      op: 'insert',
      index: 2,
      node: a,
    })
  })

  it('الاستبدال يبدّل `before` و`after`', () => {
    expect(invertPatch({ op: 'replace', index: 3, before: a, after: b })).toEqual({
      op: 'replace',
      index: 3,
      before: b,
      after: a,
    })
  })

  it('النقل يبدّل الطرفين', () => {
    expect(invertPatch({ op: 'move', from: 1, to: 4 })).toEqual({ op: 'move', from: 4, to: 1 })
  })

  it('الجذر — كل حقل يبدّل قيمتيه', () => {
    const crop = deviceRect(0, 0, 5, 5)
    expect(
      invertPatch({ op: 'root', patch: { field: 'crop', before: null, after: crop } }),
    ).toEqual({ op: 'root', patch: { field: 'crop', before: crop, after: null } })
    expect(invertPatch({ op: 'root', patch: { field: 'pinStart', before: 1, after: 8 } })).toEqual({
      op: 'root',
      patch: { field: 'pinStart', before: 8, after: 1 },
    })
    expect(
      invertPatch({
        op: 'root',
        patch: { field: 'pinShape', before: 'circle', after: 'square' },
      }),
    ).toEqual({ op: 'root', patch: { field: 'pinShape', before: 'square', after: 'circle' } })
  })

  it('العكس مرّتين يعيد الفرق نفسه — لكل نوع عملية', () => {
    const patches: Patch[] = [
      { op: 'insert', index: 0, node: a },
      { op: 'remove', index: 1, node: b },
      { op: 'replace', index: 0, before: a, after: b },
      { op: 'move', from: 0, to: 2 },
      { op: 'root', patch: { field: 'pinStart', before: 1, after: 3 } },
      { op: 'root', patch: { field: 'pinShape', before: 'circle', after: 'pin' } },
      { op: 'root', patch: { field: 'crop', before: null, after: deviceRect(0, 0, 1, 1) } },
    ]
    for (const p of patches) expect(invertPatch(invertPatch(p))).toEqual(p)
  })
})

describe('`applyPatches` و`invertPatches`', () => {
  it('قائمة فارغة تعيد المشهد نفسه بالمرجع', () => {
    const scene = sceneOf(rect('a'))
    expect(applyPatches(scene, [])).toBe(scene)
  })

  it('تُطبَّق بالترتيب — كل فرق يرى نتيجة سابقه', () => {
    const scene = sceneOf(rect('a'))
    const next = applyPatches(scene, [
      { op: 'insert', index: 1, node: rect('b') },
      { op: 'insert', index: 2, node: rect('c') },
      { op: 'move', from: 2, to: 0 },
    ])
    expect(ids(next)).toEqual(['c', 'a', 'b'])
  })

  it('فرق خارج المدى في منتصف القائمة يرمي — لا فساد صامت', () => {
    const scene = sceneOf(rect('a'))
    expect(() =>
      applyPatches(scene, [
        { op: 'insert', index: 1, node: rect('b') },
        { op: 'remove', index: 7, node: rect('b') },
      ]),
    ).toThrow(RangeError)
    // والمشهد الأصلي سليم.
    expect(ids(scene)).toEqual(['a'])
  })

  it('**عكس القائمة يعكس الترتيب ثمّ كلًّا** — حذفان تنازليان يعودان إلى موضعيهما', () => {
    const scene = sceneOf(rect('a'), rect('b'), rect('c'), rect('d'), rect('e'))
    // حذف 3 ثمّ 1 (تنازليًّا) — وعكسهما يجب أن يدرج 1 ثمّ 3.
    const patches: Patch[] = [
      { op: 'remove', index: 3, node: scene.nodes[3]! },
      { op: 'remove', index: 1, node: scene.nodes[1]! },
    ]
    expect(invertPatches(patches)).toEqual([
      { op: 'insert', index: 1, node: scene.nodes[1] },
      { op: 'insert', index: 3, node: scene.nodes[3] },
    ])
    expectRoundTrip(scene, patches)
  })

  it('لا يعدّل القائمة الأصلية عند العكس', () => {
    const patches: Patch[] = [
      { op: 'insert', index: 0, node: rect('x') },
      { op: 'insert', index: 1, node: rect('y') },
    ]
    const copy = [...patches]
    invertPatches(patches)
    expect(patches).toEqual(copy)
  })

  it('قائمة فارغة تُعكَس إلى فارغة', () => {
    expect(invertPatches([])).toEqual([])
  })

  it('خليط من كل الأنواع يعود إلى الأصل حقلًا بحقل', () => {
    const scene = sceneOf(rect('a'), rect('b'), rect('c'))
    const patches: Patch[] = [
      { op: 'replace', index: 0, before: scene.nodes[0]!, after: rect('a', 40) },
      { op: 'insert', index: 3, node: rect('d') },
      { op: 'move', from: 3, to: 1 },
      { op: 'remove', index: 2, node: scene.nodes[1]! },
      { op: 'root', patch: { field: 'pinStart', before: 1, after: 6 } },
      { op: 'root', patch: { field: 'crop', before: null, after: deviceRect(1, 1, 9, 9) } },
    ]
    expectRoundTrip(scene, patches)
  })
})

describe('`coalesce` — الدمج على مستوى المعرّف', () => {
  const a = rect('a')
  const b = rect('b')
  const replaceOf = (before: RectNode, x: number, index = 0): Patch => ({
    op: 'replace',
    index,
    before,
    after: rect(before.id, x),
  })

  it('قائمة فارغة تبقى فارغة', () => {
    expect(coalesce([])).toEqual([])
  })

  it('فرق واحد يبقى كما هو', () => {
    const p = replaceOf(a, 1)
    expect(coalesce([p])).toEqual([p])
  })

  it('**أوّل `before` وآخر `after`** لكل معرّف', () => {
    const merged = coalesce([
      replaceOf(a, 1),
      replaceOf(rect('a', 1), 2),
      replaceOf(rect('a', 2), 3),
    ])
    expect(merged).toEqual([{ op: 'replace', index: 0, before: a, after: rect('a', 3) }])
  })

  it('يحفظ موضع أوّل ظهور لكل معرّف حين يتداخل معرّفان', () => {
    const merged = coalesce([
      replaceOf(a, 1, 0),
      replaceOf(b, 10, 1),
      replaceOf(rect('a', 1), 2, 0),
      replaceOf(rect('b', 10), 20, 1),
    ])
    expect(merged).toEqual([
      { op: 'replace', index: 0, before: a, after: rect('a', 2) },
      { op: 'replace', index: 1, before: b, after: rect('b', 20) },
    ])
  })

  it('معرّفان مختلفان لا يندمجان', () => {
    expect(coalesce([replaceOf(a, 1, 0), replaceOf(b, 2, 1)])).toHaveLength(2)
  })

  it('ألف فرق على العقدة نفسها تصير فرقًا واحدًا وتعطي النتيجة نفسها', () => {
    const scene = sceneOf(a)
    const patches: Patch[] = []
    let cur = a
    for (let i = 1; i <= 1000; i++) {
      const next = rect('a', i)
      patches.push({ op: 'replace', index: 0, before: cur, after: next })
      cur = next
    }
    const merged = coalesce(patches)
    expect(merged).toHaveLength(1)
    expect(applyPatches(scene, merged)).toEqual(applyPatches(scene, patches))
    expectRoundTrip(scene, merged)
  })

  it('فرق `move` لا مفتاح له فيمرّ كما هو ولو تكرّر', () => {
    const moves: Patch[] = [
      { op: 'move', from: 0, to: 1 },
      { op: 'move', from: 1, to: 2 },
    ]
    expect(coalesce(moves)).toEqual(moves)
  })

  it('لا يغيّر القائمة الأصلية', () => {
    const input = [replaceOf(a, 1), replaceOf(rect('a', 1), 2)]
    const copy = [...input]
    coalesce(input)
    expect(input).toEqual(copy)
  })

  it('الاستبدال على عقدة حُذفت لا يندمج مع ما قبل الحذف', () => {
    const removed = rect('a', 1)
    const patches: Patch[] = [
      replaceOf(a, 1),
      { op: 'remove', index: 0, node: removed },
      replaceOf(removed, 2),
    ]
    const merged = coalesce(patches)
    expect(merged).toHaveLength(3)
    expect(merged.map((p) => p.op)).toEqual(['replace', 'remove', 'replace'])
  })

  it('**الاستبدال بعد إدراج العقدة نفسها يُحفَظ كما هو** — والنتيجة والعكس سليمان', () => {
    const scene = sceneOf(rect('base'))
    const fresh = rect('fresh')
    const patches: Patch[] = [
      { op: 'insert', index: 1, node: fresh },
      { op: 'replace', index: 1, before: fresh, after: rect('fresh', 10) },
      { op: 'replace', index: 1, before: rect('fresh', 10), after: rect('fresh', 20) },
    ]
    const merged = coalesce(patches)
    expect(applyPatches(scene, merged)).toEqual(applyPatches(scene, patches))
    expectRoundTrip(scene, merged)
    expect((applyPatches(scene, merged).nodes[1] as RectNode).rect.x).toBe(20)
  })

  it('حذف عقدة أخرى بين استبدالين لا يقطع سلسلة الأولى', () => {
    const scene = sceneOf(b, a)
    const patches: Patch[] = [
      replaceOf(a, 1, 1),
      { op: 'remove', index: 0, node: b },
      replaceOf(rect('a', 1), 2, 0),
    ]
    const merged = coalesce(patches)
    expect(merged.map((p) => p.op)).toEqual(['replace', 'remove'])
    expect(applyPatches(scene, merged)).toEqual(applyPatches(scene, patches))
    expectRoundTrip(scene, merged)
  })
})

describe('`coalesce` — تغييرات الجذر', () => {
  it('الاقتصاص: أوّل `before` وآخر `after`', () => {
    const c1 = deviceRect(0, 0, 10, 10)
    const c2 = deviceRect(0, 0, 20, 20)
    const merged = coalesce([
      { op: 'root', patch: { field: 'crop', before: null, after: c1 } },
      { op: 'root', patch: { field: 'crop', before: c1, after: c2 } },
    ])
    expect(merged).toEqual([{ op: 'root', patch: { field: 'crop', before: null, after: c2 } }])
  })

  it('نقطة البداية: أوّل `before` وآخر `after`', () => {
    const merged = coalesce([
      { op: 'root', patch: { field: 'pinStart', before: 1, after: 5 } },
      { op: 'root', patch: { field: 'pinStart', before: 5, after: 7 } },
      { op: 'root', patch: { field: 'pinStart', before: 7, after: 9 } },
    ])
    expect(merged).toEqual([{ op: 'root', patch: { field: 'pinStart', before: 1, after: 9 } }])
  })

  it('شكل الدبّوس: أوّل `before` وآخر `after`', () => {
    const merged = coalesce([
      { op: 'root', patch: { field: 'pinShape', before: 'circle', after: 'square' } },
      { op: 'root', patch: { field: 'pinShape', before: 'square', after: 'pin' } },
    ])
    expect(merged).toEqual([
      { op: 'root', patch: { field: 'pinShape', before: 'circle', after: 'pin' } },
    ])
  })

  it('حقلا جذر مختلفان لا يندمجان ويبقى ترتيبهما', () => {
    const patches: Patch[] = [
      { op: 'root', patch: { field: 'pinStart', before: 1, after: 4 } },
      { op: 'root', patch: { field: 'pinShape', before: 'circle', after: 'pin' } },
    ]
    expect(coalesce(patches)).toEqual(patches)
  })

  it('الجذر المدموج يعطي المشهد النهائي نفسه ويُعكَس بسلامة', () => {
    const scene = sceneOf()
    const patches: Patch[] = [
      { op: 'root', patch: { field: 'pinStart', before: 1, after: 3 } },
      { op: 'root', patch: { field: 'pinShape', before: 'circle', after: 'square' } },
      { op: 'root', patch: { field: 'pinStart', before: 3, after: 8 } },
    ]
    const merged = coalesce(patches)
    expect(merged).toHaveLength(2)
    expect(applyPatches(scene, merged)).toEqual(applyPatches(scene, patches))
    expectRoundTrip(scene, merged)
  })

  it('استبدال عقدة وجذر معًا: مفتاحان مستقلّان', () => {
    const a = rect('a')
    const merged = coalesce([
      { op: 'replace', index: 0, before: a, after: rect('a', 1) },
      { op: 'root', patch: { field: 'pinStart', before: 1, after: 2 } },
      { op: 'replace', index: 0, before: rect('a', 1), after: rect('a', 2) },
      { op: 'root', patch: { field: 'pinStart', before: 2, after: 3 } },
    ])
    expect(merged.map((p) => p.op)).toEqual(['replace', 'root'])
  })
})
