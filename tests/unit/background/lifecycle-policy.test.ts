import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerLifecycle, sweepRetention } from '@/background/lifecycle'
import { resetHandlers } from '@/shared/messaging'
import { patchSettings, resetSettingsCache } from '@/shared/settings'
import * as db from '@/shared/storage/db'
import { getSession, patchSession } from '@/shared/storage/session'

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  vi.restoreAllMocks()
  // fakeBrowser لا يطبّق `runtime.onConnect` ولا `alarms` — registerLifecycle
  // تستدعيهما (القنوات والحارس) وهما خارج نطاق هذا الاختبار تمامًا.
  Object.assign(globalThis.chrome, {
    runtime: { ...globalThis.chrome.runtime, onConnect: { addListener: vi.fn() } },
    alarms: {
      create: vi.fn(),
      get: vi.fn().mockResolvedValue(undefined),
      onAlarm: { addListener: vi.fn() },
    },
  })
})

describe('registerLifecycle — سياسة التصفّح الخاص حيّة', () => {
  it('تغيّر الإعداد بعد الإقلاع يُعيد تطبيق السياسة بلا إعادة تشغيل', async () => {
    const spy = vi.spyOn(db, 'setIncognitoWritePolicy')
    registerLifecycle()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith(true))

    await patchSettings({ privacy: { incognito: 'allow' } } as never)
    await vi.waitFor(() => expect(spy).toHaveBeenLastCalledWith(false))
  })

  /*
   * الوحدة 20.3 — «معطَّل» يمنع الحقن عند البوّابة، ويمنع الكتابة هنا كذلك.
   * حزامان لا تكرار: الكتابة لا تصل أصلًا حين لا يُحقَن شيء، لكن مسارات
   * الخلفية (الالتقاط) لا تمرّ كلّها ببوّابة الحقن.
   */
  it('و«معطَّل» يمنع الكتابة كما يمنعها «يعمل بلا حفظ»', async () => {
    const spy = vi.spyOn(db, 'setIncognitoWritePolicy')
    registerLifecycle()

    await patchSettings({ privacy: { incognito: 'off' } } as never)
    await vi.waitFor(() => expect(spy).toHaveBeenLastCalledWith(true))
  })
})

/**
 * المنبّهات — `§6` صفّ 127، أخطر ما رصدته مراجعة Gate B للوحدة 20.3.
 *
 * `chrome.alarms.create` باسمٍ قائم **يستبدل المنبّه ويصفّر عدّاده**. و
 * service worker في MV3 يُوقَظ ويُنهى عشرات المرّات في الساعة، و
 * `registerLifecycle()` تُستدعى في كل إقلاع — فمنبّهٌ دورته ستّون دقيقة كان
 * **لا يبلغها أبدًا**، والحذف الدوري ميّتٌ تمامًا لا بطيء.
 */
describe('المنبّهات لا تُعاد جدولتها عند كل إقلاع', () => {
  const alarms = () =>
    globalThis.chrome.alarms as unknown as {
      create: ReturnType<typeof vi.fn>
      get: ReturnType<typeof vi.fn>
    }

  it('**إقلاعٌ ثانٍ بمنبّهات قائمة لا يُنشئ شيئًا** — وإلّا صُفِّر العدّاد فلم يُطلَق قطّ', async () => {
    alarms().get.mockResolvedValue({ name: 'قائم', periodInMinutes: 60 })

    registerLifecycle()
    await vi.waitFor(() => expect(alarms().get).toHaveBeenCalled())

    expect(alarms().create, 'أُعيدت جدولة منبّه قائم فصُفِّر عدّاده').not.toHaveBeenCalled()
  })

  it('وإقلاعٌ أوّل بلا منبّهات يُنشئ الاثنين بدورتيهما', async () => {
    alarms().get.mockResolvedValue(undefined)

    registerLifecycle()

    await vi.waitFor(() => expect(alarms().create).toHaveBeenCalledTimes(2))
    expect(alarms().create).toHaveBeenCalledWith('rasd:watchdog', { periodInMinutes: 1 })
    expect(alarms().create).toHaveBeenCalledWith('rasd:retention', { periodInMinutes: 60 })
  })

  it('والكنس يخرج فورًا حين تكون المدّة صفرًا — الافتراضي لا يحذف شيئًا', async () => {
    await expect(sweepRetention(1_700_000_000_000)).resolves.toBe(0)
  })
})

/**
 * تدقيق Copilot، N3 — في كروم حقيقي بإيقاف العامل عبر CDP أثناء التقاط كامل: بعد الإيقاف والاستيقاظ
 * بقيت `session.job` (فتعرض النافذة «يلتقط» حتى يمسحها الحارس بعد دقيقتين ونصف)، وبقيت الصفحة مُمرَّرة
 * بعناصرها المخفيّة. العلَم `active` في الذاكرة يموت مع العامل، والجلسة تنجو منه.
 */
describe('إقلاع العامل يستعيد مهمّةً يتيمة', () => {
  const orphan = {
    id: 'يتيمة',
    kind: 'full-page',
    tabId: 3,
    startedAt: 1,
    updatedAt: 1,
    done: 0,
    total: 0,
  }

  it('**مهمّةُ عاملٍ مات تُمسح من الجلسة عند الإقلاع، وتُستعاد صفحتها**', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, value: { restored: true } })
    Object.assign(globalThis.chrome.tabs, { sendMessage })
    await patchSession({ job: orphan, modes: { 3: 'area' } })

    registerLifecycle()

    await vi.waitFor(async () => expect((await getSession()).job).toBeNull())
    expect((await getSession()).modes, 'الأوضاع تبقى').toEqual({ 3: 'area' })
    expect(sendMessage).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: 'fullpage/finish' }),
      undefined,
    )
  })

  /*
   * الرسالة التي توقظ العامل تُخدَم قبل أن يأتي دور الاستعادة في طابور الجلسة: قِيس في كروم أن `session/get`
   * بعد الإيقاف ردّ باليتيمة والصفحةُ قد استُعيدت. فالقراءة عبر الرسالة تنتظر دورها كالكتابة.
   */
  it('**و`session/get` الذي أيقظ العامل يرى الجلسة بعد الاستعادة لا قبلها**', async () => {
    Object.assign(globalThis.chrome.tabs, {
      sendMessage: vi.fn().mockResolvedValue({ ok: true, value: { restored: true } }),
    })
    await patchSession({ job: orphan })
    const replies: { ok: boolean; value?: { job: unknown } }[] = []
    // `fakeBrowser.reset()` يُسقط مستمع الرسائل والوحدة تظنّه قائمًا — يُعاد تسجيله من الصفر.
    resetHandlers()

    registerLifecycle()
    void (await fakeBrowser.runtime.onMessage.trigger(
      { __rasd: 1, id: 'g', type: 'session/get' },
      {},
      (reply: { ok: boolean; value?: { job: unknown } }) => replies.push(reply),
    ))

    await vi.waitFor(() => expect(replies).toHaveLength(1))
    expect(replies[0]).toMatchObject({ ok: true, value: { job: null } })
  })

  it('وإقلاعٌ بلا مهمّة لا يكتب شيئًا ولا يراسل تبويبًا', async () => {
    const sendMessage = vi.fn()
    Object.assign(globalThis.chrome.tabs, { sendMessage })
    await patchSession({ modes: { 3: 'area' } })
    const set = vi.spyOn(chrome.storage.session, 'set')

    registerLifecycle()
    await new Promise((r) => setTimeout(r, 30))

    expect(set).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
