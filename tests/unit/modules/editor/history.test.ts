import { describe, expect, it } from 'vitest'

import { applyPatches, coalesce, invertPatches, type Patch } from '@/modules/editor/commands'
import { createHistory, HISTORY_LIMIT } from '@/modules/editor/history'
import { movePinOrdinal, pinsByOrdinal, setPinStart } from '@/modules/editor/pins'
import {
  asNodeId,
  type AnnotationColor,
  type NodeId,
  type NoteNode,
  type PinNode,
  type RectNode,
  type Scene,
  type SceneNode,
} from '@/modules/editor/scene'
import { addNode, deleteNodes, replaceNode, setCrop } from '@/modules/editor/scene-ops'
import { emptyScene } from '@/modules/editor/scene-schema'
import { deviceRect, devicePoint } from '@/shared/geometry'

/**
 * التاريخ — والحالة التي بُني لها.
 *
 * كل ما يلي يجري **بلا بكسل واحد**: بيئة الاختبار بلا سياق 2D بالقياس، وهذا
 * ما فرض أن يكون النموذج قابلًا للاختبار كاملًا بمعزل عن الرسم.
 */

const COLOR: AnnotationColor = 'tool/annotate/solid'

const stroke = () => ({ colorToken: COLOR, widthPx: 3, dash: [], opacity: 1 }) as const

function pin(id: string, ordinal: number, noteId: NodeId | null = null): PinNode {
  return {
    kind: 'pin',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke: stroke(),
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
    stroke: stroke(),
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

function rect(id: string, x: number): RectNode {
  return {
    kind: 'rect',
    id: asNodeId(id),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke: stroke(),
    rect: deviceRect(x, 0, 50, 50),
    radiusPx: 0,
    fill: 'none',
  }
}

const base = (): Scene => emptyScene({ captureId: 'cap', width: 800, height: 600, dpr: 2 })

/** يبني مشهد الحالة الصعبة: خمسة دبابيس، كلٌّ بملاحظته. */
function fivePinsWithNotes(): Scene {
  let scene = base()
  const nodes: SceneNode[] = []
  for (let i = 1; i <= 5; i++) {
    const noteId = asNodeId(`note-${i}`)
    nodes.push(pin(`pin-${i}`, i, noteId))
    nodes.push(note(`note-${i}`, asNodeId(`pin-${i}`)))
  }
  scene = { ...scene, nodes }
  return scene
}

describe('العمليات الأساسية', () => {
  it('الإضافة تُدرج في الأعلى', () => {
    const scene = base()
    const { patches, refusal } = addNode(scene, rect('r1', 0))
    expect(refusal).toBeNull()
    const next = applyPatches(scene, patches)
    expect(next.nodes).toHaveLength(1)
  })

  it('الحذف يرفض المقفول ويعلن السبب', () => {
    const scene = { ...base(), nodes: [{ ...rect('r1', 0), locked: true }] }
    expect(deleteNodes(scene, [asNodeId('r1')]).refusal).toBe('locked')
  })

  it('الحذف يرفض ما لا وجود له', () => {
    expect(deleteNodes(base(), [asNodeId('ghost')]).refusal).toBe('not-found')
  })
})

describe('**الحالة الصعبة**: حذف دبّوس من خمسة بترقيم تلقائي وملاحظات مربوطة', () => {
  it('الحذف يُعيد الترقيم ويفكّ الرابط', () => {
    const scene = fivePinsWithNotes()
    const { patches } = deleteNodes(scene, [asNodeId('pin-3'), asNodeId('note-3')])
    const after = applyPatches(scene, patches)

    const ordinals = pinsByOrdinal(after).map((p) => p.ordinal)
    expect(ordinals).toEqual([1, 2, 3, 4])

    // الدبّوس الذي كان الرابع صار الثالث — ورابطه بملاحظته لم يتغيّر.
    const third = pinsByOrdinal(after)[2]
    expect(third?.id).toBe('pin-4')
    expect(third?.noteId).toBe('note-4')
  })

  it('**والتراجع يعيد الحالة مطابقةً حقلًا بحقل**', () => {
    const scene = fivePinsWithNotes()
    const { patches } = deleteNodes(scene, [asNodeId('pin-3'), asNodeId('note-3')])
    const after = applyPatches(scene, patches)
    const back = applyPatches(after, invertPatches(patches))
    expect(back).toEqual(scene)
  })

  it('حذف الملاحظة وحدها يفكّ مرجعها من الدبّوس، والتراجع يعيده', () => {
    const scene = fivePinsWithNotes()
    const { patches } = deleteNodes(scene, [asNodeId('note-2')])
    const after = applyPatches(scene, patches)

    const p2 = after.nodes.find((n) => n.id === 'pin-2') as PinNode
    expect(p2.noteId).toBeNull()

    const back = applyPatches(after, invertPatches(patches))
    expect(back).toEqual(scene)
  })

  it('**الربط بالهوية لا بالرقم** — بعد التراجع تبقى كل ملاحظة مع دبّوسها', () => {
    const scene = fivePinsWithNotes()
    const { patches } = deleteNodes(scene, [asNodeId('pin-1'), asNodeId('note-1')])
    const back = applyPatches(applyPatches(scene, patches), invertPatches(patches))

    for (const p of back.nodes.filter((n): n is PinNode => n.kind === 'pin')) {
      const suffix = p.id.split('-')[1]
      expect(p.noteId).toBe(`note-${suffix}`)
    }
  })

  it('حذف دبّوسين معًا — الفهارس تنازلية فلا تنزاح', () => {
    const scene = fivePinsWithNotes()
    const { patches } = deleteNodes(scene, [asNodeId('pin-2'), asNodeId('pin-4')])
    const after = applyPatches(scene, patches)
    expect(pinsByOrdinal(after).map((p) => p.id)).toEqual(['pin-1', 'pin-3', 'pin-5'])
    expect(pinsByOrdinal(after).map((p) => p.ordinal)).toEqual([1, 2, 3])
    expect(applyPatches(after, invertPatches(patches))).toEqual(scene)
  })
})

describe('ترتيب الأرقام مستقلّ عن ترتيب الرسم', () => {
  it('`movePinOrdinal` يغيّر الأرقام ولا يمسّ مواضع العقد', () => {
    const scene = fivePinsWithNotes()
    const patches = movePinOrdinal(scene, asNodeId('pin-5'), 0)
    const after = applyPatches(scene, patches)

    expect(pinsByOrdinal(after).map((p) => p.id)).toEqual([
      'pin-5',
      'pin-1',
      'pin-2',
      'pin-3',
      'pin-4',
    ])
    // مواضع العقد في المصفوفة لم تتغيّر — ترتيب الرسم محفوظ.
    expect(after.nodes.map((n) => n.id)).toEqual(scene.nodes.map((n) => n.id))
    expect(applyPatches(after, invertPatches(patches))).toEqual(scene)
  })

  it('`setPinStart` يزيح الجميع، والتراجع يعيدهم', () => {
    const scene = fivePinsWithNotes()
    const patches = setPinStart(scene, 10)
    const after = applyPatches(scene, patches)
    expect(after.meta.pinStart).toBe(10)
    expect(pinsByOrdinal(after).map((p) => p.ordinal)).toEqual([10, 11, 12, 13, 14])
    expect(applyPatches(after, invertPatches(patches))).toEqual(scene)
  })
})

describe('الدمج داخل العلامة', () => {
  it('**يدمج على مستوى المعرّف لا التتالي** — سحبُ تحديد متعدّد', () => {
    let scene = base()
    scene = { ...scene, nodes: [rect('a', 0), rect('b', 100)] }

    // كل «إطار» يمسّ العقدتين معًا، فلا `replace` متتاليتان على العقدة نفسها.
    const patches: Patch[] = []
    for (let frame = 1; frame <= 20; frame++) {
      const cur = applyPatches(scene, patches)
      for (const id of ['a', 'b']) {
        const index = cur.nodes.findIndex((n) => n.id === id)
        const before = cur.nodes[index] as RectNode
        patches.push({
          op: 'replace',
          index,
          before,
          after: { ...before, rect: deviceRect(before.rect.x + 1, 0, 50, 50) },
        })
      }
    }

    expect(patches).toHaveLength(40)
    const merged = coalesce(patches)
    // اثنان لا أربعون — واحد لكل معرّف.
    expect(merged).toHaveLength(2)

    // والنتيجة النهائية واحدة سواء دُمج أو لم يُدمج.
    expect(applyPatches(scene, merged)).toEqual(applyPatches(scene, patches))
    expect(applyPatches(applyPatches(scene, merged), invertPatches(merged))).toEqual(scene)
  })

  it('لا يدمج ما بعد الحذف — الحذف يقطع السلسلة', () => {
    const scene = { ...base(), nodes: [rect('a', 0)] }
    const a = scene.nodes[0] as RectNode
    const patches: Patch[] = [
      { op: 'replace', index: 0, before: a, after: { ...a, radiusPx: 4 } },
      { op: 'remove', index: 0, node: { ...a, radiusPx: 4 } },
      { op: 'insert', index: 0, node: { ...a, radiusPx: 9 } },
    ]
    expect(coalesce(patches)).toHaveLength(3)
  })

  it('يدمج تغييرات الجذر المتكرّرة ويحفظ أوّل `before`', () => {
    const scene = base()
    const p1 = setCrop(scene, deviceRect(0, 0, 10, 10)).patches
    const mid = applyPatches(scene, p1)
    const p2 = setCrop(mid, deviceRect(0, 0, 20, 20)).patches
    const merged = coalesce([...p1, ...p2])
    expect(merged).toHaveLength(1)
    expect(applyPatches(applyPatches(scene, merged), invertPatches(merged))).toEqual(scene)
  })
})

describe('مكدّس التاريخ', () => {
  it('العلامة تجمع الفروق خطوةً واحدة', () => {
    const scene = { ...base(), nodes: [rect('a', 0)] }
    const h = createHistory(scene, { now: () => 0 })

    h.mark('تحريك')
    for (let i = 0; i < 10; i++) {
      const cur = h.state.scene
      const before = cur.nodes[0] as RectNode
      h.push([
        {
          op: 'replace',
          index: 0,
          before,
          after: { ...before, rect: deviceRect(before.rect.x + 1, 0, 50, 50) },
        },
      ])
    }
    h.commit()

    expect(h.state.past).toHaveLength(1)
    expect((h.state.scene.nodes[0] as RectNode).rect.x).toBe(10)

    h.undo()
    expect(h.state.scene).toEqual(scene)
    h.redo()
    expect((h.state.scene.nodes[0] as RectNode).rect.x).toBe(10)
  })

  it('`cancel` يتراجع عمّا دُفع ولا يُدرج علامة', () => {
    const scene = { ...base(), nodes: [rect('a', 0)] }
    const h = createHistory(scene, { now: () => 0 })
    h.mark('سحب')
    const before = scene.nodes[0] as RectNode
    h.push([
      { op: 'replace', index: 0, before, after: { ...before, rect: deviceRect(99, 0, 50, 50) } },
    ])
    h.cancel()
    expect(h.state.scene).toEqual(scene)
    expect(h.state.past).toHaveLength(0)
  })

  /**
   * خمسون علامة مختلطة — والمقارنة **بلقطة قبل كل علامة**، لا بعدّاد.
   *
   * بعض العمليات تُرفَض بحقّ (حذفٌ لمقفول، استبدالٌ لغير موجود) فلا تُنتج
   * فرقًا ولا تُدرَج علامةً. فربطُ اللقطات بعدد الدورات يقارن حالةً بحالة
   * أخرى ويُخفق — **في الاختبار لا في التاريخ**. اللقطة تُسجَّل حين ينمو
   * المكدّس، فتبقى المقارنة صادقة.
   */
  it('**خمسون علامة مختلطة تتراجع بالضبط**', () => {
    const h = createHistory(base(), { now: () => 0 })
    /** `before[k]` = المشهد قبل العلامة رقم `k` في المكدّس. */
    const before: Scene[] = []

    for (let i = 0; i < 60 && h.state.past.length < 50; i++) {
      const cur = h.state.scene
      const depth = h.state.past.length
      const kind = i % 5

      if (kind === 0 || cur.nodes.length === 0) {
        h.push(addNode(cur, rect(`r${i}`, i)).patches)
      } else if (kind === 1) {
        h.push(addNode(cur, pin(`p${i}`, 1)).patches)
      } else if (kind === 2) {
        const target = cur.nodes[0]
        if (target) h.push(deleteNodes(cur, [target.id]).patches)
      } else if (kind === 3) {
        const target = cur.nodes.find((n): n is RectNode => n.kind === 'rect')
        if (target) h.push(replaceNode(cur, { ...target, radiusPx: i }).patches)
      } else {
        h.push(setCrop(cur, deviceRect(0, 0, i + 1, i + 1)).patches)
      }

      if (h.state.past.length > depth) before.push(cur)
    }

    const steps = h.state.past.length
    expect(steps).toBe(50)

    const top = h.state.scene
    for (let k = steps - 1; k >= 0; k--) {
      h.undo()
      expect(h.state.scene).toEqual(before[k])
    }
    for (let k = 0; k < steps; k++) h.redo()
    expect(h.state.scene).toEqual(top)
  })

  it('السقف يقصّ الأقدم عند الإدراج لا عند القراءة', () => {
    const h = createHistory(base(), { now: () => 0, limit: 3 })
    for (let i = 0; i < 10; i++) {
      h.push(addNode(h.state.scene, rect(`r${i}`, i)).patches)
    }
    expect(h.state.past).toHaveLength(3)
    expect(HISTORY_LIMIT).toBe(50)
  })

  it('تحرير جديد يُبطل مسار الإعادة', () => {
    const h = createHistory(base(), { now: () => 0 })
    h.push(addNode(h.state.scene, rect('a', 0)).patches)
    h.undo()
    expect(h.canRedo).toBe(true)
    h.push(addNode(h.state.scene, rect('b', 0)).patches)
    expect(h.canRedo).toBe(false)
  })

  it('`⌘Z` أثناء سحب يغلق العلامة أوّلًا', () => {
    const scene = { ...base(), nodes: [rect('a', 0)] }
    const h = createHistory(scene, { now: () => 0 })
    h.mark('سحب')
    const before = scene.nodes[0] as RectNode
    h.push([
      { op: 'replace', index: 0, before, after: { ...before, rect: deviceRect(50, 0, 50, 50) } },
    ])
    h.undo()
    expect(h.state.scene).toEqual(scene)
  })
})
