import { options, render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { createHistory } from '@/modules/editor/history'
import {
  asNodeId,
  type NodeId,
  type RedactNode,
  type Scene,
  type SceneNode,
} from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { LayerList } from '@/pages/editor/parts/LayerList'
import { deviceRect, devicePoint } from '@/shared/geometry'

/**
 * قائمة الطبقات — **ترتيب رسم لا ترتيب أرقام**.
 *
 * وأهمّ ما فيها ما **لا** تفعله: رفعُ دبّوس لا يغيّر رقمه، وعقدةُ الحجب لا
 * تُخفى بحكم النوع لا بفحصٍ يُنسى.
 */

options.debounceRendering = (cb) => {
  cb()
}

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 } as const

const rect = (id: string): SceneNode => ({
  kind: 'rect',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  rect: deviceRect(0, 0, 10, 10),
  radiusPx: 0,
  fill: 'none',
})

const pin = (id: string, ordinal: number): SceneNode => ({
  kind: 'pin',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  at: devicePoint(5, 5),
  shape: 'circle',
  ordinal,
  noteId: null,
  radiusPx: 13,
})

const redact = (id: string): RedactNode => ({
  kind: 'redact',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  stroke,
  rect: deviceRect(0, 0, 20, 20),
  mode: 'cover',
  strength: 0,
  coverToken: 'status/danger/solid',
})

const sceneWith = (...nodes: readonly SceneNode[]): Scene => ({
  ...emptyScene({ captureId: 'c', width: 100, height: 100, dpr: 1 }),
  nodes,
})

let container: HTMLDivElement | null = null
afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(scene: Scene) {
  const history = createHistory(scene)
  const selected: NodeId[] = []
  container = document.createElement('div')
  container.dir = 'rtl'
  document.body.appendChild(container)
  const draw = (): void => {
    render(
      <LayerList
        history={history}
        selection={new Set(selected)}
        onSelect={(id) => {
          selected.length = 0
          selected.push(id)
          draw()
        }}
        onChange={draw}
      />,
      container!,
    )
  }
  draw()
  return { history, root: container }
}

const q = (r: Element, sel: string): HTMLElement | null => r.querySelector(sel)
const qa = (r: Element, sel: string): HTMLElement[] => [...r.querySelectorAll<HTMLElement>(sel)]

describe('الترتيب', () => {
  it('**الأعلى في القائمة هو الأعلى في الرسم** — أي آخر المصفوفة', () => {
    const { root } = mount(sceneWith(rect('a'), rect('b'), rect('c')))
    expect(qa(root, '[data-layer]').map((el) => el.dataset.layer)).toEqual(['c', 'b', 'a'])
  })

  it('**والترتيب بأزرار لا بالسحب وحده** — لوحة المفاتيح تصل إليه', () => {
    const { root, history } = mount(sceneWith(rect('a'), rect('b')))
    // «ب» في الأعلى؛ إنزالها يجعل «أ» أعلى.
    q(root, '[data-layer="b"] [data-layer-down]')?.click()
    expect(history.state.scene.nodes.map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('وأزرار الطرفين معطَّلة — لا حركة بلا أثر', () => {
    const { root } = mount(sceneWith(rect('a'), rect('b')))
    expect((q(root, '[data-layer="b"] [data-layer-up]') as HTMLButtonElement).disabled).toBe(true)
    expect((q(root, '[data-layer="a"] [data-layer-down]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('**ورفعُ دبّوس لا يغيّر رقمه** — محوران مستقلّان', () => {
    const { root, history } = mount(sceneWith(pin('p1', 1), pin('p2', 2), rect('r')))
    q(root, '[data-layer="p1"] [data-layer-up]')?.click()

    const ordinals = history.state.scene.nodes
      .filter((n): n is Extract<SceneNode, { kind: 'pin' }> => n.kind === 'pin')
      .map((n) => `${n.id}:${n.ordinal}`)
    expect(ordinals).toEqual(['p2:2', 'p1:1'])
  })

  it('والترتيب علامة تاريخ واحدة قابلة للتراجع', () => {
    const { root, history } = mount(sceneWith(rect('a'), rect('b')))
    const before = history.state.past.length
    q(root, '[data-layer="b"] [data-layer-down]')?.click()
    expect(history.state.past.length).toBe(before + 1)
    history.undo()
    expect(history.state.scene.nodes.map((n) => n.id)).toEqual(['a', 'b'])
  })
})

describe('**الحجب لا يُخفى — بحكم النوع**', () => {
  it('زرّ الإخفاء معطَّل على عقدة الحجب', () => {
    const { root } = mount(sceneWith(redact('r1')))
    const btn = q(root, '[data-layer="r1"] [data-layer-hide]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('**ويقول لماذا** — التعطيل بلا سبب يُقرأ عطلًا', () => {
    const { root } = mount(sceneWith(redact('r1')))
    const btn = q(root, '[data-layer="r1"] [data-layer-hide]')
    expect(btn?.getAttribute('aria-label')).toContain('لا يمكن إخفاء الحجب')
    expect(btn?.title).toContain('احذفه')
  })

  it('والنقر عليه لا يفعل شيئًا', () => {
    const { root, history } = mount(sceneWith(redact('r1')))
    const before = history.state.past.length
    q(root, '[data-layer="r1"] [data-layer-hide]')?.click()
    expect(history.state.past.length).toBe(before)
  })

  it('وما يجوز إخفاؤه يُخفى ويُظهَر', () => {
    const { root, history } = mount(sceneWith(rect('a')))
    q(root, '[data-layer="a"] [data-layer-hide]')?.click()
    expect((history.state.scene.nodes[0] as { hidden: boolean }).hidden).toBe(true)
  })
})

describe('التسميات والأفعال', () => {
  it('**اسم الحجب يحمل نمطه** — لا «حجب» على ضباب', () => {
    const blurNode = { ...redact('r1'), mode: 'blur' as const, strength: 8 }
    const { root } = mount(sceneWith(blurNode))
    expect(q(root, '[data-layer="r1"] [data-layer-select]')?.textContent).toContain('طمس')
  })

  it('ورقم الدبّوس هندي — عدٌّ بشري', () => {
    const { root } = mount(sceneWith(pin('p1', 3)))
    expect(q(root, '[data-layer="p1"] [data-layer-select]')?.textContent).toContain('٣')
  })

  it('والقفل يُبدَّل ويُعلَن لقارئ الشاشة', () => {
    const { root, history } = mount(sceneWith(rect('a')))
    q(root, '[data-layer="a"] [data-layer-lock]')?.click()
    expect(history.state.scene.nodes[0]!.locked).toBe(true)
    expect(q(root, '[data-layer="a"] [data-layer-lock]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('والحذف يُزيل الطبقة ويبقى قابلًا للتراجع', () => {
    const { root, history } = mount(sceneWith(rect('a'), rect('b')))
    q(root, '[data-layer="a"] [data-layer-delete]')?.click()
    expect(history.state.scene.nodes.map((n) => n.id)).toEqual(['b'])
    history.undo()
    expect(history.state.scene.nodes).toHaveLength(2)
  })

  it('وقائمةٌ فارغة تقول ما يُفعل', () => {
    const { root } = mount(sceneWith())
    expect(q(root, '[data-layer-empty]')?.textContent).toContain('ارسم')
  })
})
