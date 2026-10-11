import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSession,
  defaultSession,
  getSession,
  patchSession,
  setTabMode,
  updateSession,
} from '@/shared/storage/session'

beforeEach(() => {
  fakeBrowser.reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('حالة الجلسة', () => {
  it('تبدأ فارغة', async () => {
    expect(await getSession()).toEqual(defaultSession())
  })

  it('تحفظ وضع كل تبويب على حدة', async () => {
    await setTabMode(11, 'inspect')
    await setTabMode(22, 'measure')
    const s = await getSession()
    expect(s.modes[11]).toBe('inspect')
    expect(s.modes[22]).toBe('measure')
  })

  it('العودة إلى idle تحذف المدخل بدل تخزين حالة خاملة', async () => {
    await setTabMode(11, 'inspect')
    await setTabMode(11, 'idle')
    expect((await getSession()).modes[11]).toBeUndefined()
  })

  it('تحفظ المهمة الجارية وتمحوها', async () => {
    await patchSession({
      job: { id: 'j1', kind: 'full-page', tabId: 5, startedAt: 1, done: 2, total: 10 },
    })
    expect((await getSession()).job?.id).toBe('j1')
    await patchSession({ job: null })
    expect((await getSession()).job).toBeNull()
  })

  it('القيمة التالفة تعود إلى الافتراضي', async () => {
    await fakeBrowser.storage.session.set({ 'rasd:session': 'ليست كائنًا' })
    expect(await getSession()).toEqual(defaultSession())
  })

  it('المسح يُفرِغ كل شيء', async () => {
    await setTabMode(1, 'colour')
    await clearSession()
    expect(await getSession()).toEqual(defaultSession())
  })
})

/**
 * الجلسة حالة عابرة — وفشل التخزين فيها يجب أن يظهر للمستدعي لا أن يُبتلع
 * فيظنّ أن الوضع النشط حُفظ. القراءة وحدها تتسامح: الجلسة الفاضية افتراضٌ آمن.
 */
describe('القيم الناقصة والأعطال', () => {
  it('كائن مخزَّن بلا modes يعطي modes فارغة لا undefined', async () => {
    const job = { id: 'j1', kind: 'full-page', tabId: 5, startedAt: 1, done: 0, total: 3 }
    await fakeBrowser.storage.session.set({ 'rasd:session': { job } })

    expect(await getSession()).toEqual({ modes: {}, job })
  })

  it('كائن مخزَّن بلا job يعطي job = null لا undefined', async () => {
    await fakeBrowser.storage.session.set({ 'rasd:session': { modes: { 4: 'measure' } } })

    expect(await getSession()).toEqual({ modes: { 4: 'measure' }, job: null })
  })

  it('فشل القراءة يعطي الجلسة الافتراضية ولا يرمي', async () => {
    vi.spyOn(chrome.storage.session, 'get').mockRejectedValueOnce(new Error('down'))

    expect(await getSession()).toEqual(defaultSession())
  })

  it('فشل الكتابة يُرجَع خطأً ولا يُبلَّغ نجاحًا — والمخزَّن لا يتغيّر', async () => {
    await setTabMode(3, 'inspect')
    vi.spyOn(chrome.storage.session, 'set').mockRejectedValueOnce(new Error('quota'))

    const result = await patchSession({ modes: { 3: 'measure' } })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.detail).toBe('quota')
    expect((await getSession()).modes[3]).toBe('inspect')
  })

  it('setTabMode يمرّر فشل الكتابة كما هو', async () => {
    vi.spyOn(chrome.storage.session, 'set').mockRejectedValueOnce(new Error('quota'))

    const result = await setTabMode(3, 'colour')

    expect(result.ok).toBe(false)
    expect((await getSession()).modes[3]).toBeUndefined()
  })

  it('فشل المسح يُرجَع خطأً — والحالة باقية', async () => {
    await setTabMode(1, 'colour')
    vi.spyOn(chrome.storage.session, 'remove').mockRejectedValueOnce(new Error('busy'))

    const result = await clearSession()

    expect(result.ok).toBe(false)
    expect((await getSession()).modes[1]).toBe('colour')
  })

  it('المسح الناجح يُرجع ok(null)', async () => {
    expect(await clearSession()).toEqual({ ok: true, value: null })
  })
})

/**
 * كتابات متزامنة — تدقيق Copilot، D1 (مؤكَّد في كروم بنقاط الدخول الحقيقية: `tool/activate` إلى أربعة
 * تبويبات معًا ضيّع وضعًا إلى ثلاثة في كل جولة). كل كتابة كانت قراءةً ثمّ تعديلًا ثمّ كتابة بلا طابور،
 * فتقرأ الكتابات المتزامنة الحال نفسه ويمحو آخرُها ما كتبه ما قبلها.
 */
describe('الكتابات المتزامنة لا يمحو بعضها بعضًا', () => {
  it('**أربعة أوضاع لأربعة تبويبات معًا تُحفظ كلّها**', async () => {
    await Promise.all([
      setTabMode(1, 'area'),
      setTabMode(2, 'measure'),
      setTabMode(3, 'colour'),
      setTabMode(4, 'inspect'),
    ])

    expect((await getSession()).modes).toEqual({
      1: 'area',
      2: 'measure',
      3: 'colour',
      4: 'inspect',
    })
  })

  it('**ومهمّةٌ تُكتب مع وضعٍ في اللحظة نفسها تبقى معه**', async () => {
    const job = { id: 'j', kind: 'full-page', tabId: 9, startedAt: 1, done: 0, total: 0 }
    await Promise.all([setTabMode(5, 'element'), patchSession({ job })])

    expect(await getSession()).toEqual({ modes: { 5: 'element' }, job })
  })

  it('وكل كاتب يرى ما كتبه من سبقه في الطابور', async () => {
    const seen: number[] = []
    await Promise.all(
      [1, 2, 3].map((n) =>
        updateSession((current) => {
          seen.push(Object.keys(current.modes).length)
          return { ...current, modes: { ...current.modes, [n]: 'area' } }
        }),
      ),
    )

    expect(seen).toEqual([0, 1, 2])
  })

  it('وتحديثٌ يعيد الحال نفسه لا يكتب شيئًا', async () => {
    await setTabMode(1, 'area')
    const set = vi.spyOn(chrome.storage.session, 'set')

    const result = await updateSession((current) => current)

    expect(result.ok).toBe(true)
    expect(set).not.toHaveBeenCalled()
  })

  it('**وقراءةٌ فاشلة لا تكتب الافتراضي فوق الموجود** — فرع D1b', async () => {
    await setTabMode(1, 'area')
    vi.spyOn(chrome.storage.session, 'get').mockRejectedValueOnce(new Error('down'))

    const result = await setTabMode(2, 'measure')

    expect(result.ok, 'كتابةٌ بُنيت على قراءة فاشلة').toBe(false)
    expect((await getSession()).modes).toEqual({ 1: 'area' })
  })

  it('وكاتبٌ سقط لا يوقف الطابور عمّن بعده', async () => {
    vi.spyOn(chrome.storage.session, 'set').mockRejectedValueOnce(new Error('quota'))

    const [first, second] = await Promise.all([setTabMode(1, 'area'), setTabMode(2, 'measure')])

    expect(first.ok).toBe(false)
    expect(second.ok).toBe(true)
    expect((await getSession()).modes).toEqual({ 2: 'measure' })
  })
})
