/**
 * أداة القياس — أبعاد عنصر، مسافة بين اثنين، قياس حرّ، ومحاذاة.
 *
 * **بنية القرار مطابقة لـ`element-hover.ts` عمدًا**: نفس القسمة بين مسار
 * بارد (يجري عند تغيّر الهدف) ومسار ساخن (كل إطار)، ونفس منطق الاستهداف
 * (`pickAt`) — لأن «مرّر فاستهدف» هو نفسه هنا، وإعادة اختراعه تُدخل عطلًا
 * لا داعي له فيما ثبتت صحّته في المرحلة 9.
 *
 * **الفرق الجوهري**: عنصر واحد يُستهدَف هناك، واثنان هنا — الأوّل يُثبَّت
 * بنقرة («مرجع»)، والثاني يُتتبَّع بالمرور. والقياس الحرّ (بلا عنصر) حالة
 * ثالثة: سحب بين نقطتين على الطبقة نفسها لا على الصفحة.
 */

import { signal, type Signal } from '@preact/signals'

import { pickAt } from '@/modules/dom-picker/hit-test'
import { boxEdges, boxGap, elementBounds, type BoxEdges, type Gap } from '@/modules/dom-picker/inspect'
import { detectAlignment, type AlignMatch } from '@/modules/measure/alignment'
import { fourWayGap, type FourWayGap } from '@/modules/measure/distance'
import { nearestSnap, SNAP_THRESHOLD_PX } from '@/modules/measure/snap'
import { pxToRem } from '@/modules/measure/units'
import { normalizeRect, viewportPoint, type ViewportPoint, type ViewportRect } from '@/shared/geometry'

import type { SyncReason } from '../sync'

export type MeasureUnit = 'px' | 'rem'

/** ما تعرفه الأداة عن هدف واحد — مرجعًا كان أو هدف تتبّع. */
export interface MeasureTarget {
  readonly rect: ViewportRect
  readonly edges: BoxEdges
  readonly gap: Gap
}

/** حصيلة المقارنة بين المرجع والهدف الحيّ — تُحسب كلّما توفّر الاثنان. */
export interface MeasureComparison {
  readonly gap: FourWayGap
  readonly alignment: readonly AlignMatch[]
}

export interface MeasureState {
  /** الهدف تحت المؤشِّر الآن — `null` حين لا شيء تحته أو أثناء سحب حرّ. */
  readonly hover: Signal<MeasureTarget | null>
  /** عنصر مثبَّت بنقرة — القياس بينه وبين `hover` يُحسب في `comparison`. */
  readonly reference: Signal<MeasureTarget | null>
  readonly comparison: Signal<MeasureComparison | null>
  /** مستطيل السحب الحرّ الجاري أو المنتهي — بلا عنصر. */
  readonly freeRect: Signal<ViewportRect | null>
  readonly cursor: Signal<ViewportPoint | null>
  /** `⌥` معطوظ الآن — للعرض فقط؛ القرار الفعلي في `snapPoint`. */
  readonly snapHeld: Signal<boolean>
  readonly unit: Signal<MeasureUnit>
}

export interface MeasureOptions {
  doc?: Document
  /** مضيف طبقتنا — يُستبعَد من كل اختبار إصابة، كما في كل أداة تفاعلية. */
  skip?: Element | null
  onInvalidate?: () => void
  onCancel(): void
  onBusy(busy: boolean): void
}

export interface MeasureTool {
  readonly state: MeasureState
  onPointerMove(event: PointerEvent): void
  onPointerDown(event: PointerEvent): void
  /** لا تحتاج الحدث — الحسم يعتمد على الحالة المتراكمة من `onPointerMove`. */
  onPointerUp(): void
  /** نقرة على خلفية الطبقة (لا على عنصر) تمسح المرجع — النقر بعيدًا يُلغي التحديد. */
  clearReference(): void
  toggleUnit(): void
  reset(): void
  frame(reasons: ReadonlySet<SyncReason>): void
  dispose(): void
}

/** بكسل rem الجذر — يُقرأ عند الحاجة لا يُخزَّن؛ `font-size` قد يتغيّر. */
function rootFontSize(doc: Document, win: Window): number {
  const v = Number.parseFloat(win.getComputedStyle(doc.documentElement).fontSize)
  return Number.isFinite(v) && v > 0 ? v : 16
}

/** يجمع حواف عنصر مستهدَف في هيئة واحدة — يُستدعى عند تغيّر الهدف فقط. */
function targetOf(el: Element, win: Window): MeasureTarget {
  return { rect: elementBounds(el), edges: boxEdges(el, win), gap: boxGap(el, win) }
}

export function createMeasure(options: MeasureOptions): MeasureTool {
  const doc = options.doc ?? document
  const win = doc.defaultView ?? globalThis.window

  const state: MeasureState = {
    hover: signal<MeasureTarget | null>(null),
    reference: signal<MeasureTarget | null>(null),
    comparison: signal<MeasureComparison | null>(null),
    freeRect: signal<ViewportRect | null>(null),
    cursor: signal<ViewportPoint | null>(null),
    snapHeld: signal(false),
    unit: signal<MeasureUnit>('px'),
  }

  // حالة ساخنة خارج الإشارات — السبب نفسه المكتوب في `element-hover.ts`:
  // كتابة إشارة تُخطر كل مشترك، وهذا يجري ستّين مرّة في الثانية هنا لولاه.
  let hoverEl: Element | null = null
  let referenceEl: Element | null = null
  let px = -1
  let py = -1
  let pointerDirty = false
  let snapDisabled = false

  let dragStart: ViewportPoint | null = null
  let dragActive = false

  /** نفس عتبة `area-select.ts` — حركة أقلّ منها نقرة لا سحب. */
  const DRAG_THRESHOLD = 3

  /**
   * مرشَّحات الالتقاط اللحظي — حوافّ المرجع وحواف الهدف الحيّ معًا.
   *
   * تُحسَب من الإشارتين مباشرة لا من حالة منفصلة: كلاهما محدَّث بالفعل حين
   * يُستدعى هذا، فلا ازدواج مصدر حقيقة.
   */
  const snapCandidates = (axis: 'x' | 'y'): number[] => {
    const out: number[] = []
    for (const t of [state.reference.peek(), state.hover.peek()]) {
      if (!t) continue
      if (axis === 'x') out.push(t.rect.x, t.rect.x + t.rect.width)
      else out.push(t.rect.y, t.rect.y + t.rect.height)
    }
    return out
  }

  const recomputeComparison = (): void => {
    const ref = state.reference.peek()
    const hov = state.hover.peek()
    state.comparison.value =
      ref && hov ? { gap: fourWayGap(ref.rect, hov.rect), alignment: detectAlignment(ref.rect, hov.rect) } : null
  }

  /** المسار البارد — عند تغيّر هدف التتبّع فقط، كما في `element-hover.ts`. */
  const adoptHover = (el: Element | null): void => {
    hoverEl = el
    state.hover.value = el ? targetOf(el, win) : null
    recomputeComparison()
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (event.clientX === px && event.clientY === py) return
    px = event.clientX
    py = event.clientY
    snapDisabled = event.altKey
    state.snapHeld.value = !event.altKey

    if (dragStart) {
      if (!dragActive) {
        const moved = Math.hypot(px - dragStart.x, py - dragStart.y)
        if (moved < DRAG_THRESHOLD) return
        dragActive = true
        options.onBusy(true)
      }
      const candX = snapCandidates('x')
      const candY = snapCandidates('y')
      const end = viewportPoint(
        snapDisabled ? px : (nearestSnap(px, candX) ?? px),
        snapDisabled ? py : (nearestSnap(py, candY) ?? py),
      )
      state.freeRect.value = normalizeRect(dragStart, end)
      options.onInvalidate?.()
      return
    }

    state.cursor.value = viewportPoint(px, py)
    pointerDirty = true
    options.onInvalidate?.()
  }

  /** المسار الساخن — كل إطار، بعد أن تُقرأ الهندسة كلّها مرّة واحدة. */
  const frame = (reasons: ReadonlySet<SyncReason>): void => {
    const retarget = pointerDirty || reasons.has('scroll') || reasons.has('resize')
    pointerDirty = false

    if (retarget && px >= 0 && !dragActive) {
      const hit = pickAt(doc, px, py, options.skip)
      const el = hit?.el ?? null
      if (el !== hoverEl) adoptHover(el)
    }

    // رخيصة ومطلوبة كل إطار: الهدفان يتحرّكان مع التمرير والانتقالات.
    if (hoverEl && !dragActive) {
      const rect = elementBounds(hoverEl)
      const prev = state.hover.peek()
      if (prev) state.hover.value = { ...prev, rect }
    }
    if (referenceEl) {
      const rect = elementBounds(referenceEl)
      const prev = state.reference.peek()
      if (prev) state.reference.value = { ...prev, rect }
    }
    if ((hoverEl || referenceEl) && (reasons.has('scroll') || reasons.has('resize'))) {
      recomputeComparison()
    }
  }

  /**
   * ضغط على عنصر: لا مرجع بعد ← يُثبَّت هذا مرجعًا. مرجع قائم ← يُستبدَل —
   * لا حاجة لمسحه أوّلًا، فالنقرة التالية دائمًا أوضح نيّة من صمت ينتظر.
   *
   * ضغط على الخلفية: بداية سحب محتملة. يُحسَم في `onPointerMove` — حركة
   * دون العتبة تبقيه نقرة (فتمسح المرجع عند `onPointerUp`)، وفوقها يصير
   * قياسًا حرًّا بين نقطتين.
   */
  const onPointerDown = (event: PointerEvent): void => {
    const el = pickAt(doc, event.clientX, event.clientY, options.skip)?.el ?? null

    if (!el) {
      dragStart = viewportPoint(event.clientX, event.clientY)
      dragActive = false
      return
    }

    referenceEl = el
    state.reference.value = targetOf(el, win)
    recomputeComparison()
    options.onInvalidate?.()
  }

  const onPointerUp = (): void => {
    if (dragStart && !dragActive) {
      // نقرة طائشة على الخلفية بلا سحب فعلي: تُعامَل كمسح للمرجع، لا كقياس حرّ صفري.
      clearReference()
    }
    if (dragActive) options.onBusy(false)
    dragActive = false
    dragStart = null
  }

  const clearReference = (): void => {
    referenceEl = null
    state.reference.value = null
    state.comparison.value = null
    state.freeRect.value = null
    options.onInvalidate?.()
  }

  const toggleUnit = (): void => {
    state.unit.value = state.unit.peek() === 'px' ? 'rem' : 'px'
  }

  const reset = (): void => {
    hoverEl = null
    referenceEl = null
    px = -1
    py = -1
    pointerDirty = false
    snapDisabled = false
    dragStart = null
    dragActive = false
    state.hover.value = null
    state.reference.value = null
    state.comparison.value = null
    state.freeRect.value = null
    state.cursor.value = null
    state.snapHeld.value = false
    options.onBusy(false)
  }

  return {
    state,
    onPointerMove,
    onPointerDown,
    onPointerUp,
    clearReference,
    toggleUnit,
    reset,
    frame,
    dispose: reset,
  }
}

/** جذر الخط الحيّ للمستهلكين خارج الملفّ (تحويل px↔rem في اللوحة). */
export function measureRootFontSize(doc: Document = document): number {
  const win = doc.defaultView ?? globalThis.window
  return rootFontSize(doc, win)
}

export { pxToRem, SNAP_THRESHOLD_PX }
