import { describe, expect, it } from 'vitest'

import {
  centerOf,
  clampRatioRect,
  clampRect,
  describeRatio,
  drawRect,
  handlePoint,
  isCapturable,
  moveRect,
  resizeRect,
  solveDrag,
} from '@/modules/capture/selection'
import { deviceRect, devicePoint, viewportPoint, viewportRect } from '@/shared/geometry'

/**
 * تعميم هندسة التحديد على الفضاء — اختبار **انحدار** لا ميزة.
 *
 * الملفّ بُني في المرحلة 8 مثبَّتًا على `viewport`، ويُستهلك في المرحلة 15
 * على مستطيلات بفضاء **الجهاز** (الاقتصاص على اللقطة). ونصّ المرحلة يمنع
 * كتابة الهندسة مرّتين.
 *
 * فهذا الملفّ يثبت شيئين معًا:
 *   - أن سلوك `viewport` **لم يتغيّر بحرف** — الأرقام نفسها والنتائج نفسها.
 *   - أن `device` يمرّ ويُرجع فضاءه، لا فضاءً تختاره الدالّة.
 *
 * الاختبارات القائمة في `selection.test.ts` تغطّي الرياضيات نفسها بعمق؛
 * هذه تغطّي **حفظ الوسم**، وهو ما لا يلتقطه اختبار رياضي.
 */

describe('الوسم يُحفَظ لا يُختار', () => {
  it('`centerOf` تُرجع فضاء مدخلها', () => {
    expect(centerOf(viewportRect(0, 0, 10, 10)).space).toBe('viewport')
    expect(centerOf(deviceRect(0, 0, 10, 10)).space).toBe('device')
  })

  it('`handlePoint` كذلك', () => {
    expect(handlePoint(deviceRect(10, 20, 100, 50), 'se').space).toBe('device')
  })

  it('`drawRect` تأخذ فضاءها من المرساة', () => {
    const r = drawRect(devicePoint(10, 10), devicePoint(50, 40))
    expect(r.space).toBe('device')
    expect(r).toEqual(deviceRect(10, 10, 40, 30))
  })

  it('`resizeRect` و`moveRect` و`clampRect` تحفظ الفضاء', () => {
    const base = deviceRect(10, 10, 100, 80)
    expect(resizeRect(base, 'se', devicePoint(60, 50)).space).toBe('device')
    expect(moveRect(base, 5, 5).space).toBe('device')
    expect(clampRect(base, deviceRect(0, 0, 200, 200)).space).toBe('device')
  })

  it('`solveDrag` و`clampRatioRect` تحفظان الفضاء', () => {
    const bounds = deviceRect(0, 0, 500, 500)
    expect(solveDrag(devicePoint(10, 10), devicePoint(200, 200), bounds).space).toBe('device')
    expect(clampRatioRect(deviceRect(0, 0, 400, 300), bounds, 16 / 9).space).toBe('device')
  })
})

/**
 * الرياضيات لا تتغيّر بتغيّر الوسم — وهذا هو معنى «انحدار».
 *
 * كل حالة أدناه تُشغَّل في الفضاءين وتُقارَن نتيجتاهما رقمًا برقم.
 */
describe('السلوك واحد في الفضاءين', () => {
  const cases: { name: string; run: (mk: 'v' | 'd') => unknown }[] = [
    {
      name: 'رسم حرّ',
      run: (k) =>
        k === 'v'
          ? drawRect(viewportPoint(10, 10), viewportPoint(50, 40))
          : drawRect(devicePoint(10, 10), devicePoint(50, 40)),
    },
    {
      name: 'رسم بنسبة مثبَّتة',
      run: (k) =>
        k === 'v'
          ? drawRect(viewportPoint(0, 0), viewportPoint(160, 40), { ratio: 16 / 9 })
          : drawRect(devicePoint(0, 0), devicePoint(160, 40), { ratio: 16 / 9 }),
    },
    {
      name: 'تكبير من مقبض بانقلاب',
      run: (k) =>
        k === 'v'
          ? resizeRect(viewportRect(50, 50, 100, 100), 'nw', viewportPoint(300, 300))
          : resizeRect(deviceRect(50, 50, 100, 100), 'nw', devicePoint(300, 300)),
    },
    {
      name: 'سحب محصور بحدود ضيّقة',
      run: (k) =>
        k === 'v'
          ? solveDrag(viewportPoint(20, 20), viewportPoint(999, 999), viewportRect(0, 0, 100, 100))
          : solveDrag(devicePoint(20, 20), devicePoint(999, 999), deviceRect(0, 0, 100, 100)),
    },
    {
      name: 'حصر مستطيل أكبر من حدوده',
      run: (k) =>
        k === 'v'
          ? clampRect(viewportRect(-50, -50, 400, 400), viewportRect(0, 0, 200, 200))
          : clampRect(deviceRect(-50, -50, 400, 400), deviceRect(0, 0, 200, 200)),
    },
  ]

  for (const c of cases) {
    it(`${c.name} — الأرقام متطابقة`, () => {
      const v = c.run('v') as Record<string, unknown>
      const d = c.run('d') as Record<string, unknown>
      expect({ ...v, space: null }).toEqual({ ...d, space: null })
      expect(v.space).toBe('viewport')
      expect(d.space).toBe('device')
    })
  }

  it('الدوالّ العددية الخالصة لا تتأثّر بالفضاء', () => {
    expect(isCapturable(deviceRect(0, 0, 100, 100))).toBe(
      isCapturable(viewportRect(0, 0, 100, 100)),
    )
    expect(describeRatio(deviceRect(0, 0, 160, 90))).toBe(
      describeRatio(viewportRect(0, 0, 160, 90)),
    )
  })
})
