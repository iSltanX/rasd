import { describe, expect, it, vi } from 'vitest'

import { createAutosave, AUTOSAVE_DEBOUNCE_MS, type SavePayload } from '@/modules/editor/autosave'
import { asNodeId, type Scene, type SceneNode } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { deviceRect } from '@/shared/geometry'
import { err, ok, type Result } from '@/shared/result'

/**
 * الحفظ التلقائي — **حيث يُفقَد العمل أو يُنقَذ**.
 *
 * والمقياس ليس «هل كُتب» بل: كم مرّة كُتب أثناء السحب، وماذا يحدث حين يكتب
 * تبويبٌ آخر بيننا، وهل يعرف المستخدم أن عمله لا يُحفَظ.
 */

const scene = (n = 0): Scene => ({
  ...emptyScene({ captureId: 'c', width: 100, height: 100, dpr: 1 }),
  nodes: Array.from({ length: n }, (_, i) => rect(`n${i}`)),
})

const rect = (id: string): SceneNode => ({
  kind: 'rect',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  hidden: false,
  stroke: { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 },
  rect: deviceRect(0, 0, 10, 10),
  radiusPx: 0,
  fill: 'none',
})

/** مؤقّتٌ يدوي — الزمن يُدار لا يُنتظَر. */
function manualTimer() {
  const queue: { fn: () => void; ms: number; cancelled: boolean }[] = []
  return {
    schedule: (fn: () => void, ms: number) => {
      const entry = { fn, ms, cancelled: false }
      queue.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    /** يُشغّل كل ما لم يُلغَ. */
    run: () => {
      const live = queue.filter((e) => !e.cancelled)
      queue.length = 0
      for (const e of live) e.fn()
    },
    get scheduled() {
      return queue.filter((e) => !e.cancelled).length
    },
  }
}

type WriteResult = Result<
  { written: true; updatedAt: number } | { written: false; actual: number | null }
>

/**
 * سجلٌّ مزيّف بدلالات `putIfUnchanged` **الحقيقية**.
 *
 * والدمية الساذجة هي التي أخفت العطل: كتابةٌ بشرط `null` على سجلٍّ موجود
 * تفشل **دائمًا** في القاعدة الحقيقية، بينما كانت الدمية تُنجحها — فمرّ
 * اختبارٌ أخضر على زرّ «احفظ نسختي» الذي لا يفعل شيئًا أبدًا.
 */
function fakeStore(initial: number | null) {
  let stored = initial
  return {
    get value() {
      return stored
    },
    set: (v: number | null) => {
      stored = v
    },
    write: (payload: SavePayload, expected: number | null): WriteResult => {
      if (stored !== expected) return ok({ written: false as const, actual: stored })
      stored = payload.updatedAt
      return ok({ written: true as const, updatedAt: payload.updatedAt })
    },
  }
}

function harness(
  writeImpl?: (p: SavePayload, bytes: number, expected: number | null) => Promise<WriteResult>,
) {
  const timer = manualTimer()
  const calls: { payload: SavePayload; bytes: number; expected: number | null }[] = []
  let clock = 1000

  const write = vi.fn(async (payload: SavePayload, bytes: number, expected: number | null) => {
    calls.push({ payload, bytes, expected })
    if (writeImpl) return writeImpl(payload, bytes, expected)
    return ok({ written: true as const, updatedAt: payload.updatedAt })
  })

  const states: string[] = []
  const auto = createAutosave({
    write,
    now: () => (clock += 10),
    schedule: timer.schedule,
    baseUpdatedAt: 500,
    onState: (s) => states.push(s.outcome),
  })

  return { auto, timer, calls, write, states }
}

describe('**التهدئة — شرط بنيوي لا تحسين**', () => {
  it('ثلاثة تعديلات داخل النافذة تُكتب **مرّةً واحدة**', async () => {
    const { auto, timer, calls } = harness()
    auto.push(scene(1))
    auto.push(scene(2))
    auto.push(scene(3))

    expect(calls).toHaveLength(0)
    timer.run()
    await Promise.resolve()
    await Promise.resolve()

    expect(calls).toHaveLength(1)
    // آخر مشهد لا أوّله.
    expect(calls[0]!.payload.scene.nodes).toHaveLength(3)
  })

  it('والنافذة هي المعلَنة', () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(800)
  })

  it('**و`flush` يكتب فورًا** — للإغلاق ولزرّ «احفظ»', async () => {
    const { auto, timer, calls } = harness()
    auto.push(scene(1))
    expect(timer.scheduled).toBe(1)

    await auto.flush()
    expect(calls).toHaveLength(1)
    // والمؤقّت أُلغي فلا كتابة ثانية.
    timer.run()
    await Promise.resolve()
    expect(calls).toHaveLength(1)
  })

  it('و`flush` بلا تعديل لا يكتب شيئًا', async () => {
    const { auto, calls } = harness()
    await auto.flush()
    expect(calls).toHaveLength(0)
  })
})

describe('**الكتابة المشروطة**', () => {
  it('تمرّر الأساس المقروء عند الفتح', async () => {
    const { auto, calls } = harness()
    auto.push(scene(1))
    await auto.flush()
    expect(calls[0]!.expected).toBe(500)
  })

  it('**وتُحدّث الأساس بعد كل نجاح** — وإلّا تعارضت الكتابة التالية مع نفسها', async () => {
    const { auto, calls } = harness()
    auto.push(scene(1))
    await auto.flush()
    const first = calls[0]!.payload.updatedAt

    auto.push(scene(2))
    await auto.flush()
    expect(calls[1]!.expected).toBe(first)
  })

  it('**والتعارض لا يُكتَب فوقه ولا يُرمى ما عندنا**', async () => {
    const { auto, states } = harness(() =>
      Promise.resolve(ok({ written: false as const, actual: 777 })),
    )
    auto.push(scene(1))
    const outcome = await auto.flush()

    expect(outcome).toBe('conflict')
    expect(states).toContain('conflict')
    expect(auto.state.dirty).toBe(true)
    expect(auto.state.message).toContain('مكان آخر')
    // الأساس لم يتغيّر: لم تقع كتابة.
    expect(auto.state.baseUpdatedAt).toBe(500)
  })

  it('**وقرار المستخدم «أبقِ ما عندي» يكتب فوق قيمتهم لا فوق `null`**', async () => {
    // سجلٌّ حقيقي: أساسُنا 500، وتبويبٌ آخر كتب فصار 777.
    const store = fakeStore(777)
    const { auto, calls } = harness((p, _b, expected) => Promise.resolve(store.write(p, expected)))

    auto.push(scene(1))
    expect(await auto.flush()).toBe('conflict')
    expect(calls[0]!.expected).toBe(500)

    /*
     * **هنا كان العطل**: الكتابة فوقهم بشرط `null` تعني «اكتب إن لم يكن
     * هناك سجلّ» — وعند التعارض يوجد سجلّ بالتعريف. فالزرّ لم يكن يفعل
     * شيئًا أبدًا، والدمية الساذجة كانت تُخفيه بإنجاحها ما تفشله القاعدة.
     */
    expect(await auto.overwrite()).toBe('saved')
    expect(calls[1]!.expected).toBe(777)

    // والكتابة التالية تعود مشروطة بالأساس الجديد.
    auto.push(scene(2))
    await auto.flush()
    expect(calls[2]!.expected).toBe(calls[1]!.payload.updatedAt)
  })
})

describe('**الحدود تُعلَن لا تُبتلَع**', () => {
  it('التصفّح الخاص يُعلَن حدًّا برسالته', async () => {
    const { auto } = harness(() =>
      Promise.resolve(
        err({
          code: 'incognito-blocked' as const,
          message: 'الحفظ التلقائي معطَّل في التصفّح الخاص',
        }),
      ),
    )
    auto.push(scene(1))
    expect(await auto.flush()).toBe('incognito-blocked')
    expect(auto.state.message).toContain('التصفّح الخاص')
    expect(auto.state.dirty).toBe(true)
  })

  it('والحصّة الممتلئة تُميَّز عن الفشل العامّ', async () => {
    const { auto } = harness(() =>
      Promise.resolve(err({ code: 'quota-exceeded' as const, message: 'التخزين ممتلئ' })),
    )
    auto.push(scene(1))
    expect(await auto.flush()).toBe('quota-exceeded')
  })

  it('**ومشهدٌ تجاوز السقف يُرفَض قبل المحاولة بسببٍ يُملي فعلًا**', async () => {
    const { calls } = harness()
    const tiny = createAutosave({
      write: () => Promise.resolve(ok({ written: true as const, updatedAt: 1 })),
      now: () => 1,
      schedule: (fn) => {
        fn()
        return () => undefined
      },
      maxBytes: 10,
    })
    tiny.push(scene(3))
    expect(await tiny.flush()).toBe('too-large')
    expect(tiny.state.message).toContain('احذف')
    // ولم تُستدعَ الكتابة أصلًا.
    expect(calls).toHaveLength(0)
  })

  it('**والفشل يُبقي المشهد معلَّقًا** — لا يُرمى ما بُني', async () => {
    let fail = true
    const { auto, calls } = harness((p) => {
      if (fail) return Promise.resolve(err({ code: 'quota-exceeded' as const, message: 'ممتلئ' }))
      return Promise.resolve(ok({ written: true as const, updatedAt: p.updatedAt }))
    })

    auto.push(scene(2))
    expect(await auto.flush()).toBe('quota-exceeded')
    expect(auto.state.dirty).toBe(true)

    // أُفرغت مساحة، فتنجح المحاولة التالية **على المشهد نفسه**.
    fail = false
    expect(await auto.flush()).toBe('saved')
    expect(calls).toHaveLength(2)
    expect(calls[1]!.payload.scene.nodes).toHaveLength(2)
  })
})

describe('الحمولة', () => {
  it('**تحمل ملخّص الحجب كي يُقرأ بلا فكّ المشهد**', async () => {
    const { auto, calls } = harness()
    auto.push(scene(2))
    await auto.flush()
    expect(calls[0]!.payload.redaction).toEqual({ total: 0, irreversible: 0 })
    expect(calls[0]!.payload.schemaVersion).toBeGreaterThan(0)
  })

  it('وتحمل البايتات المقدَّرة — لا يُعاد حسابها في القاعدة', async () => {
    const { auto, calls } = harness()
    auto.push(scene(2))
    await auto.flush()
    expect(calls[0]!.bytes).toBeGreaterThan(0)
  })
})

describe('دورة الحياة', () => {
  it('**و`dispose` يُلغي ما لم يُكتب** — لا كتابة بعد إغلاق المحرر', async () => {
    const { auto, timer, calls } = harness()
    auto.push(scene(1))
    auto.dispose()
    timer.run()
    await Promise.resolve()
    expect(calls).toHaveLength(0)
  })

  it('و`push` بعد `dispose` لا يفعل شيئًا', async () => {
    const { auto, timer, calls } = harness()
    auto.dispose()
    auto.push(scene(1))
    timer.run()
    await Promise.resolve()
    expect(calls).toHaveLength(0)
  })

  it('**ولا كتابتان متوازيتان على السجلّ نفسه**', async () => {
    let open = 0
    let peak = 0
    const { auto } = harness(async (p) => {
      open++
      peak = Math.max(peak, open)
      await Promise.resolve()
      open--
      return ok({ written: true, updatedAt: p.updatedAt })
    })

    auto.push(scene(1))
    const a = auto.flush()
    auto.push(scene(2))
    const b = auto.flush()
    await Promise.all([a, b])
    expect(peak).toBe(1)
  })
})
