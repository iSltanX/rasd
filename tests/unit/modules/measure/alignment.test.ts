import { describe, expect, it } from 'vitest'

import { ALIGN_TOLERANCE_PX, detectAlignment } from '@/modules/measure/alignment'
import { viewportRect } from '@/shared/geometry'

/**
 * كشف المحاذاة — البند المنصوص: «المحاور الصحيحة» و«انحراف 1–2px».
 */

describe('detectAlignment — تطابق تامّ', () => {
  it('يكتشف المحاور الستّة معًا حين تتطابق كلّها', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(0, 0, 100, 100)
    const matches = detectAlignment(a, b)
    const axes = matches.map((m) => m.axis).sort()
    expect(axes).toEqual(['bottom', 'centerX', 'centerY', 'left', 'right', 'top'].sort())
    expect(matches.every((m) => m.delta === 0)).toBe(true)
  })

  it('محاذاة الحافّة اليسرى وحدها — بلا زيف محاور أخرى', () => {
    const a = viewportRect(40, 0, 100, 50)
    const b = viewportRect(40, 300, 30, 30) // نفس x، بعيد رأسيًّا كليًّا
    const matches = detectAlignment(a, b)
    expect(matches).toHaveLength(1)
    expect(matches[0]?.axis).toBe('left')
    expect(matches[0]?.delta).toBe(0)
  })

  it('محاذاة المركز الرأسي بين عنصرين بارتفاعين مختلفين', () => {
    const a = viewportRect(0, 0, 40, 100) // centerY = 50
    const b = viewportRect(200, 30, 40, 40) // centerY = 50
    const matches = detectAlignment(a, b)
    expect(matches.some((m) => m.axis === 'centerY' && m.delta === 0)).toBe(true)
  })
})

describe('detectAlignment — انحراف قريب يُكتشَف ويُقاس', () => {
  it('انحراف 1px عن المحاذاة يُبلَّغ لا يُسقَط', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(1, 300, 30, 30)
    const matches = detectAlignment(a, b)
    const left = matches.find((m) => m.axis === 'left')
    expect(left?.delta).toBe(1)
  })

  it(`انحراف يساوي الحدّ الأقصى (${ALIGN_TOLERANCE_PX}px) لا يزال يُبلَّغ`, () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(ALIGN_TOLERANCE_PX, 300, 30, 30)
    const matches = detectAlignment(a, b)
    expect(matches.some((m) => m.axis === 'left')).toBe(true)
  })

  it('انحراف يتجاوز الحدّ الأقصى بمقدار واحد لا يُبلَّغ أصلًا', () => {
    const a = viewportRect(0, 0, 100, 100)
    const b = viewportRect(ALIGN_TOLERANCE_PX + 1, 300, 30, 30)
    const matches = detectAlignment(a, b)
    expect(matches.some((m) => m.axis === 'left')).toBe(false)
  })

  it('إشارة الانحراف تحمل الاتّجاه: b - a', () => {
    const a = viewportRect(10, 0, 100, 100)
    const b = viewportRect(9, 300, 30, 30) // (ب) أيسر (أ) بـ1px
    const left = detectAlignment(a, b).find((m) => m.axis === 'left')
    expect(left?.delta).toBe(-1)
  })
})

describe('detectAlignment — لا خلط بين الأبعاد', () => {
  it('تطابق رقمي بين إحداثية أفقية ورأسية لا يُعدّ محاذاة', () => {
    const a = viewportRect(50, 999, 20, 20) // left = 50
    const b = viewportRect(999, 50, 20, 20) // top = 50 — يطابق left(أ) رقميًّا لا هندسيًّا
    const matches = detectAlignment(a, b)
    expect(matches.some((m) => m.axis === 'left')).toBe(false)
    expect(matches.some((m) => m.axis === 'top')).toBe(false)
  })

  it('لا محاذاة إطلاقًا حين تتباعد كل المحاور', () => {
    const a = viewportRect(0, 0, 10, 10)
    const b = viewportRect(500, 500, 10, 10)
    expect(detectAlignment(a, b)).toEqual([])
  })
})
