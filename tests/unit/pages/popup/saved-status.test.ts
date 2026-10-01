import { describe, expect, it } from 'vitest'

import { savedStatusLine } from '@/pages/popup/context'
import { hasIsolates, stripIsolates } from '@/shared/bidi'

/**
 * سطر «محفوظة محليًا · العرض × الارتفاع» تحت اسم المنتج في نافذة الإضافة.
 *
 * كُتب البُعدان في قالبٍ نصّي بلا عزل، فقلبهما Chrome بصريًّا: `1440 × 3820` تُعرَض «3820 × 1440». الأرقام
 * تأخذ حكم الحرف الأيمن في قاعدة N1، فيفصل رقمَين غربيّين محايدٌ واحد (×) فتُرتَّب جزرهما باتّجاه
 * المحيط. وعزل الوسم `<bdi>` المحيط بالسطر كلّه لا يكفي — يعزله عمّا حوله لا بعضَه عن بعض. كشفه
 * `verify:visual` (فحص الأرقام) على الشاشة المرسومة لا على الشيفرة (`STAGES/26`).
 */
describe('savedStatusLine — سطر الحالة بعد حفظ لقطة', () => {
  it('البُعدان بين محرفَي عزل — فلا ينقلب ترتيبهما بجوار العربية', () => {
    const line = savedStatusLine(1440, 3820)
    expect(hasIsolates(line)).toBe(true)
    expect(line).toContain('⁦1440 × 3820⁩')
  })

  it('وبلا محارف العزل هو النصّ نفسه — ما يقرؤه المستخدم لا يتغيّر', () => {
    expect(stripIsolates(savedStatusLine(1440, 3820))).toBe('محفوظة محليًا · 1440 × 3820')
  })
})
