/**
 * حلقة المزامنة — متى تُعاد الطبقة إلى مكانها.
 *
 * **الحلقة لا تدور إلا عند الحاجة.** الطبقة الخاملة يجب أن تكلّف الصفحة
 * صفرًا تقريبًا، فلا `setInterval` ولا إطار مجدوَل دائمًا: راية «متّسخ»
 * تُرفَع من حدث، وإطار واحد يُجدوَل لمعالجتها ثم تتوقّف الحلقة.
 *
 * **لا قراءة تخطيط داخل معالج التمرير.** هذا هو ما يمنع الارتجاج فعلًا.
 * (`passive: true` مذكور للصحّة، لكنه لا يشتري سلاسة هنا: حدث `scroll` غير
 * قابل للإلغاء ويُرسَل بعد تثبيت التمرير، فلا ينتظره المُركِّب أصلًا —
 * بخلاف `wheel` و`touchmove`.)
 */

export type SyncReason =
  | 'scroll'
  | 'resize'
  | 'dpr'
  | 'manual'
  /** حركة مؤشِّر — تُبطِل الاستهداف بلا قياس في المستمع نفسه. */
  | 'pointer'

export interface SyncOptions {
  /** يُستدعى مرّة واحدة لكل إطار، وفيه وحده يجوز قياس التخطيط. */
  onFrame: (reasons: ReadonlySet<SyncReason>) => void
  doc?: Document
}

export interface SyncLoop {
  /** يرفع الراية ويجدول إطارًا إن لم يكن مجدولًا. */
  invalidate(reason?: SyncReason): void
  /** هل هناك إطار مجدوَل الآن؟ للاختبار والقياس. */
  readonly pending: boolean
  stop(): void
}

export function startSync(options: SyncOptions): SyncLoop {
  const doc = options.doc ?? document
  const win = doc.defaultView
  const reasons = new Set<SyncReason>()
  let frame = 0
  let stopped = false

  const run = () => {
    frame = 0
    if (stopped) return
    const snapshot = new Set(reasons)
    reasons.clear()
    options.onFrame(snapshot)
  }

  const invalidate = (reason: SyncReason = 'manual') => {
    if (stopped) return
    reasons.add(reason)
    // إطار واحد مجدوَل في كل لحظة — عشرة أحداث تمرير في إطار واحد ترسم مرّة.
    if (frame === 0 && win) frame = win.requestAnimationFrame(run)
  }

  const onScroll = () => invalidate('scroll')
  const onResize = () => invalidate('resize')

  win?.addEventListener('scroll', onScroll, { passive: true, capture: true })
  win?.addEventListener('resize', onResize, { passive: true })

  // `ResizeObserver` على الجذر يلتقط تغيّر المقاس الذي لا يصحبه حدث `resize`
  // (فتح شريط جانبي، تغيّر تكبير الصفحة، ظهور شريط تمرير).
  let observer: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined' && doc.documentElement) {
    observer = new ResizeObserver(() => invalidate('resize'))
    observer.observe(doc.documentElement)
  }

  return {
    invalidate,
    get pending() {
      return frame !== 0
    },
    stop() {
      stopped = true
      if (frame !== 0 && win) win.cancelAnimationFrame(frame)
      frame = 0
      reasons.clear()
      observer?.disconnect()
      observer = null
      win?.removeEventListener('scroll', onScroll, { capture: true })
      win?.removeEventListener('resize', onResize)
    },
  }
}
