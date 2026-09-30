import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onMessage, resetHandlers, send, sendToTab } from '@/shared/messaging'
import { rasdError, RasdThrow } from '@/shared/result'

/**
 * طبقة RPC — الطريق الوحيد لعبور حدّ.
 *
 * الحالات الأربع التي تُنتج أعطالًا متقطّعة في الإضافات: النجاح، المهلة،
 * غياب المستقبِل، ورمي المستقبِل. كلها يجب أن تنتهي بـ`Result` لا باستثناء.
 */

beforeEach(() => {
  resetHandlers()
  fakeBrowser.reset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('send / onMessage', () => {
  it('يوصل الحمولة ويعيد الردّ', async () => {
    onMessage('session/patch', (payload) => ({ echoed: payload.patch }))

    const result = await send('session/patch', { patch: { a: 1 } })
    expect(result.ok).toBe(true)
    expect(result.ok && result.value).toEqual({ echoed: { a: 1 } })
  })

  it('يدعم المستقبِل غير المتزامن', async () => {
    onMessage('diagnostics/ping', async () => {
      await new Promise((r) => setTimeout(r, 5))
      return { version: '9.9.9', uptimeMs: 1, openPorts: 0, incognito: false }
    })

    const result = await send('diagnostics/ping', undefined)
    expect(result.ok && result.value.version).toBe('9.9.9')
  })

  it('رمي المستقبِل يعود خطأً لا استثناءً', async () => {
    onMessage('settings/reset', () => {
      throw new Error('فشل داخلي')
    })

    const result = await send('settings/reset', undefined)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe('handler-failed')
    expect(result.ok === false && result.error.detail).toBe('فشل داخلي')
  })

  it('نوع بلا مستقبِل يعطي no-receiver رغم وجود مستمع', async () => {
    // الحالة الواقعية: الـservice worker حيّ لكنه لا يعالج هذا النوع.
    onMessage('diagnostics/ping', () => ({
      version: '1',
      uptimeMs: 0,
      openPorts: 0,
      incognito: false,
    }))

    const result = await send('settings/get', undefined)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe('no-receiver')
    expect(result.ok === false && result.error.message).toContain('settings/get')
  })

  it('المهلة تنتهي بـtimeout ولا تعلّق', async () => {
    // مستقبِل لا يردّ أبدًا.
    onMessage('offscreen/ensure', () => new Promise<never>(() => {}))

    const promise = send('offscreen/ensure', undefined, { timeoutMs: 50 })
    const result = await promise
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe('timeout')
    expect(result.ok === false && result.error.detail).toContain('50ms')
  })

  it('يتجاهل الرسائل التي ليست من رصد', async () => {
    const handler = vi.fn()
    onMessage('diagnostics/ping', handler)
    await fakeBrowser.runtime.sendMessage({ hello: 'world' }).catch(() => null)
    expect(handler).not.toHaveBeenCalled()
  })

  it('يمرّر سياق المرسِل إلى المستقبِل', async () => {
    let seen: unknown = null
    onMessage('session/get', (_payload, context) => {
      seen = context
      return {}
    })
    await send('session/get', undefined)
    expect(seen).not.toBeNull()
  })

  it('إلغاء التسجيل يوقف الاستقبال', async () => {
    const off = onMessage('settings/get', () => ({ a: 1 }))
    expect((await send('settings/get', undefined)).ok).toBe(true)
    off()
    const after = await send('settings/get', undefined)
    expect(after.ok).toBe(false)
    expect(after.ok === false && after.error.code).toBe('no-receiver')
  })
})

describe('فكّ الردّ السلكي', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['نصّ', 'ok'],
    ['رقم', 1],
  ])('ردّ غير كائن (%s) يعني أن أحدًا لم يردّ → no-receiver', async (_label, wire) => {
    // Chrome يُنهي `sendMessage` بلا ردّ حين لا مستمع يردّ — وهذا لا يُقرأ نجاحًا.
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(wire as never)

    const result = await send('diagnostics/ping', undefined)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.code).toBe('no-receiver')
    expect(result.ok === false && result.error.detail).toContain('ردّ فارغ')
  })

  it('ردّ خطأ بلا رمز يُنسب إلى unknown ويحفظ رسالته', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({
      ok: false,
      error: { message: 'شيء ما' },
    } as never)

    const result = await send('diagnostics/ping', undefined)

    expect(result).toEqual({ ok: false, error: { code: 'unknown', message: 'شيء ما' } })
  })

  it('ردّ الخطأ يحمل رمزه ورسالته وتفصيله كما أُرسلت', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue({
      ok: false,
      error: { code: 'quota-exceeded', message: 'ممتلئ', detail: 'IDB' },
    } as never)

    const result = await send('diagnostics/ping', undefined)

    expect(result).toEqual({
      ok: false,
      error: { code: 'quota-exceeded', message: 'ممتلئ', detail: 'IDB' },
    })
  })

  it('رفض `sendMessage` نفسه يُحوَّل بتصنيفه: غياب المستقبِل', async () => {
    vi.spyOn(chrome.runtime, 'sendMessage').mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    )

    const result = await send('diagnostics/ping', undefined)

    expect(result.ok === false && result.error.code).toBe('no-receiver')
  })
})

describe('sendToTab', () => {
  const ping = { version: '1', uptimeMs: 0, openPorts: 0, incognito: false }

  it('يرسل إلى التبويب ويعيد الردّ', async () => {
    const spy = vi
      .spyOn(chrome.tabs, 'sendMessage')
      .mockResolvedValue({ ok: true, value: ping } as never)

    const result = await sendToTab({ tabId: 5 }, 'diagnostics/ping', undefined)

    expect(result).toEqual({ ok: true, value: ping })
    expect(spy).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ __rasd: 1, type: 'diagnostics/ping' }),
      undefined,
    )
  })

  it('يمرّر الإطار المحدَّد — والإطار الرئيسي صفرٌ لا «غير محدَّد»', async () => {
    const spy = vi
      .spyOn(chrome.tabs, 'sendMessage')
      .mockResolvedValue({ ok: true, value: ping } as never)

    await sendToTab({ tabId: 5, frameId: 3 }, 'diagnostics/ping', undefined)
    await sendToTab({ tabId: 5, frameId: 0 }, 'diagnostics/ping', undefined)

    expect(spy.mock.calls[0]![2]).toEqual({ frameId: 3 })
    // `frameId: 0` قيمة مشروعة: إسقاطها يوجّه الرسالة إلى كل الإطارات.
    expect(spy.mock.calls[1]![2]).toEqual({ frameId: 0 })
  })

  it('تبويب لا مستقبِل فيه يعود no-receiver لا استثناءً', async () => {
    vi.spyOn(chrome.tabs, 'sendMessage').mockRejectedValue(
      new Error('Could not establish connection. Receiving end does not exist.'),
    )

    const result = await sendToTab({ tabId: 9 }, 'diagnostics/ping', undefined)

    expect(result.ok === false && result.error.code).toBe('no-receiver')
  })

  it('ردّ الخطأ السلكي يُفكّ كما في send', async () => {
    vi.spyOn(chrome.tabs, 'sendMessage').mockResolvedValue({
      ok: false,
      error: { code: 'not-injectable', message: 'صفحة مقيّدة' },
    } as never)

    const result = await sendToTab({ tabId: 1 }, 'diagnostics/ping', undefined)

    expect(result).toEqual({
      ok: false,
      error: { code: 'not-injectable', message: 'صفحة مقيّدة' },
    })
  })

  it('ردّ فارغ من التبويب يعني no-receiver', async () => {
    vi.spyOn(chrome.tabs, 'sendMessage').mockResolvedValue(undefined)

    const result = await sendToTab({ tabId: 1 }, 'diagnostics/ping', undefined)

    expect(result.ok === false && result.error.code).toBe('no-receiver')
  })

  it('المهلة تنتهي بـtimeout ولا تعلّق', async () => {
    vi.useFakeTimers()
    vi.spyOn(chrome.tabs, 'sendMessage').mockReturnValue(new Promise<never>(() => {}))

    const pending = sendToTab({ tabId: 1 }, 'diagnostics/ping', undefined, { timeoutMs: 40 })
    await vi.advanceTimersByTimeAsync(40)
    const result = await pending

    expect(result.ok === false && result.error.code).toBe('timeout')
    expect(result.ok === false && result.error.detail).toContain('40ms')
  })
})

/**
 * المُستقبِل نفسه، بمنفذ الاستماع مباشرةً.
 *
 * `fake-browser` لا يُرسل بيانات المُرسِل (`sender`)، فيُلتقَط المستمع المسجَّل
 * ويُستدعى بمرسِلٍ يبنيه الاختبار — وهذا وحده يصل إلى ما يُبنى منه سياق الرسالة.
 */
describe('المستقبِل — السياق والردّ', () => {
  type Listener = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (reply: unknown) => void,
  ) => boolean | undefined

  function capture(): () => Listener {
    const add = vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener')
    return () => add.mock.calls.at(-1)![0] as unknown as Listener
  }

  const envelope = (type: string, payload?: unknown) => ({ __rasd: 1, type, payload, id: 'x#1' })
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('يبني السياق من التبويب والإطار والأصل حين يحملها المرسِل', async () => {
    const listener = capture()
    let seen: unknown = null
    onMessage('session/get', (_payload, context) => {
      seen = context
      return {}
    })

    const sendResponse = vi.fn()
    listener()(
      envelope('session/get'),
      { tab: { id: 7 } as chrome.tabs.Tab, frameId: 3, origin: 'https://example.com' },
      sendResponse,
    )
    await settle()

    expect(seen).toStrictEqual({ tabId: 7, frameId: 3, origin: 'https://example.com' })
  })

  it('مرسِلٌ بلا تبويب ولا إطار ولا أصل يعطي سياقًا فارغًا بلا مفاتيح undefined', async () => {
    const listener = capture()
    let seen: unknown = null
    onMessage('session/get', (_payload, context) => {
      seen = context
      return {}
    })

    listener()(envelope('session/get'), {}, vi.fn())
    await settle()

    expect(seen).toStrictEqual({})
  })

  it('الإطار الرئيسي (صفر) يُحفَظ في السياق لا يُسقَط كأنه غائب', async () => {
    const listener = capture()
    let seen: unknown = null
    onMessage('session/get', (_payload, context) => {
      seen = context
      return {}
    })

    listener()(envelope('session/get'), { frameId: 0 }, vi.fn())
    await settle()

    expect(seen).toStrictEqual({ frameId: 0 })
  })

  it('يردّ بقيمة المعالج ويُبقي القناة مفتوحة للردّ غير المتزامن', async () => {
    const listener = capture()
    onMessage('session/get', () => ({ a: 1 }))

    const sendResponse = vi.fn()
    const keepOpen = listener()(envelope('session/get'), {}, sendResponse)
    await settle()

    expect(keepOpen).toBe(true)
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, value: { a: 1 } })
  })

  it('معالجاتٌ متعدّدة تركّب مستمع chrome واحدًا — لا ردّان على الرسالة الواحدة', async () => {
    const add = vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener')
    onMessage('session/get', () => ({}))
    onMessage('settings/get', () => ({}))
    onMessage('diagnostics/ping', () => ({
      version: '1',
      uptimeMs: 0,
      openPorts: 0,
      incognito: false,
    }))

    expect(add).toHaveBeenCalledTimes(1)
    // ويبقى كل نوع مخدومًا بمعالجه عبر ذلك المستمع الواحد.
    expect((await send('session/get', undefined)).ok).toBe(true)
    expect((await send('settings/get', undefined)).ok).toBe(true)
  })

  it('رسالة ليست غلاف رصد لا تُردّ ولا تحجز القناة', () => {
    const listener = capture()
    onMessage('session/get', () => ({}))

    const sendResponse = vi.fn()
    const keepOpen = listener()({ hello: 'world' }, {}, sendResponse)

    expect(keepOpen).toBe(false)
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it('نوعٌ بلا معالج يُردّ عليه فورًا بـno-receiver ويعود true رغم الردّ المتزامن', () => {
    const listener = capture()
    onMessage('session/get', () => ({}))

    const sendResponse = vi.fn()
    const keepOpen = listener()(envelope('settings/get'), {}, sendResponse)

    // بعض البيئات تُسقط الردّ إن عاد المستمع `false` — فيُعاد `true` دائمًا هنا.
    expect(keepOpen).toBe(true)
    expect(sendResponse).toHaveBeenCalledTimes(1)
    const reply = sendResponse.mock.calls[0]![0] as { ok: boolean; error: { code: string } }
    expect(reply.ok).toBe(false)
    expect(reply.error.code).toBe('no-receiver')
  })

  it('رمي `RasdThrow` يعبر الحدّ برمزه ورسالته المحدَّدتين لا العامّتين', async () => {
    const listener = capture()
    onMessage('settings/reset', () => {
      throw new RasdThrow(rasdError('permission-denied'))
    })

    const sendResponse = vi.fn()
    listener()(envelope('settings/reset'), {}, sendResponse)
    await settle()

    // بلا مفتاح `detail` أصلًا حين لا تفصيل — لا `detail: undefined`.
    expect(sendResponse.mock.calls[0]![0]).toStrictEqual({
      ok: false,
      error: { code: 'permission-denied', message: rasdError('permission-denied').message },
    })
  })

  it('رمي خطأ عاديّ يحمل نصّه في detail برمز handler-failed', async () => {
    const listener = capture()
    onMessage('settings/reset', () => {
      throw new Error('فشل داخلي')
    })

    const sendResponse = vi.fn()
    listener()(envelope('settings/reset'), {}, sendResponse)
    await settle()

    expect(sendResponse.mock.calls[0]![0]).toStrictEqual({
      ok: false,
      error: {
        code: 'handler-failed',
        message: rasdError('handler-failed').message,
        detail: 'فشل داخلي',
      },
    })
  })
})
