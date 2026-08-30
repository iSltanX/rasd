/**
 * ترتيب الطبقات وحسم التتالي — بالحالات المقيسة في Chrome.
 *
 * الحالتان الحاسمتان هنا خالفتا الحدس عند القياس: الطبقة المتداخلة يسبقها
 * محتوى أبيها، و`!important` يعكس مقارنة الطبقات. وكلتاهما تُنتج جوابًا
 * خاطئًا في كل صفحة حديثة إن أُغفلت.
 */
import { describe, expect, it } from 'vitest'

import {
  beats,
  compareLayer,
  LayerOrder,
  winner,
  type Candidate,
} from '@/modules/computed-style/layer-order'

import type { Specificity } from '@/modules/computed-style/specificity'

const SPEC: Specificity = [0, 1, 0]

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  important: false,
  inline: false,
  layer: null,
  spec: SPEC,
  order: 0,
  ...over,
})

describe('LayerOrder — شجرة لا قائمة', () => {
  it('محتوى الطبقة يقع بعد طبقاتها الفرعية', () => {
    /*
     * الحالة المقيسة:
     *   @layer outer { @layer inner { .N {…} } }
     *   @layer outer { .N {…} }
     * الفائز `outer`. والقائمة المسطّحة [outer, inner] تعطي `inner` — خطأ.
     */
    const order = new LayerOrder()
    order.register('outer')
    order.register('outer.inner')

    const outer = order.key('outer')
    const inner = order.key('outer.inner')

    expect(compareLayer(outer, inner)).toBeGreaterThan(0)
  })

  it('الترتيب بأوّل ذكر', () => {
    const order = new LayerOrder()
    order.register('a')
    order.register('b')
    expect(compareLayer(order.key('b'), order.key('a'))).toBeGreaterThan(0)
  })

  it('إعادة التسجيل لا تغيّر الترتيب', () => {
    const order = new LayerOrder()
    order.register('a')
    order.register('b')
    const before = order.key('a')
    order.register('a')
    expect(order.key('a')).toEqual(before)
  })

  it('طبقتان بالاسم نفسه تحت أبوين مختلفين ليستا واحدة', () => {
    const order = new LayerOrder()
    order.register('x.inner')
    order.register('y.inner')
    expect(compareLayer(order.key('y.inner'), order.key('x.inner'))).toBeGreaterThan(0)
  })

  it('التسجيل يشمل الآباء ضمنًا', () => {
    const order = new LayerOrder()
    order.register('a.b.c')
    expect(order.key('a')).not.toBeNull()
    expect(order.key('a.b')).not.toBeNull()
  })

  it('المسار الفارغ يعني «خارج الطبقات»', () => {
    expect(new LayerOrder().key('')).toBeNull()
  })
})

describe('compareLayer', () => {
  it('خارج الطبقات يغلب أي طبقة', () => {
    const order = new LayerOrder()
    order.register('a')
    expect(compareLayer(null, order.key('a'))).toBeGreaterThan(0)
    expect(compareLayer(order.key('a'), null)).toBeLessThan(0)
  })

  it('لا فرق بين معدومين', () => {
    expect(compareLayer(null, null)).toBe(0)
  })

  it('المسار الأعمق يسبق أباه', () => {
    const order = new LayerOrder()
    order.register('p.q')
    expect(compareLayer(order.key('p'), order.key('p.q'))).toBeGreaterThan(0)
  })
})

describe('beats — ترتيب الحسم', () => {
  it('الأهمّية تتقدّم على كل شيء', () => {
    expect(beats(cand({ important: true, spec: [0, 0, 1] }), cand({ spec: [9, 9, 9] }))).toBe(true)
  })

  it('الطبقة تتقدّم على الأولوية', () => {
    const order = new LayerOrder()
    order.register('a')
    order.register('b')
    const inA = cand({ layer: order.key('a'), spec: [9, 9, 9] })
    const inB = cand({ layer: order.key('b'), spec: [0, 0, 1] })
    expect(beats(inB, inA)).toBe(true)
  })

  it('خارج الطبقات يغلب المُطبَّق — عاديًّا', () => {
    const order = new LayerOrder()
    order.register('a')
    expect(beats(cand({ layer: null }), cand({ layer: order.key('a') }))).toBe(true)
  })

  it('و`!important` يعكس ذلك — الحالة المقيسة', () => {
    /*
     * قيس: إعلان مُهمّ **داخل** طبقة غلب إعلانًا مُهمًّا **خارجها**. وهي
     * القاعدة الوحيدة في التتالي التي تنقلب.
     */
    const order = new LayerOrder()
    order.register('a')
    const layered = cand({ important: true, layer: order.key('a') })
    const unlayered = cand({ important: true, layer: null })
    expect(beats(layered, unlayered)).toBe(true)
    expect(beats(unlayered, layered)).toBe(false)
  })

  it('الانعكاس يشمل الطبقات بينها', () => {
    const order = new LayerOrder()
    order.register('a')
    order.register('b')
    const impA = cand({ important: true, layer: order.key('a') })
    const impB = cand({ important: true, layer: order.key('b') })
    // عاديًّا يغلب `b`؛ ومُهمًّا يغلب `a`.
    expect(beats(impA, impB)).toBe(true)
    expect(beats(cand({ layer: order.key('b') }), cand({ layer: order.key('a') }))).toBe(true)
  })

  it('السطري يغلب القاعدة عند تساوي الأهمّية والطبقة', () => {
    expect(beats(cand({ inline: true, spec: [0, 0, 0] }), cand({ spec: [9, 9, 9] }))).toBe(true)
  })

  it('السطري لا يغلب مُهمًّا في قاعدة', () => {
    expect(beats(cand({ inline: true }), cand({ important: true }))).toBe(false)
  })

  it('الأولوية ثم ترتيب المستند', () => {
    expect(beats(cand({ spec: [0, 2, 0] }), cand({ spec: [0, 1, 0] }))).toBe(true)
    expect(beats(cand({ order: 5 }), cand({ order: 4 }))).toBe(true)
    expect(beats(cand({ order: 4 }), cand({ order: 5 }))).toBe(false)
  })

  it('المتطابق تمامًا لا يغلب نفسه', () => {
    expect(beats(cand(), cand())).toBe(false)
  })
})

describe('winner', () => {
  it('يختار الأقوى من مجموعة', () => {
    const order = new LayerOrder()
    order.register('base')
    const list = [
      cand({ order: 1, spec: [0, 0, 1] }),
      cand({ order: 2, layer: order.key('base'), spec: [9, 9, 9] }),
      cand({ order: 3, spec: [0, 1, 0] }),
    ]
    expect(winner(list)).toBe(list[2])
  })

  it('null على قائمة فارغة', () => {
    expect(winner([])).toBeNull()
  })

  it('المُهمّ يفوز مهما تأخّر', () => {
    const list = [cand({ order: 9, spec: [9, 9, 9] }), cand({ order: 0, important: true })]
    expect(winner(list)).toBe(list[1])
  })
})
