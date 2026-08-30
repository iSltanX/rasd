import { describe, expect, it } from 'vitest'

import { applyPatches, type Patch } from '@/modules/editor/commands'
import { createHistory } from '@/modules/editor/history'
import { asNodeId, type Scene, type TextNode } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import {
  absorb,
  breakAfter,
  breakBefore,
  decide,
  idleTyping,
  isHistoryShortcut,
  isWordBreak,
  TYPING_IDLE_MS,
  TYPING_MAX_CHARS,
  type TypingState,
} from '@/modules/editor/typing'
import { devicePoint } from '@/shared/geometry'

/**
 * نوبة الكتابة — بند القبول على **أشيع فعل في المحرر**.
 *
 * الطرفان كلاهما عطل: علامة للجلسة تجعل `⌘Z` تمحو فقرة، وعلامة لكل حرف
 * تُخلي مكدّسًا سعته خمسون بسطر واحد. وهذه الاختبارات تقيس المسافة بينهما.
 */

const textNode = (text: string): TextNode => ({
  kind: 'text',
  id: asNodeId('t'),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 },
  at: devicePoint(0, 0),
  text,
  font: { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 0 },
  maxWidthPx: 0,
  align: 'start',
  dir: 'auto',
})

const base = (): Scene => ({
  ...emptyScene({ captureId: 'c', width: 100, height: 100, dpr: 1 }),
  nodes: [textNode('')],
})

describe('القواطع الثلاثة', () => {
  it('لا قطع في نوبة لم تبدأ', () => {
    expect(breakBefore(idleTyping, 0, 'ا')).toBeNull()
  })

  it('**السكون يقطع** عند العتبة لا قبلها', () => {
    const state: TypingState = { lastAt: 1000, chars: 5 }
    expect(breakBefore(state, 1000 + TYPING_IDLE_MS - 1, 'ا')).toBeNull()
    expect(breakBefore(state, 1000 + TYPING_IDLE_MS, 'ا')).toBe('idle')
  })

  it('**والطول يقطع** عند تجاوز الحدّ', () => {
    const state: TypingState = { lastAt: 1000, chars: TYPING_MAX_CHARS }
    expect(breakBefore(state, 1001, 'ا')).toBe('length')
  })

  it('**وحدّ الكلمة يقطع بعد ضمّه** لا قبله', () => {
    expect(breakAfter('ا')).toBeNull()
    expect(breakAfter(' ')).toBe('word')
    expect(breakAfter('\n')).toBe('word')
    expect(isWordBreak(' ')).toBe(true)
    expect(isWordBreak('ك')).toBe(false)
  })

  it('السكون له الأسبقية على الطول', () => {
    const state: TypingState = { lastAt: 1000, chars: TYPING_MAX_CHARS + 10 }
    expect(breakBefore(state, 1000 + TYPING_IDLE_MS, 'ا')).toBe('idle')
  })

  it('الاستيعاب يجمع المحارف ويحدّث اللحظة', () => {
    expect(absorb({ lastAt: 10, chars: 3 }, 20, 'كلمة')).toEqual({ lastAt: 20, chars: 7 })
  })

  it('القرار الكامل يُعيد الأمرين والحالة', () => {
    const d = decide({ lastAt: 1000, chars: 2 }, 1010, ' ')
    expect(d.closeBefore).toBeNull()
    expect(d.closeAfter).toBe('word')
    expect(d.next).toEqual({ lastAt: 1010, chars: 3 })
  })

  it('والقطع يُصفّر العدّاد — النوبة الجديدة تبدأ من الصفر', () => {
    const d = decide({ lastAt: 1000, chars: 50 }, 1000 + TYPING_IDLE_MS, 'ا')
    expect(d.closeBefore).toBe('idle')
    expect(d.next.chars).toBe(1)
  })
})

describe('اعتراض اختصارات التاريخ', () => {
  it('`⌘Z` تراجع و`⇧⌘Z` إعادة', () => {
    expect(isHistoryShortcut({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false })).toBe(
      'undo',
    )
    expect(isHistoryShortcut({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: true })).toBe(
      'redo',
    )
  })

  it('و`⌃Y` إعادة على ويندوز', () => {
    expect(isHistoryShortcut({ key: 'y', metaKey: false, ctrlKey: true, shiftKey: false })).toBe(
      'redo',
    )
  })

  it('وحرفٌ بلا مُعدِّل ليس اختصارًا', () => {
    expect(
      isHistoryShortcut({ key: 'z', metaKey: false, ctrlKey: false, shiftKey: false }),
    ).toBeNull()
    expect(
      isHistoryShortcut({ key: 'a', metaKey: true, ctrlKey: false, shiftKey: false }),
    ).toBeNull()
  })
})

/**
 * السيناريو الكامل: كتابة جملة عربية حرفًا حرفًا، بالتوقيت الحقيقي.
 */
describe('**نوبة كتابة حقيقية على مكدّس التاريخ**', () => {
  /** يكتب نصًّا محرفًا محرفًا بفاصل زمني، ويُدير العلامات بقرار `decide`. */
  function type(
    text: string,
    gapMs: number,
  ): { history: ReturnType<typeof createHistory>; marks: number } {
    const scene = base()
    const history = createHistory(scene, { now: () => 0 })
    let state = idleTyping
    let at = 0
    let open = false
    let current = ''

    for (const ch of text) {
      at += gapMs
      const d = decide(state, at, ch)

      if (d.closeBefore) {
        history.commit()
        open = false
      }
      if (!open) {
        history.mark('كتابة')
        open = true
      }

      current += ch
      const before = history.state.scene.nodes[0] as TextNode
      const patch: Patch = {
        op: 'replace',
        index: 0,
        before,
        after: { ...before, text: current },
      }
      history.push([patch])
      state = d.next

      if (d.closeAfter) {
        history.commit()
        open = false
        state = idleTyping
      }
    }
    history.commit()
    return { history, marks: history.state.past.length }
  }

  const SENTENCE = 'العنوان أكبر بدرجتين'

  it('الكتابة السريعة تُنتج علامةً لكل كلمة — لا لكل حرف', () => {
    const { history, marks } = type(SENTENCE, 50)
    expect((history.state.scene.nodes[0] as TextNode).text).toBe(SENTENCE)
    // ثلاث كلمات ⇒ ثلاث علامات، لا عشرون.
    expect(marks).toBe(3)
    expect(marks).toBeLessThan(SENTENCE.length)
  })

  it('**و`⌘Z` واحدة تمحو كلمة لا الفقرة كلّها**', () => {
    const { history } = type(SENTENCE, 50)
    history.undo()
    const after = (history.state.scene.nodes[0] as TextNode).text
    expect(after).not.toBe('')
    expect(after.length).toBeGreaterThan(0)
    expect(after.length).toBeLessThan(SENTENCE.length)
    expect(SENTENCE.startsWith(after)).toBe(true)
  })

  it('**ولا تُخلي نوبةٌ واحدة مكدّسًا سعته خمسون**', () => {
    const long = 'كلمة '.repeat(40).trim()
    const { marks } = type(long, 30)
    // أربعون كلمة ⇒ أربعون علامة، لا مئتان.
    expect(marks).toBeLessThanOrEqual(50)
    expect(marks).toBeGreaterThan(1)
  })

  it('والسكون بين حرفين يقطع النوبة داخل الكلمة الواحدة', () => {
    const { marks } = type('كلمة', TYPING_IDLE_MS + 10)
    // كل حرف بعد سكون ⇒ علامة مستقلّة.
    expect(marks).toBe(4)
  })

  it('والتراجع المتتابع يُفرغ النصّ ثمّ يقف', () => {
    const { history } = type('كلمتان اثنتان', 50)
    for (let i = 0; i < 10; i++) history.undo()
    expect((history.state.scene.nodes[0] as TextNode).text).toBe('')
    expect(history.canUndo).toBe(false)
  })

  it('**والإعادة تستعيد النصّ كاملًا حرفًا بحرف**', () => {
    const { history } = type(SENTENCE, 50)
    const top = history.state.scene
    for (let i = 0; i < 10; i++) history.undo()
    for (let i = 0; i < 10; i++) history.redo()
    expect(history.state.scene).toEqual(top)
    expect(applyPatches(history.state.scene, [])).toEqual(top)
  })
})
