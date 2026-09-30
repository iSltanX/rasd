import { describe, expect, it } from 'vitest'

import { applyPatches, invertPatches } from '@/modules/editor/commands'
import { pinsByOrdinal } from '@/modules/editor/pins'
import {
  asNodeId,
  MAX_SCENE_NODES,
  type NoteNode,
  type PinNode,
  type RectNode,
  type RedactNode,
  type Scene,
  type SceneNode,
} from '@/modules/editor/scene'
import {
  addNode,
  deleteNodes,
  reorderNode,
  replaceNode,
  replaceNodes,
  setCoverToken,
  setCrop,
  setPinShape,
  setRedactMode,
  setRedactStrength,
  toggleHidden,
  toggleLocked,
} from '@/modules/editor/scene-ops'
import { emptyScene } from '@/modules/editor/scene-schema'
import { deviceRect, devicePoint } from '@/shared/geometry'

/**
 * عمليات المشهد — مُنشئات فروق لا تعدّل شيئًا.
 *
 * كل عملية تُختبَر بما تُصدِره **وبتطبيقه ثمّ عكسه**: عمليةٌ تُصدِر فروقًا
 * صحيحة شكلًا وعكسُها لا يعيد المشهد هي أخبث ما في نماذج التاريخ.
 */

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 3, dash: [], opacity: 1 } as const

function rect(id: string, over: Partial<RectNode> = {}): RectNode {
  return {
    kind: 'rect',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    rect: deviceRect(0, 0, 50, 50),
    radiusPx: 0,
    fill: 'none',
    ...over,
  }
}

function pin(id: string, ordinal: number, over: Partial<PinNode> = {}): PinNode {
  return {
    kind: 'pin',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    at: devicePoint(ordinal * 10, 10),
    shape: 'circle',
    ordinal,
    noteId: null,
    radiusPx: 13,
    ...over,
  }
}

function note(id: string, over: Partial<NoteNode> = {}): NoteNode {
  return {
    kind: 'note',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    at: devicePoint(0, 0),
    widthPx: 200,
    title: 'ملاحظة',
    body: '',
    tag: null,
    font: { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 0 },
    paddingPx: 12,
    pinId: null,
    ...over,
  }
}

function redact(id: string, over: Partial<RedactNode> = {}): RedactNode {
  return {
    kind: 'redact',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    stroke,
    rect: deviceRect(10, 10, 100, 40),
    mode: 'cover',
    strength: 0,
    coverToken: 'tool/annotate/solid',
    ...over,
  }
}

function sceneOf(nodes: readonly SceneNode[], pinStart = 1): Scene {
  const base = emptyScene({ captureId: 'cap', width: 800, height: 600, dpr: 2, pinStart })
  return { ...base, nodes }
}

/** يطبّق ثم يعكس — والنتيجة يجب أن تطابق الأصل حقلًا بحقل. */
function roundTrips(scene: Scene, patches: Parameters<typeof applyPatches>[1][]): void {
  const after = applyPatches(scene, patches)
  expect(applyPatches(after, invertPatches(patches))).toEqual(scene)
}

describe('`addNode`', () => {
  it('عقدة غير دبّوس: فرق إدراج وحيد في أعلى المشهد', () => {
    const scene = sceneOf([rect('a'), rect('b')])
    const node = rect('c')
    const { patches, refusal } = addNode(scene, node)
    expect(refusal).toBeNull()
    expect(patches).toEqual([{ op: 'insert', index: 2, node }])
    expect(applyPatches(scene, patches).nodes.at(-1)).toBe(node)
  })

  it('الملاحظة لا تمسّ الترقيم ولو وُجدت دبابيس', () => {
    const scene = sceneOf([pin('p1', 1), pin('p2', 2)])
    const { patches } = addNode(scene, note('n'))
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({ op: 'insert', index: 2 })
  })

  it('**يرفض عند بلوغ سقف العقد** ويعلن السبب بلا فروق', () => {
    const full = sceneOf(Array.from({ length: MAX_SCENE_NODES }, (_, i) => rect(`r${i}`)))
    const result = addNode(full, rect('over'))
    expect(result.refusal).toBe('too-many-nodes')
    expect(result.patches).toEqual([])
  })

  it('ويقبل الإضافة الأخيرة قبل السقف بواحدة', () => {
    const almost = sceneOf(Array.from({ length: MAX_SCENE_NODES - 1 }, (_, i) => rect(`r${i}`)))
    const result = addNode(almost, rect('last'))
    expect(result.refusal).toBeNull()
    expect(result.patches).toHaveLength(1)
  })

  it('دبّوس برقمه الصحيح: إدراج بلا فروق ترقيم', () => {
    const scene = sceneOf([pin('p1', 1), pin('p2', 2)])
    const { patches, refusal } = addNode(scene, pin('p3', 3))
    expect(refusal).toBeNull()
    expect(patches).toEqual([{ op: 'insert', index: 2, node: pin('p3', 3) }])
  })

  it('**الترقيم يُعاد بعد الإدراج**: دبّوس برقم مكرَّر يأخذ رقمًا فريدًا ولا يبقى تكرار', () => {
    const scene = sceneOf([pin('p1', 1), pin('p2', 2)])
    // الرقم ١ مأخوذ: الجديد يُدرَج ثمّ تُصحَّح الأرقام كلّها.
    const { patches } = addNode(scene, pin('fresh', 1))
    expect(patches[0]).toMatchObject({ op: 'insert', index: 2 })
    expect(patches.length).toBeGreaterThan(1)

    const after = applyPatches(scene, patches)
    expect(pinsByOrdinal(after).map((p) => p.ordinal)).toEqual([1, 2, 3])
    // ترتيب الرسم لم يُمسّ: الجديد آخر المصفوفة.
    expect(after.nodes.map((n) => n.id)).toEqual(['p1', 'p2', 'fresh'])
    roundTrips(scene, [...patches])
  })

  it('أوّل دبّوس في مشهد فارغ يأخذ `pinStart` مهما كان رقمه الوارد', () => {
    const scene = sceneOf([], 4)
    const { patches } = addNode(scene, pin('first', 99))
    const after = applyPatches(scene, patches)
    expect(pinsByOrdinal(after).map((p) => p.ordinal)).toEqual([4])
  })
})

describe('`deleteNodes`', () => {
  it('معرّفات لا وجود لها ⇒ `not-found` بلا فروق', () => {
    const result = deleteNodes(sceneOf([rect('a')]), [asNodeId('ghost')])
    expect(result).toEqual({ patches: [], refusal: 'not-found' })
  })

  it('قائمة معرّفات فارغة ⇒ `not-found`', () => {
    expect(deleteNodes(sceneOf([rect('a')]), []).refusal).toBe('not-found')
  })

  it('**عقدة مقفولة بين الأهداف ترفض العملية كلّها** — لا حذف جزئي', () => {
    const scene = sceneOf([rect('a'), rect('b', { locked: true }), rect('c')])
    const result = deleteNodes(scene, [asNodeId('a'), asNodeId('b')])
    expect(result).toEqual({ patches: [], refusal: 'locked' })
  })

  it('يحذف الموجود ويتجاهل المجهول في القائمة نفسها', () => {
    const scene = sceneOf([rect('a'), rect('b')])
    const { patches, refusal } = deleteNodes(scene, [asNodeId('ghost'), asNodeId('b')])
    expect(refusal).toBeNull()
    expect(applyPatches(scene, patches).nodes.map((n) => n.id)).toEqual(['a'])
  })

  it('**الحذف تنازليًّا بالفهرس** — كي لا يُزيح الأصغر ما بعده', () => {
    const scene = sceneOf([rect('a'), rect('b'), rect('c'), rect('d')])
    // القائمة بترتيب معاكس عمدًا: الترتيب المُصدَر لا يتبع ترتيب الإدخال.
    const { patches } = deleteNodes(scene, [asNodeId('b'), asNodeId('d')])
    const indices = patches.flatMap((p) => (p.op === 'remove' ? [p.index] : []))
    expect(indices).toEqual([3, 1])
    expect(applyPatches(scene, patches).nodes.map((n) => n.id)).toEqual(['a', 'c'])
    roundTrips(scene, [...patches])
  })

  it('حذف غير الدبابيس لا يُصدِر إلّا فروق الحذف', () => {
    const scene = sceneOf([pin('p1', 1), rect('a'), pin('p2', 2)])
    const { patches } = deleteNodes(scene, [asNodeId('a')])
    expect(patches.map((p) => p.op)).toEqual(['remove'])
  })

  it('**الترتيب الملزِم: فكّ الروابط ثمّ الحذف ثمّ إعادة الترقيم**', () => {
    // p2 مربوط بـn2. حذف p2 يفكّ n2 (فهرس 2)، يحذف (فهرس 1)، ويُقدِّم p3.
    const scene = sceneOf([
      pin('p1', 1),
      pin('p2', 2, { noteId: asNodeId('n2') }),
      note('n2', { pinId: asNodeId('p2') }),
      pin('p3', 3),
    ])
    const { patches } = deleteNodes(scene, [asNodeId('p2')])

    expect(patches.map((p) => p.op)).toEqual(['replace', 'remove', 'replace'])
    expect(patches[0]).toMatchObject({ op: 'replace', index: 2 })
    expect(patches[1]).toMatchObject({ op: 'remove', index: 1 })
    // فهرس p3 محسوب على المشهد **بعد** الحذف: [p1, n2, p3] ⇒ 2.
    expect(patches[2]).toMatchObject({ op: 'replace', index: 2 })

    const after = applyPatches(scene, patches)
    const n2 = after.nodes.find((n) => n.id === 'n2') as NoteNode
    expect(n2.pinId).toBeNull()
    expect(pinsByOrdinal(after).map((p) => [p.id, p.ordinal])).toEqual([
      ['p1', 1],
      ['p3', 2],
    ])
    roundTrips(scene, [...patches])
  })

  it('حذف الملاحظة وحدها يفكّ مرجع دبّوسها', () => {
    const scene = sceneOf([pin('p1', 1, { noteId: asNodeId('n1') }), note('n1')])
    const { patches } = deleteNodes(scene, [asNodeId('n1')])
    const after = applyPatches(scene, patches)
    expect((after.nodes[0] as PinNode).noteId).toBeNull()
    roundTrips(scene, [...patches])
  })
})

describe('`replaceNode`', () => {
  it('عقدة مجهولة ⇒ `not-found`', () => {
    const result = replaceNode(sceneOf([rect('a')]), rect('ghost'))
    expect(result).toEqual({ patches: [], refusal: 'not-found' })
  })

  it('يُصدِر فرق استبدال يحمل العقدة قبل التغيير وبعده', () => {
    const before = rect('a')
    const next = rect('a', { radiusPx: 8 })
    const { patches, refusal } = replaceNode(sceneOf([rect('z'), before]), next)
    expect(refusal).toBeNull()
    expect(patches).toEqual([{ op: 'replace', index: 1, before, after: next }])
  })

  it('**المقفول لا يُعدَّل**: مقفول قبل وبعد ⇒ `locked`', () => {
    const scene = sceneOf([rect('a', { locked: true })])
    const result = replaceNode(scene, rect('a', { locked: true, radiusPx: 5 }))
    expect(result).toEqual({ patches: [], refusal: 'locked' })
  })

  it('لكنّ فكّ القفل يمرّ — المقفول يبقى قابلًا لفكّ قفله', () => {
    const scene = sceneOf([rect('a', { locked: true })])
    const result = replaceNode(scene, rect('a', { locked: false }))
    expect(result.refusal).toBeNull()
    expect(result.patches).toHaveLength(1)
  })

  it('وقفل عقدة مفتوحة يمرّ كذلك', () => {
    const scene = sceneOf([rect('a')])
    expect(replaceNode(scene, rect('a', { locked: true })).refusal).toBeNull()
  })
})

describe('`replaceNodes`', () => {
  it('يستبدل كل ما وُجد ويحفظ فهارس المصفوفة', () => {
    const scene = sceneOf([rect('a'), rect('b'), rect('c')])
    const { patches, refusal } = replaceNodes(scene, [
      rect('c', { radiusPx: 3 }),
      rect('a', { radiusPx: 1 }),
    ])
    expect(refusal).toBeNull()
    expect(patches.map((p) => (p.op === 'replace' ? p.index : -1))).toEqual([2, 0])
    roundTrips(scene, [...patches])
  })

  it('يتخطّى المجهول والمقفول ويُبقي البقية', () => {
    const scene = sceneOf([rect('a'), rect('b', { locked: true }), rect('c')])
    const { patches, refusal } = replaceNodes(scene, [
      rect('ghost'),
      rect('b', { locked: true, radiusPx: 9 }),
      rect('c', { radiusPx: 2 }),
    ])
    expect(refusal).toBeNull()
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({ op: 'replace', index: 2 })
  })

  it('لا شيء صالح ⇒ `not-found` بلا فروق', () => {
    const scene = sceneOf([rect('a', { locked: true })])
    const result = replaceNodes(scene, [rect('a', { locked: true }), rect('ghost')])
    expect(result).toEqual({ patches: [], refusal: 'not-found' })
  })

  it('قائمة فارغة ⇒ `not-found`', () => {
    expect(replaceNodes(sceneOf([rect('a')]), []).refusal).toBe('not-found')
  })
})

describe('`reorderNode`', () => {
  const four = (): Scene => sceneOf([rect('a'), rect('b'), rect('c'), rect('d')])

  it('معرّف مجهول ⇒ `not-found`', () => {
    expect(reorderNode(four(), asNodeId('ghost'), 0)).toEqual({
      patches: [],
      refusal: 'not-found',
    })
  })

  it('يصدر فرق نقل من الفهرس الحالي إلى الهدف', () => {
    const { patches, refusal } = reorderNode(four(), asNodeId('b'), 3)
    expect(refusal).toBeNull()
    expect(patches).toEqual([{ op: 'move', from: 1, to: 3 }])
    expect(applyPatches(four(), patches).nodes.map((n) => n.id)).toEqual(['a', 'c', 'd', 'b'])
  })

  it('الهدف الأكبر من المدى يُحصَر عند الأخير', () => {
    const { patches } = reorderNode(four(), asNodeId('a'), 100)
    expect(patches).toEqual([{ op: 'move', from: 0, to: 3 }])
  })

  it('الهدف السالب يُحصَر عند الأوّل', () => {
    const { patches } = reorderNode(four(), asNodeId('d'), -5)
    expect(patches).toEqual([{ op: 'move', from: 3, to: 0 }])
  })

  it('النقل إلى الموضع نفسه ينجح بلا فروق — ليس رفضًا', () => {
    expect(reorderNode(four(), asNodeId('c'), 2)).toEqual({ patches: [], refusal: null })
  })

  it('محصور عند الموضع نفسه بعد الحصر — بلا فروق', () => {
    expect(reorderNode(four(), asNodeId('d'), 50)).toEqual({ patches: [], refusal: null })
  })

  it('لا يمسّ أرقام الدبابيس — ترتيب الرسم غير ترتيب الأرقام', () => {
    const scene = sceneOf([pin('p1', 1), pin('p2', 2), rect('r')])
    const { patches } = reorderNode(scene, asNodeId('p2'), 2)
    const after = applyPatches(scene, patches)
    expect(after.nodes.map((n) => n.id)).toEqual(['p1', 'r', 'p2'])
    expect(pinsByOrdinal(after).map((p) => [p.id, p.ordinal])).toEqual([
      ['p1', 1],
      ['p2', 2],
    ])
    roundTrips(scene, [...patches])
  })
})

describe('`toggleHidden`', () => {
  it('يخفي الظاهر ويُظهر المخفيّ', () => {
    const shown = sceneOf([rect('a')])
    const hidden = applyPatches(shown, toggleHidden(shown, rect('a')).patches)
    expect((hidden.nodes[0] as RectNode).hidden).toBe(true)

    const back = applyPatches(hidden, toggleHidden(hidden, hidden.nodes[0] as RectNode).patches)
    expect((back.nodes[0] as RectNode).hidden).toBe(false)
  })

  it('عقدة ليست في المشهد ⇒ `not-found`', () => {
    expect(toggleHidden(sceneOf([]), rect('ghost')).refusal).toBe('not-found')
  })

  it('والعكس يعيد المشهد', () => {
    const scene = sceneOf([rect('a')])
    roundTrips(scene, [...toggleHidden(scene, rect('a')).patches])
  })
})

describe('`toggleLocked`', () => {
  it('يقفل المفتوح ويفكّ قفل المقفول', () => {
    const open = sceneOf([rect('a')])
    const locked = applyPatches(open, toggleLocked(open, rect('a')).patches)
    expect(locked.nodes[0]?.locked).toBe(true)

    const unlocked = applyPatches(locked, toggleLocked(locked, locked.nodes[0]!).patches)
    expect(unlocked.nodes[0]?.locked).toBe(false)
  })

  it('**فكّ القفل لا يمرّ من فحص القفل** — المقفول يبقى قابلًا لفكّه', () => {
    const scene = sceneOf([rect('a', { locked: true })])
    const result = toggleLocked(scene, scene.nodes[0]!)
    expect(result.refusal).toBeNull()
    expect(result.patches).toHaveLength(1)
  })

  it('عقدة ليست في المشهد ⇒ `not-found`', () => {
    expect(toggleLocked(sceneOf([rect('a')]), rect('ghost'))).toEqual({
      patches: [],
      refusal: 'not-found',
    })
  })

  it('يقبل عقدة الحجب — القفل لا حدّ أمنيّ فيه', () => {
    const scene = sceneOf([redact('x')])
    const after = applyPatches(scene, toggleLocked(scene, redact('x')).patches)
    expect(after.nodes[0]?.locked).toBe(true)
  })

  it('والعكس يعيد المشهد', () => {
    const scene = sceneOf([rect('a')])
    roundTrips(scene, [...toggleLocked(scene, rect('a')).patches])
  })
})

describe('`setCrop`', () => {
  it('اقتصاص جديد: فرق جذر يحمل القيمة القديمة `null`', () => {
    const crop = deviceRect(10, 10, 100, 80)
    const { patches, refusal } = setCrop(sceneOf([]), crop)
    expect(refusal).toBeNull()
    expect(patches).toEqual([{ op: 'root', patch: { field: 'crop', before: null, after: crop } }])
  })

  it('المرجع نفسه لا يُصدِر شيئًا', () => {
    const crop = deviceRect(0, 0, 10, 10)
    const scene: Scene = { ...sceneOf([]), meta: { ...sceneOf([]).meta, crop } }
    expect(setCrop(scene, crop)).toEqual({ patches: [], refusal: null })
  })

  it('`null` على `null` لا يُصدِر شيئًا', () => {
    expect(setCrop(sceneOf([]), null)).toEqual({ patches: [], refusal: null })
  })

  it('إزالة الاقتصاص تحفظ المستطيل السابق للتراجع', () => {
    const crop = deviceRect(5, 5, 20, 20)
    const scene: Scene = { ...sceneOf([]), meta: { ...sceneOf([]).meta, crop } }
    const { patches } = setCrop(scene, null)
    expect(patches).toEqual([{ op: 'root', patch: { field: 'crop', before: crop, after: null } }])
    expect(applyPatches(scene, patches).meta.crop).toBeNull()
    roundTrips(scene, [...patches])
  })

  it('الاقتصاص لا يُزيح أي عقدة', () => {
    const scene = sceneOf([rect('a')])
    const after = applyPatches(scene, setCrop(scene, deviceRect(10, 10, 20, 20)).patches)
    expect(after.nodes).toEqual(scene.nodes)
  })
})

describe('`setRedactMode` — الشدّة ترافق النمط', () => {
  it('**من التغطية إلى الضباب يحمل شدّةً فعّالة لا صفرًا**', () => {
    // صفر التغطية منقولًا إلى الضباب يُنتج «ضبابيًّا» لا يغيّر شيئًا على الشاشة.
    const node = redact('x', { mode: 'cover', strength: 0 })
    const { patches } = setRedactMode(sceneOf([node]), node, 'blur')
    const after = applyPatches(sceneOf([node]), patches).nodes[0] as RedactNode
    expect(after.mode).toBe('blur')
    expect(after.strength).toBe(12)
  })

  it('من الضباب إلى البكسلة: الافتراضي للنمط الجديد لا رقم النمط القديم', () => {
    const node = redact('x', { mode: 'blur', strength: 30 })
    const scene = sceneOf([node])
    const after = applyPatches(scene, setRedactMode(scene, node, 'pixelate').patches)
      .nodes[0] as RedactNode
    expect(after.mode).toBe('pixelate')
    expect(after.strength).toBe(12)
  })

  it('إلى التغطية: الشدّة تُصفَّر', () => {
    const node = redact('x', { mode: 'pixelate', strength: 20 })
    const scene = sceneOf([node])
    const after = applyPatches(scene, setRedactMode(scene, node, 'cover').patches)
      .nodes[0] as RedactNode
    expect(after.mode).toBe('cover')
    expect(after.strength).toBe(0)
  })

  it('النمط نفسه يُبقي شدّة المستخدم', () => {
    const node = redact('x', { mode: 'blur', strength: 25 })
    const scene = sceneOf([node])
    const after = applyPatches(scene, setRedactMode(scene, node, 'blur').patches)
      .nodes[0] as RedactNode
    expect(after.strength).toBe(25)
  })

  it('النمط نفسه بشدّة خارج المدى يحصرها في مدى النمط', () => {
    const node = redact('x', { mode: 'pixelate', strength: 900 })
    const scene = sceneOf([node])
    const after = applyPatches(scene, setRedactMode(scene, node, 'pixelate').patches)
      .nodes[0] as RedactNode
    expect(after.strength).toBe(64)
  })

  it('**حجب مقفول لا يتبدّل نمطه**', () => {
    const node = redact('x', { locked: true })
    const result = setRedactMode(sceneOf([node]), node, 'blur')
    expect(result).toEqual({ patches: [], refusal: 'locked' })
  })

  it('حجب غير موجود ⇒ `not-found`', () => {
    expect(setRedactMode(sceneOf([]), redact('ghost'), 'blur').refusal).toBe('not-found')
  })
})

describe('`setRedactStrength`', () => {
  it('الضباب: يُحصَر بين الحدّين', () => {
    const node = redact('x', { mode: 'blur', strength: 10 })
    const scene = sceneOf([node])
    const strengthAfter = (v: number): number =>
      (applyPatches(scene, setRedactStrength(scene, node, v).patches).nodes[0] as RedactNode)
        .strength
    expect(strengthAfter(0)).toBe(1)
    expect(strengthAfter(500)).toBe(40)
    expect(strengthAfter(7.5)).toBe(7.5)
  })

  it('البكسلة: تُقرَّب إلى عدد صحيح وتُحصَر', () => {
    const node = redact('x', { mode: 'pixelate', strength: 10 })
    const scene = sceneOf([node])
    const strengthAfter = (v: number): number =>
      (applyPatches(scene, setRedactStrength(scene, node, v).patches).nodes[0] as RedactNode)
        .strength
    expect(strengthAfter(1)).toBe(2)
    expect(strengthAfter(9.6)).toBe(10)
    expect(strengthAfter(1000)).toBe(64)
  })

  it('التغطية تُهمل الرقم — تبقى صفرًا', () => {
    const node = redact('x', { mode: 'cover' })
    const scene = sceneOf([node])
    const after = applyPatches(scene, setRedactStrength(scene, node, 30).patches)
      .nodes[0] as RedactNode
    expect(after.strength).toBe(0)
  })

  it('حجب مقفول لا تتبدّل شدّته', () => {
    const node = redact('x', { mode: 'blur', strength: 10, locked: true })
    expect(setRedactStrength(sceneOf([node]), node, 20).refusal).toBe('locked')
  })
})

describe('`setCoverToken`', () => {
  it('يغيّر اللون ويحفظ الباقي', () => {
    const node = redact('x', { mode: 'pixelate', strength: 9 })
    const scene = sceneOf([node])
    const { patches, refusal } = setCoverToken(scene, node, 'status/danger/solid')
    expect(refusal).toBeNull()
    const after = applyPatches(scene, patches).nodes[0] as RedactNode
    expect(after.coverToken).toBe('status/danger/solid')
    expect(after.mode).toBe('pixelate')
    expect(after.strength).toBe(9)
    roundTrips(scene, [...patches])
  })

  it('حجب مقفول لا يتبدّل لونه', () => {
    const node = redact('x', { locked: true })
    expect(setCoverToken(sceneOf([node]), node, 'status/success/solid').refusal).toBe('locked')
  })
})

describe('`setPinShape`', () => {
  it('لا دبابيس والشكل نفسه ⇒ لا فروق', () => {
    expect(setPinShape(sceneOf([rect('a')]), 'circle')).toEqual({ patches: [], refusal: null })
  })

  it('شكل جديد: فرق جذر أوّلًا ثمّ فرق لكل دبّوس مخالف', () => {
    const scene = sceneOf([pin('p1', 1), rect('r'), pin('p2', 2)])
    const { patches, refusal } = setPinShape(scene, 'square')
    expect(refusal).toBeNull()
    expect(patches[0]).toEqual({
      op: 'root',
      patch: { field: 'pinShape', before: 'circle', after: 'square' },
    })
    expect(patches).toHaveLength(3)

    const after = applyPatches(scene, patches)
    expect(after.meta.pinShape).toBe('square')
    expect(pinsByOrdinal(after).map((p) => p.shape)).toEqual(['square', 'square'])
    // المستطيل لم يُمسّ — الاستبدال بالمرجع نفسه.
    expect(after.nodes[1]).toBe(scene.nodes[1])
    roundTrips(scene, [...patches])
  })

  it('دبّوس بالشكل المطلوب أصلًا لا يُصدِر فرقًا', () => {
    const scene = sceneOf([pin('p1', 1, { shape: 'square' }), pin('p2', 2)])
    const { patches } = setPinShape(scene, 'square')
    // جذر + p2 وحده.
    expect(patches).toHaveLength(2)
    expect(patches[1]).toMatchObject({ op: 'replace', index: 1 })
  })

  it('**يُحدِّث الدبابيس القائمة ولو كان الجذر على الشكل نفسه**', () => {
    // جذر `circle` ودبّوس شاذّ `pin`: لا فرق جذر، وفرق واحد للدبّوس.
    const scene = sceneOf([pin('p1', 1, { shape: 'pin' })])
    const { patches } = setPinShape(scene, 'circle')
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({ op: 'replace', index: 0 })
    expect(applyPatches(scene, patches).nodes[0]).toMatchObject({ shape: 'circle' })
  })

  it('الجذر وحده حين لا دبابيس', () => {
    const { patches } = setPinShape(sceneOf([rect('a')]), 'pin')
    expect(patches).toEqual([
      { op: 'root', patch: { field: 'pinShape', before: 'circle', after: 'pin' } },
    ])
  })
})
