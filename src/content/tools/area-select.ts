/**
 * أداة «تصوير منطقة» — آلة الحالة وأحداث المؤشِّر.
 *
 * **الفصل المتعمَّد:** الرياضيات كلّها في `modules/capture/selection.ts`
 * (خالصة، مُختبَرة بلا متصفّح). هذا الملفّ يترجم أحداث DOM إلى نداءات لتلك
 * الدوالّ ويحفظ الحالة في إشارات. لا صيغة رياضية واحدة هنا — وهو ما يجعل
 * ما ينكسر قابلًا للاختبار حيث كُتب.
 *
 * **لماذا إشارات لا حالة Preact:** السحب يحدّث الهندسة عند كل حركة مؤشِّر.
 * إشارة تُحدِّث العُقد المرتبطة بها وحدها؛ حالة مكوّن تُعيد تركيب الشجرة
 * كاملةً — وهو الفرق بين سحب سلس وسحب متقطّع على صفحة ثقيلة.
 *
 * **أحداث المؤشِّر لا الفأرة:** `setPointerCapture` يُبقي السحب واصلًا حتى لو
 * غادر المؤشِّر النافذة أو أُفلت فوق إطار آخر. مستمعو `mousemove` على
 * `window` يفقدون الحدث في الحالتين.
 */

import { signal, type Signal } from '@preact/signals'

import {
  clampRect,
  isCapturable,
  moveRect,
  resizeRect,
  solveDrag,
  type Handle,
} from '@/modules/capture/selection'
import { contains, viewportPoint, viewportRect, type ViewportRect } from '@/shared/geometry'

/** مرحلة التفاعل. */
export type AreaPhase =
  /** لا تحديد بعد — النقرة التالية تبدأ السحب. */
  | 'idle'
  /** سحب ابتدائي جارٍ. */
  | 'drawing'
  /** تحديد قائم قابل للتعديل — الحالة التي تفرضها `Rasd_Ar.md §4.1`. */
  | 'ready'
  /** سحب مقبض أو نقل التحديد كاملًا. */
  | 'adjusting'

export interface AreaState {
  readonly phase: Signal<AreaPhase>
  readonly rect: Signal<ViewportRect | null>
  /** `⇧` مضغوط الآن — تثبيت النسبة. */
  readonly constrained: Signal<boolean>
  /** `⌥` مضغوط الآن — الرسم من المركز. */
  readonly fromCenter: Signal<boolean>
  /** نسبة مفروضة من الرقاقة (تتجاوز `⇧`)؛ `null` يعني حرّ. */
  readonly lockedRatio: Signal<number | null>
}

export interface AreaSelectOptions {
  /** حدود النافذة الحيّة — تُقرأ عند كل إطار لا تُخزَّن. */
  bounds(): ViewportRect
  /** يُستدعى حين يطلب المستخدم الالتقاط (`↵` أو زرّ). */
  onCommit(rect: ViewportRect): void
  /** يُستدعى عند `Esc` أو إلغاء صريح. */
  onCancel(): void
  /** يُبلَّغ بأن سحبًا جارٍ — يمنع مدير الأوضاع من التبديل تحته. */
  onBusy(busy: boolean): void
}

export interface AreaSelectTool {
  readonly state: AreaState
  /** تُركَّب على عنصر الطبقة. */
  readonly handlers: {
    onPointerDown(event: PointerEvent, handle?: Handle): void
    onPointerMove(event: PointerEvent): void
    onPointerUp(event: PointerEvent): void
  }
  /** أسهم لوحة المفاتيح — تحرّك التحديد القائم. */
  nudge(dx: number, dy: number): void
  /** يطلب الالتقاط الآن إن كان التحديد صالحًا. */
  commit(): void
  reset(): void
  dispose(): void
}

/**
 * أقلّ إزاحة تُميّز سحبًا عن نقرة، بالبكسل المنطقي.
 *
 * **غير `MIN_SELECTION`**: هذه تسأل «هل نوى المستخدم السحب أصلًا؟» وتلك
 * تسأل «هل التحديد كبير بما يكفي ليُلتقَط؟». خلطهما يجعل نقرة عابرة تمحو
 * تحديدًا أتعب المستخدم في ضبطه.
 */
export const DRAG_THRESHOLD = 3

/** الشاشات اللمسية أقلّ دقّة — العتبة نفسها عليها تُنتج سحبًا لم يُقصَد. */
const TOUCH_DRAG_THRESHOLD = 8

/** ما يجري الآن — يعيش خارج الإشارات لأنه لا يُعرَض. */
interface Drag {
  readonly pointerId: number
  readonly target: Element
  /** سحب ابتدائي: نقطة البداية. سحب مقبض: المقبض. نقل: إزاحة المؤشِّر. */
  readonly kind: 'draw' | 'resize' | 'move'
  readonly anchor: { x: number; y: number }
  readonly handle?: Handle
  /** المستطيل لحظة بدء السحب — مرجع النقل. */
  readonly startRect?: ViewportRect
  /**
   * التحديد الذي كان قائمًا قبل بدء هذا السحب.
   *
   * يُستعاد إن تبيّن أن السحب كان نقرة: محو تحديد مضبوط بنقرة طائشة خسارة
   * لا يستردّها المستخدم إلا بإعادة الرسم كلّه.
   */
  readonly prev: ViewportRect | null
  /** هل تجاوزت الإزاحة العتبة؟ يُرفَع مرّة ولا يعود. */
  moved: boolean
}

export function createAreaSelect(options: AreaSelectOptions): AreaSelectTool {
  const state: AreaState = {
    phase: signal<AreaPhase>('idle'),
    rect: signal<ViewportRect | null>(null),
    constrained: signal(false),
    fromCenter: signal(false),
    lockedRatio: signal<number | null>(null),
  }

  let drag: Drag | null = null

  /** النسبة الفعّالة: الرقاقة تتقدّم على `⇧`، وإلا فلا تثبيت. */
  const activeRatio = (): number | null => {
    if (state.lockedRatio.value !== null) return state.lockedRatio.value
    if (!state.constrained.value) return null
    const current = state.rect.value
    // `⇧` يثبّت النسبة **القائمة** لا نسبة اعتباطية: هذا ما يتوقّعه
    // المستخدم حين يمسك المفتاح في منتصف سحب.
    if (drag?.kind === 'resize' && current && current.height > 0) {
      return current.width / current.height
    }
    return 1
  }

  /** يحصر ويحفظ — كل مسار يمرّ من هنا فلا يفلت مستطيل خارج النافذة. */
  const commitRect = (next: ViewportRect) => {
    state.rect.value = clampRect(next, options.bounds())
  }

  const endDrag = () => {
    if (!drag) return
    try {
      drag.target.releasePointerCapture?.(drag.pointerId)
    } catch {
      // المؤشِّر أُفلت أصلًا أو العنصر أُزيل — التفكيك لا يرمي.
    }
    drag = null
    options.onBusy(false)
  }

  return {
    state,

    handlers: {
      onPointerDown(event, handle) {
        // الزرّ الأيسر وحده: الأيمن يفتح قائمة السياق، والأوسط يلصق في لينكس.
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()

        const target = event.currentTarget as Element | null
        if (!target) return
        try {
          target.setPointerCapture(event.pointerId)
        } catch {
          // بلا التقاط يبقى السحب يعمل داخل النافذة — تدهور لا فشل.
        }

        const point = { x: event.clientX, y: event.clientY }
        const current = state.rect.value
        const base = {
          pointerId: event.pointerId,
          target,
          anchor: point,
          prev: current,
          moved: false,
        }

        /*
         * النقل يبدأ **من داخل التحديد وحده**.
         *
         * الاعتماد على أيّ عنصر أرسل الحدث يجعل صحّة الأداة رهنًا بترتيب DOM
         * في طبقة العرض: ضغطة خارج التحديد كانت تُقرأ نقلًا فينزلق التحديد
         * بدل أن يُرسَم واحد جديد. الاحتواء يُفحص هنا، فتبقى الأداة صحيحة
         * أيًّا كان مصدر الحدث — وهو ما يجعلها قابلة للاختبار أصلًا.
         */
        if (handle && current) {
          drag = { ...base, kind: 'resize', handle }
          state.phase.value = 'adjusting'
        } else if (
          !handle &&
          current &&
          state.phase.value === 'ready' &&
          contains(current, viewportPoint(point.x, point.y))
        ) {
          drag = { ...base, kind: 'move', startRect: current }
          state.phase.value = 'adjusting'
        } else {
          drag = { ...base, kind: 'draw' }
          state.phase.value = 'drawing'
          state.rect.value = viewportRect(point.x, point.y, 0, 0)
        }

        options.onBusy(true)
      },

      onPointerMove(event) {
        if (!drag) return
        event.preventDefault()

        const threshold = event.pointerType === 'touch' ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD
        if (
          !drag.moved &&
          Math.hypot(event.clientX - drag.anchor.x, event.clientY - drag.anchor.y) >= threshold
        ) {
          drag.moved = true
        }

        const pointer = viewportPoint(event.clientX, event.clientY)
        const ratio = activeRatio()

        if (drag.kind === 'draw') {
          // `solveDrag` يحصر حول المرساة لا حول الزاوية العليا — بدونها
          // ينزلق المستطيل عند حافّة النافذة في السحب لأعلى أو لليسار.
          state.rect.value = solveDrag(
            viewportPoint(drag.anchor.x, drag.anchor.y),
            pointer,
            options.bounds(),
            { ratio, fromCenter: state.fromCenter.value },
          )
          return
        }

        if (drag.kind === 'resize' && drag.handle && state.rect.value) {
          commitRect(resizeRect(state.rect.value, drag.handle, pointer, { ratio }))
          return
        }

        if (drag.kind === 'move' && drag.startRect) {
          commitRect(
            moveRect(drag.startRect, event.clientX - drag.anchor.x, event.clientY - drag.anchor.y),
          )
        }
      },

      onPointerUp(event) {
        if (!drag) return
        event.preventDefault()

        const { moved, prev } = drag
        endDrag()

        // نقرة لا سحب: يُستعاد ما كان، ولا يُلتقَط شيء ولا يُمحى شيء.
        if (!moved) {
          state.rect.value = prev
          state.phase.value = prev ? 'ready' : 'idle'
          return
        }

        const current = state.rect.value
        // سحب فعلي لكنه أصغر من أن يُلتقَط: يُعامَل كنقرة كذلك.
        if (!current || !isCapturable(current)) {
          state.rect.value = prev
          state.phase.value = prev ? 'ready' : 'idle'
          return
        }
        state.phase.value = 'ready'
      },
    },

    nudge(dx, dy) {
      const current = state.rect.value
      if (!current || state.phase.value !== 'ready') return
      state.rect.value = clampRect(moveRect(current, dx, dy), options.bounds())
    },

    commit() {
      const current = state.rect.value
      if (!current || !isCapturable(current)) return
      options.onCommit(current)
    },

    reset() {
      endDrag()
      state.rect.value = null
      state.phase.value = 'idle'
      state.constrained.value = false
      state.fromCenter.value = false
    },

    dispose() {
      endDrag()
      options.onCancel()
    },
  }
}
