import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CHANNELS,
  HEARTBEAT_MS,
  openChannel,
  openPortCount,
  resetChannels,
  serveChannel,
  type ChannelDown,
} from '@/shared/messaging'

import { installFakePorts, type FakePortNetwork } from '../helpers/fake-ports'

/**
 * القنوات — الآلية التي تُبقي الـservice worker حيًّا.
 *
 * مهلة الخمول في MV3 ثلاثون ثانية. النبضة كل عشرين تجدّدها، والقناة المفتوحة
 * تمنع الإنهاء. الاختبار الحاسم هنا يحاكي خمسًا وأربعين ثانية.
 */

let net: FakePortNetwork

beforeEach(() => {
  resetChannels()
  net = installFakePorts()
})

afterEach(() => {
  net.restore()
  vi.useRealTimers()
})

describe('النبضة تتجاوز مهلة الـservice worker', () => {
  it('فاصل النبضة أقصر من مهلة الخمول البالغة 30 ثانية', () => {
    expect(HEARTBEAT_MS).toBeLessThan(30_000)
  })

  it('مهمة 45 ثانية: القناة تبقى مفتوحة والنبضات تصل', () => {
    vi.useFakeTimers()

    const pings: number[] = []
    serveChannel(CHANNELS.job, () => {
      // النبضة يردّ عليها الطرف المضيف تلقائيًا في port.ts.
    })

    const received: ChannelDown[] = []
    const channel = openChannel(CHANNELS.job, {
      onMessage: (m) => received.push(m),
    })

    // نراقب النبضات الصاعدة من طرف المضيف.
    const pair = net.pairs()[0]!
    pair.host.onMessage.addListener((m) => {
      if ((m as { kind?: string }).kind === 'ping') pings.push(Date.now())
    })

    expect(openPortCount()).toBe(1)

    // 45 ثانية — أطول من مهلة الخمول بمقدار النصف.
    vi.advanceTimersByTime(45_000)

    expect(channel.connected(), 'القناة انقطعت قبل انتهاء المهمة').toBe(true)
    expect(openPortCount()).toBe(1)
    // نبضتان على الأقل خلال 45 ثانية بفاصل 20.
    expect(pings.length).toBeGreaterThanOrEqual(2)
    // والطرف المضيف ردّ على كلٍّ منها.
    expect(received.filter((m) => m.kind === 'pong').length).toBeGreaterThanOrEqual(2)

    channel.close()
    expect(openPortCount()).toBe(0)
  })

  it('لا نبضة بعد الإغلاق', () => {
    vi.useFakeTimers()
    serveChannel(CHANNELS.keepalive, () => undefined)
    const channel = openChannel(CHANNELS.keepalive)
    const pair = net.pairs()[0]!
    let pings = 0
    pair.host.onMessage.addListener((m) => {
      if ((m as { kind?: string }).kind === 'ping') pings++
    })

    vi.advanceTimersByTime(HEARTBEAT_MS * 2)
    const before = pings
    channel.close()
    vi.advanceTimersByTime(HEARTBEAT_MS * 3)
    expect(pings).toBe(before)
  })
})

describe('إعادة الاتصال', () => {
  it('انقطاع الـservice worker يُتبَع بإعادة اتصال تلقائية', async () => {
    vi.useFakeTimers()
    serveChannel(CHANNELS.job, () => undefined)

    const disconnects: string[] = []
    const reconnects: number[] = []
    const channel = openChannel(CHANNELS.job, {
      onDisconnect: (e) => disconnects.push(e.code),
      onReconnect: (n) => reconnects.push(n),
    })

    expect(channel.connected()).toBe(true)

    // يحاكي إعادة تشغيل الـservice worker.
    net.dropAll()
    expect(disconnects).toEqual(['disconnected'])
    expect(channel.connected()).toBe(false)

    await vi.advanceTimersByTimeAsync(200)
    expect(reconnects).toEqual([1])
    expect(channel.connected()).toBe(true)
    expect(channel.reconnects()).toBe(1)
  })

  it('يتوقّف بعد الحدّ الأقصى بدل الدوران للأبد', async () => {
    vi.useFakeTimers()
    serveChannel(CHANNELS.job, () => undefined)
    const channel = openChannel(CHANNELS.job, { maxReconnects: 2 })

    for (let i = 0; i < 5; i++) {
      net.dropAll()
      await vi.advanceTimersByTimeAsync(3000)
    }
    expect(channel.reconnects()).toBe(2)
    channel.close()
  })

  it('يمكن تعطيل إعادة الاتصال', async () => {
    vi.useFakeTimers()
    serveChannel(CHANNELS.job, () => undefined)
    const channel = openChannel(CHANNELS.job, { autoReconnect: false })
    net.dropAll()
    await vi.advanceTimersByTimeAsync(3000)
    expect(channel.reconnects()).toBe(0)
    expect(channel.connected()).toBe(false)
  })

  it('الإغلاق المتعمَّد لا يُطلق إعادة اتصال', async () => {
    vi.useFakeTimers()
    serveChannel(CHANNELS.job, () => undefined)
    const channel = openChannel(CHANNELS.job)
    channel.close()
    await vi.advanceTimersByTimeAsync(3000)
    expect(channel.reconnects()).toBe(0)
  })
})

describe('تبادل الرسائل', () => {
  it('يوصل الرسائل في الاتجاهين', () => {
    const fromClient: unknown[] = []
    serveChannel(CHANNELS.job, (host, message) => {
      fromClient.push(message)
      if (message.kind === 'start') {
        host.post({ kind: 'progress', done: 1, total: 10 })
      }
    })

    const received: ChannelDown[] = []
    const channel = openChannel(CHANNELS.job, { onMessage: (m) => received.push(m) })

    expect(channel.post({ kind: 'start', job: 'full-page' })).toBe(true)
    expect(fromClient).toEqual([{ kind: 'start', job: 'full-page' }])
    expect(received).toEqual([{ kind: 'progress', done: 1, total: 10 }])
  })

  it('الإرسال بعد الانقطاع يعود false لا يرمي', () => {
    serveChannel(CHANNELS.job, () => undefined)
    const channel = openChannel(CHANNELS.job, { autoReconnect: false })
    net.dropAll()
    expect(() => channel.post({ kind: 'cancel' })).not.toThrow()
    expect(channel.post({ kind: 'cancel' })).toBe(false)
  })

  it('القناة غير المسجَّلة لا تُحتسب مفتوحة', () => {
    openChannel('rasd:unknown' as never, { autoReconnect: false })
    expect(openPortCount()).toBe(0)
  })
})
