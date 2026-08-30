/**
 * أداة كشف العناصر — تمرير يُبرز، ونقر يلتقط.
 *
 * **المبدأ الحاكم: الاستهداف لا يُبطئ الصفحة.** قياسٌ في Chrome على صفحة
 * 5024 عقدة يقول إن اختبار الإصابة نفسه يكلّف 7.75µs — أي 0.05% من إطار،
 * فليس هو الخطر. الخطر **إعادة حساب الأنماط القسرية**: النداء نفسه على
 * شجرة أنماط مُتّسخة يكلّف ~22ms، أي إطارًا كاملًا وزيادة. لذلك القسمة
 * الصارمة أدناه بين ما يجري كل إطار وما يجري عند تغيّر الهدف وحده.
 *
 * ولذلك أيضًا لا حلقة رسوم ثانية: كل شيء يُعلَّق على `startSync` القائمة —
 * فهي تضمن إطارًا واحدًا لكل إطار، وتكتب لقطة الإحداثيات مرّة واحدة، وتهدأ
 * حين لا شيء يجري.
 */

import { signal, type Signal } from '@preact/signals'

import { pickAt, type Hit } from '@/modules/dom-picker/hit-test'
import {
  boxEdges,
  elementBounds,
  walkDown,
  walkUp,
  type BoxEdges,
} from '@/modules/dom-picker/inspect'
import { buildSelector, shortLabel } from '@/modules/dom-picker/selector'
import { viewportFit, viewportRect, type ViewportRect } from '@/shared/geometry'

import type { SyncReason } from '../sync'

export type ElementPhase =
  /** يتتبّع المؤشِّر — الحالة الأصل. */
  | 'tracking'
  /** الهدف مثبَّت بالمشي في الشجرة؛ المؤشِّر لا يُعيد الاستهداف. */
  | 'pinned'
  /** الالتقاط جارٍ — كل إدخال يُتجاهَل. */
  | 'capturing'

/** ما تعرضه الواجهة عن الهدف — يُكتب عند **تغيّره** لا كل إطار. */
export interface TargetInfo {
  readonly tag: string
  /** الاسم المختصر في البطاقة (`.hero-title`). */
  readonly label: string
  /** المحدِّد الكامل — للنسخ. */
  readonly selector: string
  readonly edges: BoxEdges
  /** الهدف داخل إطار عابر للأصل: يُبرَز صندوقًا واحدًا ويُعلَن خارج النطاق. */
  readonly opaqueFrame: boolean
}

export interface ElementState {
  readonly phase: Signal<ElementPhase>
  /** حدود الهدف بإحداثيات نافذة الإطار الأعلى؛ تُكتب كل إطار. */
  readonly rect: Signal<ViewportRect | null>
  readonly info: Signal<TargetInfo | null>
}

export interface ElementHoverOptions {
  /** يُستدعى حين يطلب المستخدم التقاط الهدف. */
  onCommit(rect: ViewportRect, info: TargetInfo): void
  onCancel(): void
  onBusy(busy: boolean): void
  /** نسخ المحدِّد إلى الحافظة — يُمرَّر من طبقة المحتوى. */
  onCopySelector?(selector: string): void
  /**
   * يطلب إطار مزامنة.
   *
   * الأداة لا تملك الحلقة ولا تبدأ ثانية: `startSync` تضمن إطارًا واحدًا لكل
   * إطار، ولقطة إحداثيات واحدة يقرأها الجميع.
   */
  onInvalidate?(): void
  doc?: Document
  /** مضيف طبقتنا — يُستبعَد من كل اختبار إصابة بالهُويّة. */
  skip?: Element | null
}

export interface ElementHoverTool {
  readonly state: ElementState
  /** يُركَّب على مضيف الطبقة — يصله ما يقع فوق الصفحة. */
  onPointerMove(event: PointerEvent): void
  /** نقرة تلتقط الهدف الحالي. */
  onPointerDown(event: PointerEvent): void
  /** `↑`/`↓` — المشي في الشجرة. يُرجع `true` إن استهلك المفتاح. */
  walk(direction: 'up' | 'down'): boolean
  copySelector(): void
  commit(): void
  reset(): void
  /** يُستدعى من `onFrame` بعد تحديث لقطة الإحداثيات. */
  frame(reasons: ReadonlySet<SyncReason>): void
  dispose(): void
}

/**
 * أقلّ إزاحة تفكّ التثبيت، بالبكسل المنطقي.
 *
 * أربعة أضعاف عتبة السحب: التثبيت يُراد له أن ينجو من رعشة اليد، والسحب
 * لا. وأهمّ من العدد **فضاء القياس**: النقطة المرجعية بإحداثيات النافذة لا
 * الصفحة. فأرة ساكنة تُبقي `clientX/clientY` ثابتين عبر أي تمرير، فالحدث
 * المُصطنَع الذي يُطلقه Chrome بعد التمرير ليعيد حساب `:hover` يقيس مسافة
 * صفر ولا يفكّ التثبيت. لو قيست في فضاء الصفحة لفكّ تمريرٌ مقداره 400px
 * التثبيتَ فورًا — فيصير المشي في الشجرة عديم الفائدة بالضبط كما تحذّر
 * المرحلة.
 */
const PIN_RELEASE = 12

export function createElementHover(options: ElementHoverOptions): ElementHoverTool {
  const doc = options.doc ?? document
  const win = doc.defaultView

  const state: ElementState = {
    phase: signal<ElementPhase>('tracking'),
    rect: signal<ViewportRect | null>(null),
    info: signal<TargetInfo | null>(null),
  }

  /**
   * الحالة الساخنة تعيش في متغيّرات عادية **لا في إشارات**.
   *
   * الإشارة تُخطر مشتركيها عند كل كتابة، فتُعيد Preact الرسم مرّة لكل حدث
   * مؤشِّر — وهو ما تتفاداه هذه الحلقة كلّها. الإشارات تُكتب مرّة واحدة في
   * إطار المزامنة بعد أن يُحسَم الهدف.
   */
  let target: Element | null = null
  let frames: readonly HTMLIFrameElement[] = []
  let opaque = false
  let px = -1
  let py = -1
  let pointerDirty = false
  let pinAt: { x: number; y: number } | null = null

  /**
   * إزاحة الإطار المضيف بإحداثيات النافذة الأعلى.
   *
   * حدود عنصر داخل إطار منسوبة إلى نافذة **ذلك الإطار**، والطبقة تُرسَم في
   * النافذة الأعلى. تُجمَع أصول صناديق محتوى السلسلة كلّها للترجمة عائدًا.
   */
  const frameOffset = (): { x: number; y: number } => {
    let x = 0
    let y = 0
    for (const f of frames) {
      const r = f.getBoundingClientRect()
      const view = f.ownerDocument.defaultView
      const cs = view?.getComputedStyle(f)
      const bx = cs ? Number.parseFloat(cs.borderLeftWidth) || 0 : 0
      const by = cs ? Number.parseFloat(cs.borderTopWidth) || 0 : 0
      const pxs = cs ? Number.parseFloat(cs.paddingLeft) || 0 : 0
      const pys = cs ? Number.parseFloat(cs.paddingTop) || 0 : 0
      x += r.x + bx + pxs
      y += r.y + by + pys
    }
    return { x, y }
  }

  /** حدود الهدف مترجَمةً إلى نافذة الأعلى. */
  const currentRect = (): ViewportRect | null => {
    if (!target) return null
    const r = elementBounds(target)
    if (frames.length === 0) return r
    const off = frameOffset()
    return viewportRect(r.x + off.x, r.y + off.y, r.width, r.height)
  }

  /**
   * المسار البارد — يجري عند **تغيّر الهدف** وحده.
   *
   * كل ما هنا مكلف بمقياس الإطار: `getComputedStyle` يفرض إعادة حساب أنماط،
   * وتوليد المحدِّد قيس بـ~500µs (لأنه يتحقّق من التفرّد بـ`querySelectorAll`
   * لكل مرشّح). تشغيلهما ستّين مرّة في الثانية هو بالضبط ما يمنعه شرط
   * «الاستهداف لا يُبطئ الصفحة» — وهما هنا ≤10 مرّات في الثانية بإيقاع
   * المستخدم لا بإيقاع الإطار.
   */
  const adopt = (hit: Hit | null): void => {
    target = hit?.el ?? null
    frames = hit?.frames ?? []
    opaque = hit?.opaqueFrame ?? false

    if (!target) {
      state.info.value = null
      state.rect.value = null
      return
    }

    const view = target.ownerDocument.defaultView ?? win ?? undefined
    state.info.value = {
      tag: target.tagName.toLowerCase(),
      label: shortLabel(target),
      selector: buildSelector(target).selector,
      edges: boxEdges(target, view),
      opaqueFrame: opaque,
    }
  }

  /**
   * يمرّر الهدف إلى الرؤية إن لم يكن مرئيًا كاملًا — `instant` دائمًا.
   *
   * `behavior: 'instant'` يتفوّق على `scroll-behavior: smooth` في CSS
   * الصفحة بلا حاجة إلى مسّه (الأثر نفسه المقيس في `scrollToInstant` عبر
   * `scrollTo`، والآلية واحدة في المواصفة). و`scrollIntoView` وحدها تحلّ
   * حاويات التمرير المتداخلة — وهو ما لا تفعله `scroller.ts` المبنيّة
   * لحاوية الصفحة الواحدة في المرحلة 10، فليست بديلًا هنا.
   *
   * **لا تُستدعى إن كان الهدف `oversized`**: لا تمرير يجعل عنصرًا أطول من
   * النافذة مرئيًا كاملًا دفعة واحدة — انظر `viewportFit`.
   */
  const scrollIfOffscreen = (el: Element, rect: ViewportRect): void => {
    if (!win) return
    if (viewportFit(rect, win.innerWidth, win.innerHeight) !== 'off-screen') return
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
  }

  /**
   * ينتقل إلى عنصر بعينه (المشي في الشجرة) — يثبّت الهدف ويمرّر إليه.
   *
   * **البند 51 في `Rasd_Plan.md §6`** (بأثر رجعي من المرحلة 9): التمرير
   * التلقائي هنا لا في التتبّع العادي — المستخدم طلب هذا العنصر صراحةً
   * بالسهم، وعدم إظهاره يجعل المشي بلا فائدة.
   */
  const adoptElement = (el: Element | null): boolean => {
    if (!el) return false
    adopt({ el, frames, opaqueFrame: opaque })
    let rect = currentRect()
    if (rect) {
      // `scrollIntoView` على العنصر نفسه يمرّر إطاره الداخلي ثم النافذة
      // الأعلى إن لزم — سلسلة واحدة، لا فرق بين هدف في الصفحة وهدف في إطار.
      scrollIfOffscreen(el, rect)
      rect = currentRect()
    }
    state.rect.value = rect
    if (!pinAt && px >= 0) pinAt = { x: px, y: py }
    state.phase.value = 'pinned'
    options.onInvalidate?.()
    return true
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (state.phase.peek() === 'capturing') return
    // حركة صفرية: قلم يبلّغ تغيّر ضغط، أو حدث مُصطنَع بعد تمرير.
    if (event.clientX === px && event.clientY === py) return

    px = event.clientX
    py = event.clientY

    if (pinAt) {
      const moved = Math.hypot(px - pinAt.x, py - pinAt.y)
      if (moved < PIN_RELEASE) return
      // المؤشِّر أعاد تعريف النيّة — يُلغى التثبيت ويعود التتبّع.
      pinAt = null
      state.phase.value = 'tracking'
    }

    pointerDirty = true
    // لا قياس ولا نمط هنا — رفع راية وطلب إطار فقط.
    options.onInvalidate?.()
  }

  /**
   * المسار الساخن — كل إطار مُبطَل.
   *
   * الترتيب مقصود: **تُقرأ هندسة الصفحة كلّها أوّلًا ثم تُكتب الإشارات**.
   * تداخل «اكتب ← اقرأ ← اكتب» هو ما يجعل إعادة حساب الأنماط تقع N مرّة في
   * الإطار بدل مرّة واحدة.
   */
  const frame = (reasons: ReadonlySet<SyncReason>): void => {
    if (state.phase.peek() === 'capturing') return

    // التمرير وتغيّر المقاس يبدّلان ما تحت مؤشِّر ساكن — يُعاد الاختبار
    // بالإحداثيات نفسها.
    const retarget =
      state.phase.peek() !== 'pinned' &&
      (pointerDirty || reasons.has('scroll') || reasons.has('resize'))
    pointerDirty = false

    if (retarget && px >= 0) {
      const hit = pickAt(doc, px, py, options.skip)
      if (hit?.el !== target) adopt(hit)
    }

    // رخيصة (0.33µs) ومطلوبة كل إطار: العنصر يتحرّك مع التمرير والانتقالات.
    state.rect.value = currentRect()
  }

  const walk = (direction: 'up' | 'down'): boolean => {
    if (!target || state.phase.peek() === 'capturing') return false
    return adoptElement(direction === 'up' ? walkUp(target) : walkDown(target))
  }

  /**
   * التقاط الهدف — يمرّر إليه أوّلًا إن كان `off-screen` فقط.
   *
   * **البند 51 في `Rasd_Plan.md §6`، الفرع الأوّل** («التمرير ثم الالتقاط»):
   * `captureVisibleTab` يلتقط ما هو مرئي وحده، فهدف خارج النافذة يُقصّ إلى
   * صفر بصمت لولا هذا. التمرير `instant` فتقرأ `currentRect()` طازجة —
   * لا حاجة لإطار انتظار: موضع التمرير يُطبَّق فورًا وقراءة الهندسة بعده
   * مباشرة تعكسه (خلاف الرسم المرئي الذي ينتظر الإطار التالي).
   *
   * **الفرع الثاني (`oversized` — الإحالة لمسار المرحلة 10) مؤجَّل صراحةً
   * إلى المرحلة 22**: يحتاج عقد رسائل جديدًا يُقيَّد بارتفاع عنصر لا
   * الصفحة كاملة، وهو عمل مستقلّ لا تعديل سطرين. حتى يُبنى، يلتقط هذا
   * المسار ما هو مرئي من العنصر الطويل — نفس السلوك القائم قبل هذه
   * المرحلة، غير منكوس.
   */
  const commit = (): void => {
    let rect = state.rect.peek()
    const info = state.info.peek()
    if (!rect || !info || state.phase.peek() === 'capturing') return

    if (target && win && viewportFit(rect, win.innerWidth, win.innerHeight) === 'off-screen') {
      target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
      rect = currentRect() ?? rect
      state.rect.value = rect
    }

    state.phase.value = 'capturing'
    options.onBusy(true)
    options.onCommit(rect, info)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (state.phase.peek() === 'capturing') return
    // الدرع يملك الحدث أصلًا؛ المنع يوقف تنقّل الصفحة تحته.
    event.preventDefault()
    commit()
  }

  const copySelector = (): void => {
    const info = state.info.peek()
    if (info) options.onCopySelector?.(info.selector)
  }

  const reset = (): void => {
    target = null
    frames = []
    opaque = false
    px = -1
    py = -1
    pointerDirty = false
    pinAt = null
    state.phase.value = 'tracking'
    state.rect.value = null
    state.info.value = null
    options.onBusy(false)
  }

  return {
    state,
    onPointerMove,
    onPointerDown,
    walk,
    copySelector,
    commit,
    reset,
    frame,
    dispose: reset,
  }
}
