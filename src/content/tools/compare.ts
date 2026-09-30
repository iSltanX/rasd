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
  drawnRectToReference,
  newZone,
  resolveElementZone,
  type ZoneResolution,
} from '@/modules/compare/exclusions'
import {
  identityOverlayTransform,
  matchWidthScale,
  referenceToViewport,
  scaleAt,
  translate,
  type CompareBlendMode,
  type CompareDisplayMode,
  type OverlayTransform,
  type SplitAxis,
} from '@/modules/compare/overlay'
import { pickAt } from '@/modules/dom-picker/hit-test'
import { identify, refind } from '@/modules/dom-picker/identity'
import {
  fromDomRect,
  normalizeRect,
  referencePoint,
  viewportPoint,
  viewportRectToDevice,
  type CoordSpace,
  type DeviceRect,
  type ViewportPoint,
  type ViewportRect,
} from '@/shared/geometry'

import type { SyncReason } from '../sync'
import type { ElementAnchor, ExclusionZone } from '@/shared/exclusion-schema'

// `ui/` يحتاج الأنواع الثلاثة أيضًا (خصائص `ReferenceOverlay.tsx`) — تعيش في
// modules/compare/overlay.ts لا هنا، انظر تعليق تعريفها هناك. تُعاد هنا بلا
// تكرار، نفس نمط `export { pxToRem, SNAP_THRESHOLD_PX }` في measure.ts.
export type { CompareBlendMode, CompareDisplayMode, SplitAxis }

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
  /** مناطق المرجع المستثناة كما حُفظت (ADR 0034). */
  readonly zones: Signal<readonly ExclusionZone[]>
  /** مناطق عنصر من مقاسات أخرى للصفحة نفسها — اقتراحٌ لا يُكتب إلا بنقرة. */
  readonly suggested: Signal<readonly ExclusionZone[]>
  /** إعداد منطقة جارٍ: رسم مستطيل فوق المرجع، أو اختيار عنصر من الصفحة. */
  readonly zoneTool: Signal<'draw' | 'pick' | null>
  /** المستطيل الجاري رسمه، أو العنصر تحت المؤشِّر — بفضاء النافذة. */
  readonly zoneDraft: Signal<{ readonly rect: ViewportRect; readonly selector?: string } | null>
  /** حلّ مناطق العنصر في الصفحة الحيّة الآن، بمعرّف المنطقة. */
  readonly resolved: Signal<Readonly<Record<string, ZoneResolution>>>
}

export interface CompareOptions {
  win?: Window
  onInvalidate?: () => void
  onBusy?: (busy: boolean) => void
  /** مضيف الطبقة — لا يُعدّ عنصرًا يُختار. */
  skip?: Element | null
  /** فضاء الإحداثيات الحيّ — نسبة البكسل لمستطيل العنصر. */
  space?: () => CoordSpace
  /** قائمةٌ جديدة يجب أن تُحفظ مع المرجع — الحفظ خارج هذا الملفّ، و`previous` لإعادتها إن فشل. */
  onZonesChange?: (zones: readonly ExclusionZone[], previous: readonly ExclusionZone[]) => void
}

export interface CompareTool {
  readonly state: CompareState
  setReference(image: ReferenceImage | null): void
  onPointerDown(event: PointerEvent): void
  onPointerMove(event: PointerEvent): void
  onPointerUp(event?: PointerEvent): void
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
  /** مناطق المرجع المحمَّل ومقترحاته — من ردّ `reference/load` أو `reference/set`. */
  setZones(zones: readonly ExclusionZone[], suggested: readonly ExclusionZone[]): void
  setZoneTool(tool: 'draw' | 'pick' | null): void
  removeZone(id: string): void
  /** يضيف المقترح الموجود في الصفحة الآن، بمستطيله فيها. */
  addSuggested(): void
  /** مستطيل كل منطقة عنصر وُجدت في الصفحة الآن — يرافق طلب الفرق. */
  liveRects(): Record<string, DeviceRect>
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
    zones: signal<readonly ExclusionZone[]>([]),
    suggested: signal<readonly ExclusionZone[]>([]),
    zoneTool: signal<'draw' | 'pick' | null>(null),
    zoneDraft: signal(null),
    resolved: signal({}),
  }
  const doc = win.document
  let drawStart: ViewportPoint | null = null
  // العنصر تحت المؤشِّر ومحدِّده — يُبنى المحدِّد حين يتبدّل العنصر لا مع كل حركة.
  let hovered: { el: Element; selector: string } | null = null

  /** مستطيل عنصرٍ بفضاء الجهاز — موضعه في لقطة الصفحة التي يقارنها الفرق الحيّ بالمرجع. */
  const deviceOf = (el: Element): DeviceRect | null => {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0 || !options.space) return null
    return viewportRectToDevice(fromDomRect(r), options.space())
  }

  const locate = (anchor: ElementAnchor): ZoneResolution => {
    const verdict = refind(anchor, doc, options.skip)
    const el = verdict.kind === 'found' || verdict.kind === 'changed' ? verdict.el : null
    return resolveElementZone(anchor, verdict.kind, el ? deviceOf(el) : null)
  }

  /** يعيد العثور على مناطق العنصر — عند التحميل والتمرير وقبل كل قياس. */
  const resolveZones = (): void => {
    const next: Record<string, ZoneResolution> = {}
    for (const zone of state.zones.peek()) {
      if (zone.anchor.kind === 'element') next[zone.id] = locate(zone.anchor)
    }
    state.resolved.value = next
  }

  const commitZones = (zones: readonly ExclusionZone[]): void => {
    const previous = state.zones.peek()
    state.zones.value = zones
    resolveZones()
    options.onZonesChange?.(zones, previous)
  }

  /** العنصر المختار: إطارٌ متداخل يُستثنى كلّه — المحدِّد لا يعبر حدّ الإطار. */
  const pickedAt = (event: PointerEvent): Element | null => {
    const hit = pickAt(doc, event.clientX, event.clientY, options.skip)
    return hit ? (hit.frames[0] ?? hit.el) : null
  }

  let dragStart: ViewportPoint | null = null
  let dragOrigin: OverlayTransform = identityOverlayTransform
  let lastScrollX = win.scrollX
  let lastScrollY = win.scrollY

  /** المقترح يُعرض إن وُجد عنصره في الصفحة الآن وحده — اقتراحُ ما لا يُرى وعدٌ لا يُوفى. */
  const setZones = (zones: readonly ExclusionZone[], suggested: readonly ExclusionZone[]): void => {
    state.zones.value = zones
    state.suggested.value = suggested.filter(
      (s) => s.anchor.kind === 'element' && !locate(s.anchor).fallback,
    )
    resolveZones()
  }

  const setReference = (image: ReferenceImage | null): void => {
    state.reference.value = image
    // مرجعٌ جديد يبدأ بتحويل محايد — موضع مرجع سابق لا معنى له لصورة أخرى.
    state.transform.value = identityOverlayTransform
    // ومناطق المرجع السابق ليست مناطقه — يضعها المستدعي من ردّ المرجع الجديد.
    setZones([], [])
    state.zoneTool.value = null
  }

  const setZoneTool = (tool: 'draw' | 'pick' | null): void => {
    state.zoneTool.value = state.reference.peek() ? tool : null
    state.zoneDraft.value = null
    drawStart = null
    hovered = null
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!state.reference.peek()) return
    if (state.zoneTool.peek() === 'draw') {
      drawStart = viewportPoint(event.clientX, event.clientY)
      return
    }
    if (state.zoneTool.peek()) return
    dragStart = viewportPoint(event.clientX, event.clientY)
    dragOrigin = state.transform.peek()
    options.onBusy?.(true)
  }

  const onPointerMove = (event: PointerEvent): void => {
    const tool = state.zoneTool.peek()
    if (tool === 'pick') {
      const el = pickedAt(event)
      if (el && hovered?.el !== el) hovered = { el, selector: identify(el, win).selector }
      state.zoneDraft.value =
        el && hovered
          ? { rect: fromDomRect(el.getBoundingClientRect()), selector: hovered.selector }
          : null
      return
    }
    if (tool === 'draw') {
      if (drawStart) {
        state.zoneDraft.value = {
          rect: normalizeRect(drawStart, viewportPoint(event.clientX, event.clientY)),
        }
      }
      return
    }
    if (!dragStart) return
    const dx = event.clientX - dragStart.x
    const dy = event.clientY - dragStart.y
    state.transform.value = translate(dragOrigin, dx, dy)
    options.onInvalidate?.()
  }

  /** يُنهي الإعداد الجاري بمنطقة جديدة — أو بلا شيء إن لم يُرسم ما يُعدّ ولم يُصَب عنصر. */
  const finishZone = (event: PointerEvent): void => {
    const tool = state.zoneTool.peek()
    const now = Date.now()
    let zone: ExclusionZone | null = null
    if (tool === 'draw' && drawStart) {
      const rect = drawnRectToReference(
        drawStart,
        viewportPoint(event.clientX, event.clientY),
        state.transform.peek(),
      )
      if (rect.width >= 2 && rect.height >= 2)
        zone = newZone({ kind: 'rect', rect }, crypto.randomUUID(), now)
    }
    if (tool === 'pick') {
      const el = pickedAt(event)
      const rect = el ? deviceOf(el) : null
      if (el && rect) {
        const { selector, hosts, fingerprint } = identify(el, win)
        zone = newZone(
          { kind: 'element', selector, hosts, fingerprint, rect },
          crypto.randomUUID(),
          now,
        )
      }
    }
    setZoneTool(null)
    if (zone) commitZones([...state.zones.peek(), zone])
  }

  const onPointerUp = (event?: PointerEvent): void => {
    if (state.zoneTool.peek()) {
      if (event) finishZone(event)
      else {
        drawStart = null
        state.zoneDraft.value = null
      }
      return
    }
    if (!dragStart) return
    dragStart = null
    options.onBusy?.(false)
  }

  const removeZone = (id: string): void => {
    commitZones(state.zones.peek().filter((z) => z.id !== id))
  }

  const addSuggested = (): void => {
    const now = Date.now()
    const added = state.suggested.peek().flatMap((s) => {
      if (s.anchor.kind !== 'element') return []
      const found = locate(s.anchor)
      if (found.fallback) return []
      return [newZone({ ...s.anchor, rect: found.rect }, crypto.randomUUID(), now)]
    })
    state.suggested.value = []
    if (added.length > 0) commitZones([...state.zones.peek(), ...added])
  }

  const liveRects = (): Record<string, DeviceRect> => {
    resolveZones()
    const out: Record<string, DeviceRect> = {}
    for (const [id, r] of Object.entries(state.resolved.peek())) if (!r.fallback) out[id] = r.rect
    return out
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
    // موضع العنصر يتبع التمرير وتغيير الحجم — منطقته تُرسم حيث هو الآن.
    if (
      (reasons.has('scroll') || reasons.has('resize')) &&
      Object.keys(state.resolved.peek()).length
    )
      resolveZones()
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
    setZones([], [])
    setZoneTool(null)
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
    setZones,
    setZoneTool,
    removeZone,
    addSuggested,
    liveRects,
    reset,
    dispose: reset,
  }
}
