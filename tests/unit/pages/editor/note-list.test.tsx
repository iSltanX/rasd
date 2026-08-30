import { options, render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { createHistory } from '@/modules/editor/history'
import { asNodeId, type NoteNode, type PinNode, type Scene, type NodeId  } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { NoteList } from '@/pages/editor/parts/NoteList'
import { createTextEditSession } from '@/pages/editor/text-editing'
import { devicePoint } from '@/shared/geometry'


const stroke = { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 } as const
const font = { family: 'ui', sizePx: 16, weight: 400, letterSpacingPx: 0 } as const

const note = (id: string, over: Partial<NoteNode> = {}): NoteNode => ({
  kind: 'note',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  at: devicePoint(0, 0),
  widthPx: 240,
  title: '',
  body: '',
  tag: null,
  font,
  paddingPx: 12,
  pinId: null,
  ...over,
})

const pin = (id: string, ordinal: number, noteId: string): PinNode => ({
  kind: 'pin',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke,
  at: devicePoint(0, 0),
  shape: 'circle',
  ordinal,
  noteId: asNodeId(noteId),
  radiusPx: 13,
})

const sceneOf = (...nodes: Scene['nodes']): Scene => ({
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
      <NoteList
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
  return { history, root: container, selected, draw }
}

/**
 * تصيير متزامن.
 *
 * Preact يؤجّل إعادة التصيير إلى مهمّة دقيقة، فنقرةٌ تُغيّر حالةً لا يظهر
 * أثرها في DOM قبل انتهاء الاختبار — والاختبار عندئذٍ يقيس التوقيت لا
 * السلوك. والخطّاف الرسمي يجعلها فورية.
 */
options.debounceRendering = (cb) => {
  cb()
}

const q = (root: Element, sel: string): HTMLElement | null => root.querySelector(sel)
const qa = (root: Element, sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)]

describe('لوحة الملاحظات', () => {
  it('**ترتّب بأرقام الدبابيس وتعرضها بالهندية**', () => {
    const { root } = mount(
      sceneOf(note('n2'), note('n1'), pin('p2', 2, 'n2'), pin('p1', 1, 'n1')),
    )
    const ordinals = qa(root, '[data-note] > span').map((el) => el.textContent)
    expect(ordinals).toEqual(['١', '٢'])
  })

  it('وملاحظةٌ بلا دبّوس تُعلَّم شرطةً ولا تُحذَف من القائمة', () => {
    const { root } = mount(sceneOf(note('free')))
    const badge = q(root, '[data-note="free"] > span')
    expect(badge?.textContent).toBe('—')
    expect(badge?.dataset.unlinked).toBe('true')
  })

  it('والقائمة الفارغة تقول ما يُفعل لا «لا شيء»', () => {
    const { root } = mount(sceneOf())
    expect(q(root, '[data-note-empty]')?.textContent).toContain('ضَع دبّوسًا')
  })

  it('**والتصنيف يُثبَّت في المشهد بعلامة تاريخ واحدة قابلة للتراجع**', () => {
    const { root, history } = mount(sceneOf(note('n1')))
    const before = history.state.past.length
    q(root, '[data-note="n1"] [data-note-tag="spacing"]')?.click()

    const stored = history.state.scene.nodes[0] as NoteNode
    expect(stored.tag).toBe('spacing')
    expect(history.state.past.length).toBe(before + 1)

    history.undo()
    expect((history.state.scene.nodes[0] as NoteNode).tag).toBeNull()
  })

  it('والضغط على التصنيف نفسه يفكّه — زرّ ثنائي لا ثلاثة أزرار حصرية', () => {
    const { root, history } = mount(sceneOf(note('n1', { tag: 'token' })))
    q(root, '[data-note="n1"] [data-note-tag="token"]')?.click()
    expect((history.state.scene.nodes[0] as NoteNode).tag).toBeNull()
  })

  it('**والترشيح يخفي ما لا يطابق ويُبقي العدّاد على الكلّ**', () => {
    const { root } = mount(
      sceneOf(note('a', { tag: 'type' }), note('b', { tag: 'spacing' }), note('c')),
    )
    q(root, '[data-note-filter="type"]')?.click()
    expect(qa(root, '[data-note]').map((el) => el.dataset.note)).toEqual(['a'])
    expect(q(root, '[data-note-filter="all"]')?.textContent).toContain('٣')
  })

  it('وترشيحٌ بلا نتيجة يفرّق بين «لا ملاحظات» و«لا ملاحظة بهذا التصنيف»', () => {
    const { root } = mount(sceneOf(note('a', { tag: 'type' })))
    q(root, '[data-note-filter="token"]')?.click()
    expect(q(root, '[data-note-empty]')?.textContent).toBe('لا ملاحظة بهذا التصنيف.')
  })

  it('والحقول تحمل تسميات وصفية لقارئ الشاشة', () => {
    const { root } = mount(sceneOf(note('n1')))
    expect(q(root, '[data-note-title="n1"]')?.getAttribute('aria-label')).toBe('عنوان الملاحظة')
    expect(q(root, '[data-note-body="n1"]')?.getAttribute('aria-label')).toBe('متن الملاحظة')
  })
})

describe('**جلسة تحرير النصّ — على حقول الملاحظة**', () => {
  it('تكتب في الحقل المطلوب وحده', () => {
    const history = createHistory(sceneOf(note('n1')))
    const session = createTextEditSession(history, asNodeId('n1'), 'body', 'ملاحظة')
    session.edit('متن', 'ن', 0)
    session.finish()
    const stored = history.state.scene.nodes[0] as NoteNode
    expect(stored.body).toBe('متن')
    expect(stored.title).toBe('')
  })

  it('**وتقرأ العقدة من التاريخ في كل تعديل** — فلا ينقضها تراجعٌ بينهما', () => {
    const history = createHistory(sceneOf(note('n1')))
    const session = createTextEditSession(history, asNodeId('n1'), 'title', 'ملاحظة')

    session.edit('أ', 'أ', 0)
    session.finish()
    session.edit('أب', 'ب', 10)
    session.finish()
    expect((history.state.scene.nodes[0] as NoteNode).title).toBe('أب')

    history.undo()
    expect((history.state.scene.nodes[0] as NoteNode).title).toBe('أ')

    // الكتابة بعد التراجع تبني على ما عاد من الماضي، لا على مرجع محتجَز.
    session.edit('أج', 'ج', 20)
    session.finish()
    expect((history.state.scene.nodes[0] as NoteNode).title).toBe('أج')
  })

  it('وعقدةٌ حُذفت أثناء التحرير لا تُرجعها الكتابة إلى الوجود', () => {
    const history = createHistory(sceneOf(note('n1')))
    const session = createTextEditSession(history, asNodeId('ghost'), 'title', 'ملاحظة')
    session.edit('نصّ', 'ص', 0)
    expect(history.state.past).toHaveLength(0)
    expect(history.state.scene.nodes).toHaveLength(1)
  })

  it('وحقلٌ لا يوجد على هذا الصنف يُرفض بلا علامة', () => {
    const history = createHistory(sceneOf(note('n1')))
    // `text` حقل عقدة النصّ لا الملاحظة.
    const session = createTextEditSession(history, asNodeId('n1'), 'text', 'ملاحظة')
    session.edit('نصّ', 'ص', 0)
    expect(history.state.past).toHaveLength(0)
  })
})
