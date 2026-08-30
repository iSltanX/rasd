/**
 * أداة الفحص — تمرير يستهدف، ونقر يثبّت، ولوحة تقرأ.
 *
 * **بلا درع كامل، وهذا قرار مقيس لا تبسيط.** أوضاع المرحلتين 8 و9 ترفع
 * `pointer-events: auto` على المضيف كي تصلها الأحداث؛ وتحت ذلك الدرع قِيس
 * أن `matches(':hover')` يساوي **false** وأن قواعد `:hover`/`:active`
 * معطَّلة. فمحرّك التتالي يُعلن قاعدة `.btn:hover` غير فائزة وهي التي تفوز
 * حين يمرّ المستخدم فعلًا — أي أن الفاحص **يكذب**.
 *
 * والبديل المقيس **درع جزئيّ**: المضيف يبقى `pointer-events: none` (كما هو
 * أصلًا)، واللوحة وحدها تعلن `auto` لنفسها — وهو نمط `.rasd-ov-place`
 * القائم منذ المرحلة 9. النتيجة: حقيقة التتالي كاملةً، **مع** بقاء نقرات
 * واجهتنا تصل إليها (وهو ما يخسره رفع الدرع كلّيًّا).
 *
 * وثلاثة حدود مقيسة تُعلَن:
 *   1. القراءة تقع عند **الإفلات** لا عند الضغط: `:active` تشتعل بنقرة
 *      التثبيت نفسها حتى مع `preventDefault`، وتنطفئ عند الإفلات.
 *   2. مستمعات الصفحة المسجَّلة في طور الالتقاط قبلنا تعمل؛ التنقّل يُمنع
 *      وأثرها الجانبي لا.
 *   3. تفاعلات الصفحة البصرية حيّة تحت المؤشِّر — وهي الحقيقة التي نقرؤها
 *      لا عيبٌ فيها.
 */

import { signal, type Signal } from '@preact/signals'

import { pageOffset, readInspectStyles, readState } from '@/modules/computed-style/read'
import { pickAt } from '@/modules/dom-picker/hit-test'
import { buildSelector, shortLabel } from '@/modules/dom-picker/selector'
import { traceVariable, type VarTrace } from '@/modules/var-trace/declaration'
import { INSPECT_PROPS, type InspectSnapshot } from '@/shared/inspect-schema'

import { createCssResolver, firstVarName, type CssResolver } from '../css-resolver'

import type { SyncReason } from '../sync'
import type { WinningRule } from '@/modules/computed-style/cascade'

/** ما تعرضه اللوحة عن العنصر المثبَّت. */
export interface InspectDetail {
  readonly snapshot: InspectSnapshot
  /** القاعدة الفائزة بكل خاصّية — `null` حين لا قاعدة مؤلِّف. */
  readonly rules: ReadonlyMap<string, WinningRule | null>
  /** تتبّع المتغيّر لكل خاصّية لونية تحمل واحدًا. */
  readonly vars: ReadonlyMap<string, VarTrace>
}

export interface InspectState {
  /** مستطيل الهدف تحت المؤشِّر — يُحدَّث كل إطار. */
  readonly rect: Signal<{ x: number; y: number; width: number; height: number } | null>
  /** اللقطة المثبَّتة — `null` يعني حالة الخمول. */
  readonly detail: Signal<InspectDetail | null>
}

export interface InspectOptions {
  doc?: Document
  /**
   * حلّال التتالي المشترك.
   *
   * يُمرَّر من `content/index.ts` كي تتشارك أداتا الفحص واللون فهرسًا
   * واحدًا — بناؤه مقيس بـ99.5ms، وبناؤه مرّتين لمستند واحد هدرٌ صرف.
   * وحين لا يُمرَّر تُنشئ الأداة حلّالها الخاصّ فتبقى مستقلّة في الاختبار.
   */
  resolver?: CssResolver
  /** يُبلَّغ عند تثبيت لقطة أو مسحها. */
  onReport?: (snapshot: InspectSnapshot | null) => void
  onInvalidate?: () => void
}

export interface InspectTool {
  readonly state: InspectState
  onPointerMove(event: PointerEvent): void
  /** التثبيت عند **الإفلات** لا عند الضغط — انظر رأس الملفّ. */
  onPointerUp(event: PointerEvent): void
  frame(reasons: ReadonlySet<SyncReason>): void
  /** يمسح التثبيت ويعود إلى الخمول. */
  clear(): void
  reset(): void
  dispose(): void
}

/** خصائص تُتتبَّع متغيّراتها — الألوان أوّلًا كما يفرض `Rasd_Ar.md §7.4`. */
const TRACED = ['color', 'background-color', 'border-block-start-color', 'outline-color']

export function createInspect(options: InspectOptions = {}): InspectTool {
  const doc = options.doc ?? document
  const win = doc.defaultView ?? window

  /** حلّال خاصّ، كسول — لا يُبنى ما لم يُثبَّت عنصر بلا حلّال مُمرَّر. */
  let own: CssResolver | null = null
  const ownResolver = (): CssResolver => (own ??= createCssResolver(doc, win))

  const state: InspectState = {
    rect: signal<{ x: number; y: number; width: number; height: number } | null>(null),
    detail: signal<InspectDetail | null>(null),
  }

  // حالة ساخنة في متغيّرات عادية لا إشارات — تُكتب مرّة في إطار المزامنة.
  let target: Element | null = null
  let px = -1
  let py = -1
  let dirty = false

  const onPointerMove = (event: PointerEvent): void => {
    if (state.detail.peek()) return // مثبَّت — لا يُعاد الاستهداف.
    if (event.clientX === px && event.clientY === py) return
    px = event.clientX
    py = event.clientY
    dirty = true
    options.onInvalidate?.()
  }

  const frame = (reasons: ReadonlySet<SyncReason>): void => {
    if (state.detail.peek()) return
    const retarget = dirty || reasons.has('scroll') || reasons.has('resize')
    dirty = false
    if (retarget && px >= 0) {
      const hit = pickAt(doc, px, py, null)
      target = hit?.el ?? null
    }
    if (!target) {
      state.rect.value = null
      return
    }
    const r = target.getBoundingClientRect()
    state.rect.value = { x: r.x, y: r.y, width: r.width, height: r.height }
  }

  /**
   * يبني اللقطة الكاملة — عند التثبيت وحده.
   *
   * كل ما هنا مكلف بمقياس الإطار: بناء الفهرس، وحلّ التتالي، وتتبّع
   * المتغيّرات. ولا يُدفَع إلا بأمر المستخدم.
   */
  const pin = (el: Element): void => {
    const built = buildSelector(el)
    const reading = readInspectStyles(el, win)
    const box = el.getBoundingClientRect()
    const page = pageOffset(el, win)
    const live = readState(el)

    const resolver = options.resolver ?? ownResolver()
    const idx = resolver.ensureIndex()
    const context = resolver.ctx()
    const blocked = resolver.blocked
    const rules = resolver.resolve(el, INSPECT_PROPS)

    const vars = new Map<string, VarTrace>()
    for (const prop of TRACED) {
      const rule = rules.get(prop)
      const name = rule ? firstVarName(rule.declared) : null
      if (name) {
        vars.set(prop, traceVariable(el, name, { win, index: idx, ctx: context, blocked }))
      }
    }

    const snapshot: InspectSnapshot = {
      at: Date.now(),
      tag: el.tagName.toLowerCase(),
      label: shortLabel(el),
      selector: built.selector,
      unique: built.unique,
      positional: built.positional,
      inShadow: built.inShadow,
      rect: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        pageX: page.pageX,
        pageY: page.pageY,
      },
      styles: reading.styles,
      limits: {
        closedShadowHost: false,
        opaqueFrame: false,
        unlaid: reading.unlaid,
        animating: reading.animating,
        unreadableSheets: blocked.count,
        unreadableOrigins: blocked.origins,
        indexComplete: idx.complete,
        // الدرع جزئيّ، فالحالات التفاعلية تُقرأ صحيحةً — والعلم يُرفع فقط
        // حين تكون كلّها كاذبة والمؤشِّر فوق العنصر (حالة لا تقع اليوم).
        interactiveStateUnknown: !live.hover && !live.focus && px < 0,
      },
    }

    state.detail.value = { snapshot, rules, vars }
    options.onReport?.(snapshot)
  }

  const onPointerUp = (): void => {
    if (state.detail.peek() || !target) return
    pin(target)
  }

  const clear = (): void => {
    state.detail.value = null
    options.onReport?.(null)
    dirty = true
    options.onInvalidate?.()
  }

  const reset = (): void => {
    target = null
    px = -1
    py = -1
    dirty = false
    state.rect.value = null
    if (state.detail.peek()) {
      state.detail.value = null
      options.onReport?.(null)
    }
  }

  const dispose = (): void => {
    reset()
    // الحلّال المُمرَّر ليس ملكنا — يُحرّره من بناه في `content/index.ts`.
    own?.dispose()
    own = null
  }

  return { state, onPointerMove, onPointerUp, frame, clear, reset, dispose }
}

/** يمشي على شجرة القواعد ويجمع قواعد الأنماط مفكَّكةَ التداخل. */
