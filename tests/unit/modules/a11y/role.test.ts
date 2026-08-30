/**
 * الدور والاسم — والقاعدة الحاكمة: **يُعلَن المصدر، ولا يُخترَع دور**.
 *
 * شجرة الإتاحة المحسوبة لا تُتاح لسكربت صفحة: `computedRole` و
 * `computedName` غير موجودتين، و`element.role` انعكاس سمة لا حساب
 * (`button.role` يساوي `null`). فما يُختبَر هنا تقريبٌ يعرف حدوده — والحالة
 * الأهمّ فيه هي `unknown` لا الحالات الناجحة.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { readAccessibleName, readRole } from '@/modules/a11y/role'

const html = (markup: string): Element => {
  document.body.innerHTML = markup
  return document.body.firstElementChild!
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('readRole — الدور ومصدره', () => {
  it('سمة role صريحة تتقدّم على الوسم', () => {
    const el = html('<div role="button">x</div>')
    expect(readRole(el)).toEqual({ role: 'button', source: 'aria-attribute' })
  })

  it('تأخذ أوّل دور في القائمة', () => {
    expect(readRole(html('<div role="switch checkbox">x</div>')).role).toBe('switch')
  })

  it.each([
    ['<button>x</button>', 'button'],
    ['<nav></nav>', 'navigation'],
    ['<main></main>', 'main'],
    ['<h2>x</h2>', 'heading'],
    ['<ul></ul>', 'list'],
    ['<img alt="x">', 'img'],
    ['<dialog></dialog>', 'dialog'],
  ])('%s ⇒ %s ضمنيًّا', (markup, role) => {
    const r = readRole(html(markup))
    expect(r.role).toBe(role)
    expect(r.source).toBe('html-aam')
  })

  it('الرابط بلا href بلا دور — خطأ إتاحة يستحقّ أن يُرى', () => {
    expect(readRole(html('<a>x</a>'))).toEqual({ role: null, source: 'unknown' })
    expect(readRole(html('<a href="#">x</a>')).role).toBe('link')
  })

  it('دور input يتبع نوعه', () => {
    expect(readRole(html('<input type="checkbox">')).role).toBe('checkbox')
    expect(readRole(html('<input type="range">')).role).toBe('slider')
    expect(readRole(html('<input>')).role).toBe('textbox')
  })

  it('نوع input غير معروف لا يُخترَع له دور', () => {
    expect(readRole(html('<input type="color">'))).toEqual({ role: null, source: 'unknown' })
  })

  it('section بلا اسم بلا دور region', () => {
    // الدور مشروط بوجود اسم متاح — وإدراجه ثابتًا في الجدول كذب.
    expect(readRole(html('<section></section>')).role).toBeNull()
    expect(readRole(html('<section aria-label="س"></section>')).role).toBe('region')
  })

  it('الوسم المجهول يُعلَن مجهولًا', () => {
    expect(readRole(html('<div></div>'))).toEqual({ role: null, source: 'unknown' })
    expect(readRole(html('<span></span>')).source).toBe('unknown')
  })
})

describe('readAccessibleName — بترتيب الأولوية', () => {
  it('aria-label أوّلًا', () => {
    const el = html('<button aria-label="حفظ">احفظ الآن</button>')
    expect(readAccessibleName(el)).toEqual({ name: 'حفظ', source: 'aria-label' })
  })

  it('aria-labelledby ثانيًا', () => {
    document.body.innerHTML = '<span id="t">عنوان</span><button aria-labelledby="t">x</button>'
    const btn = document.querySelector('button')!
    expect(readAccessibleName(btn)).toEqual({ name: 'عنوان', source: 'aria-labelledby' })
  })

  it('aria-labelledby يجمع مراجع متعدّدة', () => {
    document.body.innerHTML =
      '<span id="a">حفظ</span><span id="b">المستند</span><button aria-labelledby="a b">x</button>'
    expect(readAccessibleName(document.querySelector('button')!).name).toBe('حفظ المستند')
  })

  it('alt الفارغ اسمٌ مقصود لا غياب', () => {
    // صورة زخرفية: `alt=""` قرارُ مؤلِّف، وعرضه «بلا اسم» يخفي القرار.
    const r = readAccessibleName(html('<img alt="">'))
    expect(r).toEqual({ name: '', source: 'alt' })
  })

  it('alt الحقيقي يُقرأ', () => {
    expect(readAccessibleName(html('<img alt="شعار">')).name).toBe('شعار')
  })

  it('عنصر label ملفوف', () => {
    document.body.innerHTML = '<label>الاسم <input id="i"></label>'
    const input = document.getElementById('i')!
    const r = readAccessibleName(input)
    expect(r.source).toBe('label-element')
    expect(r.name).toContain('الاسم')
  })

  it('title ملاذًا', () => {
    expect(readAccessibleName(html('<div title="تلميح"></div>'))).toEqual({
      name: 'تلميح',
      source: 'title',
    })
  })

  it('المحتوى النصّي لما يأخذ اسمه منه', () => {
    const r = readAccessibleName(html('<button>  احفظ\n  الآن </button>'))
    expect(r).toEqual({ name: 'احفظ الآن', source: 'text-content' })
  })

  it('‏div بنصّ لا يأخذ اسمه منه', () => {
    // الاسم من المحتوى مقصور على أدوار بعينها — وتعميمه يخترع أسماء.
    expect(readAccessibleName(html('<div>نصّ</div>'))).toEqual({ name: null, source: 'unknown' })
  })

  it('بلا شيء ⇒ unknown', () => {
    expect(readAccessibleName(html('<div></div>')).source).toBe('unknown')
  })
})
