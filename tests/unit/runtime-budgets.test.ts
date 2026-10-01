// @vitest-environment node

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُقرأ رقمه لمقارنته بالجدول.
import { BUDGETS as BUNDLE_BUDGETS } from '../../scripts/bundle-budget.mjs'
import {
  BUDGETS,
  cpuPercent,
  framesToFps,
  judge,
  median,
  MIN_FRAMES,
  percentile,
  ROWS,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/runtime-budgets.mjs'

interface Row {
  id: string
  budget: number
  command: string | null
  pending?: string
  guard?: string
  source: string | null
}
const rows = ROWS as Row[]

/**
 * ميزانيات وقت التشغيل (`scripts/runtime-budgets.mjs`، ADR 0038). السالبة الحاسمة: قيمةٌ لم تُقَس لا
 * تمرّ، وإطاراتٌ تتلاحق دفعات بعد توقّف طويل لا تُقرأ سلاسةً، وصفٌّ في الجدول بلا أمر ولا حارس
 * يستورد الحكم يُسقط الاختبار — وإلا صارت الميزانية وعدًا في وثيقة كما كانت (الصفّ 152).
 */

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('الأرقام كما اعتُمدت', () => {
  it('لا رقم أخفّ من الجدول الأصلي للمرحلة 24 السابقة', () => {
    // تعديل هذا الاختبار هو الطريق الوحيد إلى تليين ميزانية — فيظهر في الفرق ويُسأل عنه.
    expect(BUDGETS).toEqual({
      inspectEntryMs: 150,
      idleCpuPercent: 1,
      minFps: 55,
      fullPageSeconds: 25,
      searchMs: 150,
    })
  })

  it('الجدول تسعة صفوف بمعرّفات فريدة', () => {
    expect(rows).toHaveLength(9)
    expect(new Set(rows.map((r) => r.id)).size).toBe(9)
  })
})

describe('judge', () => {
  it('السقف: الحدّ نفسه يمرّ وما فوقه يسقط', () => {
    expect(judge('inspect-entry', 150).pass).toBe(true)
    expect(judge('inspect-entry', 150.01).pass).toBe(false)
    expect(judge('search-5000', 0).pass).toBe(true)
  })

  it('ذروة الذاكرة: 400MB تمرّ و401 تسقط، ولم تُقَس تسقط', () => {
    expect(judge('memory-peak', 400).pass).toBe(true)
    expect(judge('memory-peak', 400.5).pass).toBe(false)
    expect(judge('memory-peak', Number.NaN).pass).toBe(false)
  })

  it('الأرضية: الحدّ نفسه يمرّ وما تحته يسقط', () => {
    expect(judge('fps-5000', 55).pass).toBe(true)
    expect(judge('fps-5000', 54.99).pass).toBe(false)
  })

  it('قيمة لم تُقَس تسقط ولا تمرّ — NaN وInfinity وغير الرقم', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, '12', {}]) {
      expect(judge('inspect-entry', value).pass).toBe(false)
      expect(judge('fps-5000', value).pass).toBe(false)
    }
    // ما يجعل NaN فخًّا: `!(NaN > 150)` صواب. الحكم لا يُكتب بهذه الصيغة.
    expect(judge('inspect-entry', Number.NaN).text).toContain('لم يُقَس')
  })

  it('النصّ يحمل القيمة والحدّ والوحدة', () => {
    expect(judge('fullpage-20', 15.7).text).toBe('التقاط صفحة 20 شاشة: 15.7s ≤ 25s')
    expect(judge('idle-cpu', 0.04).text).toBe('CPU للـoverlay الخامل: 0.04% ≤ 1%')
    expect(judge('fps-5000', 60).text).toContain('≥ 55fps')
  })

  it('معرّف مجهول يرمي', () => {
    expect(() => {
      judge('no-such-row', 1)
    }).toThrow(/غير معروف/u)
  })
})

describe('الإحصاء', () => {
  it('الوسيط والمئين', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10)
    expect(Number.isNaN(median([]))).toBe(true)
    expect(Number.isNaN(percentile([], 0.5))).toBe(true)
  })
})

describe('framesToFps', () => {
  it('ستّون إطارًا في الثانية على إيقاع الشاشة تمرّ', () => {
    const steady = Array.from({ length: 90 }, () => 16.7)
    const { fps } = framesToFps(steady)
    expect(fps).toBeGreaterThan(59)
    expect(judge('fps-5000', fps).pass).toBe(true)
  })

  it('إطارات تتلاحق دفعات بعد توقّفات طويلة تسقط وإن كان وسيطها «سريعًا»', () => {
    // الشكل المقيس في السالبة: ثلاثون توقّفًا بـ47ms، وسبعة وخمسون إطارًا يستدرك كلٌّ منها في 6.8ms.
    const bunched = [
      ...Array.from({ length: 30 }, () => 47),
      ...Array.from({ length: 57 }, () => 6.8),
    ]
    const { fps, medianMs } = framesToFps(bunched)
    // الوسيط وحده كان سيقرؤها «147fps» فتمرّ — وهذا ما يمنع الحكم عليه.
    expect(1000 / medianMs).toBeGreaterThan(55)
    expect(fps).toBeLessThan(55)
    expect(judge('fps-5000', fps).pass).toBe(false)
  })

  it('تعثّرٌ منتظم يسقط', () => {
    const { fps } = framesToFps(Array.from({ length: 60 }, () => 33.4))
    expect(fps).toBeCloseTo(30, 0)
    expect(judge('fps-5000', fps).pass).toBe(false)
  })

  it('عيّنة أقصر من الحدّ الأدنى لا تُقرأ: NaN فيسقط الحكم', () => {
    const { fps } = framesToFps(Array.from({ length: MIN_FRAMES - 1 }, () => 16.7))
    expect(Number.isNaN(fps)).toBe(true)
    expect(judge('fps-5000', fps).pass).toBe(false)
    expect(Number.isNaN(framesToFps([]).fps)).toBe(true)
  })
})

describe('cpuPercent', () => {
  const at = (timestamp: number, task: number) => [
    { name: 'Timestamp', value: timestamp },
    { name: 'TaskDuration', value: task },
    { name: 'ScriptDuration', value: 0 },
  ]

  it('نسبة العمل من الزمن الجداري', () => {
    expect(cpuPercent(at(100, 2), at(103, 2.03))).toBeCloseTo(1, 5)
    expect(judge('idle-cpu', cpuPercent(at(100, 2), at(103, 2.0012))).pass).toBe(true)
  })

  it('30% تسقط', () => {
    const cpu = cpuPercent(at(0, 0), at(3, 0.9))
    expect(cpu).toBeCloseTo(30, 5)
    expect(judge('idle-cpu', cpu).pass).toBe(false)
  })

  it('قراءتان بلا مرور زمن، أو عدّاد رجع للوراء، أو مقياس مفقود ⇒ NaN', () => {
    expect(Number.isNaN(cpuPercent(at(5, 1), at(5, 1)))).toBe(true)
    expect(Number.isNaN(cpuPercent(at(5, 2), at(8, 1)))).toBe(true)
    expect(Number.isNaN(cpuPercent([], []))).toBe(true)
  })
})

describe('الجدول والحرّاس', () => {
  const scripts: Record<string, string> = JSON.parse(read('package.json')).scripts

  it('كل صفّ له أمر في package.json، أو مرحلة معلنة تبنيه', () => {
    for (const row of rows) {
      if (row.command === null) {
        expect(row.pending, `الصفّ ${row.id} بلا أمر ولا مرحلة`).toMatch(/^STAGES\/\d\d$/u)
        continue
      }
      expect(scripts[row.command], `الصفّ ${row.id}: لا سكربت ${row.command}`).toBeTruthy()
    }
  })

  it('كل حارس يملك صفًّا يستورد الحكم ويستدعيه باسم صفّه', () => {
    const mine = rows.filter((r) => r.source === null && r.guard)
    expect(mine.map((r) => r.id).sort()).toEqual([
      'fps-5000',
      'fullpage-20',
      'idle-cpu',
      'inspect-entry',
      'memory-peak',
      'search-5000',
    ])
    for (const row of mine) {
      const file = `scripts/verify-${row.guard}.mjs`
      expect(existsSync(join(root, file)), file).toBe(true)
      const source = read(file)
      expect(source, `${file} لا يستورد runtime-budgets`).toMatch(
        /from '\.\/runtime-budgets\.mjs'/u,
      )
      expect(source, `${file} لا يحكم على ${row.id}`).toMatch(
        new RegExp(`judge\\(\\s*'${row.id}'`, 'u'),
      )
    }
  })

  it('لا رقم ميزانية حرفيّ يعيش في حارس بجانب الجدول', () => {
    // كان `elapsed <= 25000` في الالتقاط الكامل؛ نُقل إلى `BUDGETS.fullPageSeconds`.
    expect(read('scripts/verify-fullpage.mjs')).not.toMatch(/\b25000\b|<=\s*25\b/u)
    expect(read('scripts/verify-library.mjs')).not.toMatch(/<=\s*150\b/u)
    expect(read('scripts/verify-inspect.mjs')).not.toMatch(/<=\s*150\b/u)
    expect(read('scripts/verify-overlay.mjs')).not.toMatch(/>=\s*55\b|cpu\w*\s*<=\s*1\b/iu)
  })

  it('الصفوف التي رقمها في مصدر آخر تطابقه', () => {
    const row = (id: string) => rows.find((r) => r.id === id)!
    expect(row('bundle-content').budget).toBe(BUNDLE_BUDGETS.content)
    expect(row('bundle-popup').budget).toBe(BUNDLE_BUDGETS.popup)
    const popup = /OPEN_BUDGET_MS\s*=\s*(\d+)/u.exec(read('scripts/verify-popup.mjs'))
    expect(Number(popup?.[1])).toBe(row('popup-open').budget)
  })
})

describe('عيّنتا الأداء', () => {
  const html = (name: string) => read(`tests/fixtures/sites/${name}/index.html`)

  it('perf-5000 خمسة آلاف خلية ساكنة بلا مؤقّت ولا شبكة', () => {
    const source = html('perf-5000')
    expect(source).toMatch(/const CELLS = 5000\b/u)
    expect(source).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|animation|transition/u)
    expect(source).not.toMatch(/https?:\/\/|fetch\(|XMLHttpRequest|@import/u)
  })

  it('perf-20screens عشرون شاشة بارتفاع النافذة والفائض مقصوص', () => {
    const source = html('perf-20screens')
    expect(source).toMatch(/const SCREENS = 20\b/u)
    expect(source).toMatch(/block-size:\s*100vh/u)
    expect(source).toMatch(/overflow:\s*hidden/u)
    expect(source).not.toMatch(/https?:\/\/|fetch\(|XMLHttpRequest|@import/u)
  })
})
