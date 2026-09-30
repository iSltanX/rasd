import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PAGE_PATHS } from '@/shared/page-paths'
import {
  closeOffscreen,
  ensureOffscreen,
  OFFSCREEN_IDLE_MS,
  touchOffscreen,
} from '@/shared/storage/offscreen'

/**
 * دورة حياة المستند خارج الشاشة.
 *
 * `fake-browser` لا يطبّق `chrome.offscreen` ولا `runtime.getContexts` — فتُركَّب
 * بدائل يتحكّم الاختبار في ما تُرجعه. والمهلة تُقاس بمؤقّتات مزيَّفة لا بالوقت
 * الحقيقي: الحكم على «متى يُغلق» يقع على ثلاثين ثانية.
 */

type Contexts = { contextType: string }[]

const present: Contexts = [{ contextType: 'OFFSCREEN_DOCUMENT' }]
const absent: Contexts = []

let getContexts: ReturnType<typeof vi.fn>
let createDocument: ReturnType<typeof vi.fn>
let closeDocument: ReturnType<typeof vi.fn>

/** يركّب الواجهات المفقودة على `chrome` — ويُعاد الأصل في `afterEach`. */
function installOffscreenApi() {
  getContexts = vi.fn().mockResolvedValue(absent)
  createDocument = vi.fn().mockResolvedValue(undefined)
  closeDocument = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(chrome.runtime, 'getContexts').mockImplementation(getContexts as never)
  Object.assign(chrome, {
    offscreen: {
      Reason: { CLIPBOARD: 'CLIPBOARD', BLOBS: 'BLOBS' },
      createDocument,
      closeDocument,
    },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  installOffscreenApi()
})

afterEach(async () => {
  // يُلغي مؤقّت الخمول المعلَّق في حالة الوحدة بين الاختبارات.
  getContexts.mockResolvedValue(absent)
  await closeOffscreen()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ensureOffscreen — الإنشاء', () => {
  it('ينشئ المستند بمساره وسببَيه ويُخبر أنه أُنشئ', async () => {
    const result = await ensureOffscreen()

    expect(result).toEqual({ ok: true, value: { created: true } })
    expect(getContexts).toHaveBeenCalledWith({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
    expect(createDocument).toHaveBeenCalledTimes(1)
    const options = createDocument.mock.calls[0]![0] as {
      url: string
      reasons: string[]
      justification: string
    }
    expect(options.url).toBe(PAGE_PATHS.offscreen)
    expect(options.reasons).toEqual(['CLIPBOARD', 'BLOBS'])
    // التبرير يصل إلى Chrome ويُعرض عند المراجعة — لا يُترك فارغًا.
    expect(options.justification).toMatch(/[؀-ۿ]/)
  })

  it('المستند الموجود لا يُنشأ ثانيةً — محاولتان ترميان', async () => {
    getContexts.mockResolvedValue(present)

    const result = await ensureOffscreen()

    expect(result).toEqual({ ok: true, value: { created: false } })
    expect(createDocument).not.toHaveBeenCalled()
  })

  it('تعذّر السؤال عن السياقات يُرجَع خطأً ولا يُحاوَل الإنشاء بعده', async () => {
    getContexts.mockRejectedValue(new Error('runtime unavailable'))

    const result = await ensureOffscreen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('unknown')
    expect(!result.ok && result.error.detail).toBe('runtime unavailable')
    expect(createDocument).not.toHaveBeenCalled()
    // لا مؤقّت خمول لمستند لم يُتأكَّد من وجوده.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('سباق: فشل الإنشاء لأن سياقًا آخر سبق — الوجود هو المطلوب فيُعدّ نجاحًا', async () => {
    // الفحص الأوّل: لا مستند. ثم يسبقنا سياق آخر فيرمي الإنشاء. الفحص الثاني: موجود.
    getContexts.mockResolvedValueOnce(absent).mockResolvedValueOnce(present)
    createDocument.mockRejectedValue(new Error('Only a single offscreen document may be created'))

    const result = await ensureOffscreen()

    expect(result).toEqual({ ok: true, value: { created: false } })
    expect(getContexts).toHaveBeenCalledTimes(2)
    // والمستند الذي وُجد يدخل دورة الخمول كأنّنا استخدمناه.
    expect(vi.getTimerCount()).toBe(1)
  })

  it('فشل الإنشاء بلا مستند بعده يُرجَع خطأً كما هو — ولا مؤقّت', async () => {
    getContexts.mockResolvedValue(absent)
    createDocument.mockRejectedValue(new Error('offscreen denied'))

    const result = await ensureOffscreen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.detail).toBe('offscreen denied')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('مهلة الخمول', () => {
  it('المستند المُنشأ يُغلَق بعد ثلاثين ثانية بالضبط لا قبلها', async () => {
    await ensureOffscreen()
    // بعد الإنشاء يصير المستند موجودًا لمن يسأل.
    getContexts.mockResolvedValue(present)

    await vi.advanceTimersByTimeAsync(OFFSCREEN_IDLE_MS - 1)
    expect(closeDocument).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(closeDocument).toHaveBeenCalledTimes(1)
  })

  it('كل استخدام يجدّد المهلة — مستند مستعمَل لا يُغلَق من تحت المستخدم', async () => {
    getContexts.mockResolvedValue(present)
    await ensureOffscreen()

    await vi.advanceTimersByTimeAsync(20_000)
    await ensureOffscreen() // استخدام ثانٍ عند الثانية 20
    await vi.advanceTimersByTimeAsync(20_000) // الثانية 40 — كان سيُغلَق عند 30
    expect(closeDocument).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10_000) // 30 ثانية منذ آخر استخدام
    expect(closeDocument).toHaveBeenCalledTimes(1)
  })

  it('touchOffscreen يستبدل المؤقّت ولا يراكمه', () => {
    touchOffscreen()
    touchOffscreen()
    touchOffscreen()

    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('closeOffscreen', () => {
  it('يغلق المستند الموجود ويُلغي مؤقّت الخمول المعلَّق', async () => {
    getContexts.mockResolvedValue(present)
    await ensureOffscreen()
    expect(vi.getTimerCount()).toBe(1)

    const result = await closeOffscreen()

    expect(result).toEqual({ ok: true, value: { closed: true } })
    expect(closeDocument).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('بلا مستند لا يستدعي الإغلاق ويقول إنه لم يُغلق', async () => {
    getContexts.mockResolvedValue(absent)

    const result = await closeOffscreen()

    expect(result).toEqual({ ok: true, value: { closed: false } })
    expect(closeDocument).not.toHaveBeenCalled()
  })

  it('تعذّر السؤال عن السياقات يُرجَع خطأً — والمؤقّت أُلغي مع ذلك', async () => {
    touchOffscreen()
    getContexts.mockRejectedValue(new Error('runtime unavailable'))

    const result = await closeOffscreen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.detail).toBe('runtime unavailable')
    expect(closeDocument).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('فشل الإغلاق نفسه يُرجَع خطأً لا «أُغلق»', async () => {
    getContexts.mockResolvedValue(present)
    closeDocument.mockRejectedValue(new Error('close failed'))

    const result = await closeOffscreen()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.detail).toBe('close failed')
  })
})
