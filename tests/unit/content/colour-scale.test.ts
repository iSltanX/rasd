/**
 * أداة «توليد درجات اللون» — الوصل بين لونٍ مثبَّت وسلّم `generateScale`.
 *
 * حساب محض بلا شبكة، فما يُحرَس هنا هو **الاختزال إلى ما تعرضه `ScalePanel`**:
 * تصفية العرض (9/11)، وثبات الدرجات الأربع في الجدول، وتطابق تنسيق OKLCH
 * والتباين مع الدوالّ المصدر — لا صحّة `generateScale`/`contrastRatio`
 * نفسيهما (مُختبَرتان في وحدتيهما).
 */
import { describe, expect, it } from 'vitest'

import { createColourScale } from '@/content/tools/colour-scale'
import { formatRatio, contrastRatio } from '@/modules/colour/contrast'
import { formatColour, readColour } from '@/modules/colour/formats'

const BASE = readColour('#2b7fff')!

describe('createColourScale — الفتح والحساب', () => {
  it('يحسب 11 درجة عند الفتح، ويحفظ اللون الأساس', () => {
    const tool = createColourScale()
    tool.open(BASE)

    expect(tool.state.open.value).toBe(true)
    expect(tool.state.base.value).toBe(BASE)
    expect(tool.state.stops.value).toHaveLength(11)
    tool.dispose()
  })

  it('السلّم يبدأ من 50 وينتهي عند 950، بالترتيب', () => {
    const tool = createColourScale()
    tool.open(BASE)

    const steps = tool.state.stops.value.map((s) => s.step)
    expect(steps[0]).toBe(50)
    expect(steps.at(-1)).toBe(950)
    expect(steps).toEqual([...steps].sort((a, b) => a - b))
    tool.dispose()
  })

  it('الإغلاق يخفي اللوحة بلا مسح السلّم المحسوب', () => {
    const tool = createColourScale()
    tool.open(BASE)
    tool.close()

    expect(tool.state.open.value).toBe(false)
    expect(tool.state.stops.value).toHaveLength(11)
    tool.dispose()
  })
})

describe('createColourScale — عدد الدرجات المعروضة (9/11)', () => {
  it('11 تُعيد الشريط كاملًا', () => {
    const tool = createColourScale()
    tool.open(BASE)

    expect(tool.stripStops()).toHaveLength(11)
    tool.dispose()
  })

  /*
   * `generateScale` تُرجع 11 درجة دومًا — «9» مرشِّح عرض فوق نفس السلّم لا
   * حسابًا موازيًا. انظر ترويسة `colour-scale.ts`.
   */
  it('9 تُسقِط الطرفين 50 و950 فقط — لا حساب ثانٍ', () => {
    const tool = createColourScale()
    tool.open(BASE)
    tool.setSteps(9)

    const strip = tool.stripStops()
    expect(strip).toHaveLength(9)
    expect(strip.map((s) => s.step)).not.toContain(50)
    expect(strip.map((s) => s.step)).not.toContain(950)
    tool.dispose()
  })

  it('العودة إلى 11 تُعيد الطرفين', () => {
    const tool = createColourScale()
    tool.open(BASE)
    tool.setSteps(9)
    tool.setSteps(11)

    expect(tool.stripStops()).toHaveLength(11)
    tool.dispose()
  })
})

describe('createColourScale — جدول العيّنة الثابت (300/500/700/900)', () => {
  it('يعرض الدرجات الأربع بالضبط، مهما كان `steps`', () => {
    const tool = createColourScale()
    tool.open(BASE)
    tool.setSteps(9) // العيّنة لا تتأثّر بعدد الشريط — انظر `ScalePanel.tsx`.

    const sample = tool.sampleRows()
    expect(sample.map((r) => r.step)).toEqual([300, 500, 700, 900])
    tool.dispose()
  })

  it('كل صفّ يحمل OKLCH منسَّقة وتباينًا على الأبيض من نفس دوالّ `contrast.ts`', () => {
    const tool = createColourScale()
    tool.open(BASE)

    const sample = tool.sampleRows()
    for (const row of sample) {
      const reading = readColour(row.hex)!
      expect(row.oklch).toBe(formatColour(reading).oklch)
      expect(row.contrastRatio).toBe(
        formatRatio(contrastRatio(reading.rgb, { r: 255, g: 255, b: 255 })),
      )
    }
    tool.dispose()
  })

  it('التباين يتزايد مع الدرجة — أغمق يعني تباينًا أعلى على الأبيض', () => {
    const tool = createColourScale()
    tool.open(BASE)

    const ratios = tool.sampleRows().map((r) => Number(r.contrastRatio.split(' : ')[0]))
    expect(ratios[0]).toBeLessThan(ratios[3]!)
    tool.dispose()
  })
})

describe('createColourScale — فتحٌ ثانٍ بلونٍ آخر', () => {
  it('يستبدل السلّم كاملًا — لا يدمج مع السابق', () => {
    const tool = createColourScale()
    tool.open(BASE)
    const firstHexes = tool.state.stops.value.map((s) => s.hex)

    tool.open(readColour('#e7000b')!)
    const secondHexes = tool.state.stops.value.map((s) => s.hex)

    expect(tool.state.stops.value).toHaveLength(11)
    expect(secondHexes).not.toEqual(firstHexes)
    tool.dispose()
  })
})
