import { describe, expect, it } from 'vitest'

import { applyPatches, invertPatches, type Patch } from '@/modules/editor/commands'
import {
  isPin,
  movePinOrdinal,
  noteOf,
  pinOf,
  pinsByOrdinal,
  renumber,
  setPinStart,
  unlinkPatchesFor,
} from '@/modules/editor/pins'
import {
  asNodeId,
  type NodeId,
  type NoteNode,
  type PinNode,
  type RectNode,
  type Scene,
  type SceneNode,
} from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { deviceRect, devicePoint } from '@/shared/geometry'

/**
 * الدبابيس المرقَّمة — الترقيم مخزَّن في العقدة، والربط بالمعرّف لا بالرقم.
 *
 * كل حالة تتحقّق مرّتين حيث يلزم: **ما تُصدِره الفروق** (فرقٌ لكل دبّوس
 * تغيّر رقمه لا للمقصود وحده)، ثمّ **أنها قابلة للعكس** — لأن هذا ما يفسد
 * عندما يُشتقّ العكس من الحالة الراهنة.
 */

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 3, dash: [], opacity: 1 } as const

function pin(id: string, ordinal: number, noteId: NodeId | null = null): PinNode {
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
    noteId,
    radiusPx: 13,
  }
}

function note(id: string, pinId: NodeId | null = null): NoteNode {
  return {
    kind: 'note',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    at: devicePoint(0, 0),
    widthPx: 200,
    title: `ملاحظة ${id}`,
    body: '',
    tag: null,
    font: { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 0 },
    paddingPx: 12,
    pinId,
  }
}

function rect(id: string): RectNode {
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
  }
}

function sceneOf(nodes: readonly SceneNode[], pinStart = 1): Scene {
  const base = emptyScene({ captureId: 'cap', width: 800, height: 600, dpr: 2, pinStart })
  return { ...base, nodes }
}

/** أرقام الدبابيس بترتيب الرقم، مقترنةً بمعرّفاتها. */
const ordinalsById = (scene: Scene): Array<[string, number]> =>
  pinsByOrdinal(scene).map((p) => [p.id, p.ordinal])

/** هوية الفرق `replace` على معرّف — يُستخرج منها الرقم الجديد. */
const replacedIds = (patches: readonly Patch[]): string[] =>
  patches.flatMap((p) => (p.op === 'replace' ? [p.after.id] : []))

describe('`pinsByOrdinal`', () => {
  it('يرتّب بالرقم لا بترتيب الرسم', () => {
    const scene = sceneOf([pin('c', 3), rect('r'), pin('a', 1), pin('b', 2)])
    expect(pinsByOrdinal(scene).map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('يتجاهل ما ليس دبّوسًا', () => {
    const scene = sceneOf([rect('r'), note('n'), pin('a', 1)])
    expect(pinsByOrdinal(scene).map((p) => p.id)).toEqual(['a'])
  })

  it('**لا يمسّ ترتيب المصفوفة الأصلية** — الترتيب على نسخة', () => {
    const scene = sceneOf([pin('c', 3), pin('a', 1)])
    pinsByOrdinal(scene)
    expect(scene.nodes.map((n) => n.id)).toEqual(['c', 'a'])
  })

  it('مشهد بلا دبابيس يعطي قائمة فارغة', () => {
    expect(pinsByOrdinal(sceneOf([rect('r')]))).toEqual([])
  })
})

describe('`renumber`', () => {
  it('أرقام متتابعة أصلًا لا تُصدِر فروقًا', () => {
    const scene = sceneOf([pin('a', 1), pin('b', 2), pin('c', 3)])
    expect(renumber(scene)).toEqual([])
  })

  it('فجوة في التسلسل تُسدّ، وتُصدَر الفروق لمن تغيّر رقمه وحده', () => {
    // الرقم ٢ غاب: الثالث والرابع يتقدّمان، والأوّل لا يُمسّ.
    const scene = sceneOf([pin('a', 1), pin('c', 3), pin('d', 4)])
    const patches = renumber(scene)

    expect(replacedIds(patches)).toEqual(['c', 'd'])
    const after = applyPatches(scene, patches)
    expect(ordinalsById(after)).toEqual([
      ['a', 1],
      ['c', 2],
      ['d', 3],
    ])
  })

  it('يبدأ من `meta.pinStart` لا من الواحد', () => {
    const scene = sceneOf([pin('a', 1), pin('b', 2)], 7)
    const after = applyPatches(scene, renumber(scene))
    expect(ordinalsById(after)).toEqual([
      ['a', 7],
      ['b', 8],
    ])
  })

  it('الفرق يحمل العقدة قبل التغيير وبعده — كي يُعكَس بلا اشتقاق', () => {
    const scene = sceneOf([pin('a', 5)])
    const [patch] = renumber(scene)
    expect(patch).toMatchObject({ op: 'replace', index: 0 })
    if (patch?.op !== 'replace') throw new Error('فرق استبدال متوقّع')
    expect((patch.before as PinNode).ordinal).toBe(5)
    expect((patch.after as PinNode).ordinal).toBe(1)
  })

  it('الفهرس هو موضع الدبّوس في مصفوفة المشهد لا في ترتيب الأرقام', () => {
    // الدبّوس صاحب الرقم الأدنى يقع آخر المصفوفة.
    const scene = sceneOf([rect('r'), pin('late', 9), pin('early', 8)])
    const patches = renumber(scene)
    const byId = new Map(patches.flatMap((p) => (p.op === 'replace' ? [[p.after.id, p]] : [])))
    expect(byId.get(asNodeId('early'))).toMatchObject({ index: 2 })
    expect(byId.get(asNodeId('late'))).toMatchObject({ index: 1 })
  })

  it('ترتيب الرسم لا يتغيّر — العقد غير الدبابيس تبقى في مواضعها', () => {
    const scene = sceneOf([pin('b', 4), rect('r'), pin('a', 2)])
    const after = applyPatches(scene, renumber(scene))
    expect(after.nodes.map((n) => n.id)).toEqual(['b', 'r', 'a'])
    expect(ordinalsById(after)).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('**والعكس يعيد الأرقام القديمة كلّها**', () => {
    const scene = sceneOf([pin('a', 4), pin('b', 9), pin('c', 20)])
    const patches = renumber(scene)
    expect(patches).toHaveLength(3)
    expect(applyPatches(applyPatches(scene, patches), invertPatches(patches))).toEqual(scene)
  })

  it('مشهد بلا دبابيس لا يُصدِر شيئًا', () => {
    expect(renumber(sceneOf([rect('r')]))).toEqual([])
  })
})

describe('`movePinOrdinal`', () => {
  const five = (): Scene => sceneOf([1, 2, 3, 4, 5].map((i) => pin(`p${i}`, i)))

  it('دبّوس مجهول المعرّف لا يُصدِر شيئًا', () => {
    expect(movePinOrdinal(five(), asNodeId('ghost'), 0)).toEqual([])
  })

  it('العقدة الموجودة لكنها ليست دبّوسًا تُعامَل كمجهولة', () => {
    const scene = sceneOf([rect('r'), pin('a', 1), pin('b', 2)])
    expect(movePinOrdinal(scene, asNodeId('r'), 1)).toEqual([])
  })

  it('النقل إلى موضعه الحالي لا يُصدِر شيئًا', () => {
    expect(movePinOrdinal(five(), asNodeId('p3'), 2)).toEqual([])
  })

  it('النقل إلى الأمام يزيح من بينهما إلى الخلف', () => {
    const scene = five()
    const patches = movePinOrdinal(scene, asNodeId('p2'), 3)
    // p2 صار الرابع، وp3 وp4 تقدّما.
    expect(ordinalsById(applyPatches(scene, patches))).toEqual([
      ['p1', 1],
      ['p3', 2],
      ['p4', 3],
      ['p2', 4],
      ['p5', 5],
    ])
    // لا فرق لمن لم يتحرّك رقمه.
    expect(replacedIds(patches).sort()).toEqual(['p2', 'p3', 'p4'])
  })

  it('النقل إلى الخلف يزيح من بينهما إلى الأمام', () => {
    const scene = five()
    const after = applyPatches(scene, movePinOrdinal(scene, asNodeId('p4'), 1))
    expect(ordinalsById(after)).toEqual([
      ['p1', 1],
      ['p4', 2],
      ['p2', 3],
      ['p3', 4],
      ['p5', 5],
    ])
  })

  it('موضع أكبر من العدد يُحصَر عند الأخير', () => {
    const scene = five()
    const after = applyPatches(scene, movePinOrdinal(scene, asNodeId('p1'), 99))
    expect(pinsByOrdinal(after).map((p) => p.id)).toEqual(['p2', 'p3', 'p4', 'p5', 'p1'])
  })

  it('موضع سالب يُحصَر عند الأوّل', () => {
    const scene = five()
    const after = applyPatches(scene, movePinOrdinal(scene, asNodeId('p5'), -4))
    expect(pinsByOrdinal(after).map((p) => p.id)).toEqual(['p5', 'p1', 'p2', 'p3', 'p4'])
  })

  it('محصور عند الموضع الحالي بعد الحصر — لا فروق', () => {
    // الأخير يُطلب نقله إلى ما بعد الأخير: الحصر يعيده إلى موضعه.
    expect(movePinOrdinal(five(), asNodeId('p5'), 40)).toEqual([])
  })

  it('يحترم `pinStart` عند توزيع الأرقام', () => {
    const scene = sceneOf([pin('a', 10), pin('b', 11), pin('c', 12)], 10)
    const after = applyPatches(scene, movePinOrdinal(scene, asNodeId('c'), 0))
    expect(ordinalsById(after)).toEqual([
      ['c', 10],
      ['a', 11],
      ['b', 12],
    ])
  })

  it('يصلح تسلسلًا فيه فجوة أثناء النقل — الأرقام تعود متتابعة', () => {
    const scene = sceneOf([pin('a', 2), pin('b', 5), pin('c', 9)])
    const after = applyPatches(scene, movePinOrdinal(scene, asNodeId('c'), 0))
    expect(ordinalsById(after)).toEqual([
      ['c', 1],
      ['a', 2],
      ['b', 3],
    ])
  })

  it('**لا يمسّ ترتيب الرسم** والعكس يعيد المشهد بحقوله', () => {
    const scene = sceneOf([pin('p1', 1), rect('r'), pin('p2', 2), pin('p3', 3)])
    const patches = movePinOrdinal(scene, asNodeId('p3'), 0)
    const after = applyPatches(scene, patches)
    expect(after.nodes.map((n) => n.id)).toEqual(scene.nodes.map((n) => n.id))
    expect(applyPatches(after, invertPatches(patches))).toEqual(scene)
  })
})

describe('`setPinStart`', () => {
  it('البداية نفسها لا تُصدِر شيئًا', () => {
    expect(setPinStart(sceneOf([pin('a', 1)]), 1)).toEqual([])
  })

  it('فرق الجذر أوّلًا ثمّ فروق الدبابيس', () => {
    const scene = sceneOf([pin('a', 1), pin('b', 2)])
    const patches = setPinStart(scene, 5)
    expect(patches[0]).toEqual({
      op: 'root',
      patch: { field: 'pinStart', before: 1, after: 5 },
    })
    expect(patches).toHaveLength(3)
  })

  it('**تغيير البداية يزيح كل الأرقام المخزَّنة** لا الجذر وحده', () => {
    const scene = sceneOf([pin('a', 1), pin('b', 2), pin('c', 3)])
    const after = applyPatches(scene, setPinStart(scene, 0))
    expect(after.meta.pinStart).toBe(0)
    expect(ordinalsById(after)).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
  })

  it('دبّوس رقمه مطابق للبداية الجديدة لا يُصدِر فرقًا', () => {
    // الترتيب (a=3, b=4): بداية 3 لا تمسّ a، وتُبقي b عند 4.
    const scene = sceneOf([pin('a', 3), pin('b', 4)], 1)
    const patches = setPinStart(scene, 3)
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({ op: 'root' })
  })

  it('مشهد بلا دبابيس: فرق الجذر وحده', () => {
    const patches = setPinStart(sceneOf([rect('r')]), 4)
    expect(patches).toEqual([{ op: 'root', patch: { field: 'pinStart', before: 1, after: 4 } }])
  })

  it('يُرقِّم بترتيب الأرقام لا بترتيب المصفوفة', () => {
    const scene = sceneOf([pin('late', 2), pin('early', 1)])
    const after = applyPatches(scene, setPinStart(scene, 20))
    expect(ordinalsById(after)).toEqual([
      ['early', 20],
      ['late', 21],
    ])
  })

  it('والعكس يعيد البداية والأرقام معًا', () => {
    const scene = sceneOf([pin('a', 1), pin('b', 2)])
    const patches = setPinStart(scene, 10)
    expect(applyPatches(applyPatches(scene, patches), invertPatches(patches))).toEqual(scene)
  })
})

describe('`unlinkPatchesFor`', () => {
  const linked = (): Scene =>
    sceneOf([
      pin('p1', 1, asNodeId('n1')),
      note('n1', asNodeId('p1')),
      pin('p2', 2, asNodeId('n2')),
      note('n2', asNodeId('p2')),
    ])

  it('حذف الملاحظة يفكّ مرجعها من الدبّوس الباقي', () => {
    const scene = linked()
    const patches = unlinkPatchesFor(scene, new Set([asNodeId('n1')]))
    expect(patches).toHaveLength(1)
    const [patch] = patches
    if (patch?.op !== 'replace') throw new Error('فرق استبدال متوقّع')
    expect(patch.index).toBe(0)
    expect((patch.before as PinNode).noteId).toBe('n1')
    expect((patch.after as PinNode).noteId).toBeNull()
  })

  it('حذف الدبّوس يفكّ مرجعه من الملاحظة الباقية', () => {
    const scene = linked()
    const patches = unlinkPatchesFor(scene, new Set([asNodeId('p2')]))
    expect(patches).toHaveLength(1)
    const [patch] = patches
    if (patch?.op !== 'replace') throw new Error('فرق استبدال متوقّع')
    expect(patch.index).toBe(3)
    expect((patch.before as NoteNode).pinId).toBe('p2')
    expect((patch.after as NoteNode).pinId).toBeNull()
  })

  it('حذف الطرفين معًا لا يُصدِر فروقًا — لا شيء باقٍ يُفَكّ', () => {
    const scene = linked()
    const patches = unlinkPatchesFor(scene, new Set([asNodeId('p1'), asNodeId('n1')]))
    expect(patches).toEqual([])
  })

  it('ما لا صلة له بالمحذوف لا يُمسّ', () => {
    const scene = linked()
    const patches = unlinkPatchesFor(scene, new Set([asNodeId('n1')]))
    expect(replacedIds(patches)).toEqual(['p1'])
  })

  it('دبّوس بلا ملاحظة وملاحظة بلا دبّوس لا يُصدِران شيئًا', () => {
    const scene = sceneOf([pin('p', 1), note('n'), rect('r')])
    expect(unlinkPatchesFor(scene, new Set([asNodeId('r')]))).toEqual([])
  })

  it('مجموعة محذوفات لا وجود لها في المشهد لا تُصدِر شيئًا', () => {
    expect(unlinkPatchesFor(linked(), new Set([asNodeId('ghost')]))).toEqual([])
  })

  it('محذوفات عديدة تُفَكّ الروابط المعلَّقة كلّها', () => {
    const scene = linked()
    const patches = unlinkPatchesFor(scene, new Set([asNodeId('n1'), asNodeId('p2')]))
    expect(replacedIds(patches).sort()).toEqual(['n2', 'p1'])
    const after = applyPatches(scene, patches)
    const p1 = after.nodes.find((n) => n.id === 'p1') as PinNode
    const n2 = after.nodes.find((n) => n.id === 'n2') as NoteNode
    expect(p1.noteId).toBeNull()
    expect(n2.pinId).toBeNull()
  })

  it('العكس يعيد الروابط', () => {
    const scene = linked()
    const patches = unlinkPatchesFor(scene, new Set([asNodeId('n1')]))
    const after = applyPatches(scene, patches)
    expect(applyPatches(after, invertPatches(patches))).toEqual(scene)
  })
})

describe('`noteOf` و`pinOf`', () => {
  const scene = sceneOf([
    pin('p1', 1, asNodeId('n1')),
    note('n1', asNodeId('p1')),
    pin('lonely', 2),
    note('orphan'),
  ])
  const nodeAt = <T extends SceneNode>(id: string): T => scene.nodes.find((n) => n.id === id) as T

  it('`noteOf` يعطي الملاحظة المربوطة', () => {
    expect(noteOf(scene, nodeAt<PinNode>('p1'))?.id).toBe('n1')
  })

  it('`noteOf` يعطي `null` لدبّوس بلا ملاحظة', () => {
    expect(noteOf(scene, nodeAt<PinNode>('lonely'))).toBeNull()
  })

  it('**`noteOf` يعطي `null` لمرجع معلَّق** — الملاحظة غير موجودة', () => {
    const dangling = pin('d', 3, asNodeId('gone'))
    expect(noteOf(scene, dangling)).toBeNull()
  })

  it('`noteOf` لا يعطي عقدة من نوع آخر بالمعرّف نفسه', () => {
    // المعرّف يطابق مستطيلًا لا ملاحظة.
    const withRect = sceneOf([rect('shared')])
    expect(noteOf(withRect, pin('p', 1, asNodeId('shared')))).toBeNull()
  })

  it('`pinOf` يعطي الدبّوس المربوط', () => {
    expect(pinOf(scene, nodeAt<NoteNode>('n1'))?.id).toBe('p1')
  })

  it('`pinOf` يعطي `null` لملاحظة بلا دبّوس', () => {
    expect(pinOf(scene, nodeAt<NoteNode>('orphan'))).toBeNull()
  })

  it('**`pinOf` يعطي `null` لمرجع معلَّق**', () => {
    expect(pinOf(scene, note('x', asNodeId('gone')))).toBeNull()
  })

  it('`pinOf` لا يعطي عقدة من نوع آخر بالمعرّف نفسه', () => {
    const withRect = sceneOf([rect('shared')])
    expect(pinOf(withRect, note('n', asNodeId('shared')))).toBeNull()
  })
})

describe('`isPin`', () => {
  it('يميّز الدبّوس من غيره ويصلح مرشِّحًا', () => {
    const nodes: SceneNode[] = [pin('a', 1), rect('r'), note('n'), pin('b', 2)]
    expect(nodes.filter(isPin).map((n) => n.id)).toEqual(['a', 'b'])
    expect(isPin(rect('r'))).toBe(false)
    expect(isPin(pin('a', 1))).toBe(true)
  })
})
