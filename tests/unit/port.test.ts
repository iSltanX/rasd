import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  broadcastChannel,
  CHANNELS,
  HEARTBEAT_MS,
  openChannel,
  openPortCount,
  resetChannels,
  serveChannel,
  type ChannelDown,
  type ChannelHost,
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

  it('الإغلاق أثناء انتظار المحاولة يُلغيها — لا منفذ يُفتح بعد إغلاق المستدعي', async () => {
    vi.useFakeTimers()
    serveChannel(CHANNELS.job, () => undefined)
    const onReconnect = vi.fn()
    const channel = openChannel(CHANNELS.job, { onReconnect })

    // الانقطاع يجدول محاولة بعد 100ms، ثمّ يُغلق المستدعي قبل أن تحين.
    net.dropAll()
    channel.close()
    await vi.advanceTimersByTimeAsync(3000)

    expect(onReconnect).not.toHaveBeenCalled()
    expect(net.pairs(), 'فُتح منفذ جديد بعد الإغلاق المتعمَّد').toHaveLength(0)
    expect(channel.connected()).toBe(false)
  })

  it('التراجع أسّي ويُقصّ عند ثانيتين', async () => {
    vi.useFakeTimers()
    serveChannel(CHANNELS.job, () => undefined)
    const reconnects: number[] = []
    const channel = openChannel(CHANNELS.job, {
      maxReconnects: 10,
      onReconnect: (n) => reconnects.push(n),
    })

    // مهلات المحاولات: 100 · 200 · 400 · 800 · 1600 · 2000 (مقصوصة). وقبل انقضاء أيٍّ منها بمللي ثانية لا تجري.
    const waits = [100, 200, 400, 800, 1600, 2000]
    for (const [i, wait] of waits.entries()) {
      net.dropAll()
      await vi.advanceTimersByTimeAsync(wait - 1)
      expect(reconnects, `المحاولة ${i + 1} جاءت قبل مهلتها`).toHaveLength(i)
      await vi.advanceTimersByTimeAsync(1)
      expect(reconnects).toHaveLength(i + 1)
    }
    channel.close()
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

  it('مستمع الاتصال قائم لقناة أخرى: الاسم المجهول يُتجاهَل ولا يبلغ معالجًا', () => {
    // الفرق عن الاختبار السابق: هنا المستمع مركَّب فعلًا (سُجّلت قناة)، فيُفحَص الاسم.
    const handler = vi.fn()
    serveChannel(CHANNELS.job, handler)

    const stranger = openChannel('rasd:unknown' as never, { autoReconnect: false })
    stranger.post({ kind: 'cancel' })

    expect(openPortCount()).toBe(0)
    expect(handler).not.toHaveBeenCalled()
  })

  it('ردّ المضيف بعد انقطاع العميل لا يرمي — الانقطاع يصل من طريقه', () => {
    let saved: ChannelHost | null = null
    serveChannel(CHANNELS.job, (host) => {
      saved = host
    })
    const channel = openChannel(CHANNELS.job, { autoReconnect: false })
    channel.post({ kind: 'start', job: 'full-page' })
    channel.close()

    expect(saved).not.toBeNull()
    expect(() => saved!.post({ kind: 'progress', done: 1, total: 2 })).not.toThrow()
    expect(openPortCount()).toBe(0)
  })
})

/**
 * منفذٌ يرمي أو ينقطع — الحالات التي لا تنتجها الشبكة المزيَّفة لأنها تقطع
 * الطرف المقابل وحده. تُركَّب فيها منافذ صغيرة يتحكّم الاختبار في سلوكها.
 */
describe('منفذ عميل لا يتعاون', () => {
  function stubPort(name: string) {
    const disconnectListeners: (() => void)[] = []
    const port = {
      name,
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: (fn: () => void) => disconnectListeners.push(fn) },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    }
    const connect = vi.fn(() => port)
    Object.assign(chrome.runtime, { connect })
    return { port, connect, fireDisconnect: () => disconnectListeners.forEach((fn) => fn()) }
  }

  it('انقطاعٌ يصل بعد الإغلاق المتعمَّد لا يُبلَّغ عطلًا ولا يُعيد الاتصال', async () => {
    vi.useFakeTimers()
    const stub = stubPort(CHANNELS.job)
    const onDisconnect = vi.fn()
    const onReconnect = vi.fn()
    const channel = openChannel(CHANNELS.job, { onDisconnect, onReconnect })

    channel.close()
    // حدث انقطاع متأخّر (سباق مع الطرف الآخر) يصل بعد أن أغلق المستدعي.
    stub.fireDisconnect()
    await vi.advanceTimersByTimeAsync(3000)

    expect(stub.port.disconnect).toHaveBeenCalledTimes(1)
    expect(onDisconnect).not.toHaveBeenCalled()
    expect(onReconnect).not.toHaveBeenCalled()
    expect(stub.connect).toHaveBeenCalledTimes(1)
  })

  it('post يعود false حين يرمي المنفذ ولا يُسقط المستدعي', () => {
    const stub = stubPort(CHANNELS.job)
    stub.port.postMessage.mockImplementation(() => {
      throw new Error('Attempting to use a disconnected port object')
    })
    const channel = openChannel(CHANNELS.job, { autoReconnect: false })

    expect(channel.post({ kind: 'cancel' })).toBe(false)
    // والقناة نفسها ما تزال تعدّ نفسها متّصلة: الحكم بالانقطاع لحدثه لا لفشل إرسال.
    expect(channel.connected()).toBe(true)
    channel.close()
  })

  it('نبضة يرمي إرسالها لا توقف المؤقّت — النبضة التالية تجري', () => {
    vi.useFakeTimers()
    const stub = stubPort(CHANNELS.keepalive)
    stub.port.postMessage.mockImplementation(() => {
      throw new Error('port closed')
    })
    const channel = openChannel(CHANNELS.keepalive, { autoReconnect: false })

    expect(() => vi.advanceTimersByTime(HEARTBEAT_MS * 3)).not.toThrow()
    expect(stub.port.postMessage).toHaveBeenCalledTimes(3)
    expect(stub.port.postMessage).toHaveBeenCalledWith({ kind: 'ping' })
    channel.close()
  })
})

describe('broadcastChannel — البثّ إلى كل عملاء قناة', () => {
  it('يصل إلى كل عملاء القناة المسمّاة وحدهم ويُرجع عددهم', () => {
    serveChannel(CHANNELS.job, () => undefined)
    serveChannel(CHANNELS.inspect, () => undefined)
    const jobA: ChannelDown[] = []
    const jobB: ChannelDown[] = []
    const inspect: ChannelDown[] = []
    openChannel(CHANNELS.job, { onMessage: (m) => jobA.push(m) })
    openChannel(CHANNELS.job, { onMessage: (m) => jobB.push(m) })
    openChannel(CHANNELS.inspect, { onMessage: (m) => inspect.push(m) })

    const sent = broadcastChannel(CHANNELS.job, { kind: 'progress', done: 3, total: 9 })

    expect(sent).toBe(2)
    expect(jobA).toEqual([{ kind: 'progress', done: 3, total: 9 }])
    expect(jobB).toEqual([{ kind: 'progress', done: 3, total: 9 }])
    expect(inspect, 'تسرّب بثّ قناةٍ إلى قناة أخرى').toEqual([])
  })

  it('بلا عملاء يُرجع صفرًا', () => {
    serveChannel(CHANNELS.job, () => undefined)
    expect(broadcastChannel(CHANNELS.job, { kind: 'done', result: null })).toBe(0)
  })

  it('عميلٌ أُغلق بين الفحص والإرسال لا يمنع بقيّة العملاء ولا يُحتسب مُرسَلًا إليه', () => {
    serveChannel(CHANNELS.job, () => undefined)
    const stale: ChannelDown[] = []
    const live: ChannelDown[] = []
    openChannel(CHANNELS.job, { autoReconnect: false, onMessage: (m) => stale.push(m) })
    openChannel(CHANNELS.job, { autoReconnect: false, onMessage: (m) => live.push(m) })
    // الأوّل ينقطع: يبقى منفذه في مجموعة المضيف لحظةً فيرمي الإرسال إليه.
    net.pairs()[0]!.host.disconnect()
    expect(openPortCount()).toBe(2)

    const sent = broadcastChannel(CHANNELS.job, { kind: 'progress', done: 1, total: 1 })

    expect(sent).toBe(1)
    expect(stale).toEqual([])
    expect(live).toEqual([{ kind: 'progress', done: 1, total: 1 }])
  })
})
