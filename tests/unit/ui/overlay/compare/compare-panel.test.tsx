import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CompareIdle, ComparePanel, type ComparePanelProps } from '@/ui/overlay'

import type { LiveDiff } from '@/shared/messaging/contract'

let host: HTMLDivElement | null = null

function mount(ui: preact.ComponentChild): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  render(ui, host)
  return host
}

afterEach(() => {
  if (host) {
    render(null, host)
    host.remove()
    host = null
  }
})

function panelProps(overrides: Partial<ComparePanelProps> = {}): ComparePanelProps {
  return {
    displayMode: 'split',
    opacity: 52,
    splitPosition: 43,
    viewportLabel: 'سطح مكتب 1440',
    onSetDisplayMode: vi.fn(),
    onOpacityChange: vi.fn(),
    onSplitPositionChange: vi.fn(),
    ...overrides,
  }
}

describe('ComparePanel — يُصيَّر بلا رمي', () => {
  it('يرسم العنوان وأربعة تبويبات ومنزلقين وصفّ المقاس وزرّ التبديل', () => {
    const el = mount(<ComparePanel {...panelProps()} />)
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(4)
    expect(el.querySelectorAll('input[type="range"]')).toHaveLength(2)
    expect(el.textContent).toContain('سطح مكتب 1440')
  })

  it('التبويب المطابق لـdisplayMode محدَّد وحده', () => {
    const el = mount(<ComparePanel {...panelProps({ displayMode: 'blend' })} />)
    const selected = [...el.querySelectorAll('[role="tab"]')].filter(
      (t) => t.getAttribute('aria-selected') === 'true',
    )
    expect(selected).toHaveLength(1)
    expect(selected[0]?.textContent).toBe('تراكب')
  })

  it('النقر على تبويب يستدعي onSetDisplayMode بالوضع الصحيح', () => {
    const onSetDisplayMode = vi.fn()
    const el = mount(<ComparePanel {...panelProps({ onSetDisplayMode })} />)
    const blink = [...el.querySelectorAll('[role="tab"]')].find((t) => t.textContent === 'وميض')
    ;(blink as HTMLButtonElement).click()
    expect(onSetDisplayMode).toHaveBeenCalledWith('blink')
  })

  it('منزلق موضع الفاصل معطَّل خارج وضع split', () => {
    const el = mount(<ComparePanel {...panelProps({ displayMode: 'opacity' })} />)
    const splitSlider = el.querySelector('[aria-label="موضع الفاصل"]') as HTMLInputElement
    expect(splitSlider.disabled).toBe(true)
  })

  it('منزلق موضع الفاصل مفعَّل في وضع split', () => {
    const el = mount(<ComparePanel {...panelProps({ displayMode: 'split' })} />)
    const splitSlider = el.querySelector('[aria-label="موضع الفاصل"]') as HTMLInputElement
    expect(splitSlider.disabled).toBe(false)
  })

  // كانت `formatHuman` (أرقام هندية) — الاسم الحالي يصف القرار المصحَّح
  // لا الأصلي: كل عدّاد مئوي آخر في المستودع (`Capturing`/`QuotaIndicator`/
  // `ExportProgress`) يمرّ من `formatPercent` (أرقام غربية)، وكانت هذه
  // اللوحة الاستثناء الوحيد بلا سبب مسجَّل — وCSS نفسه (`direction: ltr`
  // + `unicode-bidi: isolate` + خطّ أحادي المسافة في `.rasd-ov-cmp-slider-value`)
  // يفترض قياسًا تقنيًّا أصلًا لا عدًّا بشريًّا. صُحِّح بالمراجعة، §6 صفّ 87.
  it('العدّاد المئوي غربيّ — قياسٌ تقني كبقيّة عدّادات المستودع', () => {
    const el = mount(<ComparePanel {...panelProps({ opacity: 52 })} />)
    expect(el.textContent).toContain('52%')
  })

  it('زرّ الإغلاق يستدعي onClose', () => {
    const onClose = vi.fn()
    const el = mount(<ComparePanel {...panelProps({ onClose })} />)
    ;(el.querySelector('[aria-label="إغلاق"]') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalled()
  })

  it('زرّ التبديل يستدعي onSwap إن وُجد، ولا يرمي إن غاب', () => {
    const onSwap = vi.fn()
    const el = mount(<ComparePanel {...panelProps({ onSwap })} />)
    ;(el.querySelector('[data-rasd-ov="compare-panel"] footer button') as HTMLButtonElement).click()
    expect(onSwap).toHaveBeenCalled()

    expect(() => {
      const noSwap = mount(<ComparePanel {...panelProps()} />)
      ;(noSwap.querySelector('footer button') as HTMLButtonElement).click()
    }).not.toThrow()
  })
})

/**
 * ── قسم «فرق البكسلات» — سدادُ دَيْن المرحلة 16 على 17 ──────────────
 *
 * كان القسم مُستبعَدًا من المكوّن لغياب محرّك `pixelmatch`؛ صار له محرّك
 * في `background/compare-diff-service.ts` يصل عبر `compare/diff`.
 */
function liveDiff(overrides: Partial<LiveDiff> = {}): LiveDiff {
  return {
    diffRatio: 0.048,
    regionCount: 3,
    comparedPixels: 1_296_000,
    overlapWidth: 1440,
    overlapHeight: 900,
    sizeMismatch: false,
    excludedPixels: 0,
    excludedZones: 0,
    ...overrides,
  }
}

describe('ComparePanel — فرق البكسلات', () => {
  it('لا قسم ولا زرّ بلا onCaptureDiff ولا نتيجة — سابقة المرحلة 7', () => {
    const el = mount(<ComparePanel {...panelProps()} />)
    expect(el.querySelector('[data-rasd-ov="compare-diff"]')).toBeNull()
    expect(el.textContent).not.toContain('التقط الفرق')
  })

  it('قبل أوّل قياس تُعرَض «—» لا صفرٌ كاذب', () => {
    const el = mount(<ComparePanel {...panelProps({ onCaptureDiff: vi.fn() })} />)
    const section = el.querySelector('[data-rasd-ov="compare-diff"]')
    expect(section).toBeTruthy()
    expect(section?.querySelector('.rasd-ov-cmp-diff-value')?.textContent).toBe('—')
    expect(section?.querySelector('.rasd-ov-cmp-diff-count')?.textContent).toBe('—')
    expect(section?.textContent).not.toContain('0%')
  })

  /** §3.5: النسبة قياسٌ تقني (غربي)، وعدّ العناصر عدٌّ بشري (هندي). */
  it('بعد القياس: النسبة بأرقام غربية والعدد بأرقام هندية', () => {
    const el = mount(<ComparePanel {...panelProps({ diff: liveDiff(), onCaptureDiff: vi.fn() })} />)
    expect(el.querySelector('.rasd-ov-cmp-diff-value')?.textContent).toBe('4.8%')
    expect(el.querySelector('.rasd-ov-cmp-diff-count')?.textContent).toBe('٣')
    expect(el.textContent).toContain('فرق البكسلات')
    expect(el.textContent).toContain('عناصر تحرّكت')
  })

  it('اختلاف المقاسين يُعلَن نصًّا بأبعاد التقاطع — لا يُبتلَع', () => {
    const el = mount(
      <ComparePanel
        {...panelProps({
          diff: liveDiff({ sizeMismatch: true, overlapWidth: 1280, overlapHeight: 800 }),
          onCaptureDiff: vi.fn(),
        })}
      />,
    )
    const note = el.querySelector('.rasd-ov-cmp-diff-note')
    expect(note?.textContent).toContain('مقاس المرجع يخالف مقاس الصفحة')
    expect(note?.textContent).toContain('1280 × 800')
  })

  it('تطابق المقاسين لا يُظهر الإعلان أصلًا', () => {
    const el = mount(<ComparePanel {...panelProps({ diff: liveDiff(), onCaptureDiff: vi.fn() })} />)
    expect(el.querySelector('.rasd-ov-cmp-diff-note')).toBeNull()
  })

  it('رسالة الفشل تُعرَض — زرٌّ يفشل صامتًا يُقرأ «لا شيء تغيّر»', () => {
    const el = mount(
      <ComparePanel {...panelProps({ diffError: 'لا مرجع محفوظًا لهذا المقاس.' })} />,
    )
    expect(el.querySelector('.rasd-ov-cmp-diff-error')?.textContent).toBe(
      'لا مرجع محفوظًا لهذا المقاس.',
    )
  })

  it('زرّ «التقط الفرق» يستدعي المعاودة', () => {
    const onCaptureDiff = vi.fn()
    const el = mount(<ComparePanel {...panelProps({ onCaptureDiff })} />)
    const btn = [...el.querySelectorAll('footer button')].find((b) =>
      b.textContent?.includes('التقط الفرق'),
    )
    ;(btn as HTMLButtonElement).click()
    expect(onCaptureDiff).toHaveBeenCalledOnce()
  })

  it('أثناء القياس: الزرّ معطَّل ونصّه يقول ذلك، والنتيجة السابقة تبقى معروضة', () => {
    const el = mount(
      <ComparePanel
        {...panelProps({ diff: liveDiff(), diffBusy: true, onCaptureDiff: vi.fn() })}
      />,
    )
    const btn = el.querySelector<HTMLButtonElement>('footer button[aria-busy="true"]')
    expect(btn?.disabled).toBe(true)
    expect(btn?.textContent).toContain('جارٍ القياس')
    expect(el.querySelector('.rasd-ov-cmp-diff-value')?.textContent).toBe('4.8%')
  })

  it('نتيجة بلا معاودة تُعرَض كذلك — قياسٌ وقع لا يختفي', () => {
    const el = mount(<ComparePanel {...panelProps({ diff: liveDiff() })} />)
    expect(el.querySelector('[data-rasd-ov="compare-diff"]')).toBeTruthy()
    expect(el.textContent).not.toContain('التقط الفرق')
  })
})

describe('CompareIdle — يُصيَّر بلا رمي', () => {
  it('يرسم العنوان ومنطقة الإفلات', () => {
    const el = mount(<CompareIdle />)
    expect(el.textContent).toContain('لا يوجد مرجع لهذه الصفحة')
    expect(el.querySelector('[data-rasd-ov="compare-idle"]')).toBeTruthy()
    expect(el.querySelector('.rasd-ov-cmp-dropzone')).toBeTruthy()
  })

  /**
   * سابقة المرحلة 7: ما لا محرّك له **يُحذَف** لا يُعرَض معطَّلًا ولا حيًّا
   * بلا أثر. الزرّان يظهران بمعاودتيهما ويغيبان بغيابهما.
   */
  it('زرّا الإجراء لا يظهران بلا معاودة خلفهما', () => {
    const el = mount(<CompareIdle />)
    expect(el.querySelectorAll('.rasd-ov-cmp-idle-actions button')).toHaveLength(0)
    expect(el.textContent).not.toContain('اختر من المكتبة')
    expect(el.textContent).not.toContain('استخدم آخر لقطة')
  })

  it('كل زرّ يظهر وحده حين تُمرَّر معاودته وحدها', () => {
    const onlyLibrary = mount(<CompareIdle onChooseFromLibrary={vi.fn()} />)
    expect(onlyLibrary.textContent).toContain('اختر من المكتبة')
    expect(onlyLibrary.textContent).not.toContain('استخدم آخر لقطة')

    render(null, onlyLibrary)
    const onlyLast = mount(<CompareIdle onUseLastCapture={vi.fn()} />)
    expect(onlyLast.textContent).toContain('استخدم آخر لقطة')
    expect(onlyLast.textContent).not.toContain('اختر من المكتبة')
  })

  it('زرّا الإجراء يستدعيان المعاودتين', () => {
    const onChooseFromLibrary = vi.fn()
    const onUseLastCapture = vi.fn()
    const el = mount(
      <CompareIdle onChooseFromLibrary={onChooseFromLibrary} onUseLastCapture={onUseLastCapture} />,
    )
    const buttons = el.querySelectorAll('.rasd-ov-cmp-idle-actions button')
    ;(buttons[0] as HTMLButtonElement).click()
    ;(buttons[1] as HTMLButtonElement).click()
    expect(onChooseFromLibrary).toHaveBeenCalled()
    expect(onUseLastCapture).toHaveBeenCalled()
  })

  it('إفلات ملفّ صورة يستدعي onDropImage بالملفّ', () => {
    const onDropImage = vi.fn()
    const el = mount(<CompareIdle onDropImage={onDropImage} />)
    const zone = el.querySelector('.rasd-ov-cmp-dropzone') as HTMLElement
    const file = new File(['x'], 'ref.png', { type: 'image/png' })
    const dataTransfer = { files: [file] } as unknown as DataTransfer
    zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer }))
    expect(onDropImage).toHaveBeenCalledWith(file)
  })

  it('إفلات ملفّ غير صورة لا يستدعي onDropImage', () => {
    const onDropImage = vi.fn()
    const el = mount(<CompareIdle onDropImage={onDropImage} />)
    const zone = el.querySelector('.rasd-ov-cmp-dropzone') as HTMLElement
    const file = new File(['x'], 'ref.txt', { type: 'text/plain' })
    const dataTransfer = { files: [file] } as unknown as DataTransfer
    zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer }))
    expect(onDropImage).not.toHaveBeenCalled()
  })

  it('data-drag-over يتبدّل مع dragover/dragleave', async () => {
    const el = mount(<CompareIdle />)
    const zone = el.querySelector('.rasd-ov-cmp-dropzone') as HTMLElement
    await act(() => {
      zone.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    })
    expect(zone.getAttribute('data-drag-over')).toBe('true')
    await act(() => {
      zone.dispatchEvent(new Event('dragleave', { bubbles: true }))
    })
    expect(zone.getAttribute('data-drag-over')).toBe('false')
  })
})

/**
 * «مناطق مستثناة» — `compare / exclusions` (`391:1989`) و`exclusions-empty` (`391:2640`) و`exclusion-fallback`
 * (`391:3022`) و`diff-masked` (`391:2819`)، ADR 0034.
 */
describe('ComparePanel — المناطق المستثناة', () => {
  const zones = [
    { id: 'a', kind: 'rect' as const, name: '196 × 40', fallback: false },
    { id: 'b', kind: 'element' as const, name: 'div.feature-card', fallback: false },
  ]

  it('لا قسم بلا `onDrawZone` — لا زرّ بلا محرّك', () => {
    const el = mount(<ComparePanel {...panelProps({ zones })} />)
    expect(el.querySelector('[data-rasd-ov="compare-zones"]')).toBeNull()
  })

  it('فارغًا: يقول إن كل البكسلات تدخل الفرق، والزرّان حاضران', () => {
    const el = mount(<ComparePanel {...panelProps({ onDrawZone: vi.fn(), onPickZone: vi.fn() })} />)
    const section = el.querySelector('[data-rasd-ov="compare-zones"]')
    expect(section?.textContent).toContain('لا مناطق مستثناة — كل البكسلات تدخل الفرق.')
    expect(section?.textContent).toContain('ارسم مستطيلًا')
    expect(section?.textContent).toContain('اختر عنصرًا')
  })

  it('القائمة بأرقام هندية ونوع كلٍّ، والحذف يُبلِّغ بمعرّف منطقته', async () => {
    const onRemoveZone = vi.fn()
    const el = mount(<ComparePanel {...panelProps({ zones, onDrawZone: vi.fn(), onRemoveZone })} />)
    const rows = el.querySelectorAll('[data-rasd-ov="compare-zone"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.querySelector('.rasd-ov-cmp-zone-n')?.textContent).toBe('١')
    expect(rows[0]?.querySelector('.rasd-ov-cmp-zone-kind')?.textContent).toBe('مستطيل')
    expect(rows[1]?.querySelector('.rasd-ov-cmp-zone-kind')?.textContent).toBe('عنصر')
    const del = el.querySelector<HTMLButtonElement>('[aria-label="احذف المنطقة ٢"]')
    await act(() => del?.click())
    expect(onRemoveZone).toHaveBeenCalledWith('b')
  })

  it('الزرّ النشط `aria-pressed`، والنقر يُبلِّغ', async () => {
    const onDrawZone = vi.fn()
    const el = mount(
      <ComparePanel {...panelProps({ onDrawZone, onPickZone: vi.fn(), zoneTool: 'draw' })} />,
    )
    const [draw, pick] = el.querySelectorAll<HTMLButtonElement>('.rasd-ov-cmp-zones-actions button')
    expect(draw?.getAttribute('aria-pressed')).toBe('true')
    expect(pick?.getAttribute('aria-pressed')).toBe('false')
    await act(() => draw?.click())
    expect(onDrawZone).toHaveBeenCalledOnce()
  })

  it('العنصر الغائب يُسمّى بمحدِّده ويُعلَن سقوطه إلى مستطيله — لا يُبتلَع', () => {
    const el = mount(
      <ComparePanel
        {...panelProps({
          zones: [{ ...zones[1]!, fallback: true }],
          onDrawZone: vi.fn(),
        })}
      />,
    )
    expect(el.querySelector('[data-fallback="true"] .rasd-ov-cmp-zone-kind')?.textContent).toBe(
      'مستطيل احتياطي',
    )
    const warn = el.querySelector('.rasd-ov-cmp-zone-warn')
    expect(warn?.getAttribute('role')).toBe('status')
    expect(warn?.textContent).toContain('div.feature-card')
    expect(warn?.textContent).toContain('فاستُعمل مستطيله المحفوظ')
  })

  it('مقترحات المقاسات الأخرى تُعرض بعددها وتُضاف بنقرة', async () => {
    const onAddSuggested = vi.fn()
    const el = mount(
      <ComparePanel {...panelProps({ onDrawZone: vi.fn(), suggestedZones: 2, onAddSuggested })} />,
    )
    expect(el.textContent).toContain('منطقتا عنصر من مقاسات أخرى')
    await act(() => el.querySelector<HTMLButtonElement>('.rasd-ov-cmp-link')?.click())
    expect(onAddSuggested).toHaveBeenCalledOnce()
  })

  it('النسبة على المناطق المهمّة تُسمّى كذلك، ومعها ما استُثني', () => {
    const el = mount(
      <ComparePanel
        {...panelProps({
          diff: liveDiff({ excludedZones: 2, comparedPixels: 930, excludedPixels: 70 }),
          onCaptureDiff: vi.fn(),
        })}
      />,
    )
    expect(el.textContent).toContain('فرق البكسلات · على المناطق المهمّة')
    expect(el.querySelector('[data-rasd-ov="compare-excluded"]')?.textContent).toContain(
      'منطقتان · 7% من الصفحة',
    )
  })

  it('وبلا مناطق لا يتغيّر شيء: «فرق البكسلات» وحدها ولا صفّ استثناء', () => {
    const el = mount(<ComparePanel {...panelProps({ diff: liveDiff(), onCaptureDiff: vi.fn() })} />)
    expect(el.textContent).not.toContain('على المناطق المهمّة')
    expect(el.querySelector('[data-rasd-ov="compare-excluded"]')).toBeNull()
  })
})
