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

/** ما طُلب من الصفحات: `[tabId, type]` بالترتيب. */
const toPage = vi.hoisted(() => [] as Array<[number, string]>)

const gates = vi.hoisted(() => ({
  step: null as null | Gate,
  finish: null as null | Gate,
  save: null as null | Gate,
  overlay: null as null | Gate,
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
  sendToTab: async (target: { tabId: number }, type: string, payload?: { y?: number }) => {
    toPage.push([target.tabId, type])
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
    if (type === 'capture/show-overlay') await pass('overlay')
    return { ok: true, value: { restored: true } }
  },
}))

vi.mock('@/background/capture-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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

import {
  cancelFullPage,
  isFullPageRunning,
  recoverOrphanedJob,
  startFullPage,
} from '@/background/full-page-job'
import { JOB_STALL_MS, sweepStalledJobs } from '@/background/lifecycle'
import { getSession, patchSession, updateSession } from '@/shared/storage/session'

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
  toPage.length = 0
  gates.step = null
  gates.finish = null
  gates.save = null
  gates.overlay = null
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
  vi.useRealTimers()
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

/**
 * الحارس والمهمّة الحيّة (تدقيق Copilot، D3 — مؤكَّد في كروم حقيقي).
 *
 * `JOB_STALL_MS` تُعرَّف «مدّة **بلا تقدّم**»، وكان `sweepStalledJobs` يقيسها من `startedAt` وحده: التقاطٌ
 * لصفحة طويلة على نافذة صغيرة مُسح من الجلسة عند 121 ثانية وعمرُ آخر تقدّمٍ له 41ms، فعرضت النافذة «خاملًا»
 * وقبلت تفعيلًا ثانيًا على التبويب نفسه.
 */
describe('الحارس يقيس الركود من آخر تقدّم لا من البدء', () => {
  const T0 = 1_800_000_000_000
  const job = (over: Record<string, number> = {}) => ({
    id: 'م',
    kind: 'full-page',
    tabId: 3,
    startedAt: T0,
    updatedAt: T0,
    done: 0,
    total: 0,
    ...over,
  })

  it('مهمّة بلا تقدّم منذ أكثر من الحدّ تُمسَح — وظيفة الحارس الأصلية', async () => {
    await patchSession({ job: job() })

    expect(await sweepStalledJobs(T0 + JOB_STALL_MS + 1)).toBe(true)
    expect((await getSession()).job).toBeNull()
  })

  it('وكتابةٌ فاشلة لا تُبلَّغ مسحًا — المهمّة باقية والنتيجة `false`', async () => {
    await patchSession({ job: job() })
    vi.spyOn(chrome.storage.session, 'set').mockRejectedValueOnce(new Error('quota'))

    expect(await sweepStalledJobs(T0 + JOB_STALL_MS + 1)).toBe(false)
    expect((await getSession()).job?.id).toBe('م')
  })

  it('**مهمّة بدأت قبل أكثر من الحدّ وتقدّمت قبل ثوانٍ تبقى**', async () => {
    await patchSession({ job: job({ updatedAt: T0 + JOB_STALL_MS - 5_000, done: 181 }) })

    expect(await sweepStalledJobs(T0 + JOB_STALL_MS + 1), 'مُسحت مهمّة تتقدّم').toBe(false)
    expect((await getSession()).job?.done).toBe(181)
  })

  it('**والتقاطٌ حيّ يكتب تقدّمه في الجلسة فلا يمسحه الحارس بعد الحدّ من بدئه**', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    const step = gate('step')
    const finish = gate('finish')
    const live = run()
    await step.reached
    // الخطوات تستغرق 85 ثانية؛ التقدّم يُبثّ بعدها، والمهمّة تبقى حيّةً عند الترميز.
    vi.setSystemTime(T0 + 85_000)
    step.release()
    await finish.reached
    expect(live.messages.filter((m) => m.kind === 'progress')).toHaveLength(1)

    await vi.waitFor(async () =>
      expect((await getSession()).job?.updatedAt, 'التقدّم يُكتب في الجلسة').toBe(T0 + 85_000),
    )
    expect(await sweepStalledJobs(T0 + JOB_STALL_MS + 1), 'مُسح التقاطٌ حيّ').toBe(false)
    expect((await getSession()).job).not.toBeNull()

    finish.release()
    await live.end
    await vi.waitFor(async () => expect((await getSession()).job).toBeNull())
  })

  it('وخروج المهمّة يمسح مهمّتها وحدها — لا مهمّةً كُتبت مكانها', async () => {
    const finish = gate('finish')
    const live = run()
    await finish.reached
    const other = job({ startedAt: Date.now(), updatedAt: Date.now() })
    await patchSession({ job: { ...other, id: 'أخرى' } })

    finish.release()
    await live.end
    await vi.waitFor(() => expect(isFullPageRunning()).toBe(false))
    // دورٌ فارغ في الطابور: كل ما كتبته المهمّة قبله قد وقع.
    await updateSession((current) => current)

    expect((await getSession()).job?.id).toBe('أخرى')
  })
})

/**
 * المهمّة اليتيمة (تدقيق Copilot، N3): العامل الذي يملك المهمّة مات، وجلستها نجت. الإقلاع التالي يمسحها
 * ويستعيد صفحتها — **ولا يمسّ مهمّةً بدأها هذا العامل نفسه**: الحدث الذي أيقظه قد يكون تفعيلًا بدأ التقاطًا.
 */
describe('استعادة المهمّة اليتيمة', () => {
  const orphan = {
    id: 'يتيمة',
    kind: 'full-page',
    tabId: 3,
    startedAt: 1,
    updatedAt: 1,
    done: 0,
    total: 0,
  }

  it('يتيمةٌ تُمسح وتُستعاد صفحتها ويُبثّ فشلها', async () => {
    await patchSession({ job: orphan })
    const broadcast = vi.fn()

    expect(await recoverOrphanedJob(broadcast)).toBe(true)

    expect((await getSession()).job).toBeNull()
    // الطبقة تُظهَر أيضًا: عاملٌ مات بين إخفائها للّقطة وإظهارها يتركها مخفيّة (المراجعة المستقلّة).
    expect(toPage).toEqual([
      [3, 'fullpage/finish'],
      [3, 'capture/show-overlay'],
    ])
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'failed' }))
  })

  /*
   * **التصفّح الخاص المنفصل** (`incognito: 'split'`): للتصفّح الخاص عاملٌ ثانٍ، و`chrome.storage.session`
   * **مشتركةٌ بين العاملين** — قِيس في Chrome 155. فعاملُ أحد السياقين حين يُقلع يرى مهمّة الآخر الحيّة وليست
   * في ذاكرته؛ وعدُّها يتيمةً يمسحها أثناء عملها. فلا يستعيد عاملٌ إلا مهمّة سياقه.
   */
  it.each([
    ['عامل التصفّح الخاص لا يستعيد مهمّة السياق العادي', true, false],
    ['والعامل العادي لا يستعيد مهمّة التصفّح الخاص', false, true],
  ])('%s', async (_name, workerIncognito, jobIncognito) => {
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: workerIncognito } })
    try {
      await patchSession({ job: { ...orphan, incognito: jobIncognito } })

      expect(await recoverOrphanedJob(vi.fn())).toBe(false)
      expect((await getSession()).job?.id).toBe('يتيمة')
      expect(toPage).toEqual([])
    } finally {
      Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
    }
  })

  it('ومهمّةٌ تُكتب بسياقها — عامل التصفّح الخاص يعلّم مهمّته', async () => {
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    try {
      const step = gate('step')
      run(7)
      await step.reached
      await updateSession((current) => current)

      expect((await getSession()).job?.incognito).toBe(true)
    } finally {
      Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
    }
  })

  it('وكتابةٌ فاشلة لا تُبلَّغ مسحًا — والصفحة تُستعاد مع ذلك', async () => {
    await patchSession({ job: orphan })
    vi.spyOn(chrome.storage.session, 'set').mockRejectedValueOnce(new Error('quota'))

    expect(await recoverOrphanedJob(vi.fn())).toBe(false)
    expect((await getSession()).job?.id).toBe('يتيمة')
    expect(toPage.map(([, type]) => type)).toContain('fullpage/finish')
  })

  it('ومهمّة هذا العامل الحيّة ليست يتيمة', async () => {
    const step = gate('step')
    run(7)
    await step.reached
    await updateSession((current) => current)
    const live = (await getSession()).job
    expect(live?.tabId).toBe(7)

    expect(await recoverOrphanedJob(vi.fn())).toBe(false)
    expect((await getSession()).job).toEqual(live)
    expect(toPage.filter(([, type]) => type === 'fullpage/finish')).toEqual([])
  })

  it('ويتيمةٌ على تبويبٍ بدأ عليه هذا العامل التقاطًا تُمسح ولا تُستعاد صفحتها — فلا يُفسَد الجديد', async () => {
    await patchSession({ job: { ...orphan, tabId: 7 } })
    const step = gate('step')
    // الاستعادة تُطلَب أوّلًا (الإقلاع) ثمّ يبدأ التفعيل الذي أيقظ العامل قبل أن يأتي دورها في الطابور.
    const recovered = recoverOrphanedJob(vi.fn())
    run(7)

    expect(await recovered).toBe(true)
    await step.reached
    expect(toPage.filter(([, type]) => type === 'fullpage/finish')).toEqual([])
    await vi.waitFor(async () => expect((await getSession()).job?.tabId).toBe(7))
    expect((await getSession()).job?.id).not.toBe('يتيمة')
  })
})

/**
 * عاملٌ يموت **بعد** لحظة الالتزام (تدقيق R4، R4-06): `deps.save` قد التزم في القاعدة ولم تُمسح المهمّة بعد، فكان
 * خلَفُه يبثّ «توقّف الالتقاط قبل اكتماله فلم يُحفظ» واللقطة محفوظة. الالتزام يُكتب في الجلسة قبل الحفظ، فالخلَف
 * يعرف أن الحفظ ربّما وقع ولا يقول ما لا يعرف.
 */
describe('موت العامل بعد لحظة الالتزام', () => {
  const orphan = {
    id: 'ملتزمة',
    kind: 'full-page',
    tabId: 3,
    startedAt: 1,
    updatedAt: 1,
    done: 2,
    total: 2,
  }

  it('**الالتزام يُكتب في الجلسة قبل أن يبدأ الحفظ**', async () => {
    const save = gate('save')
    const job = run()
    await save.reached

    expect((await getSession()).job).toMatchObject({ tabId: 7, committed: true })
    expect(cancelFullPage(), 'وبعد الالتزام لا يُقبَل إلغاء').toBe(false)
    save.release()
    await job.end
    expect(job.messages.at(-1)).toMatchObject({ kind: 'done' })
  })

  it('**يتيمةٌ ملتزمة لا يُبثّ عنها «لم يُحفظ»** — بل أن الحفظ ربّما وقع وأين يُتحقَّق منه', async () => {
    await patchSession({ job: { ...orphan, committed: true } })
    const broadcast = vi.fn()

    expect(await recoverOrphanedJob(broadcast)).toBe(true)

    const message = broadcast.mock.calls[0]?.[0] as { code: string; message: string }
    expect(message.code).toBe('interrupted-saving')
    expect(message.message).not.toContain('لم يُحفظ')
    expect(message.message).toContain('المكتبة')
    expect((await getSession()).job).toBeNull()
  })

  it('ويتيمةٌ قبل الالتزام تبقى «فلم يُحفظ» — ضابط', async () => {
    await patchSession({ job: orphan })
    const broadcast = vi.fn()

    await recoverOrphanedJob(broadcast)

    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'interrupted',
        message: expect.stringContaining('فلم يُحفظ'),
      }),
    )
  })
})

/** المراجعة المستقلّة على R4-06 وR4-01. */
describe('لحظة الالتزام والاستعادة — ما وجدته المراجعة', () => {
  it('**الالتزام يكتب نبضًا حديثًا** — فلا يبدأ الحفظ بما بقي من مهلة الحارس بعد آخر نبض', async () => {
    const finish = gate('finish')
    const save = gate('save')
    const job = run()
    await finish.reached
    const later = Date.now() + 60_000
    vi.spyOn(Date, 'now').mockReturnValue(later)
    finish.release()
    await save.reached

    expect((await getSession()).job).toMatchObject({ committed: true, updatedAt: later })
    vi.mocked(Date.now).mockRestore()
    save.release()
    await job.end
  })

  it('**تفعيلٌ على تبويب يتيمةٍ تُستعاد صفحتها يُرفض** — فلا تقع رسائل الاستعادة داخل التقاطٍ جديد', async () => {
    await patchSession({
      job: { id: 'يتيمة', kind: 'full-page', tabId: 7, startedAt: 1, done: 0, total: 0 },
    })
    const overlay = gate('overlay')
    const recovered = recoverOrphanedJob(vi.fn())
    await overlay.reached

    expect(isFullPageRunning(), 'الاستعادة جارية').toBe(true)
    expect(run(7).started).toEqual({ started: false, reason: expect.any(String) })
    overlay.release()
    expect(await recovered).toBe(true)
    expect(isFullPageRunning()).toBe(false)
  })
})
