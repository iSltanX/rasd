/**
 * خدمة الالتقاط — التسلسل والإيقاع والاستعادة.
 *
 * **كُتب هذا الملفّ قبل أن تُلمس الخدمة في المرحلة 10، لا بعدها.** كانت
 * تغطيتها صفرًا رغم أنها أخطر ملفّ في المشروع: `captureVisibleTab` لا يأخذ
 * `tabId`، والترتيب `إخفاء ← التقاط ← إظهار` هو ما يمنع ظهور طبقتنا في
 * صورة المستخدم، والفاصل هو ما يمنع رفض Chrome. ثلاثة عقود لا يمسكها
 * `tsc` ولا `eslint`، وكانت تُعدَّل على العمياء.
 *
 * ما لا يُختبَر هنا لأنه لا يُختبَر خارج متصفّح: أن الطبقة **رُسمت** مخفيّة
 * قبل الالتقاط (ضمانة إطارَي `rAF` في `host.hide()`)، وأن Chrome يرفض فعلًا
 * عند 500ms. الأوّل في `scripts/verify-capture.mjs` والثاني قيس هناك.
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CAPTURE_INTERVAL_MS, runCapture, setCaptureLimiter } from '@/background/capture-service'
import { createRateLimiter, type RateLimiterClock } from '@/modules/capture/rate-limit'
import { resetHandlers } from '@/shared/messaging'

/**
 * ساعة مقودة — الإيقاع يُختبَر بالمنطق لا بالانتظار الحقيقي.
 *
 * الفاصل صفر في كل الاختبارات هنا: ما يُفحَص هو **الترتيب** لا المدّة،
 * ومدّةُ 550ms حقيقية تُضاف إلى كل حالة بلا أن تثبت شيئًا.
 */
function drivenClock(): RateLimiterClock {
  return {
    now: () => Date.now(),
    schedule: (fn, delayMs) => {
      const id = setTimeout(fn, delayMs)
      return () => clearTimeout(id)
    },
  }
}

/** أثر التسلسل: كل خطوة تُسجَّل بترتيب وقوعها. */
let trace: string[]
/** النوع صريح: بلا هذا يظنّ اللنت أن المزيّف يُرجع `void` فيمنع الوعد. */
let captureVisibleTab: ReturnType<typeof vi.fn<() => Promise<string>>>

const PNG = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(() => {
  fakeBrowser.reset()
  resetHandlers()
  trace = []

  captureVisibleTab = vi.fn<() => Promise<string>>(() => {
    trace.push('capture')
    return Promise.resolve(PNG)
  })

  Object.assign(globalThis.chrome.tabs, {
    get: vi.fn(() =>
      Promise.resolve({
        id: 7,
        windowId: 1,
        active: true,
        url: 'https://example.com/',
        title: 'مثال',
      }),
    ),
    query: vi.fn(() =>
      Promise.resolve([{ id: 7, windowId: 1, active: true, url: 'https://example.com/' }]),
    ),
    captureVisibleTab,
    // إخفاء/إظهار الطبقة يمرّان عبر رسالة إلى التبويب — نرصد الاثنين.
    sendMessage: vi.fn((_tabId: number, message: { type?: string }) => {
      const type = typeof message?.type === 'string' ? message.type : ''
      if (type.includes('hide')) {
        trace.push('hide')
        return Promise.resolve({ ok: true, value: { hidden: true } })
      }
      if (type.includes('show')) {
        trace.push('show')
        return Promise.resolve({ ok: true, value: { shown: true } })
      }
      return Promise.resolve({ ok: true, value: {} })
    }),
  })
  Object.assign(globalThis.chrome, {
    windows: { get: vi.fn(() => Promise.resolve({ id: 1, state: 'normal' })) },
  })
})

describe('التسلسل — الطبقة مخفيّة لحظة الالتقاط وحدها', () => {
  it('يُخفي قبل الالتقاط ويُظهر بعده', async () => {
    setCaptureLimiter(createRateLimiter(drivenClock(), 0))
    await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    const hide = trace.indexOf('hide')
    const shot = trace.indexOf('capture')
    const show = trace.indexOf('show')

    expect(hide).toBeGreaterThanOrEqual(0)
    expect(shot).toBeGreaterThan(hide)
    expect(show).toBeGreaterThan(shot)
  })

  it('يُظهر الطبقة حتى حين يفشل الالتقاط — وإلا بقيت الصفحة تحت طبقة عمياء', async () => {
    captureVisibleTab.mockRejectedValueOnce(new Error('boom'))
    setCaptureLimiter(createRateLimiter(drivenClock(), 0))

    const r = await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(r.ok).toBe(false)
    expect(trace).toContain('show')
    expect(trace.indexOf('show')).toBeGreaterThan(trace.indexOf('hide'))
  })
})

describe('الحراسة — لا يُلتقط تبويب غير الذي طُلب', () => {
  it('يرفض حين لا يكون التبويب المستهدَف هو النشط', async () => {
    Object.assign(globalThis.chrome.tabs, {
      query: vi.fn(() =>
        Promise.resolve([{ id: 99, windowId: 1, active: true, url: 'https://other.test/' }]),
      ),
    })
    setCaptureLimiter(createRateLimiter(drivenClock(), 0))

    const r = await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(r.ok).toBe(false)
    // ولم يُنادَ الالتقاط أصلًا — الحراسة قبل النداء لا بعده.
    expect(captureVisibleTab).not.toHaveBeenCalled()
  })

  it('يرفض صفحة غير قابلة للحقن بلا أن يلمس الالتقاط', async () => {
    Object.assign(globalThis.chrome.tabs, {
      get: vi.fn(() =>
        Promise.resolve({
          id: 7,
          windowId: 1,
          active: true,
          url: 'chrome://settings',
          title: 'إعدادات',
        }),
      ),
      query: vi.fn(() =>
        Promise.resolve([{ id: 7, windowId: 1, active: true, url: 'chrome://settings' }]),
      ),
    })
    setCaptureLimiter(createRateLimiter(drivenClock(), 0))

    const r = await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(r.ok).toBe(false)
    expect(captureVisibleTab).not.toHaveBeenCalled()
  })
})

describe('الفاصل — بذرة الجلسة تُكتب لحظة البدء لا لحظة الانتهاء', () => {
  it('يسجّل البذرة قبل عودة النداء، فيصير الفاصل بدايةً-إلى-بداية', async () => {
    /*
     * هذا هو العقد الذي تعتمد عليه المرحلة 10.
     *
     * `createRateLimiter` يقيس من **بداية** النداء. فلو كُتبت بذرة الجلسة
     * بعد عودته لصار الانتظار التالي «نهاية + 550» بينما المُنظِّم ينتظر
     * «بداية + 550» — فيُحتسب الفاصل مرّتين ويُضاف زمن النداء كلّه إلى كل
     * بلاطة. على صفحة من عشرين بلاطة قيس الفرق بالثواني، وهو الفرق بين
     * الوفاء بمعيار «≤25 ثانية» وخرقه.
     */
    let seedAtCapture: unknown = 'لم تُكتب'
    captureVisibleTab.mockImplementationOnce(() =>
      chrome.storage.session.get('rasd:lastShotAt').then((got: Record<string, unknown>) => {
        seedAtCapture = got['rasd:lastShotAt']
        return PNG
      }),
    )
    setCaptureLimiter(createRateLimiter(drivenClock(), 0))

    await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(typeof seedAtCapture).toBe('number')
  })

  it('الفاصل المعلَن أطول من حدّ Chrome — 500 قيس أنه يُرفَض', () => {
    expect(CAPTURE_INTERVAL_MS).toBeGreaterThan(500)
  })
})
