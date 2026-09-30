// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  readReport,
  summarise,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدالّتيه الخالصتين.
} from '../../scripts/test-repeat.mjs'

/**
 * خلاصة قياس التقطّع — ما يعدّه السكربت ويطبعه هو معيار القبول، فالعدّ نفسه يُختبَر بحالتين:
 * عشرٌ خضراء تُقرأ «أخضر عشر مرّات متتالية»، وسقوطٌ واحد في وسطها يكسر السلسلة ويُسمّي الساقط.
 */

const green = { total: 4000, failed: [] }

describe('summarise', () => {
  it('عشر تشغيلات خضراء: كلّها أخضر، والسلسلة عشر، ولا متقطّع', () => {
    expect(summarise(Array.from({ length: 10 }, () => green))).toEqual({
      runs: 10,
      green: 10,
      longestStreak: 10,
      allGreen: true,
      flaky: [],
    })
  })

  it('سقوطٌ واحد في التشغيل الرابع يكسر السلسلة ويُسمّي الاختبار ومرّات سقوطه', () => {
    const runs = Array.from({ length: 10 }, (_, i) =>
      i === 3 ? { total: 4000, failed: ['tests/a.test.ts › يسقط أحيانًا'] } : green,
    )
    expect(summarise(runs)).toEqual({
      runs: 10,
      green: 9,
      longestStreak: 6,
      allGreen: false,
      flaky: [{ name: 'tests/a.test.ts › يسقط أحيانًا', times: 1 }],
    })
  })

  it('تشغيلٌ لم يكتمل أو بلا اختبارات ليس أخضر', () => {
    expect(summarise([green, { total: 0, failed: [], error: 'لم يُكتب التقرير' }]).allGreen).toBe(
      false,
    )
    expect(summarise([{ total: 0, failed: [] }]).allGreen).toBe(false)
    expect(summarise([]).allGreen).toBe(false)
  })
})

describe('readReport', () => {
  it('يعدّ من تقرير vitest ويسمّي الساقط وملفًّا سقط قبل اختباراته', () => {
    const report = {
      numTotalTests: 3,
      testResults: [
        {
          name: '/repo/tests/a.test.ts',
          status: 'failed',
          assertionResults: [
            { status: 'passed', fullName: 'ينجح' },
            { status: 'failed', fullName: 'يسقط' },
          ],
        },
        {
          name: '/repo/tests/b.test.ts',
          status: 'failed',
          message: 'import',
          assertionResults: [],
        },
        {
          name: '/repo/tests/c.test.ts',
          status: 'passed',
          assertionResults: [{ status: 'passed' }],
        },
      ],
    }
    const { total, failed } = readReport(report)
    expect(total).toBe(3)
    expect(failed).toHaveLength(2)
    expect(failed[0]).toMatch(/a\.test\.ts › يسقط$/u)
    expect(failed[1]).toMatch(/b\.test\.ts › \(فشل الملفّ: import\)$/u)
  })
})
