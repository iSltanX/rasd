import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerLifecycle, sweepRetention } from '@/background/lifecycle'
import { patchSettings, resetSettingsCache } from '@/shared/settings'
import * as db from '@/shared/storage/db'

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
