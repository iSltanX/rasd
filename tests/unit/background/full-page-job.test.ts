import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * مهمّة الالتقاط الكامل — الإلغاء ولحظة الالتزام.
 *
 * الحلقة تُقاد هنا بصفحة مصغَّرة من بلاطتين: الصفحة والالتقاط والقماش ممَوَّهة، ولكلٍّ منها **بوّابة**
 * تُمسك الحلقة عند خطوة بعينها، فيقع الإلغاء في اللحظة المقصودة لا في لحظةٍ يختارها التوقيت.
 *
 * العيب الذي بُنيت له (تدقيق Copilot، D2 — مؤكَّد في كروم حقيقي بإلغاءٍ من النافذة وبـ`Esc`): إلغاءٌ يصل بعد
 * آخر بلاطة، أثناء ترميز الصورة، كان يُردّ عليه `cancelled: true` ثمّ تُحفظ اللقطة ويُبثّ `done`.
 */

type Gate = { entered: () => void; released: Promise<void>; open: () => void }

const gates = vi.hoisted(() => ({
  step: null as null | Gate,
  finish: null as null | Gate,
  save: null as null | Gate,
}))

/** بوّابة: وعدٌ يُحلّ حين تصلها الحلقة، ومفتاحٌ يُطلقها. */
function gate(name: keyof typeof gates) {
  let entered!: () => void
  let open!: () => void
  const reached = new Promise<void>((r) => (entered = r))
  gates[name] = { entered, released: new Promise<void>((r) => (open = r)), open }
  return { reached, release: open }
}

async function pass(name: keyof typeof gates) {
  const g = gates[name]
  if (!g) return
  g.entered()
  await g.released
}

vi.mock('@/shared/messaging', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendToTab: async (_target: unknown, type: string, payload?: { y?: number }) => {
    if (type === 'fullpage/prepare') {
      return {
        ok: true,
        value: {
          maxScroll: 700,
          step: 700,
          innerWidth: 1280,
          clientWidth: 1280,
          visualScale: 1,
          gutterOnStart: false,
        },
      }
    }
    if (type === 'fullpage/step') {
      await pass('step')
      return { ok: true, value: { scrollY: payload?.y ?? 0, maxScroll: 700 } }
    }
    return { ok: true, value: { restored: true } }
  },
}))

vi.mock('@/background/capture-service', () => ({
  captureTile: () => Promise.resolve({ ok: true, value: 'data:image/png;base64,AAAA' }),
}))

vi.mock('@/background/image-ops', () => ({ dataUrlToBytes: () => new Uint8Array([0]) }))

vi.mock('@/background/stitch', () => ({
  StreamingStitcher: {
    create: () => ({
      ok: true,
      value: {
        drawTile: () => Promise.resolve({ ok: true, value: null }),
        finish: async () => {
          await pass('finish')
          return {
            ok: true,
            value: { blob: new Blob(['png']), width: 1280, height: 1500, tiles: 2 },
          }
        },
        release: () => undefined,
      },
    }),
  },
}))

import { cancelFullPage, isFullPageRunning, startFullPage } from '@/background/full-page-job'

type Broadcast = Parameters<typeof startFullPage>[1]['broadcast']
type Message = Parameters<Broadcast>[0]

/** يبدأ مهمّة ويعيد ما بثّته وما حُفظ، ووعدًا يُحلّ عند نهايتها (`done` أو `failed`). */
function run(tabId = 7) {
  const messages: Message[] = []
  let ended!: () => void
  const end = new Promise<void>((r) => (ended = r))
  const save = vi.fn(async () => {
    await pass('save')
    return { ok: true as const, value: { id: 'لقطة-1' } }
  })
  const started = startFullPage(tabId, {
    broadcast: (message) => {
      messages.push(message)
      if (message.kind === 'done' || message.kind === 'failed') ended()
    },
    save,
  })
  return { started, messages, save, end }
}

beforeEach(() => {
  gates.step = null
  gates.finish = null
  gates.save = null
  vi.stubGlobal('createImageBitmap', () =>
    Promise.resolve({ width: 1280, height: 800, close() {} }),
  )
})

afterEach(async () => {
  // البوّابات تُفتح كلّها: اختبارٌ سقط وبوّابته مغلقة لا يترك مهمّةً معلّقة تُسقط ما بعده.
  for (const g of Object.values(gates)) g?.open()
  cancelFullPage()
  await vi.waitFor(() => expect(isFullPageRunning()).toBe(false))
  vi.unstubAllGlobals()
})

describe('الالتقاط الكامل — الإلغاء ولحظة الالتزام', () => {
  it('بلا إلغاء: لقطة واحدة تُحفظ ويُبثّ `done`', async () => {
    const job = run()
    expect(job.started.started).toBe(true)
    await job.end

    expect(job.save).toHaveBeenCalledTimes(1)
    expect(job.messages.at(-1)).toMatchObject({ kind: 'done' })
  })

  it('إلغاءٌ أثناء خطوة تمرير يُحترَم: لا حفظ، والنهاية `failed/cancelled`', async () => {
    const step = gate('step')
    const job = run()
    await step.reached

    expect(cancelFullPage()).toBe(true)
    step.release()
    await job.end

    expect(job.save).not.toHaveBeenCalled()
    expect(job.messages.at(-1)).toMatchObject({ kind: 'failed', code: 'cancelled' })
  })

  it('**إلغاءٌ مقبول أثناء ترميز الصورة الأخيرة لا تُحفظ بعده لقطة** — D2', async () => {
    const finish = gate('finish')
    const job = run()
    await finish.reached
    // آخر بلاطة رُسمت وبُثّ تقدّمها؛ الحلقة الآن في `stitcher.finish()` — نافذة الإلغاء المتأخّر.
    expect(job.messages.filter((m) => m.kind === 'progress')).toHaveLength(1)

    expect(cancelFullPage(), 'الإلغاء قبل الحفظ يُقبَل').toBe(true)
    finish.release()
    await job.end

    expect(job.save, 'إلغاءٌ قُبل ثمّ حُفظت اللقطة').not.toHaveBeenCalled()
    expect(job.messages.at(-1)).toMatchObject({ kind: 'failed', code: 'cancelled' })
    expect(job.messages.some((m) => m.kind === 'done')).toBe(false)
  })

  it('**وإلغاءٌ بعد بدء الحفظ يُرَدّ صادقًا `false`** — فلا يُبلَّغ إلغاءٌ تتبعه لقطة محفوظة', async () => {
    const save = gate('save')
    const job = run()
    await save.reached

    expect(cancelFullPage(), 'الحفظ بدأ: الإلغاء لا يُقبَل').toBe(false)
    save.release()
    await job.end

    expect(job.save).toHaveBeenCalledTimes(1)
    expect(job.messages.at(-1)).toMatchObject({ kind: 'done' })
  })

  it('ولا إلغاء بلا مهمّة', () => {
    expect(isFullPageRunning()).toBe(false)
    expect(cancelFullPage()).toBe(false)
  })
})
