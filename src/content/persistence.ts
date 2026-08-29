/**
 * البقاء — إعادة الإلحاق بعد حذف الصفحة لنا، وكشف تغيّر المسار في SPA.
 *
 * **لماذا لا يكفي `MutationObserver` لكشف التنقّل.** موجّه عميل نموذجي
 * (وعيّنة `spa/` في هذا المستودع حرفيًا) ينادي `history.pushState` ثم يبدّل
 * `innerHTML` لعقدة **عميقة داخل `body`**. مراقبنا على `documentElement`
 * بلا `subtree` — عمدًا، لأن `subtree: true` على مستند غريب تكلفة غير
 * مقبولة — فلا يرى شيئًا، و`popstate` لا يُطلَق لـ`pushState`. لذلك اعتراض
 * `history` هو **المصدر الوحيد** لهذه الإشارة، لا احتياطي لها.
 *
 * **التراجع لا الاستسلام.** صفحة تحذف كل عنصر غريب في كل طفرة (عيّنة
 * `mutating/`) تدخل معنا في حلقة لا تنتهي. نتراجع بعد عدد محاولات، لكن
 * التراجع **قابل للنقض**: تغيّر مسار أو `pageshow` يعيد ربط المراقبين
 * فعليًا — لا يكفي تصفير العدّاد وترك المراقب مفصولًا.
 */

export interface PersistenceOptions {
  /** يعيد إلحاق المضيف. يجب أن يكون آمنًا للاستدعاء المتكرِّر. */
  reattach: () => void
  /** هل المضيف موصول الآن؟ */
  isAttached: () => boolean
  /** تغيّر مسار — الأدوات تعيد ضبط نفسها. */
  onRouteChange: (url: string) => void
  /** استسلمنا عن إعادة الإلحاق في هذا المستند. */
  onGiveUp?: (attempts: number) => void
  doc?: Document
  /** كم محاولة قبل التراجع. */
  maxAttempts?: number
}

export interface Persistence {
  stop(): void
  /** يستأنف بعد تراجع — يعيد ربط المراقبين لا يصفّر عدّادًا فقط. */
  resume(): void
  readonly attempts: number
  readonly surrendered: boolean
}

const DEFAULT_MAX_ATTEMPTS = 5

export function startPersistence(options: PersistenceOptions): Persistence {
  const doc = options.doc ?? document
  const win = doc.defaultView
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  let attempts = 0
  let surrendered = false
  let stopped = false
  let observer: MutationObserver | null = null

  const check = () => {
    if (stopped || surrendered) return
    if (options.isAttached()) {
      // نجحنا؛ العدّاد يخصّ نوبة الحذف الحالية لا عمر المستند.
      attempts = 0
      return
    }
    attempts++
    if (attempts > maxAttempts) {
      surrendered = true
      observer?.disconnect()
      options.onGiveUp?.(attempts)
      return
    }
    options.reattach()
  }

  const observe = () => {
    if (!doc.documentElement || typeof MutationObserver === 'undefined') return
    observer?.disconnect()
    observer = new MutationObserver(check)
    // بلا `subtree`: يكفي أن نرى حذف طفلنا المباشر، وتتبّع الشجرة كاملةً
    // على مستند غريب تكلفة لا تُبرَّر.
    observer.observe(doc.documentElement, { childList: true })
  }
  observe()

  // ── اعتراض `history` ────────────────────────────────────────────
  let restoreHistory: (() => void) | null = null
  if (win) {
    const h = win.history
    // التقاط الدالّتين الأصليّتين **بلا ربط** مقصود: نستدعيهما لاحقًا
    // بـ`.apply(this, args)` فيبقى `this` هو كائن `History` الحقيقي، ونحتاج
    // المرجع نفسه لمقارنته وقت الاستعادة. الربط هنا يكسر الأمرين معًا.
    /* eslint-disable @typescript-eslint/unbound-method */
    const originalPush = h.pushState
    const originalReplace = h.replaceState
    /* eslint-enable @typescript-eslint/unbound-method */

    const announce = () => {
      if (stopped) return
      if (surrendered) resume()
      options.onRouteChange(win.location.href)
    }

    // التغليف يحفظ `this` والقيمة المرجَعة: الموجّه قد يعتمد عليهما، وكسرهما
    // يكسر الصفحة لا أداتنا فقط.
    const wrap = <T extends typeof originalPush>(fn: T) =>
      function (this: History, ...args: Parameters<T>) {
        const result = fn.apply(this, args)
        announce()
        return result
      }

    const patchedPush = wrap(originalPush)
    const patchedReplace = wrap(originalReplace)
    h.pushState = patchedPush
    h.replaceState = patchedReplace

    const onPopState = () => announce()
    const onHashChange = () => announce()
    const onPageShow = (e: PageTransitionEvent) => {
      // العودة من bfcache: المستند نفسه لكن حالتنا قد تكون تفكّكت.
      if (e.persisted) {
        resume()
        check()
      }
    }

    win.addEventListener('popstate', onPopState)
    win.addEventListener('hashchange', onHashChange)
    win.addEventListener('pageshow', onPageShow)

    restoreHistory = () => {
      // تُعاد الأصلية **فقط** إن كانت نسختنا ما تزال المثبَّتة. لو غلّفت
      // الصفحة الدالّة بعدنا، فإعادة الأصلية تمحو تغليفها هي وتكسر موجّهها
      // — والقاعدة أن `teardown()` لا يترك أثرًا، لا أن يُتلف عمل غيرنا.
      if (h.pushState === patchedPush) h.pushState = originalPush
      if (h.replaceState === patchedReplace) h.replaceState = originalReplace
      win.removeEventListener('popstate', onPopState)
      win.removeEventListener('hashchange', onHashChange)
      win.removeEventListener('pageshow', onPageShow)
    }
  }

  function resume() {
    if (stopped) return
    surrendered = false
    attempts = 0
    observe()
  }

  return {
    stop() {
      stopped = true
      observer?.disconnect()
      observer = null
      restoreHistory?.()
      restoreHistory = null
    },
    resume,
    get attempts() {
      return attempts
    },
    get surrendered() {
      return surrendered
    },
  }
}
