// @vitest-environment node
// يشغّل ESLint على القرص، فلا علاقة له بالـDOM.

import { fileURLToPath, URL } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/**
 * حدود المعمار ليست اتفاقًا شفويًا — هذا الاختبار يثبت أن `pnpm lint`
 * يسقط فعلًا عند الاستيراد الممنوع.
 *
 * تُلَنت شجرة العيّنات بـ`cwd` مضبوط عليها، لأن `no-restricted-paths`
 * يحلّ مسارات الـzones نسبةً إلى مجلّد العمل.
 */

const fixtureRoot = fileURLToPath(new URL('../fixtures/lint', import.meta.url))

async function lintFixture(relPath: string) {
  const eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: `${fixtureRoot}/eslint.fixture.config.js`,
    ignore: false,
  })
  const [result] = await eslint.lintFiles([`${fixtureRoot}/${relPath}`])
  return result?.messages ?? []
}

const RULE = 'import-x/no-restricted-paths'

describe('حدود المعمار مفروضة آليًا', () => {
  it('يمنع modules/ من استيراد ui/', async () => {
    const messages = await lintFixture('src/modules/violates-ui.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
    expect(violation?.message).toContain('modules/')
  })

  it('يمنع content/ من استيراد pages/', async () => {
    const messages = await lintFixture('src/content/violates-pages.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
    expect(violation?.message).toContain('content/')
  })

  it('يمنع shared/ من استيراد أي طبقة أعلى', async () => {
    const messages = await lintFixture('src/shared/violates-modules.ts')
    const violation = messages.find((m) => m.ruleId === RULE)
    expect(violation, 'كان يجب أن تُرفع مخالفة').toBeDefined()
    expect(violation?.severity).toBe(2)
    expect(violation?.message).toContain('shared/')
  })

  it('يسمح لـmodules/ باستيراد shared/', async () => {
    const messages = await lintFixture('src/modules/allowed.ts')
    expect(messages.filter((m) => m.ruleId === RULE)).toHaveLength(0)
  })
})
