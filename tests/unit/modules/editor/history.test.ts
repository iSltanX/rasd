import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyPatches, coalesce, invertPatches, type Patch } from '@/modules/editor/commands'
import { createHistory, HISTORY_LIMIT, type History } from '@/modules/editor/history'
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

/*
 * حالات الحواف — ما يفسد بصمت: علامة تُغلَق في غير موضعها، أو تُبطَل الإعادة
 * بلا سبب، أو يتسرّب التاريخ بلا سقف. كل حالة تقرأ المكدّس نفسه لا اللقطة
 * وحدها، لأن مكدّسًا مكسورًا مع مشهدٍ سليم يظهر بعد خطوتين.
 */

/** فرق يحرّك أوّل مستطيل إلى `x` من حالته الراهنة في التاريخ. */
function shift(h: History, x: number): Patch {
  const before = h.state.scene.nodes[0] as RectNode
  return {
    op: 'replace',
    index: 0,
    before,
    after: { ...before, rect: deviceRect(x, 0, 50, 50) },
  }
}

const xOf = (h: History): number => (h.state.scene.nodes[0] as RectNode).rect.x

/** تاريخ فوق مشهد فيه مستطيل واحد، بساعة حتمية. */
const withRect = (options: Parameters<typeof createHistory>[1] = { now: () => 0 }): History =>
  createHistory({ ...base(), nodes: [rect('a', 0)] }, options)

describe('الساعة', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('**بلا ساعة محقونة تُختم العلامة بالوقت الراهن**', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_700_000_000_000)
    const h = createHistory({ ...base(), nodes: [rect('a', 0)] })
    h.push([shift(h, 5)])
    expect(h.state.past[0]?.at).toBe(1_700_000_000_000)
  })

  it('الساعة المحقونة تختم كل علامة بقيمتها لحظة إدراجها', () => {
    let t = 1000
    const h = withRect({ now: () => t })
    h.mark('أولى')
    h.push([shift(h, 1)])
    h.commit()
    t = 2000
    h.push([shift(h, 2)])
    expect(h.state.past.map((m) => m.at)).toEqual([1000, 2000])
  })
})

describe('فتح العلامات وإغلاقها', () => {
  it('`mark` فوق علامة مفتوحة يغلق الأولى ويُدرجها أوّلًا', () => {
    const h = withRect()
    h.mark('أولى')
    h.push([shift(h, 10)])
    h.mark('ثانية')
    // الأولى أُدرجت والثانية ما زالت مفتوحة بلا فروق.
    expect(h.state.past.map((m) => m.label)).toEqual(['أولى'])
    h.push([shift(h, 20)])
    h.commit()
    expect(h.state.past.map((m) => m.label)).toEqual(['أولى', 'ثانية'])

    h.undo()
    expect(xOf(h)).toBe(10)
    h.undo()
    expect(xOf(h)).toBe(0)
  })

  it('`push` بفروق فارغة لا يفعل شيئًا: لا علامة ولا مسّ بالإعادة', () => {
    const h = withRect()
    h.push([shift(h, 30)])
    h.undo()
    expect(h.canRedo).toBe(true)

    const scene = h.state.scene
    h.push([])
    expect(h.state.scene).toBe(scene)
    expect(h.state.past).toHaveLength(0)
    expect(h.canRedo).toBe(true)
  })

  it('`push` فارغ داخل علامة مفتوحة لا يفتح فروقًا فيها', () => {
    const h = withRect()
    h.mark('سحب')
    h.push([])
    expect(h.canUndo).toBe(false)
    h.commit()
    expect(h.state.past).toHaveLength(0)
  })

  it('دفعٌ بلا علامة يصير علامةً مفردة بوسم فارغ ويدمج فروقه', () => {
    const h = withRect()
    const start = h.state.scene.nodes[0] as RectNode
    const mid = { ...start, rect: deviceRect(5, 0, 50, 50) }
    const last = { ...start, rect: deviceRect(9, 0, 50, 50) }
    h.push([
      { op: 'replace', index: 0, before: start, after: mid },
      { op: 'replace', index: 0, before: mid, after: last },
    ])

    expect(h.state.past).toHaveLength(1)
    expect(h.state.past[0]?.label).toBe('')
    // فرقان على المعرّف نفسه ⇒ فرق واحد بعد الدمج.
    expect(h.state.past[0]?.patches).toHaveLength(1)
    expect(xOf(h)).toBe(9)
    h.undo()
    expect(xOf(h)).toBe(0)
  })

  it('`commit` بلا علامة مفتوحة لا يفعل شيئًا', () => {
    const h = withRect()
    h.commit()
    expect(h.state.past).toHaveLength(0)
    expect(h.canUndo).toBe(false)
  })

  it('**علامة بلا فروق لا تُدرَج ولا تُبطل مسار الإعادة**', () => {
    const h = withRect()
    h.push([shift(h, 40)])
    h.undo()
    expect(h.canRedo).toBe(true)

    h.mark('نقرة بلا سحب')
    h.commit()
    expect(h.state.past).toHaveLength(0)
    expect(h.canRedo).toBe(true)
    h.redo()
    expect(xOf(h)).toBe(40)
  })

  it('علامة مغلقة بفروق تُبطل مسار الإعادة', () => {
    const h = withRect()
    h.push([shift(h, 40)])
    h.undo()
    h.mark('تحريك')
    h.push([shift(h, 7)])
    h.commit()
    expect(h.canRedo).toBe(false)
    expect(h.redoLabel).toBeNull()
  })

  it('**علامة تُغلَق بـ`commit` لا تستقبل فروقًا لاحقة** — الدفع بعدها علامة مفردة', () => {
    const h = withRect()
    h.mark('سحب')
    h.push([shift(h, 5)])
    h.commit()
    h.push([shift(h, 6)])
    expect(h.state.past.map((m) => m.label)).toEqual(['سحب', ''])
    expect(h.state.past[0]?.patches).toHaveLength(1)
  })
})

describe('الإلغاء', () => {
  it('`cancel` بلا علامة مفتوحة لا يتراجع عن شيء مُدرَج', () => {
    const h = withRect()
    h.push([shift(h, 15)])
    h.cancel()
    expect(xOf(h)).toBe(15)
    expect(h.state.past).toHaveLength(1)
  })

  it('`cancel` لعلامة فارغة يغلقها بلا أثر، والدفع بعده علامة مفردة', () => {
    const h = withRect()
    h.mark('سحب')
    h.cancel()
    h.push([shift(h, 8)])
    // لو بقيت العلامة القديمة مفتوحة لدخل الفرق فيها ولم يُدرَج شيء.
    expect(h.state.past).toHaveLength(1)
    expect(h.state.past[0]?.label).toBe('')
    expect(xOf(h)).toBe(8)
  })

  it('`cancel` لعدّة فروق يعكسها بترتيبها ويعيد المشهد حقلًا بحقل', () => {
    const scene = { ...base(), nodes: [rect('a', 0)] }
    const h = createHistory(scene, { now: () => 0 })
    h.mark('سحب وإضافة')
    h.push(addNode(h.state.scene, rect('b', 100)).patches)
    h.push([shift(h, 30)])
    h.push(deleteNodes(h.state.scene, [asNodeId('b')]).patches)
    h.cancel()
    expect(h.state.scene).toEqual(scene)
    expect(h.state.past).toHaveLength(0)
    expect(h.canUndo).toBe(false)
  })

  it('**الإلغاء لا يفقد مسار الإعادة** — لم يُدرَج شيء يُبطله', () => {
    const h = withRect()
    h.push([shift(h, 12)])
    h.undo()
    h.mark('سحب')
    h.push([shift(h, 99)])
    h.cancel()
    expect(xOf(h)).toBe(0)
    expect(h.canRedo).toBe(true)
    h.redo()
    expect(xOf(h)).toBe(12)
  })

  it('علامة أُلغيت لا تُعاد فتحها بـ`commit` لاحق', () => {
    const h = withRect()
    h.mark('سحب')
    h.push([shift(h, 3)])
    h.cancel()
    h.commit()
    expect(h.state.past).toHaveLength(0)
    expect(xOf(h)).toBe(0)
  })
})

describe('التراجع والإعادة', () => {
  it('على مكدّس فارغ لا يفعلان شيئًا ولا يغيّران المشهد', () => {
    const h = withRect()
    const scene = h.state.scene
    h.undo()
    h.redo()
    expect(h.state.scene).toBe(scene)
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })

  it('التراجع ينقل العلامة إلى الإعادة والعكس', () => {
    const h = withRect()
    h.mark('أولى')
    h.push([shift(h, 1)])
    h.commit()
    h.mark('ثانية')
    h.push([shift(h, 2)])
    h.commit()

    h.undo()
    expect(h.state.past.map((m) => m.label)).toEqual(['أولى'])
    expect(h.state.future.map((m) => m.label)).toEqual(['ثانية'])
    h.undo()
    expect(h.state.future.map((m) => m.label)).toEqual(['ثانية', 'أولى'])
    expect(xOf(h)).toBe(0)

    h.redo()
    expect(h.state.future.map((m) => m.label)).toEqual(['ثانية'])
    expect(xOf(h)).toBe(1)
    h.redo()
    expect(h.state.future).toHaveLength(0)
    expect(xOf(h)).toBe(2)
  })

  it('`redo` أثناء علامة مفتوحة يغلقها فتُبطل مسار الإعادة فلا يجد ما يعيده', () => {
    const h = withRect()
    h.push([shift(h, 12)])
    h.undo()
    h.mark('سحب')
    h.push([shift(h, 5)])
    h.redo()
    expect(xOf(h)).toBe(5)
    expect(h.state.past.map((m) => m.label)).toEqual(['سحب'])
    expect(h.canRedo).toBe(false)
  })

  it('تحرير جديد بعد التراجع يفرّع التاريخ — القديم لا يعود', () => {
    const h = withRect()
    h.push([shift(h, 10)])
    h.push([shift(h, 20)])
    h.undo()
    h.push([shift(h, 99)])
    h.redo()
    expect(xOf(h)).toBe(99)
    h.undo()
    expect(xOf(h)).toBe(10)
    h.undo()
    expect(xOf(h)).toBe(0)
  })
})

describe('حالة الأزرار ووسومها', () => {
  it('تاريخ جديد: لا تراجع ولا إعادة ولا وسوم', () => {
    const h = withRect()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    expect(h.undoLabel).toBeNull()
    expect(h.redoLabel).toBeNull()
  })

  it('علامة مفتوحة بفروق تجعل التراجع متاحًا ولو خلا المكدّس', () => {
    const h = withRect()
    h.mark('سحب')
    h.push([shift(h, 4)])
    expect(h.state.past).toHaveLength(0)
    expect(h.canUndo).toBe(true)
  })

  it('علامة مفتوحة بلا فروق لا تجعل التراجع متاحًا', () => {
    const h = withRect()
    h.mark('سحب')
    expect(h.canUndo).toBe(false)
  })

  it('**وسم التراجع يتبع العلامة المفتوحة ما دامت فيها فروق**', () => {
    const h = withRect()
    h.mark('أولى')
    h.push([shift(h, 1)])
    h.commit()
    expect(h.undoLabel).toBe('أولى')

    h.mark('ثانية')
    // ما دامت بلا فروق يبقى وسم آخر مُدرَج.
    expect(h.undoLabel).toBe('أولى')
    h.push([shift(h, 2)])
    expect(h.undoLabel).toBe('ثانية')
    h.commit()
    expect(h.undoLabel).toBe('ثانية')
  })

  it('العلامة المفردة وسمها فارغ لا `null` — الفرق بين «لا شيء» و«بلا وسم»', () => {
    const h = withRect()
    h.push([shift(h, 1)])
    expect(h.canUndo).toBe(true)
    expect(h.undoLabel).toBe('')
  })

  it('وسم الإعادة يتبع أوّل علامة في مسارها', () => {
    const h = withRect()
    h.mark('أولى')
    h.push([shift(h, 1)])
    h.commit()
    h.mark('ثانية')
    h.push([shift(h, 2)])
    h.commit()

    h.undo()
    expect(h.redoLabel).toBe('ثانية')
    h.undo()
    expect(h.redoLabel).toBe('أولى')
    expect(h.undoLabel).toBeNull()
    h.redo()
    h.redo()
    expect(h.redoLabel).toBeNull()
  })
})

describe('سقف التاريخ', () => {
  it('عند الإغلاق بـ`commit` يُقصّ الأقدم ويبقى الأحدث', () => {
    const h = withRect({ now: () => 0, limit: 3 })
    for (let i = 1; i <= 6; i++) {
      h.mark(`خطوة ${i}`)
      h.push([shift(h, i)])
      h.commit()
    }
    expect(h.state.past.map((m) => m.label)).toEqual(['خطوة 4', 'خطوة 5', 'خطوة 6'])

    // ولا تراجع خلف السقف: بعد ثلاث خطوات يقف المشهد عند نتيجة الثالثة.
    h.undo()
    h.undo()
    h.undo()
    expect(h.canUndo).toBe(false)
    expect(xOf(h)).toBe(3)
  })

  it('عند الدفع المفرد يُقصّ الأقدم كذلك', () => {
    const h = withRect({ now: () => 0, limit: 2 })
    for (let i = 1; i <= 5; i++) h.push([shift(h, i)])
    expect(h.state.past).toHaveLength(2)
    h.undo()
    h.undo()
    expect(h.canUndo).toBe(false)
    expect(xOf(h)).toBe(3)
  })

  it('السقف الافتراضي هو `HISTORY_LIMIT`', () => {
    const h = withRect()
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) h.push([shift(h, i)])
    expect(h.state.past).toHaveLength(HISTORY_LIMIT)
    for (let i = 0; i < HISTORY_LIMIT; i++) h.undo()
    expect(h.canUndo).toBe(false)
    // الخطوات الخمس الأقدم سقطت من المكدّس، فآخر مشهد يبلغه التراجع نتيجتها.
    expect(xOf(h)).toBe(5)
  })

  it('القصّ يقع على مكدّس التراجع وحده — الإعادة سليمة بعده', () => {
    const h = withRect({ now: () => 0, limit: 2 })
    for (let i = 1; i <= 3; i++) h.push([shift(h, i)])
    h.undo()
    expect(h.state.past).toHaveLength(1)
    expect(h.state.future).toHaveLength(1)
    h.redo()
    expect(xOf(h)).toBe(3)
    expect(h.state.past).toHaveLength(2)
  })
})
