// @vitest-environment node

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  judgeAddedCls,
  judgeDegradation,
  MAX_DEGRADATION,
  median,
  MIN_SAMPLES,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/lighthouse-impact.mjs'

/**
 * حكم أثر الحقن على الصفحة المضيفة (`scripts/lighthouse-impact.mjs`، ADR 0049). السالبة الحاسمة: قياسٌ لم يُقَس
 * لا يمرّ، وأساسٌ صفر لا يقبل أي زيادة، وعددٌ أقلّ من الحدّ الأدنى لا يُحكَم عليه — وحارسٌ لا يستورد هذا الحكم
 * يُسقط الاختبار فلا يعود الرقم مكتوبًا في ملفّ كروم.
 */

const root = join(import.meta.dirname, '..', '..')

describe('الوسيط', () => {
  it('الفردي هو الأوسط والزوجي متوسّط الأوسطين، بلا ترتيب مسبق', () => {
    expect(median([9, 1, 5])).toBe(5)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
})

describe('CLS المضاف = صفر', () => {
  it('موجبة: صفرٌ في الجهتين يمرّ', () => {
    const v = judgeAddedCls([0, 0, 0], [0, 0, 0])
    expect(v.pass).toBe(true)
    expect(v.added).toBe(0)
  })

  it('سالبة: انزياحٌ واحد في تشغيلةٍ واحدة معها يسقط — الوسيط كان سيخفيه', () => {
    const v = judgeAddedCls([0, 0, 0, 0], [0, 0, 0.0004, 0])
    expect(v.pass).toBe(false)
    expect(v.added).toBeCloseTo(0.0004)
  })

  it('انزياحٌ ثابتٌ في الجهتين ليس مضافًا', () => {
    expect(judgeAddedCls([0.1, 0.1, 0.1], [0.1, 0.1, 0.1]).pass).toBe(true)
  })

  it('سالبة: قيمةٌ لم تُقَس (NaN · undefined) أو أقلّ من الحدّ الأدنى لا تمرّ', () => {
    expect(judgeAddedCls([0, 0, 0], [0, Number.NaN, 0]).pass).toBe(false)
    expect(judgeAddedCls([0, 0, 0], [0, undefined, 0]).pass).toBe(false)
    expect(judgeAddedCls([], []).pass).toBe(false)
    expect(judgeAddedCls([0, 0], [0, 0]).pass).toBe(false)
  })
})

describe('التدهور النسبي ≤ 5%', () => {
  const opts = { label: 'LCP' }

  it('موجبة: حدّ الخمسة بالمئة نفسه يمرّ، وما فوقه يسقط', () => {
    expect(MAX_DEGRADATION).toBe(0.05)
    expect(judgeDegradation([100, 100, 100], [105, 105, 105], opts).pass).toBe(true)
    expect(judgeDegradation([100, 100, 100], [105.1, 105.1, 105.1], opts).pass).toBe(false)
  })

  it('التحسّن يمرّ، والنسبة تُحسَب على الوسيطين لا على القيم', () => {
    expect(judgeDegradation([100, 100, 100], [90, 91, 92], opts).pass).toBe(true)
    // قيمةٌ شاذّة واحدة لا تقلب وسيط ستٍّ.
    expect(judgeDegradation([100, 100, 100, 100, 100], [100, 100, 100, 100, 190], opts).pass).toBe(
      true,
    )
  })

  it('سالبة: أساسٌ صفر لا يقبل زيادة — النسبة إلى صفر غير معرَّفة', () => {
    const stays = judgeDegradation([0, 0, 0], [0, 0, 0], { label: 'TBT' })
    expect(stays.pass).toBe(true)
    const rises = judgeDegradation([0, 0, 0], [1, 1, 1], { label: 'TBT' })
    expect(rises.pass).toBe(false)
    expect(rises.text).toContain('الأساس صفر')
  })

  it('سالبة: قيمةٌ لم تُقَس أو عددٌ دون الحدّ لا يمرّ', () => {
    expect(judgeDegradation([100, 100, 100], [100, Number.NaN, 100], opts).pass).toBe(false)
    expect(judgeDegradation([100, 100, 100], [Infinity, Infinity, Infinity], opts).pass).toBe(false)
    expect(MIN_SAMPLES).toBe(3)
    expect(judgeDegradation([100, 100], [100, 100], opts).pass).toBe(false)
  })

  it('النص يحمل القيمتين والنسبة والحدّ — يقرأ من يفتح المخرجات المقارنة كاملة', () => {
    const v = judgeDegradation([164.3, 164.3, 164.3], [172.5, 172.5, 172.5], opts)
    expect(v.text).toContain('164')
    expect(v.text).toContain('+5.0%')
    expect(v.text).toContain('5%')
  })
})

describe('الحارس يستورد الحكم ولا يكتب عتبته', () => {
  const guard = readFileSync(join(root, 'scripts/verify-lighthouse.mjs'), 'utf8')

  it('يستورد الدوالّ الثلاث من الوحدة ولا يحمل رقم الخمسة بالمئة', () => {
    expect(guard).toMatch(/from '\.\/lighthouse-impact\.mjs'/u)
    expect(guard).toContain('judgeAddedCls')
    expect(guard).toContain('judgeDegradation')
    expect(guard).not.toMatch(/0\.05\b/u)
  })

  it('لا يحمّل الإضافة بنفسه ولا يطلق كروم — النواة المشتركة وحدها', () => {
    expect(guard).toMatch(/startGuard\(/u)
    expect(guard).not.toMatch(/Extensions\.loadUnpacked|launchChrome\(/u)
  })

  it('سوالبه الثلاث مسمّاة في ترويسته', () => {
    for (const negative of [
      'RASD_BREAK_LIGHTHOUSE=shift',
      'RASD_BREAK_LIGHTHOUSE=block',
      'RASD_GUARD_SABOTAGE=content.js',
    ]) {
      expect(guard).toContain(negative)
    }
  })
})
