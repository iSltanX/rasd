import { describe, expect, it } from 'vitest'

import { collectDiagnostics, type DiagnosticsSources } from '@/modules/report/diagnostics'

import type { BrowserIdentity } from '@/shared/platform/identity'

/** التشخيص يجمع النظام من مصادره والمتصفّح من `platform/identity.ts` — كلٌّ يتدهور إلى `unknown` وحده. */
const identity: BrowserIdentity = {
  browser: 'Firefox',
  browserVersion: '157.0',
  browserId: 'firefox',
  engine: 'Gecko 157.0',
  buildTarget: 'firefox',
  installSource: 'unpacked',
}

const sources = (over: Partial<DiagnosticsSources> = {}): DiagnosticsSources => ({
  manifestVersion: () => '1.0.0',
  platformInfo: () => Promise.resolve({ os: 'mac', arch: 'arm64' }),
  uaData: () => undefined,
  identity: () => Promise.resolve(identity),
  ...over,
})

describe('collectDiagnostics', () => {
  it('الحقول الأربعة الجديدة تصل من الهوية كما هي', async () => {
    expect(await collectDiagnostics(sources())).toEqual({
      appVersion: '1.0.0',
      os: 'macos',
      osVersion: 'unknown',
      arch: 'arm64',
      browser: 'Firefox',
      browserVersion: '157.0',
      browserId: 'firefox',
      engine: 'Gecko 157.0',
      buildTarget: 'firefox',
      installSource: 'unpacked',
    })
  })

  it('إصدار النظام من القيم العالية الإنتروبيا إن وُجدت، وغيابها unknown', async () => {
    const d = await collectDiagnostics(
      sources({
        uaData: () => ({
          getHighEntropyValues: () => Promise.resolve({ platformVersion: ' 15.3.0 ' }),
        }),
      }),
    )
    expect(d.osVersion).toBe('15.3.0')
  })

  it('سالب: platformInfo ترفض ⇒ unknown للنظام والمعمارية والهوية سليمة', async () => {
    const d = await collectDiagnostics(
      sources({ platformInfo: () => Promise.reject(new Error('x')) }),
    )
    expect(d).toMatchObject({ os: 'unknown', arch: 'unknown', browserId: 'firefox' })
  })

  it('سالب: القيم العالية الإنتروبيا ترفض ⇒ osVersion=unknown لا استثناء', async () => {
    const d = await collectDiagnostics(
      sources({ uaData: () => ({ getHighEntropyValues: () => Promise.reject(new Error('x')) }) }),
    )
    expect(d.osVersion).toBe('unknown')
  })
})
