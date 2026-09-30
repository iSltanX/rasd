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

describe('readRole — الحواف', () => {
  it('سمة role بيضاء لا تُعدّ صريحة فيُرجع إلى تعيين الوسم', () => {
    // `role="  "` ليست دورًا كتبه المؤلِّف — والوسم نفسه ما زال يحمل دوره الضمني.
    expect(readRole(html('<button role="  ">x</button>'))).toEqual({
      role: 'button',
      source: 'html-aam',
    })
  })

  it('الفراغات حول القائمة لا تُنتج دورًا فارغًا', () => {
    expect(readRole(html('<div role="  tab   tabpanel ">x</div>'))).toEqual({
      role: 'tab',
      source: 'aria-attribute',
    })
  })

  it('area كـa: رابط بـhref ولا دور بدونه', () => {
    document.body.innerHTML = '<map><area href="#"><area></map>'
    const [linked, bare] = Array.from(document.querySelectorAll('area'))
    expect(readRole(linked!)).toEqual({ role: 'link', source: 'html-aam' })
    expect(readRole(bare!)).toEqual({ role: null, source: 'unknown' })
  })

  it('نوع input يُقرأ بلا اعتبار لحالة الأحرف', () => {
    expect(readRole(html('<input type="CHECKBOX">')).role).toBe('checkbox')
  })

  it.each([
    ['button', 'button'],
    ['submit', 'button'],
    ['reset', 'button'],
    ['radio', 'radio'],
    ['number', 'spinbutton'],
    ['search', 'searchbox'],
    ['email', 'textbox'],
    ['tel', 'textbox'],
    ['url', 'textbox'],
  ])('‏<input type="%s"> ⇒ %s', (type, role) => {
    expect(readRole(html(`<input type="${type}">`))).toEqual({ role, source: 'html-aam' })
  })

  it.each(['file', 'date', 'hidden', 'password', 'color'])(
    '‏<input type="%s"> لا يُخترَع له دور',
    (type) => {
      // `password` مثلًا بلا دور في HTML-AAM — تعيينه textbox ادّعاءٌ لا تسنده المواصفة.
      expect(readRole(html(`<input type="${type}">`))).toEqual({ role: null, source: 'unknown' })
    },
  )

  it('section باسم من aria-labelledby أيضًا region', () => {
    expect(readRole(html('<section aria-labelledby="h"></section>')).role).toBe('region')
  })

  it.each([
    ['<header></header>', 'banner'],
    ['<footer></footer>', 'contentinfo'],
    ['<aside></aside>', 'complementary'],
    ['<form></form>', 'form'],
    ['<table></table>', 'table'],
    ['<ol></ol>', 'list'],
    ['<li></li>', 'listitem'],
    ['<select></select>', 'combobox'],
    ['<textarea></textarea>', 'textbox'],
    ['<progress></progress>', 'progressbar'],
    ['<hr>', 'separator'],
    ['<article></article>', 'article'],
    ['<figure></figure>', 'figure'],
    ['<fieldset></fieldset>', 'group'],
    ['<output></output>', 'status'],
    ['<summary>x</summary>', 'button'],
    ['<h1>x</h1>', 'heading'],
    ['<h6>x</h6>', 'heading'],
  ])('%s ⇒ %s ضمنيًّا', (markup, role) => {
    expect(readRole(html(markup))).toEqual({ role, source: 'html-aam' })
  })
})

describe('readAccessibleName — التراجع بين المصادر', () => {
  it('aria-label أبيض لا يُعدّ اسمًا فيُقرأ المحتوى', () => {
    expect(readAccessibleName(html('<button aria-label="   ">احفظ</button>'))).toEqual({
      name: 'احفظ',
      source: 'text-content',
    })
  })

  it('aria-labelledby يشير إلى معرّف غائب فيتراجع إلى title', () => {
    // مرجع مكسور لا يمنع الاسم من مصدر تالٍ، ولا يُنتج اسمًا فارغًا.
    const el = html('<button aria-labelledby="ghost" title="تلميح">x</button>')
    expect(readAccessibleName(el)).toEqual({ name: 'تلميح', source: 'title' })
  })

  it('aria-labelledby مكسور بلا بديل يتراجع إلى المحتوى النصّي', () => {
    const el = html('<button aria-labelledby="ghost">احفظ</button>')
    expect(readAccessibleName(el)).toEqual({ name: 'احفظ', source: 'text-content' })
  })

  it('المرجع الفارغ النصّ يُتخطّى ويبقى الباقي', () => {
    document.body.innerHTML =
      '<span id="a">حفظ</span><span id="blank">  </span><span id="c"></span>' +
      '<button aria-labelledby="a blank ghost c">x</button>'
    expect(readAccessibleName(document.querySelector('button')!)).toEqual({
      name: 'حفظ',
      source: 'aria-labelledby',
    })
  })

  it('كل المراجع فارغة فلا اسم من aria-labelledby', () => {
    document.body.innerHTML = '<span id="a">  </span><div aria-labelledby="a"></div>'
    expect(readAccessibleName(document.querySelector('div')!)).toEqual({
      name: null,
      source: 'unknown',
    })
  })

  it('img بلا alt ليست img بـalt فارغ — لا اسم ولا ادّعاء زخرفة', () => {
    // غياب `alt` خطأ إتاحة يُعلَن مجهولًا، أما `alt=""` فقرار مؤلِّف يُقرأ اسمًا فارغًا.
    expect(readAccessibleName(html('<img>'))).toEqual({ name: null, source: 'unknown' })
    expect(readAccessibleName(html('<img title="شعار">'))).toEqual({
      name: 'شعار',
      source: 'title',
    })
  })

  it('حقل بلا label ولا title بلا اسم', () => {
    expect(readAccessibleName(html('<input id="solo">'))).toEqual({
      name: null,
      source: 'unknown',
    })
  })

  it('حقل بلا label يأخذ title ملاذًا', () => {
    expect(readAccessibleName(html('<input id="solo" title="البريد">'))).toEqual({
      name: 'البريد',
      source: 'title',
    })
  })

  it('label بالمعرّف `for` يعطي الاسم', () => {
    document.body.innerHTML = '<label for="e">البريد</label><input id="e">'
    expect(readAccessibleName(document.getElementById('e')!)).toEqual({
      name: 'البريد',
      source: 'label-element',
    })
  })

  it('عدّة تسميات تُجمَع بفراغ وتُطوى فراغاتها', () => {
    document.body.innerHTML =
      '<label for="e">الاسم\n   الأوّل</label><label for="e">مطلوب</label><input id="e">'
    expect(readAccessibleName(document.getElementById('e')!)).toEqual({
      name: 'الاسم الأوّل مطلوب',
      source: 'label-element',
    })
  })

  it('label فارغة النصّ لا تُنتج اسمًا فيُقرأ title بعدها', () => {
    document.body.innerHTML = '<label for="e"> </label><input id="e" title="بديل">'
    expect(readAccessibleName(document.getElementById('e')!)).toEqual({
      name: 'بديل',
      source: 'title',
    })
  })

  it('label ملفوفة حول عنصر غير مدعوم بـlabels تُقرأ أيضًا', () => {
    // `progress` قابل للتسمية بحسب HTML، وبعض البيئات لا تُرجع له `labels` — فالتراجع إلى الأب `label` ضروري.
    document.body.innerHTML = '<label>التقدّم <progress></progress></label>'
    expect(readAccessibleName(document.querySelector('progress')!)).toEqual({
      name: 'التقدّم',
      source: 'label-element',
    })
  })

  it('عنصر قابل للتسمية داخل label فارغة لا يأخذ اسمًا', () => {
    document.body.innerHTML = '<label>  <progress></progress></label>'
    expect(readAccessibleName(document.querySelector('progress')!)).toEqual({
      name: null,
      source: 'unknown',
    })
  })

  it('title الأبيض لا يُعدّ اسمًا', () => {
    expect(readAccessibleName(html('<div title="   "></div>'))).toEqual({
      name: null,
      source: 'unknown',
    })
  })

  it('زرّ بلا نصّ ولا سمة بلا اسم', () => {
    expect(readAccessibleName(html('<button></button>'))).toEqual({
      name: null,
      source: 'unknown',
    })
    expect(readAccessibleName(html('<button>   \n  </button>'))).toEqual({
      name: null,
      source: 'unknown',
    })
  })

  it('title يتقدّم على المحتوى النصّي للزرّ', () => {
    // ترتيب `accname`: title قبل المحتوى في هذا التقريب — فالمحتوى لا يسبقه.
    expect(readAccessibleName(html('<button title="حفظ">أرسل</button>'))).toEqual({
      name: 'حفظ',
      source: 'title',
    })
  })

  it.each(['<a href="#">رابط</a>', '<h3>رابط</h3>', '<summary>رابط</summary>'])(
    '‏%s يأخذ اسمه من محتواه',
    (markup) => {
      expect(readAccessibleName(html(markup))).toEqual({ name: 'رابط', source: 'text-content' })
    },
  )

  it.each([
    ['<table><tbody><tr><td>خلية</td></tr></tbody></table>', 'td'],
    ['<table><thead><tr><th>عمود</th></tr></thead></table>', 'th'],
    ['<select><option>خيار</option></select>', 'option'],
    ['<fieldset><legend>مجموعة</legend></fieldset>', 'legend'],
  ])('‏%s: %s يأخذ اسمه من محتواه', (markup, tag) => {
    document.body.innerHTML = markup
    const el = document.querySelector(tag)!
    expect(readAccessibleName(el).source).toBe('text-content')
    expect(readAccessibleName(el).name).toBe(el.textContent)
  })
})
