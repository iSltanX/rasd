import { describe, expect, it } from 'vitest'

import { generatorOf, isUnstableClass, isUnstableId } from '@/modules/dom-picker/unstable-names'

/**
 * كشف الأسماء المولَّدة — الحالات الحدّية التي لا يصلها جدول الأدوات المسمّاة.
 *
 * الجداول الموجبة (أصناف الأدوات ومعرّفاتها المعروفة) في `selector.test.ts`
 * لأنها تُختبَر هناك من زاوية المحدِّد؛ هنا ما يقع عند حافّة **الاحتياطي** الذي
 * يخمّن بلا اسم أداة، وعند المدخلات الفارغة التي لا يجوز أن تصير جزءًا من محدِّد.
 */

describe('المدخل الفارغ لا يصلح أبدًا', () => {
  // اسم فارغ يُنتج `.` أو `#` وحدهما في المحدِّد — أسوأ من رفضه.
  it('صنف فارغ يُرفَض', () => {
    expect(isUnstableClass('')).toBe(true)
  })

  it('معرّف فارغ يُرفَض', () => {
    expect(isUnstableId('')).toBe(true)
  })
})

describe('الاحتياطي يفرّق بين رمز مقاس وبصمة', () => {
  /**
   * كل مقطع مقروء: كلمة، أو حروف قليلة يتبعها رقم (`x2`، `md2`). الاسم كلّه
   * مقروء إذن ولو خلط الحروف والأرقام — وإلا رُفض صنف سلالم منافع مقصود.
   */
  it.each(['size-x2', 'gap-md2', 'ratio_sm3'])('%s يُقبَل — كل مقاطعه رموز مقروءة', (name) => {
    expect(isUnstableClass(name), `${name} رُفض خطأً`).toBe(false)
    // لم تطابقه أداة مسمّاة ولا الاحتياطي، فلا مصدر توليد له.
    expect(generatorOf(name)).toBeNull()
  })

  /**
   * مقطع واحد غير مقروء يكفي لإسقاط الاسم كلّه: `a1b2c3` يخلط الحروف والأرقام
   * على نحو لا يطابق رمز مقاس (ثلاثة محارف كحدّ أقصى لكل جانب).
   */
  it.each(['col-a1b2c3', 'size-x2y3', 'btn_9f8e7d6c'])('%s يُرفَض — فيه مقطع يشبه بصمة', (name) => {
    expect(isUnstableClass(name), `${name} قُبل خطأً`).toBe(true)
    expect(generatorOf(name)).toBe('hash-like')
  })

  it('التمييز بين الاسمين وحده هو المقطع: `size-x2` مقبول و`size-x2y3` مرفوض', () => {
    // الفارق حرفان فقط بعد `x2`، وهو بالضبط ما يقيسه الشرط الثالث في الاحتياطي.
    expect(isUnstableClass('size-x2')).toBe(false)
    expect(isUnstableClass('size-x2y3')).toBe(true)
  })
})

describe('generatorOf', () => {
  it.each(['btn', 'hero-title', 'MuiButton-root', 'grid-cols-12'])(
    '%s لا مصدر توليد له فيُرجع null',
    (name) => {
      expect(generatorOf(name)).toBeNull()
    },
  )

  it('الأداة المسمّاة تسبق الاحتياطي حين يصدق الاثنان', () => {
    // `css-1x2y3z` يبدو بصمةً أيضًا، لكن الاسم المعروف أدقّ تقريرًا.
    expect(generatorOf('css-1x2y3z')).toBe('emotion')
  })
})
