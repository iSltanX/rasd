import { describe, expect, it, vi } from 'vitest'

import {
  CAPTURES_PER_SECOND,
  createRateLimiter,
  MIN_INTERVAL_MS,
  type RateLimiterClock,
} from '@/modules/capture/rate-limit'

/**
 * مُنظِّم إيقاع الالتقاط.
 *
 * الحدّ حدّ **متصفّح** لا اختيار: تجاوزه يرمي
 * `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`. لذلك يُختبَر بساعة مزيَّفة
 * تُتيح قياس التوزيع الزمني الفعلي للنداءات، لا مجرّد أنها نُفِّذت كلّها.
 */

/** ساعة يقودها الاختبار: الزمن لا يتقدّم إلا بـ`advance`. */
function fakeClock() {
  let now = 0
  const timers: { at: number; fn: () => void; cancelled: boolean }[] = []

  const clock: RateLimiterClock = {
    now: () => now,
    schedule: (fn, delayMs) => {
      const timer = { at: now + delayMs, fn, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    },
  }

  /**
   * يُفرِغ طابور المهامّ الدقيقة.
   *
   * ضروري **قبل** البحث عن مؤقّت مستحقّ لا بعده فقط: المُنظِّم يجدول المؤقّت
   * التالي داخل `finally` لمهمّة غير متزامنة، فالمؤقّت لا يوجد بعدُ لحظة
   * انتهاء `fn()`. البحث قبل التفريغ يجده غائبًا فيخرج من الحلقة مبكّرًا،
   * وتبدو 18 مهمّة كأنها لم تُنفَّذ أبدًا.
   */
  const flush = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve()
  }

  /** يقدّم الزمن ويُطلق ما استحقّ. */
  async function advance(ms: number) {
    const target = now + ms
    for (;;) {
      await flush()
      const next = timers
        .filter((t) => !t.cancelled && t.at <= target)
        .sort((a, b) => a.at - b.at)[0]
      if (!next) break
      now = Math.max(now, next.at)
      next.cancelled = true
      next.fn()
    }
    now = target
    await flush()
  }

  return { clock, advance, at: () => now }
}

describe('الثوابت', () => {
  it('نداءان في الثانية — حدّ Chrome المعلن', () => {
    expect(CAPTURES_PER_SECOND).toBe(2)
    expect(MIN_INTERVAL_MS).toBe(500)
  })
})

describe('ضغط عشرين طلبًا', () => {
  it('لا يتجاوز نداءين في أي نافذة ثانية واحدة', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    const startedAt: number[] = []
    const results: Promise<number>[] = []
    for (let i = 0; i < 20; i++) {
      results.push(
        limiter.run(() => {
          startedAt.push(clock.now())
          return Promise.resolve(i)
        }),
      )
    }

    // 20 نداءً على 500ms لكل واحد = 9500ms للأخير. نتجاوزها بهامش.
    await advance(12_000)
    await Promise.all(results)

    expect(startedAt).toHaveLength(20)

    // الفحص الحاسم: أي نافذة مدّتها ثانية لا تحوي أكثر من نداءين.
    for (const t of startedAt) {
      const inWindow = startedAt.filter((other) => other >= t && other < t + 1000)
      expect(inWindow.length, `نافذة تبدأ عند ${t}ms`).toBeLessThanOrEqual(CAPTURES_PER_SECOND)
    }
  })

  it('يحفظ ترتيب FIFO ويُرجع نتيجة كل مهمّة إلى صاحبها', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    const order: number[] = []
    const results = Array.from({ length: 20 }, (_, i) =>
      limiter.run(() => {
        order.push(i)
        return Promise.resolve(i * 10)
      }),
    )

    await advance(12_000)
    expect(await Promise.all(results)).toEqual(Array.from({ length: 20 }, (_, i) => i * 10))
    expect(order).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })

  it('لا يُسقط طلبًا واحدًا تحت الضغط — الطابور يفرغ كاملًا', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    let ran = 0
    const results = Array.from({ length: 20 }, () =>
      limiter.run(() => {
        ran += 1
        return Promise.resolve()
      }),
    )

    expect(limiter.pending()).toBeGreaterThan(0)
    await advance(12_000)
    await Promise.all(results)

    expect(ran).toBe(20)
    expect(limiter.pending()).toBe(0)
  })
})

describe('السلوك الزمني', () => {
  it('أوّل نداء ينطلق فورًا بلا انتظار', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    let at = -1
    const p = limiter.run(() => {
      at = clock.now()
      return Promise.resolve()
    })
    await advance(0)
    await p
    expect(at).toBe(0)
  })

  it('الفاصل يُحسب من بداية النداء السابق لا من نهايته', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    const startedAt: number[] = []
    // مهمّة بطيئة (400ms) ثم مهمّة سريعة: الثانية يجب أن تنطلق عند 500
    // لا عند 900 (400 + 500).
    const slow = limiter.run(async () => {
      startedAt.push(clock.now())
      await new Promise<void>((r) => clock.schedule(r, 400))
    })
    const fast = limiter.run(() => {
      startedAt.push(clock.now())
      return Promise.resolve()
    })

    await advance(2000)
    await Promise.all([slow, fast])

    expect(startedAt[0]).toBe(0)
    expect(startedAt[1]).toBe(500)
  })

  it('طلبات متباعدة أصلًا لا تُؤخَّر إطلاقًا', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    const startedAt: number[] = []
    const record = () =>
      limiter.run(() => {
        startedAt.push(clock.now())
        return Promise.resolve()
      })

    const a = record()
    await advance(1000)
    const b = record()
    await advance(1000)
    await Promise.all([a, b])

    expect(startedAt).toEqual([0, 1000])
  })
})

describe('الأخطاء والتفكيك', () => {
  it('مهمّة ترمي تُرجع رفضًا ولا توقف الطابور', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    const failing = limiter.run(() => Promise.reject(new Error('فشل مقصود')))
    const after = limiter.run(() => Promise.resolve('نجح'))

    await advance(2000)

    await expect(failing).rejects.toThrow('فشل مقصود')
    await expect(after).resolves.toBe('نجح')
  })

  it('التفكيك يرفض ما في الطابور ولا يترك وعدًا معلَّقًا', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    const first = limiter.run(() => Promise.resolve('أوّل'))
    const queued = limiter.run(() => Promise.resolve('لن يصل'))
    const rejected = queued.catch((e: unknown) => (e as Error).message)

    await advance(0)
    limiter.dispose()

    await expect(first).resolves.toBe('أوّل')
    expect(await rejected).toContain('مُفكَّك')
    expect(limiter.pending()).toBe(0)
  })

  it('طلب بعد التفكيك يُرفض فورًا', async () => {
    const { clock } = fakeClock()
    const limiter = createRateLimiter(clock)
    limiter.dispose()
    await expect(limiter.run(() => Promise.resolve(1))).rejects.toThrow('مُفكَّك')
  })

  it('التفكيك يُلغي مؤقّت الطابور — لا نداء بعده', async () => {
    const { clock, advance } = fakeClock()
    const limiter = createRateLimiter(clock)

    const task = vi.fn(() => Promise.resolve(undefined))
    void limiter.run(task)
    const queued = limiter.run(task)
    queued.catch(() => undefined)

    await advance(0)
    expect(task).toHaveBeenCalledTimes(1)

    limiter.dispose()
    await advance(5000)
    expect(task).toHaveBeenCalledTimes(1)
  })
})
