/**
 * أداة «لوحة الصفحة» — سلكُ `palette/extract` والتصنيف الحيّ.
 *
 * `send` مُحقَنة (دمية بلا شبكة حقيقية): ما يُحرَس هنا هو **الوصل** —
 * الطلب المُرسَل، وترجمة الردّ، والتزامن بين استخراج وتصنيف، وحارس الجيل
 * الذي يمنع نتيجة قديمة من الكتابة فوق نتيجة أحدث — لا صحّة `palette/extract`
 * نفسها (ذاك اختبار الخلفية) ولا صحّة `classifyPaletteSources` (مُختبَرة
 * في `sources.test.ts`).
 */
import { describe, expect, it, vi } from 'vitest'

import { createColourPalette } from '@/content/tools/colour-palette'
import { err, errText, ok } from '@/shared/result'

import type { send as realSend } from '@/shared/messaging'
import type { PaletteExtraction } from '@/shared/messaging/contract'

const EXTRACTION: PaletteExtraction = {
  swatches: [
    { hex: '#7c3aed', share: 0.6, count: 600, neutral: false },
    { hex: '#f7f8fb', share: 0.4, count: 400, neutral: true },
  ],
  countedPixels: 1000,
  droppedNeutrals: 2,
}

function page(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

describe('createColourPalette — الاستخراج', () => {
  it('يطلب استخراجًا من الظاهر عند الفتح، ويعرض الردّ', async () => {
    const send = vi.fn().mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send })

    tool.open()
    expect(tool.state.extracting.value).toBe(true)
    await vi.waitFor(() => expect(tool.state.extracting.value).toBe(false))

    expect(send).toHaveBeenCalledWith('palette/extract', {
      source: { kind: 'viewport', rect: null },
      count: 8,
      dropNeutrals: false,
    })
    expect(tool.state.swatches.value).toHaveLength(2)
    expect(tool.state.swatches.value[0]?.hex).toBe('#7c3aed')
    // بلا تصنيف افتراضًا — `source` تصل `null` لكل مدخل.
    expect(tool.state.swatches.value[0]?.source).toBeNull()
    expect(tool.state.droppedNeutrals.value).toBe(2)
    tool.dispose()
  })

  it('يمرّر عدد الألوان وإخفاء الحياديات كما ضُبطا', async () => {
    const send = vi.fn().mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send })

    tool.setCount(12)
    tool.setHideNeutrals(true)
    await vi.waitFor(() => expect(tool.state.extracting.value).toBe(false))

    expect(send).toHaveBeenLastCalledWith('palette/extract', {
      source: { kind: 'viewport', rect: null },
      count: 12,
      dropNeutrals: true,
    })
    tool.dispose()
  })

  it('فشل الرسالة يُعلَن رسالةً لا يُبتلع صامتًا', async () => {
    const send = vi.fn().mockResolvedValue(err(errText('handler-failed', 'تعذّر الالتقاط.').error))
    const tool = createColourPalette({ send })

    tool.open()
    await vi.waitFor(() => expect(tool.state.extracting.value).toBe(false))

    expect(tool.state.unavailable.value).toContain('تعذّر الالتقاط')
    expect(tool.state.swatches.value).toHaveLength(0)
    tool.dispose()
  })

  /*
   * طلبٌ ثانٍ يبدأ قبل أن يعود الأوّل: نتيجة الأوّل يجب أن **تُهمَل** —
   * نفس حارس الجيل في `colour-usage.ts`، وللعلّة نفسها: كذبٌ صامت لا خطأ يُرى.
   */
  it('طلبٌ أُجهض بطلب لاحق لا يكتب فوق خلَفه', async () => {
    type SendResult = Awaited<ReturnType<typeof realSend>>
    let resolveFirst: (v: SendResult) => void = () => undefined
    const firstCall = new Promise<SendResult>((resolve) => {
      resolveFirst = resolve
    })
    const send = vi
      .fn()
      .mockImplementationOnce(() => firstCall)
      .mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send })

    tool.open() // الطلب الأوّل — معلَّق
    tool.setCount(12) // الطلب الثاني — يصل ويحسم قبل الأوّل، سيناريو واقعي على الشبكة.
    await vi.waitFor(() => expect(tool.state.extracting.value).toBe(false))

    // ثمّ يصل ردّ الطلب الأوّل متأخّرًا — يجب ألّا يكتب فوق نتيجة الثاني.
    resolveFirst(ok({ ...EXTRACTION, droppedNeutrals: 99 }))
    await new Promise((r) => setTimeout(r, 0))

    expect(tool.state.droppedNeutrals.value).not.toBe(99)
    tool.dispose()
  })
})

describe('createColourPalette — المصادر غير المسلوكة (element/region)', () => {
  it('لا تُرسل رسالة، وتُعلن سببًا صادقًا بدل شبكة فارغة', () => {
    const send = vi.fn().mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send })

    tool.setSource('element')
    expect(send).not.toHaveBeenCalled()
    expect(tool.state.unavailable.value).toContain('عنصر')
    expect(tool.state.swatches.value).toHaveLength(0)

    tool.setSource('region')
    expect(tool.state.unavailable.value).toContain('منطقة')
    tool.dispose()
  })

  it('العودة إلى مصدر مسلوك تمسح السبب وتستخرج فعليًّا', async () => {
    const send = vi.fn().mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send })

    tool.setSource('element')
    tool.setSource('viewport')
    await vi.waitFor(() => expect(tool.state.extracting.value).toBe(false))

    expect(tool.state.unavailable.value).toBeNull()
    expect(tool.state.swatches.value).toHaveLength(2)
    tool.dispose()
  })
})

describe('createColourPalette — التصنيف (افصل ألوان الواجهة عن الصور)', () => {
  it('يجمع الألوان المصرَّحة ويصنّف كل مدخل حين يُفعَّل', async () => {
    const root = page('<div style="background-color: #7c3aed">س</div>')
    const send = vi.fn().mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send, doc: document })

    tool.open()
    await vi.waitFor(() => expect(tool.state.extracting.value).toBe(false))
    tool.setSeparateSources(true)
    await vi.waitFor(() => expect(tool.state.swatches.value[0]?.source).not.toBeNull())

    expect(tool.state.swatches.value[0]?.source).toBe('background')
    // لا استخراج ثانٍ — التصنيف يعيد الحساب على المستخرَج بالفعل فقط.
    expect(send).toHaveBeenCalledTimes(1)
    tool.dispose()
    root.remove()
  })

  it('إطفاء التصنيف يعيد `source` إلى `null` بلا استخراج ثانٍ', async () => {
    const root = page('<div style="background-color: #7c3aed">س</div>')
    const send = vi.fn().mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send, doc: document })

    tool.open()
    await vi.waitFor(() => expect(tool.state.extracting.value).toBe(false))
    tool.setSeparateSources(true)
    await vi.waitFor(() => expect(tool.state.swatches.value[0]?.source).not.toBeNull())
    tool.setSeparateSources(false)
    await vi.waitFor(() => expect(tool.state.swatches.value[0]?.source).toBeNull())

    expect(send).toHaveBeenCalledTimes(1)
    tool.dispose()
    root.remove()
  })
})

describe('createColourPalette — `readMethod`', () => {
  it('تُخزَّن وتُبلَّغ لكن الاستخراج يسلك `pixel` دومًا — انظر ترويسة `colour-palette.ts`', () => {
    const send = vi.fn().mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send })

    tool.setReadMethod('css')
    expect(tool.state.readMethod.value).toBe('css')
    expect(send).not.toHaveBeenCalled() // تخزينٌ فقط — لا استخراج تلقائي عند تغيّرها وحدها.
    tool.dispose()
  })
})

describe('createColourPalette — الإغلاق والتخلّص', () => {
  it('`close` تُلغي جمع الألوان المصرَّحة الجاري', async () => {
    const root = page('<div style="background-color: #7c3aed">س</div>')
    const send = vi.fn().mockResolvedValue(ok(EXTRACTION))
    const tool = createColourPalette({ send, doc: document })

    tool.open()
    await vi.waitFor(() => expect(tool.state.extracting.value).toBe(false))
    tool.setSeparateSources(true)
    tool.close() // يقاطع التصنيف الجاري

    expect(tool.state.open.value).toBe(false)
    tool.dispose()
    root.remove()
  })
})
