/**
 * نسخ اللقطة إلى الحافظة — `src/content/clipboard.ts`.
 *
 * العقد الذي يُثبَّت هنا: الدالّة **لا ترمي أبدًا**، وكل فشل يعود `Result` برسالة عربية،
 * وصفحة غير مركَّزة لا تُعدّ فشلًا نهائيًّا بل تؤجِّل النسخ إلى أوّل تركيز أو نقرة — مرّة واحدة.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { copyCaptureToClipboard } from '@/content/clipboard'

/** «ABC» بـbase64 — بايتات معلومة لتُقارَن بعد المرور بـ`atob`. */
const ABC_BASE64 = 'QUJD'

type WriteFn = (items: FakeClipboardItem[]) => Promise<void>

class FakeClipboardItem {
  constructor(readonly parts: Record<string, Blob>) {}
}

/** ردّ سلكي ناجح لرسالة `capture/blob`. */
function blobReply(overrides: Partial<{ base64: string; mime: string; bytes: number }> = {}) {
  return { ok: true, value: { base64: ABC_BASE64, mime: 'image/png', bytes: 3, ...overrides } }
}

let write: ReturnType<typeof vi.fn<WriteFn>>
// مرجع محفوظ بدل `chrome.runtime.sendMessage` صريحًا: اللنت يمنع النداء الخام خارج طبقة الرسائل.
let sendMessage: MockInstance
const originalSecure = Object.getOwnPropertyDescriptor(window, 'isSecureContext')

function setSecure(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true })
}

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

beforeEach(() => {
  write = vi.fn<WriteFn>().mockResolvedValue(undefined)
  vi.stubGlobal('ClipboardItem', FakeClipboardItem)
  setClipboard({ write })
  setSecure(true)
  sendMessage = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(blobReply() as never)
})

afterEach(() => {
  // مستمعو «أوّل تركيز» يعيشون على `window` بين الاختبارات: تركيزٌ واحد يستهلك ما تركه
  // اختبارٌ سابق ولم يُطلقه، وإلا عدّ الاختبار التالي كتابات ليست له.
  window.dispatchEvent(new Event('focus'))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setClipboard(undefined)
  if (originalSecure) Object.defineProperty(window, 'isSecureContext', originalSecure)
  else Reflect.deleteProperty(window, 'isSecureContext')
})

describe('copyCaptureToClipboard — الصفحة لا تسمح بالكتابة أصلًا', () => {
  it('بلا ClipboardItem: يرفض قبل أي طلب إلى الخلفية', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    const result = await copyCaptureToClipboard('shot-1')

    expect(result).toMatchObject({ ok: false, error: { code: 'permission-denied' } })
    expect(!result.ok && result.error.message).toContain('محفوظة في المكتبة')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('بلا navigator.clipboard.write: يرفض', async () => {
    setClipboard({})
    const result = await copyCaptureToClipboard('shot-1')

    expect(result).toMatchObject({ ok: false, error: { code: 'permission-denied' } })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('سياق غير آمن (http): يرفض حتى مع وجود الواجهة', async () => {
    setSecure(false)
    const result = await copyCaptureToClipboard('shot-1')

    expect(result).toMatchObject({ ok: false, error: { code: 'permission-denied' } })
    expect(write).not.toHaveBeenCalled()
  })
})

describe('copyCaptureToClipboard — جلب البايتات من الخلفية', () => {
  it('خطأ الرسالة يعود كما هو ولا تُكتب الحافظة', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({
      ok: false,
      error: { code: 'not-found', message: 'لا لقطة بهذا المعرّف.' },
    } as never)
    const result = await copyCaptureToClipboard('missing')

    expect(result).toMatchObject({ ok: false, error: { code: 'not-found' } })
    expect(write).not.toHaveBeenCalled()
  })

  it('لقطة فوق حدّ ثمانية ميغابايت: تُرفض صراحةً بدل أن يعلّق النقل', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(
      blobReply({ bytes: 8 * 1024 * 1024 + 1 }) as never,
    )
    const result = await copyCaptureToClipboard('huge')

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-data' } })
    expect(write).not.toHaveBeenCalled()
  })

  it('الحدّ نفسه (ثمانية ميغابايت بالضبط) يُقبل', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(
      blobReply({ bytes: 8 * 1024 * 1024 }) as never,
    )
    expect((await copyCaptureToClipboard('edge')).ok).toBe(true)
  })
})

describe('copyCaptureToClipboard — الكتابة', () => {
  it('ينجح: يكتب عنصرًا واحدًا نوعه نوع اللقطة وبايتاته البايتات المنقولة', async () => {
    const result = await copyCaptureToClipboard('shot-1')

    expect(result).toEqual({ ok: true, value: null })
    expect(write).toHaveBeenCalledTimes(1)
    const [items] = write.mock.calls[0]!
    expect(items).toHaveLength(1)
    const blob = items[0]!.parts['image/png']!
    expect(blob.type).toBe('image/png')
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe('ABC')
  })

  it('يطلب البايتات بمعرّف اللقطة المعطى', async () => {
    await copyCaptureToClipboard('shot-42')
    const envelope = sendMessage.mock.calls[0]![0] as unknown as {
      type: string
      payload: unknown
    }
    expect(envelope.type).toBe('capture/blob')
    expect(envelope.payload).toEqual({ id: 'shot-42' })
  })

  it('رفض المتصفّح لأي سبب غير التركيز: permission-denied ولا مستمعين مؤجَّلين', async () => {
    write.mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'))
    const addSpy = vi.spyOn(window, 'addEventListener')

    const result = await copyCaptureToClipboard('shot-1')

    expect(result).toMatchObject({ ok: false, error: { code: 'permission-denied' } })
    expect(addSpy).not.toHaveBeenCalledWith('focus', expect.anything(), expect.anything())
  })

  it('استثناء نصّي لا كائن (بلا message) يُقرأ كما هو دون أن ينكسر التصنيف', async () => {
    write.mockRejectedValue('boom')
    const result = await copyCaptureToClipboard('shot-1')

    expect(result).toMatchObject({ ok: false, error: { code: 'permission-denied' } })
  })
})

describe('copyCaptureToClipboard — الصفحة غير مركَّزة', () => {
  const notFocused = () => new DOMException('Document is not focused.', 'NotAllowedError')

  it('يعود cancelled برسالة «انقر في الصفحة» ويؤجّل النسخ', async () => {
    write.mockRejectedValueOnce(notFocused())
    const result = await copyCaptureToClipboard('shot-1')

    expect(result).toMatchObject({ ok: false, error: { code: 'cancelled' } })
    expect(!result.ok && result.error.message).toContain('انقر في الصفحة')
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('يُتمّ النسخ عند أوّل تركيز — مرّة واحدة ولو تكرّر الحدث', async () => {
    write.mockRejectedValueOnce(notFocused())
    await copyCaptureToClipboard('shot-1')

    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    expect(write).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('يُتمّ النسخ عند أوّل نقرة، ثمّ لا يبقى مستمع للتركيز', async () => {
    write.mockRejectedValueOnce(notFocused())
    await copyCaptureToClipboard('shot-1')

    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()
    expect(write).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('النسخة المؤجَّلة تكتب اللقطة نفسها', async () => {
    write.mockRejectedValueOnce(notFocused())
    await copyCaptureToClipboard('shot-1')

    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    const [items] = write.mock.calls[1]!
    expect(new TextDecoder().decode(await items[0]!.parts['image/png']!.arrayBuffer())).toBe('ABC')
  })

  it('فشل النسخة المؤجَّلة لا يرمي ولا يتحوّل إلى رفض غير معالَج', async () => {
    write.mockRejectedValueOnce(notFocused()).mockRejectedValueOnce(new Error('denied later'))
    await copyCaptureToClipboard('shot-1')

    window.dispatchEvent(new Event('focus'))
    await new Promise((r) => setTimeout(r, 0))
    expect(write).toHaveBeenCalledTimes(2)
  })
})
