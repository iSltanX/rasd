/**
 * مُنظِّم إيقاع بطابور — يحترم حدّ `captureVisibleTab` ولا يرمي طلبًا.
 *
 * **لماذا طابور لا رفض:** Chrome يحدّ `chrome.tabs.captureVisibleTab` بنداءين
 * في الثانية، ويرمي `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` عند التجاوز.
 * الرفض يعني أن ضغطة اختصار ثالثة سريعة تُسقط لقطة بلا سبب مفهوم للمستخدم؛
 * والتأخير يعني أنها تصل متأخّرة عُشر ثانية. الثاني أفضل دائمًا هنا.
 *
 * **لماذا وحدة خالصة:** الساعة والمُجدوِل يُحقنان، فيُختبَر السلوك بمؤقّتات
 * مزيَّفة بلا متصفّح — وهو الفحص الذي تفرضه المرحلة (20 طلبًا دفعةً واحدة
 * يجب ألّا تتجاوز نداءين في أي ثانية).
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا DOM.
 */

/** حدّ Chrome المعلن: نداءان في الثانية. */
export const CAPTURES_PER_SECOND = 2

/** أقصر فاصل مسموح بين نداءين — 500ms. */
export const MIN_INTERVAL_MS = 1000 / CAPTURES_PER_SECOND

export interface RateLimiterClock {
  now(): number
  /** يُرجع دالّة إلغاء — الطابور يُفرَّغ عند التفكيك. */
  schedule(fn: () => void, delayMs: number): () => void
}

/** الساعة الحقيقية. تُستبدَل في الاختبار. */
export const systemClock: RateLimiterClock = {
  now: () => Date.now(),
  schedule: (fn, delayMs) => {
    const id = setTimeout(fn, delayMs)
    return () => clearTimeout(id)
  },
}

export interface RateLimiter {
  /**
   * ينفّذ المهمّة في أوّل لحظة مسموحة.
   *
   * يُرجع وعدًا بنتيجة المهمّة نفسها — فالمستدعي لا يعرف أنه انتظر، ولا
   * يحتاج منطق إعادة محاولة خاصًّا به.
   */
  run<T>(task: () => Promise<T>): Promise<T>
  /** عدد المهامّ المنتظرة الآن — للتشخيص والاختبار. */
  pending(): number
  /** يُلغي كل ما في الطابور برفض صريح. */
  dispose(): void
}

/**
 * مهمّة في الطابور، **مربوطة بوعدها مسبقًا**.
 *
 * تخزين `resolve`/`reject` منفصلَين يفرض توحيد نوعها عبر مهامّ مختلفة
 * الأنواع، وهو ما لا يقبله التباين العكسي (contravariance) إلا بتأكيد نوع.
 * إغلاقٌ واحد يلتقطهما يجعل النوع محلّيًا لكل مهمّة، فيسقط التأكيد ويبقى
 * الطابور متجانسًا.
 */
interface Entry {
  /** ينفّذ المهمّة ويحسم وعدها. لا يرمي أبدًا — الرفض يمرّ إلى صاحب الوعد. */
  readonly settle: () => Promise<void>
  readonly cancel: (reason: Error) => void
}

/**
 * ينشئ مُنظِّمًا.
 *
 * الخوارزمية: طابور FIFO ومهمّة واحدة قيد التنفيذ، ولحظة سماح تُحسب من
 * **بداية** آخر نداء لا من نهايته. الحدّ حدّ نداءات لا حدّ تزامن؛ لو حُسب من
 * النهاية لأصبح نداء بطيء (ثانيتان) يُضيف تأخيرًا فوق التأخير بلا مبرّر.
 */
export function createRateLimiter(
  clock: RateLimiterClock = systemClock,
  minIntervalMs = MIN_INTERVAL_MS,
): RateLimiter {
  const queue: Entry[] = []
  let lastStartedAt = Number.NEGATIVE_INFINITY
  let draining = false
  let cancelTimer: (() => void) | null = null
  let disposed = false

  const drain = () => {
    if (draining || disposed) return
    const next = queue[0]
    if (!next) return

    const waitMs = lastStartedAt + minIntervalMs - clock.now()
    if (waitMs > 0) {
      // مؤقّت واحد للطابور كلّه لا مؤقّت لكل مهمّة: عشرون طلبًا لا تعني
      // عشرين مؤقّتًا متنافسة على اللحظة نفسها.
      cancelTimer?.()
      cancelTimer = clock.schedule(() => {
        cancelTimer = null
        drain()
      }, waitMs)
      return
    }

    queue.shift()
    draining = true
    lastStartedAt = clock.now()

    void next.settle().finally(() => {
      draining = false
      // الجدولة تُطلَب دائمًا بعد الانتهاء: `drain` نفسها تقرّر إن كان
      // الوقت قد حان أم يحتاج مؤقّتًا.
      drain()
    })
  }

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      if (disposed) return Promise.reject(new Error('مُنظِّم الإيقاع مُفكَّك'))
      return new Promise<T>((resolve, reject) => {
        queue.push({ settle: () => task().then(resolve, reject), cancel: reject })
        drain()
      })
    },

    pending: () => queue.length,

    dispose() {
      disposed = true
      cancelTimer?.()
      cancelTimer = null
      for (const entry of queue.splice(0)) {
        entry.cancel(new Error('أُلغيت — مُنظِّم الإيقاع مُفكَّك'))
      }
    },
  }
}
