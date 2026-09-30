/**
 * الأولوية — بالحالات المقيسة سلوكيًّا في Chrome لا المنقولة عن المواصفة.
 *
 * كل حالة «غالب/مغلوب» هنا جاءت من تجربة فعلية: عنصران بمحدِّدين، وقراءة
 * أيّهما فاز. والاختبار الذي يخترع قواعده يثبت اتّساق الشيفرة مع نفسها.
 */
import { describe, expect, it } from 'vitest'

import {
  clearSpecificityCache,
  compareSpecificity,
  scanEscape,
  specificity,
  splitTop,
  type Specificity,
} from '@/modules/computed-style/specificity'

const spec = (s: string): Specificity => specificity(s)

describe('الأساسيات', () => {
  it.each([
    ['*', [0, 0, 0]],
    ['div', [0, 0, 1]],
    ['.a', [0, 1, 0]],
    ['#a', [1, 0, 0]],
    ['[data-x]', [0, 1, 0]],
    ['[data-x="y"]', [0, 1, 0]],
    [':hover', [0, 1, 0]],
    ['::before', [0, 0, 1]],
    [':before', [0, 0, 1]],
    ['div.a#b', [1, 1, 1]],
    ['ul li a', [0, 0, 3]],
    ['div > p + span ~ a', [0, 0, 4]],
  ])('%s ⇒ %j', (sel, want) => {
    expect(spec(sel)).toEqual(want)
  })
})

describe('الأصناف الزائفة الوظيفية — المقيسة', () => {
  it(':where() صفر مهما حوت', () => {
    // قيس: `:where(.W, #t)` خسر أمام `.W` المجرّدة.
    expect(spec(':where(.W, #t)')).toEqual([0, 0, 0])
    expect(compareSpecificity(spec('.W'), spec(':where(.W, #t)'))).toBeGreaterThan(0)
  })

  it(':is() تأخذ أعلى وسائطها', () => {
    // قيس: `:is(.W, #idX)` غلب بـ(1,0,0).
    expect(spec(':is(.W, #idX)')).toEqual([1, 0, 0])
    expect(spec(':is(div, span)')).toEqual([0, 0, 1])
  })

  it(':not() تأخذ أعلى وسائطها', () => {
    expect(spec(':not(#a, .b)')).toEqual([1, 0, 0])
    expect(spec('p:not(.x)')).toEqual([0, 1, 1])
  })

  it(':has() تأخذ أعلى وسائطها', () => {
    expect(spec(':has(> #a)')).toEqual([1, 0, 0])
    expect(spec('div:has(.x)')).toEqual([0, 1, 1])
  })

  it(':nth-child(n of S) تحسب S ولا تُهملها', () => {
    // قيس: `:nth-child(1 of .S)` غلب.
    expect(spec(':nth-child(2n)')).toEqual([0, 1, 0])
    expect(spec(':nth-child(1 of .S)')).toEqual([0, 2, 0])
    expect(spec(':nth-child(1 of #S)')).toEqual([1, 1, 0])
  })

  it('التعشيش لا يُفقد الوسائط', () => {
    expect(spec(':is(:not(#a))')).toEqual([1, 0, 0])
    expect(spec(':where(:is(#a))')).toEqual([0, 0, 0])
  })
})

describe('تهريب CSS — الإصلاح الرابع', () => {
  it('التهريب السداسي العشري ينتهي بمسافة تُبتلَع', () => {
    /*
     * `\32 xl\:flex` هو الصنف `2xl:flex` — والمسافة جزء من التهريب لا فاصل.
     * حارسٌ يتخطّى محرفًا واحدًا يقرأ `xl\:flex` **اسمَ وسم**، فيُحسب في
     * الخانة الخطأ. قيس أثره: ستّ فروق من أربعمئة عنصر على tailwindcss.com.
     */
    expect(spec('.\\32 xl\\:flex')).toEqual([0, 1, 0])
    expect(spec('.\\31 \\/2')).toEqual([0, 1, 0])
  })

  it('محدِّد Tailwind نمطي', () => {
    expect(spec('.md\\:flex')).toEqual([0, 1, 0])
    expect(spec('.hover\\:bg-blue-500:hover')).toEqual([0, 2, 0])
  })

  it('التهريب لمحرف واحد', () => {
    expect(spec('.a\\.b')).toEqual([0, 1, 0])
    expect(spec('.\\@md')).toEqual([0, 1, 0])
  })

  it('scanEscape يبتلع التهريب كاملًا', () => {
    // `\32 ` = أربعة محارف: شرطة مائلة + 3 + 2 + مسافة.
    expect(scanEscape('\\32 x', 0)).toBe(4)
    expect(scanEscape('\\.b', 0)).toBe(2)
    expect(scanEscape('\\0000e9x', 0)).toBe(7)
  })
})

describe('القائمة المفصولة بفواصل تأخذ الأعلى', () => {
  it('يختار الأقوى', () => {
    expect(spec('div, #a')).toEqual([1, 0, 0])
    expect(spec('#a, div')).toEqual([1, 0, 0])
  })

  it('لا يقسم عند فاصلة داخل أقواس', () => {
    expect(splitTop(':is(a, b), .c', ',')).toEqual([':is(a, b)', '.c'])
  })

  it('لا يقسم عند فاصلة داخل سلسلة نصّية', () => {
    expect(splitTop('[title="a,b"], .c', ',')).toEqual(['[title="a,b"]', '.c'])
  })
})

describe('&‏ التداخل تُحسب صفرًا لا وسمًا', () => {
  it('محدِّد غير مُفكَّك لا يُحسب وسمًا', () => {
    /*
     * `&` تحمل دلالة `:is()` على محدِّدات الأب، و`nesting.ts` يستبدلها قبل
     * الوصول إلى هنا. فحسابها وسمًا يضخّم الخانة `c` خطأً.
     */
    expect(spec('& .txt')).toEqual([0, 1, 0])
    expect(spec('& > .b')).toEqual([0, 1, 0])
    // والوسم بعدها يُحسب وسمًا واحدًا لا اثنين.
    expect(spec('& div')).toEqual([0, 0, 1])
  })
})

describe('السمات ذات القيم الشائكة', () => {
  it('قيمة تحوي أقواسًا أو نقطتين', () => {
    expect(spec('[href="a(b)c"]')).toEqual([0, 1, 0])
    expect(spec('[data-a=":hover"]')).toEqual([0, 1, 0])
  })

  it('قيمة تحوي نقطة لا تُحسب صنفًا', () => {
    expect(spec('[href="x.y"]')).toEqual([0, 1, 0])
  })
})

describe('تهريب في أوضاع شاذّة', () => {
  it('scanEscape يتقدّم محرفين على شرطة مائلة بلا ما بعدها', () => {
    // لا شيء يُهرَّب: النمط لا يطابق فيُقفَز الحرف نفسه وما بعده — لا حلقة.
    expect(scanEscape('\\', 0)).toBe(2)
    expect(scanEscape('a\\', 1)).toBe(3)
  })

  it('شرطة مائلة أخيرة في محدِّد لا تُعلّق الحساب', () => {
    expect(spec('.a\\')).toEqual([0, 1, 0])
  })

  it('محدِّد يبدأ بتهريب يُحسب وسمًا واحدًا', () => {
    // `\:x` اسم وسم واحد هو `:x` — لا صنف زائف ولا وسمان.
    expect(spec('\\:x')).toEqual([0, 0, 1])
  })

  it('تهريب داخل السمة لا يُنهي أقواسها', () => {
    /*
     * `\]` داخل `[a\]b]` جزء من اسم السمة لا إغلاقها. ولو أُنهي عنده لبقيت
     * `b]` فقُرئت `b` وسمًا زائدًا.
     */
    expect(spec('[a\\]b].c')).toEqual([0, 2, 0])
  })

  it('علامة اقتباس مهرَّبة داخل قيمة السمة لا تُنهي القيمة', () => {
    // القيمة `say "hi"`؛ ولو انتهت عند أوّل `\"` لقُرئ ما بعدها وسومًا.
    expect(spec('[title="say \\"hi\\""] .c')).toEqual([0, 2, 0])
  })
})

describe('سلاسل نصّية خارج السمات', () => {
  it('محتوى السلسلة لا يُحسب وسومًا', () => {
    // لو قُرئ `b c` لصارت الوسوم أربعة.
    expect(spec('a"b c"d')).toEqual([0, 0, 2])
  })

  it('علامة اقتباس مهرَّبة لا تُنهي السلسلة', () => {
    expect(spec('a"x\\"y z"d')).toEqual([0, 0, 2])
  })

  it('سلسلة بلا إغلاق تمتدّ إلى النهاية ولا تُعلّق', () => {
    expect(spec('a"b c')).toEqual([0, 0, 1])
  })

  it('علامة الاقتباس المفردة كالمزدوجة', () => {
    expect(spec("a'b c'd")).toEqual([0, 0, 2])
  })
})

describe('محدِّدات مبتورة وما لا يُحسب', () => {
  it('سمة بلا إغلاق تُحسب سمة واحدة ولا ترمي', () => {
    expect(spec('[data-x')).toEqual([0, 1, 0])
  })

  it('صنف زائف وظيفي بلا إغلاق لا يرمي', () => {
    expect(() => spec(':is(.a')).not.toThrow()
    expect(spec(':is(.a')).toEqual([0, 1, 0])
  })

  it('محارف لا معنى لها في محدِّد تُتجاهَل', () => {
    // الأرقام والرموز الشاردة ليست وسمًا ولا صنفًا.
    expect(spec('.a % 5 .b')).toEqual([0, 2, 0])
    expect(spec('!!!')).toEqual([0, 0, 0])
  })

  it('وسائط العنصر الزائف الوظيفي لا تُحسب', () => {
    // `label` هنا اسم جزء لا وسم.
    expect(spec('div::part(label)')).toEqual([0, 0, 2])
    expect(spec('::highlight(search) .x')).toEqual([0, 1, 1])
  })
})

describe('compareSpecificity', () => {
  it('يرتّب بالخانات بالترتيب', () => {
    expect(compareSpecificity([1, 0, 0], [0, 99, 99])).toBeGreaterThan(0)
    expect(compareSpecificity([0, 1, 0], [0, 0, 99])).toBeGreaterThan(0)
    expect(compareSpecificity([0, 0, 1], [0, 0, 1])).toBe(0)
  })
})

describe('الذاكرة لا تُفسد النتيجة', () => {
  it('النداء المكرَّر يعطي القيمة نفسها', () => {
    const a = spec('.x #y :where(.z)')
    const b = spec('.x #y :where(.z)')
    expect(a).toEqual(b)
    expect(a).toEqual([1, 1, 0])
  })

  it('تفريغ الذاكرة يُسقط المحفوظ ويبقي الحساب نفسه', () => {
    // الإصابة تُرجع المصفوفة عينها؛ وبعد التفريغ تُحسب من جديد فتُرجع أخرى بالقيمة ذاتها.
    const before = spec('.m .n')
    expect(spec('.m .n')).toBe(before)

    clearSpecificityCache()

    const after = spec('.m .n')
    expect(after).not.toBe(before)
    expect(after).toEqual(before)
  })
})
