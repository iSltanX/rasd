/**
 * تحييد الثابت — التصنيف والعلاج، بالأرقام المقيسة.
 *
 * كل رقم هنا من قياس فعلي بعدّ بكسلات لقطات حقيقية، لا من فرضية.
 */
import { describe, expect, it } from 'vitest'

import {
  anchorOf,
  classify,
  isTrapped,
  showsInTile,
  treatmentOf,
  type Anchor,
} from '@/modules/capture/full-page/fixed-elements'

const VH = 713
const VW = 1280

const rect = (top: number, height: number, width = VW): DOMRectReadOnly =>
  new DOMRect(0, top, width, height)

describe('anchorOf — المرساة هندسية لا نمطية', () => {
  it('رأس ملتصق بالأعلى', () => {
    expect(anchorOf(rect(0, 60), VH)).toBe('top')
  })

  it('شريط ملتصق بالأسفل', () => {
    expect(anchorOf(rect(VH - 70, 70), VH)).toBe('bottom')
  })

  it('شريط جانبي يغطّي النافذة كلّها ⇒ ممتدّ', () => {
    expect(anchorOf(rect(0, VH, 250), VH)).toBe('stretch')
  })

  it('دردشة في الوسط ⇒ عائم', () => {
    expect(anchorOf(rect(400, 60, 60), VH)).toBe('float')
  })

  it('يتسامح مع بكسلَي انحراف عن الحافّة', () => {
    expect(anchorOf(rect(2, 60), VH)).toBe('top')
    expect(anchorOf(rect(VH - 62, 60), VH)).toBe('bottom')
  })

  it('عنصر يلامس الحافّتين لكنه ضامر ⇒ ليس ممتدًّا', () => {
    // يمسّ الأعلى ويمتدّ قليلًا — لا يغطّي النافذة فليس شريطًا جانبيًّا.
    expect(anchorOf(rect(0, 100), VH)).toBe('top')
  })
})

describe('showsInTile — البلاطة تُحدَّد بالمرساة لا برقمها', () => {
  const LAST = 12

  it('العلوي في الأولى وحدها', () => {
    expect(showsInTile('top', 0, LAST)).toBe(true)
    expect(showsInTile('top', 1, LAST)).toBe(false)
    expect(showsInTile('top', LAST, LAST)).toBe(false)
  })

  it('السفلي في الأخيرة وحدها — لا في الأولى', () => {
    /*
     * قاعدة الخطّة («اتركها في البلاطة الأولى») تزرع شريطًا سفليًّا في وسط
     * الصفحة: قيس 89,102 بكسل من لافتة كوكيز عند y الصفحة 643–713 في صفحة
     * طولها 10,214px.
     */
    expect(showsInTile('bottom', 0, LAST)).toBe(false)
    expect(showsInTile('bottom', LAST, LAST)).toBe(true)
  })

  it('الممتدّ في كل البلاطات', () => {
    /*
     * إخفاؤه بعد الأولى يفقد 2,139,000 بكسل على 12 من 13 بلاطة — أي 24
     * ضعف العيب الذي جاء التصنيف لإصلاحه.
     */
    for (const i of [0, 5, LAST]) expect(showsInTile('stretch', i, LAST)).toBe(true)
  })

  it('العائم في لا شيء', () => {
    for (const i of [0, 5, LAST]) expect(showsInTile('float', i, LAST)).toBe(false)
  })

  it('صفحة من بلاطة واحدة: العلوي والسفلي كلاهما يظهر', () => {
    expect(showsInTile('top', 0, 0)).toBe(true)
    expect(showsInTile('bottom', 0, 0)).toBe(true)
  })
})

describe('treatmentOf', () => {
  it('اللاصق يُفكّ لصوقه ولا يُخفى أبدًا', () => {
    // قيس: إخفاء اللاصق يكلّف −60px من ارتفاع الصفحة — فهو في التدفّق.
    expect(treatmentOf('sticky', false)).toBe('unstick')
  })

  it('الثابت يُخفى — خارج التدفّق فحذفه لا يزيح شيئًا', () => {
    expect(treatmentOf('fixed', false)).toBe('hide')
  })

  it('المحبوس يُترك مهما كان موضعه', () => {
    expect(treatmentOf('fixed', true)).toBe('leave')
    expect(treatmentOf('sticky', true)).toBe('leave')
  })
})

describe('isTrapped — الكشف تجريبي لا بقائمة خصائص', () => {
  it('عنصر لم يتحرّك مستطيله عبر التمرير ⇒ مثبَّت بالنافذة', () => {
    expect(isTrapped(rect(0, 60), rect(0, 60))).toBe(false)
  })

  it('عنصر تحرّك مع الصفحة ⇒ محبوس بجدّه، لا يُلمَس', () => {
    // جدّ ذو `transform` يجعل نفسه الكتلة الحاوية، فيمرّ الابن مع الصفحة.
    expect(isTrapped(rect(1200, 60), rect(400, 60))).toBe(true)
  })

  it('يتسامح مع انحراف بكسلين', () => {
    expect(isTrapped(rect(0, 60), rect(1.5, 60))).toBe(false)
  })
})

describe('classify — الصورة الكاملة لمرشّح', () => {
  it('رأس لاصق علوي غير محبوس', () => {
    const el = document.createElement('header')
    const c = classify(el, 'sticky', rect(0, 60), VH, VW, false)
    expect(c).toMatchObject({ anchor: 'top', treatment: 'unstick', position: 'sticky' })
    expect(c.share).toBeCloseTo((VW * 60) / (VW * VH), 5)
  })

  it('زرّ دردشة عائم: يُخفى، ونصيبه ضئيل فيُعرَض في القائمة', () => {
    const el = document.createElement('div')
    const c = classify(el, 'fixed', rect(600, 56, 56), VH, VW, false)
    expect(c.anchor).toBe('float')
    expect(c.treatment).toBe('hide')
    expect(c.share).toBeLessThan(0.01)
  })

  it('عنصر محبوس يُترك مهما بدا ثابتًا', () => {
    const el = document.createElement('div')
    expect(classify(el, 'fixed', rect(0, 60), VH, VW, true).treatment).toBe('leave')
  })

  it('نافذة بلا مساحة لا تقسم على صفر', () => {
    const el = document.createElement('div')
    expect(classify(el, 'fixed', rect(0, 0, 0), 0, 0, false).share).toBe(0)
  })
})

describe('التغطية المشتركة: كل مرساة لها علاج وسلوك بلاطة', () => {
  const ANCHORS: Anchor[] = ['top', 'bottom', 'stretch', 'float']

  it('لا مرساة بلا قرار', () => {
    for (const a of ANCHORS) {
      expect(typeof showsInTile(a, 0, 3)).toBe('boolean')
    }
  })
})
