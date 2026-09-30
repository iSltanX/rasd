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
import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CAPTURE_INTERVAL_MS,
  runCapture,
  saveFullPage,
  setCaptureLimiter,
  shootCapture,
} from '@/background/capture-service'
import { createRateLimiter, type RateLimiterClock } from '@/modules/capture/rate-limit'
import { resetHandlers } from '@/shared/messaging'
import { defaultSettings, patchSettings, resetSettingsCache } from '@/shared/settings'
import { closeDatabase } from '@/shared/storage/db'
import { blobs, captures } from '@/shared/storage/repository'

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

beforeEach(async () => {
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  fakeBrowser.reset()
  resetSettingsCache()
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

describe('نسخة التنزيلات — saveLocation يغيّر وجهة الحفظ فعلًا', () => {
  let download: ReturnType<typeof vi.fn>
  let contains: ReturnType<typeof vi.fn>

  /**
   * الترميز الفعلي (`createImageBitmap`) غير موجود في happy-dom، والاختبارات أعلاه تمرّ على
   * مسار فشل القصّ عمدًا. هنا نحتاج المسار الناجح إلى الحفظ، فيُزيَّف فكّ الترميز وحده؛ والقصّ
   * بلا مستطيل يُعيد بايتات المتصفّح كما هي (`cropCapture`)، فالمحفوظ حقيقي.
   */
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 4, height: 3, close: vi.fn() })),
    )
    download = vi.fn().mockResolvedValue(1)
    contains = vi.fn().mockResolvedValue(true)
    Object.assign(globalThis.chrome, {
      downloads: { download },
      permissions: { contains },
    })
    setCaptureLimiter(createRateLimiter(drivenClock(), 0))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function setLocation(saveLocation: 'library' | 'library-and-downloads') {
    const settings = defaultSettings()
    const written = await patchSettings({ capture: { ...settings.capture, saveLocation } })
    expect(written.ok).toBe(true)
  }

  /** النسخة تُطلَق بلا انتظار — سلسلة وعود قصيرة تُستنزف بدورات مؤقّتات متتالية. */
  async function settle() {
    for (let i = 0; i < 3; i += 1) await new Promise((r) => setTimeout(r, 0))
  }

  /** المحفوظ فعلًا في المكتبة: سجلّ اللقطة وبايتاتها معًا. */
  async function inLibrary(id: string) {
    const record = await captures.get(id)
    const blob = await blobs.get(id)
    return { record: record.ok ? record.value : null, blob: blob.ok ? blob.value : null }
  }

  it('library-and-downloads مع الصلاحية ⟵ تُحفظ في المكتبة وتُنزَّل نسخةٌ واحدة', async () => {
    await setLocation('library-and-downloads')

    const r = await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    const saved = await inLibrary(r.value.id)
    expect(saved.record?.id).toBe(r.value.id)
    expect(saved.blob?.bytes).toBeGreaterThan(0)

    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    const call = download.mock.calls[0]?.[0] as { url: string; filename: string; saveAs: boolean }
    expect(call.filename.startsWith('رصد/مثال-')).toBe(true)
    expect(call.filename.endsWith('.png')).toBe(true)
    expect(call.saveAs).toBe(false)
    expect(call.url.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('**رفض الصلاحية لا يُفشل الالتقاط**: ok والمكتبة محفوظة ولا تنزيل', async () => {
    await setLocation('library-and-downloads')
    contains.mockResolvedValue(false)

    const r = await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    const saved = await inLibrary(r.value.id)
    expect(saved.record?.id).toBe(r.value.id)
    expect(saved.blob).not.toBeNull()
    await vi.waitFor(() => expect(contains).toHaveBeenCalled())
    await settle()
    expect(download).not.toHaveBeenCalled()
  })

  it('فشل التنزيل نفسه لا يُفشل الالتقاط ولا يمسّ المكتبة', async () => {
    await setLocation('library-and-downloads')
    download.mockRejectedValue(new Error('Download canceled by the user'))

    const r = await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    await settle()
    expect((await inLibrary(r.value.id)).record?.id).toBe(r.value.id)
  })

  it('library (الافتراضي) ⟵ المكتبة وحدها ولا تنزيل', async () => {
    await setLocation('library')

    const r = await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(r.ok).toBe(true)
    await settle()
    expect(download).not.toHaveBeenCalled()
  })

  it('فشل الحفظ في المكتبة ⟵ لا نسخة في التنزيلات: ما لم يُحفظ لا يُنسَخ', async () => {
    await setLocation('library-and-downloads')
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })

    try {
      const r = await runCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

      // الفشل من الحفظ نفسه لا من حراسة سابقة — وإلا ما أثبت الاختبار شيئًا عن الترتيب.
      expect(r.ok ? null : r.error.code).toBe('incognito-blocked')
      await settle()
      expect(download).not.toHaveBeenCalled()
    } finally {
      Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
    }
  })

  it('صفحة كاملة (saveFullPage) ⟵ المكتبة ونسخة تنزيل واحدة', async () => {
    await setLocation('library-and-downloads')
    const blob = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' })

    const r = await saveFullPage(7, { blob, width: 1280, height: 4000 }, 2)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((await inLibrary(r.value.id)).record?.kind).toBe('full-page')
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1))
  })

  it('صفحة كاملة مع رفض الصلاحية ⟵ تُحفظ في المكتبة ولا تنزيل', async () => {
    await setLocation('library-and-downloads')
    contains.mockResolvedValue(false)
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })

    const r = await saveFullPage(7, { blob, width: 10, height: 10 }, 1)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((await inLibrary(r.value.id)).record?.id).toBe(r.value.id)
    await vi.waitFor(() => expect(contains).toHaveBeenCalled())
    await settle()
    expect(download).not.toHaveBeenCalled()
  })

  /**
   * لقطة دليل المشكلة تُكتب مع مشكلتها في معاملة واحدة (`putIssueWithEvidence`) — خارج
   * نطاق النسخة: `shootCapture` لا تحفظ شيئًا ولا تنسخ شيئًا.
   */
  it('shootCapture (دليل المشكلة) لا تنسخ إلى التنزيلات', async () => {
    await setLocation('library-and-downloads')

    const shot = await shootCapture({ tabId: 7, kind: 'viewport', rect: null, dpr: 1 })

    expect(shot.ok).toBe(true)
    await settle()
    expect(download).not.toHaveBeenCalled()
  })
})
