// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * `scripts/verify-dist.mjs --target` — **اختيار الهدف**، لا فحوص البيان نفسها (تلك تجري على ما بُني، وسوالبها بتعبثٍ
 * مباشر ببيانَي الخرج في سجلّ SS1). هنا ما يُقرَّر قبل أيّ قراءة لـ`dist/`: علَمٌ ناقص أو مجهول، ومتغيّرٌ يخالف الفحص —
 * فيخرج بالرمز 2 قبل أن يلمس الحزمة، لا يمرّ على حزمةٍ قديمة بالافتراضي.
 */

const SCRIPT = fileURLToPath(new URL('../../../scripts/verify-dist.mjs', import.meta.url))

function run(args: string[], rasdTarget = '') {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, RASD_TARGET: rasdTarget },
    timeout: 60_000,
  })
}

describe('verify:dist — اختيار الهدف', () => {
  it.each([
    ['هدفٌ مجهول', ['--target', 'opera'], '', /«opera».*chromium · firefox/u],
    ['هدفٌ بصيغة المساواة مجهول', ['--target=Firefox'], '', /«Firefox»/u],
    ['علَمٌ بلا قيمة', ['--target'], '', /بلا قيمة/u],
    ['علَمٌ تتلوه علَمٌ آخر', ['--target', '--other'], '', /بلا قيمة/u],
    ['متغيّرٌ مجهول بلا علَم', [], 'opera', /RASD_TARGET = «opera» ليس هدف بناء/u],
    [
      'متغيّرٌ يسمّي غير المفحوص بلا علَم — لا نجاحَ زائفَ على dist/ قديمة',
      [],
      'firefox',
      /مرّر --target firefox/u,
    ],
  ])('يرفض بالرمز 2 قبل أي قراءة: %s', (_name, args, env, message) => {
    const result = run(args, env)
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(message)
  })

  it('العلَم الصريح يحسم على المتغيّر — لا التباس فلا رفض (الحكم بعدها للحزمة نفسها)', () => {
    // 0 أو 1 بحسب وجود `dist-firefox/` وحالتها؛ المهمّ ألّا يكون 2.
    expect(run(['--target', 'firefox'], 'firefox').status).not.toBe(2)
    expect(run(['--target', 'chromium'], 'firefox').status).not.toBe(2)
  })

  it('المتغيّر الموافق للمفحوص لا يُرفض', () => {
    expect(run([], 'chromium').status).not.toBe(2)
    expect(run([], '').status).not.toBe(2)
  })
})
