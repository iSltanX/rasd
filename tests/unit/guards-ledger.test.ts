// @vitest-environment node
// يقرأ `ci.yml` والسجلّ من القرص، فلا علاقة له بالـDOM.

import { describe, expect, it } from 'vitest'

// @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
import { classify, readMatrix, streakOf } from '../../scripts/guards-sync.mjs'

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
