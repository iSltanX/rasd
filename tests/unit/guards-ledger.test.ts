// @vitest-environment node
// يقرأ `ci.yml` والسجلّ من القرص، فلا علاقة له بالـDOM.

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  classify,
  DOCS_JOB,
  isDocsOnlyRun,
  isUnstartedRun,
  readGuardEvents,
  readMatrix,
  runDisposition,
  streakOf,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة. التوجيه على
  // سطر المُحدِّد لأن `tsc` يبلّغ عنه هناك حين يلتفّ الاستيراد على أسطر.
} from '../../scripts/guards-sync.mjs'

/**
 * قاعدة ترقية الحرّاس — الدوالّ الخالصة وحدها.
 *
 * الطرفان الآخران (‏الالتقاط بشبكة، و`--check` بمنطقه الكامل) يُثبَتان
 * بأوامر ثلاثة مكتوبة في `§6` صفّ 98: موجبٌ على الحقيقي، وسالبان على
 * عِدلَي `tests/fixtures/ci-ledger/`. هنا يُثبَت ما لا يحتاج عمليةً كاملة.
 */
describe('تصنيف نتيجة الوظيفة', () => {
  it('الخضراء وحدها هي success', () => {
    expect(classify('success')).toBe('green')
  })

  /*
   * الفخّ القاتل: `continue-on-error` يجعل **الجولة** خضراء ووظائفُها حمراء.
   * فلو قُرئت نتيجة الجولة بدل نتيجة الوظيفة، لصار السجلّ أخضر أبديًّا
   * ولرُقِّي السبعة عشر كلّهم. هذه الحالة هي ما يمنع ذلك.
   */
  it('الفشل والمهلة حمراوان', () => {
    expect(classify('failure')).toBe('red')
    expect(classify('timed_out')).toBe('red')
  })

  /* وظيفةٌ لم تُصدر حكمًا ليست حكمًا — والإلغاء يقع بدفعٍ يعلو الجولة. */
  it('الإلغاء وغياب الوظيفة وتخطّيها ثغرات لا حمرة ولا خضرة', () => {
    expect(classify('cancelled')).toBe('hole')
    expect(classify(undefined)).toBe('hole')
    expect(classify('skipped')).toBe('hole')
  })
})

describe('السلسلة الخضراء المتتالية', () => {
  const scripts = (n: number) => Array.from({ length: n }, () => 'aaa')

  it('تُعدّ من الأحدث وتتوقّف عند أوّل غير أخضر', () => {
    const entry = { results: ['green', 'green', 'red', 'green'], scripts: scripts(4) }
    expect(streakOf(entry, 'aaa')).toBe(2)
  })

  it('الثغرة تكسر السلسلة ولا تجسرها', () => {
    const entry = { results: ['green', 'hole', 'green', 'green'], scripts: scripts(4) }
    expect(streakOf(entry, 'aaa')).toBe(1)
  })

  /* حارسٌ أُعيدت كتابته لا يرث سجلّ سلفه: لا شيء منه قِيس. */
  it('تتوقّف عند أوّل جولة شُغِّل فيها حارسٌ غير الحارس اليوم', () => {
    const entry = { results: ['green', 'green', 'green'], scripts: ['aaa', 'bbb', 'bbb'] }
    expect(streakOf(entry, 'aaa')).toBe(1)
  })

  it('بصمة غائبة لا تكسر — عِدل بلا تاريخ يبقى مقروءًا', () => {
    const entry = { results: ['green', 'green'], scripts: [null, null] }
    expect(streakOf(entry, 'aaa')).toBe(2)
  })
})

describe('قراءة عمود blocking من ci.yml', () => {
  /*
   * **العدد مثبَّت بيدٍ عمدًا، ويتغيّر بيدٍ عمدًا.**
   *
   * صار تسعة عشر بإضافة `export` في الوحدة 19.1 — وهذا بالضبط ما يشتريه
   * التثبيت: حارسٌ يدخل أو يخرج لا يمرّ صامتًا، بل يُسقط هذا الاختبار
   * فيُقرأ العدد ويُقَرّ أو يُنكَر.
   */
  it('تقرأ التسعة عشر كلّهم — والعدد مثبَّت كي يظهر الحذف الصامت', () => {
    expect(readMatrix()).toHaveLength(19)
  })

  it('تقرأ القيمة المنطقية لا نصّها', () => {
    const row = readMatrix().find((r: { guard: string }) => r.guard === 'overlay')
    expect(typeof row.blocking).toBe('boolean')
  })

  it('تقرأ العِدل المُرقّى بقيمة true', () => {
    const rows = readMatrix('tests/fixtures/ci-ledger/stale-ci.yml')
    expect(rows).toEqual([{ guard: 'overlay', blocking: true }])
  })
})

describe('مسار التوثيق في ci.yml وسجلّ الترقية', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
  const pattern = /DOCS_ONLY: '([^']+)'/u.exec(ci)?.[1]
  const docsOnly = new RegExp(pattern ?? '^$', 'u')

  it('اسم وظيفة التوثيق في ci.yml هو الذي يقرؤه السجلّ', () => {
    expect(ci).toContain(`name: ${DOCS_JOB}`)
  })

  it('التوثيق الخالص يطابق المسار الخفيف', () => {
    expect(pattern).toBeDefined()
    for (const file of [
      'AGENTS.md',
      'README.md',
      'ROADMAP.md',
      'STATUS.md',
      'STAGES/02.md',
      'Docs/Engineering.md',
      'Docs/ADR/0024-x.md',
      'Docs/Brand/png/rasd-icon-idle-16.png',
      'Docs/Brand/svg/rasd-symbol-mono.svg',
    ]) {
      expect(docsOnly.test(file), file).toBe(true)
    }
  })

  it('الشيفرة والاختبارات والسكربتات والإعداد وCI تبقي المسار الكامل', () => {
    for (const file of [
      'src/ui/RasdMark.tsx',
      'tests/unit/guards-ledger.test.ts',
      'scripts/gate-a.mjs',
      'Docs/Brand/build.mjs',
      'STAGES/baseline.json',
      'public/icons/icon-16.png',
      'package.json',
      '.github/workflows/ci.yml',
      '.prettierignore',
      'manifest.config.ts',
      'xAGENTS.md',
      'AGENTS.md.bak',
    ]) {
      expect(docsOnly.test(file), file).toBe(false)
    }
  })

  it('جولة جرت فيها وظيفة التوثيق تُستبعَد', () => {
    const jobs = [
      { name: 'تصنيف التغيير', conclusion: 'success' },
      { name: DOCS_JOB, conclusion: 'success' },
      { name: 'كروم حقيقي · verify:${{ matrix.guard }}', conclusion: 'skipped' },
    ]
    expect(isDocsOnlyRun(jobs)).toBe(true)
    expect(isDocsOnlyRun([{ name: DOCS_JOB, conclusion: 'failure' }])).toBe(true)
  })

  it('الجولة الكاملة وجولة ما قبل المسارين تُعدّان كما كانتا', () => {
    const full = [
      { name: DOCS_JOB, conclusion: 'skipped' },
      { name: 'بناء الحزمة المشتركة', conclusion: 'success' },
      { name: 'كروم حقيقي · verify:load', conclusion: 'success' },
    ]
    expect(isDocsOnlyRun(full)).toBe(false)
    expect(isDocsOnlyRun([{ name: 'كروم حقيقي · verify:load', conclusion: 'success' }])).toBe(false)
    // سقوط البناء يتخطّى الحرّاس بلا وظيفة توثيق — ثغرةٌ لا استبعاد
    expect(
      isDocsOnlyRun([
        { name: 'بناء الحزمة المشتركة', conclusion: 'failure' },
        { name: 'كروم حقيقي · verify:${{ matrix.guard }}', conclusion: 'skipped' },
      ]),
    ).toBe(false)
  })
})

/*
 * القراران 5 و6 (ADR 0026): جولةٌ لم تبدأ، وجولةٌ لم تطلب الحرّاس بشرط `ci.yml`، لا تُعدّان.
 * العيّنات بشكل ردّ `repos/…/actions/runs/<id>/jobs` كما قيس على الجولات المرفوضة
 * (`36674750359`): كل وظيفة `completed` بلا خطوة واحدة.
 */
describe('مصير الجولة في السجلّ', () => {
  const step = [{ name: 'Set up job', conclusion: 'success' }]
  const refused = [
    { name: 'تصنيف التغيير', conclusion: 'failure', steps: [] },
    { name: 'بناء الحزمة المشتركة', conclusion: 'failure', steps: [] },
    { name: DOCS_JOB, conclusion: 'skipped', steps: [] },
    { name: 'كروم حقيقي · verify:${{ matrix.guard }}', conclusion: 'skipped', steps: [] },
  ]
  const cheapPush = [
    { name: 'تصنيف التغيير', conclusion: 'success', steps: step },
    { name: 'بناء الحزمة المشتركة', conclusion: 'success', steps: step },
    { name: DOCS_JOB, conclusion: 'skipped', steps: [] },
    { name: 'كروم حقيقي · verify:${{ matrix.guard }}', conclusion: 'skipped', steps: [] },
  ]
  const guardRun = [
    { name: 'تصنيف التغيير', conclusion: 'success', steps: step },
    { name: 'كروم حقيقي · verify:load', conclusion: 'success', steps: step },
  ]
  const dispatchOnly = ['workflow_dispatch']

  it('الجولة المرفوضة بلا خطوة لا تُعدّ — وكانت تُنزل الحاجبة كلّها ثغراتٍ', () => {
    expect(isUnstartedRun(refused)).toBe(true)
    expect(runDisposition('push', refused)).toBe('unstarted')
    expect(runDisposition('workflow_dispatch', refused, dispatchOnly)).toBe('unstarted')
  })

  it('وظيفةٌ واحدة بدأت تكفي لتُحاكَم الجولة', () => {
    expect(isUnstartedRun(cheapPush)).toBe(false)
    expect(isUnstartedRun(guardRun)).toBe(false)
  })

  it('بلا شرط على الحرّاس: الدفع الذي تخطّى حرّاسه ثغرةٌ كما كان (القرار 3)', () => {
    expect(runDisposition('push', cheapPush, null)).toBe('guards')
  })

  it('مع الشرط: الدفع الذي لم يطلب الحرّاس يُستبعَد', () => {
    expect(runDisposition('push', cheapPush, dispatchOnly)).toBe('no-guards')
  })

  it('مع الشرط: الجولة اليدوية التي تخطّت حرّاسها تبقى ثغرة — طُلبت الأدلّة ولم تُجمَع', () => {
    expect(runDisposition('workflow_dispatch', cheapPush, dispatchOnly)).toBe('guards')
  })

  it('مع الشرط: دفعٌ قديم جرت فيه الحرّاس يُعدّ كما كان', () => {
    expect(runDisposition('push', guardRun, dispatchOnly)).toBe('guards')
  })

  it('جولة التوثيق تبقى توثيقًا قبل أي قرار آخر', () => {
    const docs = [{ name: DOCS_JOB, conclusion: 'success', steps: step }]
    expect(runDisposition('push', docs, dispatchOnly)).toBe('docs')
  })
})

describe('أحداث الحرّاس مقروءة من شرط وظيفتها في ci.yml', () => {
  it('ci.yml الحقيقي يُقرأ بلا خطأ، ونتيجته إمّا كل الأحداث وإمّا قائمة', () => {
    const events = readGuardEvents()
    expect(events === null || Array.isArray(events)).toBe(true)
  })

  it('الشرط على الحدث يُقرأ قائمة', () => {
    expect(readGuardEvents('tests/fixtures/ci-ledger/dispatch-ci.yml')).toEqual([
      'workflow_dispatch',
    ])
  })

  it('غياب الشرط يعني كل الأحداث', () => {
    expect(readGuardEvents('tests/fixtures/ci-ledger/stale-ci.yml')).toBeNull()
  })

  it('شرطٌ بشكل غير مفهوم يُرمى ولا يُتخطّى', () => {
    expect(() => {
      readGuardEvents('tests/fixtures/ci-ledger/odd-if-ci.yml')
    }).toThrow(/غير مفهوم/u)
  })
})
