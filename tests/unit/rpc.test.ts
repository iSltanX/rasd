import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onMessage, resetHandlers, send } from '@/shared/messaging'

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
