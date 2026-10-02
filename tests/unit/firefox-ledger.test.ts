// @vitest-environment node

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  FIREFOX_JOB,
  ledgerProblems,
  readSteps,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/firefox-ledger.mjs'
import {
  firefoxGuards,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/firefox-verify.mjs'

/**
 * سجلّ ترقية حرّاس Firefox (SS7، ADR 0059) — ملفٌّ مستقلّ عن سجلّ كروم، يطابق الحرّاس المعرَّفة وخطوات وظيفة `firefox`
 * في `ci.yml` وبصماتها. الالتقاط من GitHub يثبته أمرٌ لا اختبار؛ وهنا الفحص الخالص بموجبه وسوالبه.
 */
const yml = readFileSync('.github/workflows/ci.yml', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
interface Entry {
  results: string[]
  scripts: string[]
  streak: number
  eligible: boolean
}
const entry = (streak = 0): Entry => ({ results: [], scripts: [], streak, eligible: false })
const ledgerOf = (
  guards: string[],
): { promotionStreak: number; guards: Record<string, Entry> } => ({
  promotionStreak: 10,
  guards: Object.fromEntries(guards.map((g) => [g, entry()])),
})

describe('وظيفة firefox في ci.yml', () => {
  it('خطوةٌ باسم كل حارس معرَّف، لا أكثر ولا أقلّ', () => {
    expect(readSteps(yml)?.sort()).toEqual(firefoxGuards(pkg).sort())
  })

  it('اسم الوظيفة المرجعيّ هو اسمها في ci.yml، وهي غير حاجبة', () => {
    const block = /\n {2}firefox:\n((?: {4}.*\n|\s*\n)+)/u.exec(yml)?.[1] ?? ''
    expect(block).toContain(`name: ${FIREFOX_JOB}`)
    expect(block).toContain('continue-on-error: true')
  })

  it('ليست صفوفًا في مصفوفة كروم — لا `guard: <firefox>` في live', () => {
    for (const g of firefoxGuards(pkg)) expect(yml).not.toContain(`{ guard: firefox-${g}`)
  })
})

describe('ledgerProblems', () => {
  const guards = ['load', 'popup']
  const fingerprint = () => 'abc'

  it('موجب: السجلّ والحرّاس والخطوات متطابقة', () => {
    expect(
      ledgerProblems({ ledger: ledgerOf(guards), guards, steps: guards, fingerprint }),
    ).toEqual([])
  })

  it('سالب: لا سجلّ', () => {
    expect(ledgerProblems({ ledger: null, guards, steps: guards, fingerprint })[0]).toContain(
      'لا سجلّ',
    )
  })

  it('سالب: حارسٌ أُضيف بلا سجلّ ولا خطوة', () => {
    const problems = ledgerProblems({
      ledger: ledgerOf(['load']),
      guards,
      steps: ['load'],
      fingerprint,
    })
    expect(problems).toContain('حارس بلا سجلّ: popup')
    expect(problems).toContain('حارس بلا خطوة في ci.yml: firefox:popup')
  })

  it('سالب: سلسلةٌ مودَعة لا تطابق المحسوبة', () => {
    const ledger = ledgerOf(guards)
    ledger.guards.load = { results: ['green'], scripts: ['old'], streak: 1, eligible: false }
    expect(ledgerProblems({ ledger, guards, steps: guards, fingerprint })).toContain(
      'سلسلة «load» في السجلّ 1 والمحسوبة 0',
    )
  })
})
