/**
 * أداة المقارنة — سحب المرجع وتكبيره وتدويره فوق الصفحة، وأنماط عرضه
 * الأربعة (المرحلة 16، §8.2–8.4).
 *
 * **بنية القرار تتبع `measure.ts` جزئيًا لا كليًا**: نفس شكل المصنع
 * (`createXxx(options): XxxTool`، حالة إشارات، `frame(reasons)` للمسار
 * الدوري)، لكن بلا استهداف DOM إطلاقًا — لا `pickAt` هنا، لأن ما يُسحَب
 * صورة طبقتنا نفسها لا عنصر في صفحة المضيف. فالسحب هنا مطلق منذ أوّل حركة
 * (`onPointerDown` يحفظ التحويل الحالي كنقطة انطلاق) لا عتبة نقرة/سحب
 * كحال `measure.ts`/`area-select.ts` — القرار هنا ثنائي أصلًا (فوق الصورة
 * أو لا)، لا ثلاثي (نقرة/سحب حرّ/على عنصر) يحتاج عتبة لحسمه.
 *
 * **`nudge(dx, dy)` بلا معرفة بخطوة ⇧ داخل هذا الملفّ** — يقرأ
 * `overlay-app.tsx` (دفعة لاحقة) `event.shiftKey` ويحسب `step` قبل
 * الاستدعاء، نفس نمط `area.nudge` تمامًا (انظر `content/tools/area-select.ts`
 * ومعالج لوحة المفاتيح في `overlay-app.tsx`).
 *
 * **`pinned` الافتراضي `true`**: التحويل مُعرَّف أصلًا في فضاء `viewport`
 * (`modules/compare/overlay.ts`) — تثبيتٌ بلا أي تعديل عند التمرير هو
 * السلوك الطبيعي بلا فعل إضافي، وإلغاء التثبيت (تتبّع محتوى الصفحة أثناء
 * التمرير) هو ما يحتاج تعويضًا صريحًا في `frame()`.
 */

import { signal, type Signal } from '@preact/signals'

import {
  identityOverlayTransform,
  matchWidthScale,
  referenceToViewport,
  scaleAt,
  translate,
  type OverlayTransform,
} from '@/modules/compare/overlay'
import { referencePoint, viewportPoint, type ViewportPoint } from '@/shared/geometry'

import type { SyncReason } from '../sync'

export type CompareDisplayMode = 'blink' | 'opacity' | 'blend' | 'split'
export type CompareBlendMode = 'difference' | 'multiply' | 'overlay'
export type SplitAxis = 'vertical' | 'horizontal'

export interface ReferenceImage {
  /** عنوان كائن أو data URL للعرض — لا بايتات خام هنا، انظر `resolveReferenceImage`. */
  readonly url: string
  readonly naturalWidth: number
  readonly naturalHeight: number
}

export interface CompareState {
  readonly reference: Signal<ReferenceImage | null>
  readonly transform: Signal<OverlayTransform>
  readonly displayMode: Signal<CompareDisplayMode>
  readonly blendMode: Signal<CompareBlendMode>
  /** 0–100، عدّ بشري بلا كسر — تُبنى الواجهة بـ`formatHuman` لاحقًا. */
  readonly opacity: Signal<number>
  readonly splitPosition: Signal<number>
  readonly splitAxis: Signal<SplitAxis>
  /** خلاف §3.5 لا يخصّها — قيمة تحكّم لا عدد يُعرض. */
  readonly pinned: Signal<boolean>
  /** أثناء ضغط مفتاح الوميض المطوَّل — يُظهر التنفيذ الحيّ بدل المرجع مؤقّتًا. */
  readonly blinkShowingLive: Signal<boolean>
}

export interface CompareOptions {
  win?: Window
  onInvalidate?: () => void
  onBusy?: (busy: boolean) => void
}

export interface CompareTool {
  readonly state: CompareState
  setReference(image: ReferenceImage | null): void
  onPointerDown(event: PointerEvent): void
  onPointerMove(event: PointerEvent): void
  onPointerUp(): void
  onWheel(event: WheelEvent): void
  /** رياضيات الدلتا في `overlay.ts`؛ خطوة ⇧ تُحسَب خارج هذا الملفّ (انظر تعليق الرأس). */
  nudge(dx: number, dy: number): void
  setDisplayMode(mode: CompareDisplayMode): void
  setBlendMode(mode: CompareBlendMode): void
  setOpacity(percent: number): void
  setSplitPosition(percent: number): void
  setSplitAxis(axis: SplitAxis): void
  togglePinned(): void
  setBlinkShowingLive(showing: boolean): void
  /** «طابق العرض» — الزاوية العلوية اليسرى للمرجع تبقى في مكانها، التحجيم وحده يتغيّر. */
  matchWidth(containerWidth: number): void
  frame(reasons: ReadonlySet<SyncReason>): void
  reset(): void
  dispose(): void
}

/**
 * حدّان عاقلان لا حدّان تقنيّان مُقاسان — بخلاف `MIN_ZOOM`/`MAX_ZOOM` في
 * `editor/camera.ts` (مُشتقَّين من قيد مسرح حقيقي). عنصر `<img>` محوَّل
 * بـCSS لا يحمل قيدًا مكافئًا لذاكرة قماش أو حجم مخزَّن؛ هذان الرقمان
 * شبكة أمان ضدّ تحجيم عديم الفائدة (شبه صفري أو ضخم يتجاوز أي شاشة) لا
 * قياسًا فعليًا. يُعاد النظر فيهما إن كشف استخدام حقيقي حاجة أضيق.
 */
const MIN_SCALE = 0.02
const MAX_SCALE = 50
const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
const clampPercent = (n: number): number => Math.min(100, Math.max(0, n))

export function createCompare(options: CompareOptions = {}): CompareTool {
  const win = options.win ?? window

  const state: CompareState = {
    reference: signal<ReferenceImage | null>(null),
    transform: signal<OverlayTransform>(identityOverlayTransform),
    displayMode: signal<CompareDisplayMode>('split'),
    blendMode: signal<CompareBlendMode>('difference'),
    opacity: signal(50),
    splitPosition: signal(50),
    splitAxis: signal<SplitAxis>('vertical'),
    pinned: signal(true),
    blinkShowingLive: signal(false),
  }

  let dragStart: ViewportPoint | null = null
  let dragOrigin: OverlayTransform = identityOverlayTransform
  let lastScrollX = win.scrollX
  let lastScrollY = win.scrollY

  const setReference = (image: ReferenceImage | null): void => {
    state.reference.value = image
    // مرجعٌ جديد يبدأ بتحويل محايد — موضع مرجع سابق لا معنى له لصورة أخرى.
    state.transform.value = identityOverlayTransform
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!state.reference.peek()) return
    dragStart = viewportPoint(event.clientX, event.clientY)
    dragOrigin = state.transform.peek()
    options.onBusy?.(true)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragStart) return
    const dx = event.clientX - dragStart.x
    const dy = event.clientY - dragStart.y
    state.transform.value = translate(dragOrigin, dx, dy)
    options.onInvalidate?.()
  }

  const onPointerUp = (): void => {
    if (!dragStart) return
    dragStart = null
    options.onBusy?.(false)
  }

  /** عجلة الفأرة: تكبير نحو المؤشِّر — نفس معامل `editor/Stage.tsx` (`exp(-Δy·0.0015)`) لتناسق الإحساس بين أداتين. */
  const onWheel = (event: WheelEvent): void => {
    if (!state.reference.peek()) return
    event.preventDefault()
    const anchor = viewportPoint(event.clientX, event.clientY)
    const t = state.transform.peek()
    const factor = Math.exp(-event.deltaY * 0.0015)
    const newScale = clampScale(t.scale * factor)
    state.transform.value = scaleAt(t, newScale, anchor)
    options.onInvalidate?.()
  }

  const nudge = (dx: number, dy: number): void => {
    if (!state.reference.peek()) return
    state.transform.value = translate(state.transform.peek(), dx, dy)
    options.onInvalidate?.()
  }

  const setDisplayMode = (mode: CompareDisplayMode): void => {
    state.displayMode.value = mode
  }
  const setBlendMode = (mode: CompareBlendMode): void => {
    state.blendMode.value = mode
  }
  const setOpacity = (percent: number): void => {
    state.opacity.value = clampPercent(percent)
  }
  const setSplitPosition = (percent: number): void => {
    state.splitPosition.value = clampPercent(percent)
  }
  const setSplitAxis = (axis: SplitAxis): void => {
    state.splitAxis.value = axis
  }
  const togglePinned = (): void => {
    state.pinned.value = !state.pinned.peek()
  }
  const setBlinkShowingLive = (showing: boolean): void => {
    state.blinkShowingLive.value = showing
  }

  const matchWidth = (containerWidth: number): void => {
    const ref = state.reference.peek()
    if (!ref) return
    const t = state.transform.peek()
    const newScale = clampScale(matchWidthScale(ref.naturalWidth, containerWidth))
    const topLeftAnchor = referenceToViewport(referencePoint(0, 0), t)
    state.transform.value = scaleAt(t, newScale, topLeftAnchor)
    options.onInvalidate?.()
  }

  /**
   * المسار الدوري: التمرير وحده يعني شيئًا لهذه الأداة (لا استهداف عنصر
   * يُعاد حسابه، خلاف `measure.ts`). غير مثبَّت ⇒ يتحرّك المرجع بعكس دلتا
   * التمرير كي يبقى فوق محتوى الصفحة نفسه بصريًا.
   */
  const frame = (reasons: ReadonlySet<SyncReason>): void => {
    if (!reasons.has('scroll')) return
    const dx = win.scrollX - lastScrollX
    const dy = win.scrollY - lastScrollY
    lastScrollX = win.scrollX
    lastScrollY = win.scrollY
    if (dx === 0 && dy === 0) return
    if (!state.pinned.peek() && state.reference.peek()) {
      state.transform.value = translate(state.transform.peek(), -dx, -dy)
      options.onInvalidate?.()
    }
  }

  const reset = (): void => {
    dragStart = null
    lastScrollX = win.scrollX
    lastScrollY = win.scrollY
    state.reference.value = null
    state.transform.value = identityOverlayTransform
    state.displayMode.value = 'split'
    state.blendMode.value = 'difference'
    state.opacity.value = 50
    state.splitPosition.value = 50
    state.splitAxis.value = 'vertical'
    state.pinned.value = true
    state.blinkShowingLive.value = false
    options.onBusy?.(false)
  }

  return {
    state,
    setReference,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    nudge,
    setDisplayMode,
    setBlendMode,
    setOpacity,
    setSplitPosition,
    setSplitAxis,
    togglePinned,
    setBlinkShowingLive,
    matchWidth,
    frame,
    reset,
    dispose: reset,
  }
}
