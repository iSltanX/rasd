import { describe, expect, it, vi } from 'vitest'

import { applyOps } from '@/modules/editor/redact'
import { createBlurClient, READY_TIMEOUT_MS } from '@/pages/editor/worker-client'

import type { BlurRequest, WorkerLike, ObscureOp } from '@/modules/editor/blur-protocol'

/**
 * عقد الرسائل والسقوط المتزامن.
 *
 * `Worker` غير موجود في بيئة الاختبار — **لكن `MessageChannel` موجودة**،
 * وهي تكفي لإثبات الخاصّيتين اللتين تحملان العقد كلّه: أن `ImageData` لا
 * تُنقل وأن `ArrayBuffer` يُنقل فيُفصَل. والادّعاء بأن ذلك غير قابل
 * للاختبار كان سيشحن العقد بلا برهان.
 */

const OPS: readonly ObscureOp[] = [
  {
    rect: { x: 1, y: 1, w: 2, h: 2 },
    mode: 'cover',
    strength: 0,
    cover: { r: 9, g: 8, b: 7, a: 255 },
  },
]

const W = 4
const H = 4
const bytes = (): ArrayBuffer => {
  const b = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < b.length; i++) b[i] = (i * 5) % 256
  return b.buffer
}

describe('**عقد النقل — يُثبَت بـ`MessageChannel` لا يُدَّعى**', () => {
  it('`ImageData` ليست منقولة — وضعُها في قائمة النقل يرمي', () => {
    const mc = new MessageChannel()
    const img = new ImageData(new Uint8ClampedArray(W * H * 4), W, H)
    expect(() => mc.port1.postMessage(img, [img as unknown as Transferable])).toThrow(
      /DataCloneError|invalid value in transferList/i,
    )
    mc.port1.close()
    mc.port2.close()
  })

  it('**و`ArrayBuffer` يُنقل فيُفصَل عن المُرسِل** — `byteLength` يصير صفرًا', () => {
    const mc = new MessageChannel()
    const view = new Uint8ClampedArray(16)
    const buf = view.buffer
    mc.port1.postMessage({ buffer: buf }, [buf])
    expect(buf.byteLength).toBe(0)
    expect(view.length).toBe(0)
    mc.port1.close()
    mc.port2.close()
  })
})

/**
 * خيط دمية **على `MessageChannel` حقيقية**.
 *
 * الدمية ذات `postMessage` عادية تُمرّر المخزن بالمرجع، فتُخفي بالضبط ما
 * جاءت لتُثبته: أن النقل يفصل مخزن المُرسِل. والقناة الحقيقية تفصله فعلًا
 * (مقيس في هذه البيئة: `byteLength` يصير صفرًا والوصول يقع)، فيصير الاختبار
 * على العقد لا على الدمية.
 */
function fakeWorker(options: { ready?: boolean; failRequest?: boolean; swallow?: boolean } = {}): {
  worker: WorkerLike
  posted: BlurRequest[]
} {
  const chan = new MessageChannel()
  const handlers = {
    message: [] as ((e: { data: unknown }) => void)[],
    error: [] as ((e: unknown) => void)[],
  }
  const posted: BlurRequest[] = []

  // جانب الخيط: يستقبل الطلب، ويحسب، ويردّ ناقلًا.
  chan.port2.onmessage = (e: MessageEvent) => {
    const req = e.data as BlurRequest
    posted.push(req)
    if (options.swallow) return
    if (options.failRequest) {
      chan.port2.postMessage({ id: req.id, error: 'فشل مصطنع' })
      return
    }
    const img = { data: new Uint8ClampedArray(req.buffer), width: req.width, height: req.height }
    applyOps(img, req.ops)
    chan.port2.postMessage({ id: req.id, buffer: req.buffer, ms: 1 }, [req.buffer])
  }
  chan.port2.start?.()

  chan.port1.onmessage = (e: MessageEvent) => {
    for (const h of handlers.message) h({ data: e.data })
  }
  chan.port1.start?.()

  const worker: WorkerLike = {
    postMessage(message: unknown, transfer?: Transferable[]) {
      chan.port1.postMessage(message, transfer ?? [])
    },
    addEventListener(type: 'message' | 'error', handler: never) {
      if (type === 'message') {
        handlers.message.push(handler)
        if (options.ready !== false) {
          queueMicrotask(() =>
            (handler as (e: { data: unknown }) => void)({ data: { id: -1, ready: true } }),
          )
        }
      } else {
        handlers.error.push(handler)
      }
    },
    terminate() {
      handlers.message.length = 0
      handlers.error.length = 0
      chan.port1.close()
      chan.port2.close()
    },
  }
  return { worker, posted }
}

/** الحقيقة المرجعية: العمليات نفسها على نسخة، متزامنةً. */
const expected = (): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(bytes())
  applyOps({ data, width: W, height: H }, OPS)
  return data
}

describe('عميل الخيط', () => {
  it('يمرّ على الخيط حين يجهز، ويُعيد البكسلات الصحيحة', async () => {
    const { worker, posted } = fakeWorker()
    const client = createBlurClient({ spawn: () => worker })
    const out = await client.run(bytes(), W, H, OPS)

    expect(out.path).toBe('worker')
    expect(out.reason).toBeNull()
    expect(new Uint8ClampedArray(out.buffer)).toEqual(expected())
    expect(posted).toHaveLength(1)
    client.dispose()
  })

  it('**وينقل `ArrayBuffer` لا `ImageData`** — الطلب لا يحمل غلافًا', async () => {
    const { worker, posted } = fakeWorker()
    const client = createBlurClient({ spawn: () => worker })
    await client.run(bytes(), W, H, OPS)
    expect(posted[0]!.buffer).toBeInstanceOf(ArrayBuffer)
    expect(posted[0]).not.toHaveProperty('data')
    client.dispose()
  })

  it('**وبيئةٌ بلا `Worker` تسقط إلى الخيط الرئيسي بالبكسلات نفسها**', async () => {
    const client = createBlurClient({ spawn: () => null })
    const out = await client.run(bytes(), W, H, OPS)
    expect(out.path).toBe('main')
    expect(out.reason).toBe('spawn-failed')
    expect(new Uint8ClampedArray(out.buffer)).toEqual(expected())
  })

  it('**وخيطٌ لا يجهز يسقط بعد المهلة** — لا انتظار بلا نهاية', async () => {
    const { worker } = fakeWorker({ ready: false })
    const fired: number[] = []
    const client = createBlurClient({
      spawn: () => worker,
      timer: (fn, ms) => {
        fired.push(ms)
        queueMicrotask(fn)
        return () => undefined
      },
    })
    const out = await client.run(bytes(), W, H, OPS)
    expect(out.path).toBe('main')
    expect(out.reason).toBe('ready-timeout')
    expect(fired).toContain(READY_TIMEOUT_MS)
    expect(new Uint8ClampedArray(out.buffer)).toEqual(expected())
  })

  it('**وفشلٌ بعد النقل يُنقَذ بالنسخة** — لا رقعة سوداء تدّعي أنها ضباب', async () => {
    const { worker } = fakeWorker({ failRequest: true })
    const client = createBlurClient({ spawn: () => worker })
    const out = await client.run(bytes(), W, H, OPS)

    expect(out.path).toBe('main')
    expect(out.reason).toBe('worker-error')
    // البكسلات صحيحة رغم أن المخزن المنقول مات مع الطلب.
    expect(new Uint8ClampedArray(out.buffer)).toEqual(expected())
    client.dispose()
  })

  it('والمخزن المُمرَّر مستهلَك على مسار الخيط', async () => {
    const { worker } = fakeWorker()
    const client = createBlurClient({ spawn: () => worker })
    const input = bytes()
    await client.run(input, W, H, OPS)
    expect(input.byteLength).toBe(0)
    client.dispose()
  })

  it('و`lastPath` يُعلن أي مسار عمل — تقرؤه أداة الفحص الحيّ', async () => {
    const client = createBlurClient({ spawn: () => null })
    expect(client.lastPath).toBeNull()
    await client.run(bytes(), W, H, OPS)
    expect(client.lastPath).toBe('main')
  })

  it('والخيط يُنشأ مرّة واحدة مهما تعدّدت الطلبات', async () => {
    const { worker } = fakeWorker()
    const spawn = vi.fn(() => worker)
    const client = createBlurClient({ spawn })
    await client.run(bytes(), W, H, OPS)
    await client.run(bytes(), W, H, OPS)
    expect(spawn).toHaveBeenCalledTimes(1)
    client.dispose()
  })

  it('**وبعد `dispose` يبقى الحساب صحيحًا على الخيط الرئيسي**', async () => {
    const { worker } = fakeWorker()
    const client = createBlurClient({ spawn: () => worker })
    await client.run(bytes(), W, H, OPS)
    client.dispose()
    const out = await client.run(bytes(), W, H, OPS)
    expect(out.path).toBe('main')
    expect(new Uint8ClampedArray(out.buffer)).toEqual(expected())
  })
})
