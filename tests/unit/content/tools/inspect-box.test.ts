/**
 * `inspect / element-selected` (`62:2`): العنصر المثبَّت بنموذج صندوقه — الهامش والحدّ والحشوة
 * والمحتوى — لا بإطار لون الأداة وحده. كان مؤجَّلًا لأن اللقطة تحمل الهوامش منطقية بلا اتجاه
 * كتابة العنصر؛ والأداة تملك العنصر نفسه لحظة التثبيت، فتقرأ جوانبه الفيزيائية المحلولة منه.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { createInspect } from '@/content/tools/inspect'

import type { Edges } from '@/modules/dom-picker/inspect'

const pointer = (x: number, y: number) => ({ clientX: x, clientY: y }) as PointerEvent
const sides = (e: Edges | undefined) => (e ? [e.top, e.right, e.bottom, e.left] : null)

let el: HTMLElement | null = null

afterEach(() => {
  el?.remove()
  el = null
})

describe('createInspect — جوانب العنصر المثبَّت', () => {
  it('التثبيت يحفظ الهامش والحدّ والحشوة بجهاتها الفيزيائية', () => {
    el = document.createElement('button')
    el.style.cssText =
      'margin: 4px 8px 12px 16px; padding: 1px 2px 3px 5px; border: 2px solid; direction: rtl'
    document.body.appendChild(el)
    const target = el
    document.elementsFromPoint = () => [target]
    target.getClientRects = () => [{ width: 100, height: 40 }] as unknown as DOMRectList

    const tool = createInspect({ doc: document })
    tool.onPointerMove(pointer(10, 10))
    tool.frame(new Set(['manual']))
    tool.onPointerUp(pointer(10, 10))

    const edges = tool.state.detail.value?.edges
    // بترتيب `inset`: أعلى، يمين، أسفل، يسار — جهات فيزيائية عمدًا (`BoxModel.tsx`).
    expect(sides(edges?.margin)).toEqual([4, 8, 12, 16])
    expect(sides(edges?.padding)).toEqual([1, 2, 3, 5])
    expect(sides(edges?.border)).toEqual([2, 2, 2, 2])
    tool.dispose()
  })
})
