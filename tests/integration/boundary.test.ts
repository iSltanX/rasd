import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createBoundary,
  EXTENSION_ORIGIN,
  type Boundary,
  type BrowserContext,
} from './harness/boundary'

import type * as Rpc from '@/shared/messaging/rpc'

/**
 * الحدّ نفسه تحت الاختبار — كل ما تستند إليه الدورتان يُثبَت بحالةٍ تمرّ وحالةٍ تسقط.
 *
 * دورةٌ خضراء على حدٍّ مزيّف لا تثبت شيئًا. فقبل أن تُقرأ الدورتان دليلًا: الطرفان لا يتشاركان
 * وحدة، والسلك يُسقط ما لا يعبر JSON، والمُرسِل يكتبه المتصفّح، والتوجيه يتبع قواعد كروم، وسكربت
 * المحتوى لا يصل إلى مخزن الإضافة.
 */

const PAGE = 'https://example.com/a'

let boundary: Boundary

beforeEach(() => {
  boundary = createBoundary()
})

afterEach(() => {
  boundary.dispose()
})

const rpcOf = (ctx: BrowserContext) => ctx.modules['rpc'] as typeof Rpc

const worker = () =>
  boundary.context({
    name: 'worker',
    kind: 'worker',
    url: `${EXTENSION_ORIGIN}/service-worker.js`,
    load: { rpc: () => import('@/shared/messaging/rpc') },
  })

const content = (name: string, tabId: number, url = PAGE) =>
  boundary.context({
    name,
    kind: 'content',
    tabId,
    url,
    load: { rpc: () => import('@/shared/messaging/rpc') },
  })

describe('رسوم وحدات مستقلّة', () => {
  it('لكل سياق نسخته من rpc.ts — مستقبِلٌ يُسجَّل في طرفٍ لا يجيب عن الآخر', async () => {
    const w = await worker()
    const c = await content('content', 7)
    expect(rpcOf(w)).not.toBe(rpcOf(c))

    // مستقبِل في سكربت المحتوى نفسه: `runtime.sendMessage` لا يرتدّ إليه.
    c.run(() => rpcOf(c).onMessage('diagnostics/ping', () => ({ version: 'content' }) as never))
    const own = await c.run(() => rpcOf(c).send('diagnostics/ping', undefined))
    expect(own.ok).toBe(false)

    w.run(() => rpcOf(w).onMessage('diagnostics/ping', () => ({ version: 'worker' }) as never))
    const reply = await c.run(() => rpcOf(c).send('diagnostics/ping', undefined))
    expect(reply).toEqual({ ok: true, value: { version: 'worker' } })
  })

  it('بلا مستقبِل في الطرف الآخر يعود فشلًا بنصّ كروم، لا ردًّا من الطرف نفسه', async () => {
    const c = await content('content', 7)
    const reply = await c.run(() => rpcOf(c).send('diagnostics/ping', undefined))
    expect(reply.ok).toBe(false)
    if (!reply.ok) expect(reply.error.code).toBe('no-receiver')
  })
})

describe('السلك JSON', () => {
  it('Blob يصل كائنًا فارغًا، و`undefined` يسقط، والنصّ والعدد يعبران', async () => {
    const w = await worker()
    const c = await content('content', 7)
    const seen: unknown[] = []
    w.run(() =>
      rpcOf(w).onMessage('palette/save', (payload) => {
        seen.push(payload)
        return { id: 'p', count: 0 }
      }),
    )
    await c.run(() =>
      rpcOf(c).send('palette/save', {
        name: 'x',
        colors: ['#000000'],
        blob: new Blob(['secret']),
        gone: undefined,
      } as never),
    )
    // البايتات لا تعبر: ما يصل كائنٌ عاديّ بلا `arrayBuffer` ولا أثرٍ لمحتواه.
    const [received] = seen as [{ name: string; colors: string[]; blob: object }]
    expect(Object.keys(received)).toEqual(['name', 'colors', 'blob'])
    expect(received).toMatchObject({ name: 'x', colors: ['#000000'] })
    expect(received.blob).not.toBeInstanceOf(Blob)
    expect('arrayBuffer' in received.blob).toBe(false)
    expect(JSON.stringify(received.blob)).not.toContain('secret')
  })
})

describe('المُرسِل يكتبه المتصفّح', () => {
  it('التبويب والأصل من سياق المرسِل لا من الحمولة', async () => {
    const w = await worker()
    const c = await content('content', 7)
    let context: unknown = null
    w.run(() =>
      rpcOf(w).onMessage('tab/can-operate', (_payload, ctx) => {
        context = ctx
        return { allowed: true }
      }),
    )
    await c.run(() => rpcOf(c).send('tab/can-operate', { tabId: 999 }))
    expect(context).toEqual({ tabId: 7, frameId: 0, origin: 'https://example.com' })
  })
})

describe('tabs.sendMessage', () => {
  it('يصل إلى سكربت المحتوى في التبويب المقصود وحده', async () => {
    const w = await worker()
    const a = await content('a', 1, 'https://a.example/')
    const b = await content('b', 2, 'https://b.example/')
    const hits: string[] = []
    a.run(() =>
      rpcOf(a).onMessage('capture/hide-overlay', () => {
        hits.push('a')
        return { hidden: true }
      }),
    )
    b.run(() =>
      rpcOf(b).onMessage('capture/hide-overlay', () => {
        hits.push('b')
        return { hidden: true }
      }),
    )
    const reply = await w.run(() =>
      rpcOf(w).sendToTab({ tabId: 2 }, 'capture/hide-overlay', undefined),
    )
    expect(reply).toEqual({ ok: true, value: { hidden: true } })
    expect(hits).toEqual(['b'])
    expect(boundary.crossingsOf('capture/hide-overlay')).toEqual([
      { from: 'worker', to: 'b', via: 'tabs', type: 'capture/hide-overlay' },
    ])
  })

  it('سكربت المحتوى لا يرسل إلى تبويب، ولا يلتقط الشاشة', async () => {
    const c = await content('content', 7)
    // سلبيّةٌ مقصودة: النداء الخام الممنوع خارج rpc.ts هو ما يُثبَت أن الحدّ يرفضه.
    // eslint-disable-next-line no-restricted-syntax
    expect(() => c.run(() => chrome.tabs.sendMessage(7, {}))).toThrow(/لسكربت المحتوى/u)
    expect(() => c.run(() => chrome.tabs.captureVisibleTab(1, {}))).toThrow(/للخلفية وحدها/u)
  })
})

describe('مخزن الإضافة', () => {
  it('سكربت المحتوى لا يصل إلى IndexedDB، والخلفية تصل', async () => {
    const w = await worker()
    const c = await content('content', 7)
    expect(() => c.run(() => indexedDB.open('rasd'))).toThrow(/سكربت المحتوى وصل إلى IndexedDB/u)
    const request = w.run(() => indexedDB.open('probe'))
    await new Promise((resolve) => {
      request.onsuccess = resolve
    })
    request.result.close()
  })
})
