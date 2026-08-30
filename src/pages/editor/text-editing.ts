/**
 * جلسة تحرير نصّ — تربط ضغطات لوحة المفاتيح بمكدّس التاريخ.
 *
 * تعيش في `pages/` لأنها **سياسة**: `typing.ts` تقرّر متى تُغلَق العلامة،
 * وهذه تنفّذ القرار على تاريخٍ بعينه وعقدةٍ بعينها.
 *
 * **والعقدة تُقرأ من التاريخ في كل تعديل، لا تُحتجَز مرجعًا.** مرجعٌ محتجَز
 * يُلغيه أوّل تراجع: `⌘Z` تستبدل العقدة في المشهد بنسخة أخرى، فتكتب الضغطة
 * التالية فوق نصٍّ عاد من الماضي بنصٍّ من مرجعٍ ميت — أي أن التراجع يُنقَض
 * بأوّل حرف بعده.
 */

import { replaceNode } from '@/modules/editor/scene-ops'
import { decide, idleTyping, type TypingState } from '@/modules/editor/typing'

import type { History } from '@/modules/editor/history'
import type { NodeId, SceneNode } from '@/modules/editor/scene'

/** الحقول القابلة للتحرير في كل صنف. */
export type EditableField = 'text' | 'title' | 'body'

export interface TextEditSession {
  /** يطبّق تعديلًا. `input` هو المُدخَل الجديد — لتقرير حدّ الكلمة. */
  edit(value: string, input: string, at: number): void
  /** يُغلق العلامة المفتوحة — عند فقد التركيز أو إنهاء التحرير. */
  finish(): void
  readonly open: boolean
}

/** يُحدّث الحقل المطلوب على عقدة نصّ أو ملاحظة. */
function withField(node: SceneNode, field: EditableField, value: string): SceneNode | null {
  if (node.kind === 'text' && field === 'text') return { ...node, text: value }
  if (node.kind === 'note' && field === 'title') return { ...node, title: value }
  if (node.kind === 'note' && field === 'body') return { ...node, body: value }
  return null
}

export function createTextEditSession(
  history: History,
  nodeId: NodeId,
  field: EditableField,
  label: string,
): TextEditSession {
  let typing: TypingState = idleTyping
  let open = false

  const closeMark = (): void => {
    if (!open) return
    history.commit()
    open = false
    typing = idleTyping
  }

  return {
    get open() {
      return open
    },

    edit(value, input, at) {
      const node = history.state.scene.nodes.find((n) => n.id === nodeId)
      if (!node) return
      const next = withField(node, field, value)
      if (!next) return

      const d = decide(typing, at, input)
      if (d.closeBefore) closeMark()
      if (!open) {
        history.mark(label)
        open = true
      }

      history.push(replaceNode(history.state.scene, next).patches)
      typing = d.next

      // حدّ الكلمة يُغلق **بعد** الضمّ، فتنتهي النوبة بالكلمة لا ببدايتها.
      if (d.closeAfter) closeMark()
    },

    finish: closeMark,
  }
}
