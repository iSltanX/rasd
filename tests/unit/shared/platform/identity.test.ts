import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  detectIdentity,
  installSourceOf,
  normaliseBrowser,
  type IdentitySources,
} from '@/shared/platform/identity'

/**
 * هوية المتصفّح للتشخيص — `Docs/Browsers/Architecture.md` §4.11.
 *
 * ثلاثة مصادر، ولكلٍّ حالة غيابه: `runtime.getBrowserInfo` (Firefox)، وعلامات العميل (`userAgentData`)، و`update_url`
 * مع `management.getSelf().installType` لمصدر التثبيت. وما لا يُقرأ يُكتب `unknown` — لا تخمين.
 */
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const none: IdentitySources = {
  browserInfo: () => undefined,
  uaData: () => undefined,
  updateUrl: () => undefined,
  installType: () => undefined,
}

const brands = (...entries: [string, string][]) =>
  entries.map(([brand, version]) => ({ brand, version }))

const ua = (list: [string, string][], over: { broken?: boolean } = {}) => ({
  brands: brands(...list),
  getHighEntropyValues: () =>
    over.broken
      ? Promise.reject(new Error('blocked'))
      : Promise.resolve({ fullVersionList: brands(...list) }),
})

describe('علامات العميل (Chromium)', () => {
  it('Chrome: الاسم والإصدار من علامته، والمحرّك من علامة Chromium', async () => {
    const id = await detectIdentity({
      ...none,
      uaData: () =>
        ua([
          ['Not A;Brand', '99.0.0.0'],
          ['Chromium', '152.0.7977.134'],
          ['Google Chrome', '152.0.7977.134'],
        ]),
    })
    expect(id).toMatchObject({
      browser: 'Google Chrome',
      browserVersion: '152.0.7977.134',
      browserId: 'chrome',
      engine: 'Chromium 152.0.7977.134',
      buildTarget: 'chromium',
    })
  })

  it('Opera 136 ⇒ opera على محرّك Chromium 152 — يميّزه عن Chrome 154', async () => {
    const id = await detectIdentity({
      ...none,
      uaData: () =>
        ua([
          ['Chromium', '152.0.7977.134'],
          ['Opera', '136.0.0.0'],
        ]),
    })
    expect(id).toMatchObject({
      browserId: 'opera',
      browserVersion: '136.0.0.0',
      engine: 'Chromium 152.0.7977.134',
    })
  })

  it.each([
    ['Microsoft Edge', 'edge'],
    ['Brave', 'brave'],
  ])('«%s» ⇒ %s', async (brand, expected) => {
    const id = await detectIdentity({
      ...none,
      uaData: () =>
        ua([
          ['Chromium', '152.0.1.2'],
          [brand, '152.0.1.2'],
        ]),
    })
    expect(id.browserId).toBe(expected)
  })

  it('Vivaldi يخفي علامته ⇒ Chromium، لا unknown ولا اسمٌ مُخمَّن', async () => {
    const id = await detectIdentity({
      ...none,
      uaData: () =>
        ua([
          ['Not.A/Brand', '8.0.0.0'],
          ['Chromium', '152.0.7977.134'],
        ]),
    })
    expect(id).toMatchObject({
      browser: 'Chromium',
      browserId: 'chromium',
      engine: 'Chromium 152.0.7977.134',
    })
  })

  it('علامةٌ لا يعرفها القاموس ⇒ browser_id=unknown مع بقاء الاسم والمحرّك', async () => {
    const id = await detectIdentity({
      ...none,
      uaData: () =>
        ua([
          ['Chromium', '152.1.1.1'],
          ['Yandex', '26.1'],
        ]),
    })
    expect(id).toMatchObject({
      browser: 'Yandex',
      browserId: 'unknown',
      engine: 'Chromium 152.1.1.1',
    })
  })

  it('القيم العالية الإنتروبيا مرفوضة ⇒ تسقط إلى `brands` الخفيفة', async () => {
    const id = await detectIdentity({
      ...none,
      uaData: () =>
        ua(
          [
            ['Chromium', '152'],
            ['Google Chrome', '152'],
          ],
          { broken: true },
        ),
    })
    expect(id).toMatchObject({ browserId: 'chrome', browserVersion: '152', engine: 'Chromium 152' })
  })

  it('سالب: لا userAgentData ولا getBrowserInfo ⇒ unknown في الثلاثة', async () => {
    const id = await detectIdentity(none)
    expect(id).toMatchObject({
      browser: 'unknown',
      browserVersion: 'unknown',
      browserId: 'unknown',
      engine: 'unknown',
      installSource: 'unknown',
    })
  })

  it('سالب: userAgentData يرمي ⇒ unknown لا استثناء', async () => {
    const id = await detectIdentity({
      ...none,
      uaData: () => {
        throw new Error('no ua')
      },
    })
    expect(id.browserId).toBe('unknown')
  })

  it('سالب: قائمة علامات فارغة أو علامة تمويه وحدها ⇒ unknown', async () => {
    expect((await detectIdentity({ ...none, uaData: () => ua([]) })).browserId).toBe('unknown')
    const fake = await detectIdentity({ ...none, uaData: () => ua([['Not)A;Brand', '8']]) })
    expect(fake).toMatchObject({ browser: 'unknown', browserId: 'unknown', engine: 'unknown' })
  })
})

describe('Firefox: runtime.getBrowserInfo', () => {
  it('الاسم والإصدار، والمحرّك Gecko بالإصدار نفسه', async () => {
    const id = await detectIdentity({
      ...none,
      browserInfo: () => Promise.resolve({ name: 'Firefox', version: '157.0' }),
    })
    expect(id).toMatchObject({
      browser: 'Firefox',
      browserVersion: '157.0',
      browserId: 'firefox',
      engine: 'Gecko 157.0',
    })
  })

  it('وهو مقدَّم على علامات العميل إن وُجدتا معًا', async () => {
    const id = await detectIdentity({
      ...none,
      browserInfo: () => Promise.resolve({ name: 'Firefox', version: '157.0' }),
      uaData: () =>
        ua([
          ['Chromium', '152'],
          ['Google Chrome', '152'],
        ]),
    })
    expect(id.browserId).toBe('firefox')
  })

  it('سالب: getBrowserInfo يُرفض ⇒ يرجع إلى علامات العميل', async () => {
    const id = await detectIdentity({
      ...none,
      browserInfo: () => Promise.reject(new Error('no')),
      uaData: () =>
        ua([
          ['Chromium', '152'],
          ['Brave', '152'],
        ]),
    })
    expect(id.browserId).toBe('brave')
  })

  it('سالب: ردٌّ بلا اسمٍ أو إصدار ⇒ لا Gecko مخمَّنًا', async () => {
    const id = await detectIdentity({
      ...none,
      browserInfo: () => Promise.resolve({ name: 'Firefox' }),
    })
    expect(id).toMatchObject({ browserId: 'unknown', engine: 'unknown' })
  })

  it('اسمٌ غير مألوف (فرعٌ على Gecko) ⇒ unknown مع الاسم والمحرّك', async () => {
    const id = await detectIdentity({
      ...none,
      browserInfo: () => Promise.resolve({ name: 'Waterfox', version: '6.5' }),
    })
    expect(id).toMatchObject({ browser: 'Waterfox', browserId: 'unknown', engine: 'Gecko 6.5' })
  })
})

describe('build_target — من TARGET لا من الكشف', () => {
  const targetOf = async (value: string) => {
    vi.resetModules()
    vi.stubEnv('VITE_RASD_TARGET', value)
    const mod = await import('@/shared/platform/identity')
    return (await mod.detectIdentity(none)).buildTarget
  }

  it('chromium بلا تحديد، وfirefox حين يُبنى للهدف', async () => {
    expect(await targetOf('')).toBe('chromium')
    expect(await targetOf('firefox')).toBe('firefox')
  })
})

describe('install_source — يُقاس من update_url وinstallType', () => {
  it.each([
    ['https://clients2.google.com/service/update2/crx', 'chrome-web-store'],
    ['https://clients2.googleusercontent.com/crx/blobs/x', 'chrome-web-store'],
    ['https://edge.microsoft.com/extensionwebstorebase/v1/crx', 'edge-add-ons'],
    ['https://extension-updates.opera.com/api/omaha/update/', 'opera-add-ons'],
  ])('%s ⇒ %s', (url, expected) => {
    expect(installSourceOf(url, 'normal')).toBe(expected)
  })

  it('installType=development ⇒ unpacked ولو حمل البيان update_url', () => {
    expect(installSourceOf(undefined, 'development')).toBe('unpacked')
    expect(installSourceOf('https://clients2.google.com/service/update2/crx', 'development')).toBe(
      'unpacked',
    )
  })

  it('سالب: غياب update_url وinstallType عادي ⇒ unknown لا unpacked مُخمَّنًا', () => {
    expect(installSourceOf(undefined, 'normal')).toBe('unknown')
    expect(installSourceOf(undefined, undefined)).toBe('unknown')
  })

  it.each([
    'https://example.com/update.xml',
    'https://clients2.google.com.evil.example/crx',
    'https://evil.example/clients2.google.com',
    'not a url',
    '',
  ])('سالب: «%s» ليس متجرًا ⇒ unknown', (url) => {
    expect(installSourceOf(url, 'normal')).toBe('unknown')
  })

  it('من المصادر: update_url يُقرأ من البيان، وinstallType من management', async () => {
    const id = await detectIdentity({
      ...none,
      updateUrl: () => 'https://edge.microsoft.com/extensionwebstorebase/v1/crx',
      installType: () => Promise.resolve('normal'),
    })
    expect(id.installSource).toBe('edge-add-ons')
  })

  it('سالب: management يرفض أو updateUrl يرمي ⇒ unknown لا استثناء', async () => {
    const id = await detectIdentity({
      ...none,
      updateUrl: () => {
        throw new Error('manifest')
      },
      installType: () => Promise.reject(new Error('no management')),
    })
    expect(id.installSource).toBe('unknown')
  })
})

describe('normaliseBrowser — قاموسٌ مغلق', () => {
  it.each([
    ['Firefox', 'firefox'],
    ['Google Chrome', 'chrome'],
    ['Microsoft Edge', 'edge'],
    ['Brave', 'brave'],
    ['Opera', 'opera'],
    ['Chromium', 'chromium'],
    ['unknown', 'unknown'],
    ['', 'unknown'],
    ['Safari', 'unknown'],
  ])('«%s» ⇒ %s', (name, expected) => {
    expect(normaliseBrowser(name)).toBe(expected)
  })
})
