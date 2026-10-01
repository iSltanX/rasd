// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  parseArgs,
  readReport,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدالّتيه الخالصتين.
} from '../../scripts/e2e.mjs'

/**
 * مُشغِّل المسارات — ما يعدّه ويمرّره هو معيار «صفر تقطّع في عشر تشغيلات»، فالعدّ نفسه يُختبَر:
 * مسارٌ **متخطّى** لا يُحسب نجاحًا، وساقطٌ يُسمّى بمشروعه (الكثافة)، وما لا يخصّ المُشغِّل يمرّ كما هو.
 */

const spec = (title: string, project: string, status: string, results: string[] = ['passed']) => ({
  title,
  tests: [{ projectName: project, status, results: results.map((s) => ({ status: s })) }],
})

describe('parseArgs', () => {
  it('بلا وسائط: تشغيلٌ واحد ولا شيء يمرّ إلى Playwright', () => {
    expect(parseArgs([])).toEqual({ runs: 1, passthrough: [] })
  })

  it('--runs يُنتزع، وما سواه يمرّ بترتيبه', () => {
    expect(parseArgs(['--project', 'dpr-2', '--runs', '10', '-g', 'التقاط'])).toEqual({
      runs: 10,
      passthrough: ['--project', 'dpr-2', '-g', 'التقاط'],
    })
  })
})

describe('readReport', () => {
  it('كل المسارات خضراء: العدد كاملًا ولا ساقط ولا متخطّى', () => {
    const report = {
      suites: [
        {
          title: 'a.spec.mjs',
          specs: [spec('مسار', 'dpr-1', 'expected'), spec('مسار', 'dpr-2', 'expected')],
        },
      ],
    }
    expect(readReport(report)).toEqual({ total: 2, skipped: 0, failed: [] })
  })

  it('الساقط يُسمّى بملفّه ومساره وكثافته', () => {
    const report = {
      suites: [
        {
          title: 'a.spec.mjs',
          specs: [
            spec('مسار', 'dpr-1', 'expected'),
            spec('مسار', 'dpr-2', 'unexpected', ['failed']),
          ],
        },
      ],
    }
    expect(readReport(report)).toEqual({
      total: 2,
      skipped: 0,
      failed: ['a.spec.mjs › مسار › dpr-2'],
    })
  })

  it('المتخطّى يُعدّ في المجموع ويُعلَن ولا يُحسب ساقطًا ولا ناجحًا', () => {
    const report = {
      suites: [{ title: 'a', specs: [spec('مسار', 'dpr-1', 'skipped', ['skipped'])] }],
    }
    expect(readReport(report)).toEqual({ total: 1, skipped: 1, failed: [] })
  })

  it('مسارٌ نجح في المحاولة الثانية بعد فشل أوّل ليس أخضر — الإعادة تُخفي التقطّع', () => {
    const report = {
      suites: [{ title: 'a', specs: [spec('مسار', 'dpr-1', 'flaky', ['failed', 'passed'])] }],
    }
    expect(readReport(report).failed).toEqual(['a › مسار › dpr-1'])
  })

  it('خطأ تشغيلٍ على مستوى التقرير (إعداد معطوب) يُعدّ ساقطًا مسمًّى', () => {
    const report = { suites: [], errors: [{ message: 'Error: bad config\n  at x' }] }
    expect(readReport(report).failed).toEqual(['(خطأ تشغيل: Error: bad config)'])
  })

  it('المجموعات المتداخلة تُمشى وعنوانها في اسم الساقط', () => {
    const report = {
      suites: [
        {
          title: 'file',
          suites: [{ title: 'inner', specs: [spec('مسار', 'dpr-1', 'unexpected', ['failed'])] }],
        },
      ],
    }
    expect(readReport(report).failed).toEqual(['file › inner › مسار › dpr-1'])
  })
})
