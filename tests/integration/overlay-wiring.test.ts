import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startOverlay } from '@/content'
import { resetHandlers } from '@/shared/messaging/rpc'
import { resetSettingsCache } from '@/shared/settings'

/**
 * ربط `content/index.ts` كما يُقلع فعلًا — `startOverlay` الحقيقي بكل ما فيه، والرسائل وحدها مقلَّدة.
 * الدوالّ مختبَرة منفردةً في `page-report.test.ts` و`notices.test.ts`؛ وهذا يثبت أنها موصولة: حذفُ
 * تسجيل `pagehide`، أو إشعار `Esc`، أو قصر خطأ القطّارة على وضعها، يُسقطه.
 */

interface Sent {
  readonly type: string
  readonly payload: unknown
}

let sent: Sent[] = []
let frameReply: () => unknown = () => new Promise(() => {})
let teardown: (() => void) | null = null

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  resetHandlers()
  sent = []
  frameReply = () => new Promise(() => {})
  Object.assign(globalThis.chrome.runtime, {
    sendMessage: vi.fn((envelope: { type: string; payload: unknown }) => {
      sent.push({ type: envelope.type, payload: envelope.payload })
      if (envelope.type === 'colour/frame') return frameReply()
      return Promise.resolve({ ok: true, value: { ok: true } })
    }),
  })
})

afterEach(() => {
  teardown?.()
  teardown = null
})

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

async function boot() {
  const started = await startOverlay()
  if (!started.ok) throw new Error(started.error.message)
  teardown = () => started.value.teardown()
  await settle()
  return started.value
}

const press = (code: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }))

const reports = () =>
  sent.filter((m) => m.type === 'mode/report').map((m) => (m.payload as { mode: string }).mode)

describe('ربط الطبقة', () => {
  it('مغادرة المستند تبلّغ الخمول، والتفكيك يزيل المستمع', async () => {
    const session = await boot()
    session.modes.set('inspect')
    await settle()
    sent = []
    window.dispatchEvent(new Event('pagehide'))
    expect(reports()).toEqual(['idle'])

    session.teardown()
    teardown = null
    sent = []
    window.dispatchEvent(new Event('pagehide'))
    expect(reports()).toEqual([])
  })

  it('`Esc` يُخرج بإشعار بالمفتاح الحيّ، والخروج بلا مفتاح بلا إشعار', async () => {
    const session = await boot()
    const notice = () =>
      session.host.layer.querySelector('[data-rasd-ov="notice"]')?.textContent ?? null

    session.modes.set('inspect')
    await settle()
    press('Escape')
    await settle()
    expect(notice()).toContain('خرجت من الفحص')
    expect(notice()).toContain('⌥⇧I')

    session.host.layer.querySelector<HTMLButtonElement>('button[aria-label="إغلاق"]')?.click()
    session.modes.set('inspect')
    await settle()
    session.modes.escape()
    await settle()
    expect(notice()).toBeNull()

    await fakeBrowser.storage.local.set({
      'rasd:settings': { shortcuts: { toolKeys: { inspect: 'KeyJ' } } },
    })
    await settle()
    session.modes.set('inspect')
    await settle()
    press('Escape')
    await settle()
    expect(notice()).toContain('⌥⇧J')
  })

  it('القطّارة لا تلتقط الشاشة خارج وضعها، وتلتقطها عند دخوله', async () => {
    const session = await boot()
    const frames = () => sent.filter((m) => m.type === 'colour/frame').length

    // كل وضع غير اللون: التمرير يطلب إطارًا، ولا لقطة — اللقطة تُخفي الطبقة.
    for (const mode of ['idle', 'compare', 'measure'] as const) {
      session.modes.set(mode)
      await settle()
      window.dispatchEvent(new Event('scroll'))
      await settle(200)
    }
    expect(frames()).toBe(0)

    // الدخول وحده يطلب اللقطة، بلا حركة مؤشِّر ولا تمرير.
    session.modes.set('colour')
    await settle(200)
    expect(frames()).toBe(1)
  })

  it('خطأ القطّارة لا يظهر خارج وضع اللون، ويبقى ظاهرًا فيه', async () => {
    frameReply = () =>
      Promise.resolve({ ok: false, error: { code: 'unknown', message: 'تعذّر الالتقاط' } })
    const session = await boot()
    const text = () => session.host.layer.textContent ?? ''

    session.modes.set('colour')
    await settle(200)
    expect(session.host.layer.querySelector('[data-rasd-ov="colour-error"]')).not.toBeNull()
    expect(session.host.layer.querySelector('[data-rasd-ov="notice"]')).toBeNull()

    session.modes.set('idle')
    await settle()
    window.dispatchEvent(new Event('scroll'))
    await settle(200)
    expect(text()).not.toContain('تعذّرت قراءة اللون')
    expect(session.host.layer.querySelector('[data-rasd-ov="colour-error"]')).toBeNull()
  })
})
