import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { MATRICES, cartesian, combinationCount } from '@/ui/components/matrices'
import { rendererFor } from '@/ui/components/registry'

/**
 * اختبار العرض الشامل — الإثبات الفعلي لأن `matrices.ts` مطابق لـFigma
 * ولأن كل مكوّن يعرض كل variant بلا خطأ تشغيل.
 *
 * `matrices.ts` (محاور كل مجموعة) و`registry.tsx` (دالّة العرض) مصدر واحد
 * يستهلكه طرفان: صفحة المعرض تعرض نفس حاصل الضرب الديكارتي الذي يُشغَّل هنا.
 * لا انحراف ممكن بين ما يُعرض للمستخدم وما يختبره CI.
 */

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

describe('MATRICES — عدد التركيبات يطابق Figma', () => {
  for (const matrix of MATRICES) {
    it(`${matrix.name}: حاصل الضرب الديكارتي = ${matrix.figmaCount}`, () => {
      expect(combinationCount(matrix.axes)).toBe(matrix.figmaCount)
      expect(cartesian(matrix.axes)).toHaveLength(matrix.figmaCount)
    })
  }

  it('الإجمالي عبر كل المجموعات كما في صفحة 12 — Components', () => {
    // 249 قبل `STAGES/02`، ثمّ +6 لدرجات الرقاقة الثلاث، و+49 للمجموعات التسع الجديدة،
    // و+2 للمكوّنين المفردين `Section Nav` و`App Sidebar`.
    const total = MATRICES.reduce((sum, m) => sum + m.figmaCount, 0)
    expect(total).toBe(306)
  })
})

describe('RENDERERS — كل variant يعرض بلا رمي', () => {
  for (const matrix of MATRICES) {
    describe(matrix.name, () => {
      const renderFn = rendererFor(matrix)
      const combos = cartesian(matrix.axes)

      for (const combo of combos) {
        const label = Object.entries(combo)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')

        it(label, () => {
          container = document.createElement('div')
          document.body.appendChild(container)

          expect(() => {
            render(renderFn(combo), container as HTMLElement)
          }).not.toThrow()

          // لا حدود خطأ (ErrorBoundary) التقطت رميًا داخليًا صامتًا.
          expect(container?.querySelector('[data-render-error]')).toBeNull()
          // كل تركيبة تنتج DOM فعليًا، لا عرضًا فارغًا صامتًا.
          expect(container?.childNodes.length).toBeGreaterThan(0)
        })
      }
    })
  }
})
