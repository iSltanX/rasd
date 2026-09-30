import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Stage, type CompareMode, type StageProps } from '@/pages/compare/parts/Stage'
import { ZoneDrawLayer, type ZoneDrawLayerProps } from '@/pages/compare/parts/ZoneLayer'
import { addZone, type SessionZone } from '@/pages/compare/session-zones'
import { deviceRect } from '@/shared/geometry'

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

/*
 * الصندوق 256×128 عند (8، 16) والمسرح 512×256 بكسل صورة — مقياس 2 دقيق (أرقام ثنائية الأساس)،
 * كما في `session-zones.test.ts`. happy-dom لا يقيس التخطيط، فيُحقَن قياس الصندوق.
 */
const BOX = new DOMRect(8, 16, 256, 128)
const STAGE = { width: 512, height: 256 }

function pointer(type: string, clientX: number, clientY: number, button = 0): PointerEvent {
  return new PointerEvent(type, { clientX, clientY, pointerId: 1, button, bubbles: true })
}

function layerProps(overrides: Partial<ZoneDrawLayerProps> = {}): ZoneDrawLayerProps {
  return { stageSizePx: STAGE, onAddZone: vi.fn(), onCancel: vi.fn(), ...overrides }
}

function mountLayer(overrides: Partial<ZoneDrawLayerProps> = {}): HTMLElement {
  const el = mount(<ZoneDrawLayer {...layerProps(overrides)} />)
  const layer = el.querySelector('[data-compare-zone-layer]') as HTMLElement
  vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(BOX)
  return layer
}

describe('ZoneDrawLayer — الرسم بالمؤشّر', () => {
  it('سحبة من الأعلى-اليسار إلى الأسفل-اليمين تضيف المستطيل بكسلات الصورة', async () => {
    const onAddZone = vi.fn()
    const layer = mountLayer({ onAddZone })

    await act(() => {
      layer.dispatchEvent(pointer('pointerdown', 24, 32))
      layer.dispatchEvent(pointer('pointermove', 60, 70))
      layer.dispatchEvent(pointer('pointerup', 88, 96))
    })

    expect(onAddZone).toHaveBeenCalledTimes(1)
    expect(onAddZone).toHaveBeenCalledWith(deviceRect(32, 32, 128, 128))
  })

  it('اتجاه السحب لا يغيّر الناتج — من الأسفل-اليمين إلى الأعلى-اليسار', async () => {
    const onAddZone = vi.fn()
    const layer = mountLayer({ onAddZone })

    await act(() => {
      layer.dispatchEvent(pointer('pointerdown', 88, 96))
      layer.dispatchEvent(pointer('pointerup', 24, 32))
    })

    expect(onAddZone).toHaveBeenCalledWith(deviceRect(32, 32, 128, 128))
  })

  it('صفحة RTL: الإحداثيات فيزيائية من `left` — الناتج نفسه', async () => {
    const before = document.documentElement.dir
    document.documentElement.dir = 'rtl'
    try {
      const onAddZone = vi.fn()
      const layer = mountLayer({ onAddZone })
      await act(() => {
        layer.dispatchEvent(pointer('pointerdown', 8, 16))
        layer.dispatchEvent(pointer('pointerup', 8 + 64, 16 + 64))
      })
      // ربع العرض الأيسر وربع الارتفاع الأعلى: الأعمدة 0–128 والصفوف 0–128.
      expect(onAddZone).toHaveBeenCalledWith(deviceRect(0, 0, 128, 128))
    } finally {
      document.documentElement.dir = before
    }
  })

  it('السحب خارج الصندوق يُقصّ عند حدّه (المؤشّر ملتقَط فلا يُفلَت)', async () => {
    const onAddZone = vi.fn()
    const layer = mountLayer({ onAddZone })

    await act(() => {
      layer.dispatchEvent(pointer('pointerdown', 24, 32))
      layer.dispatchEvent(pointer('pointerup', 9000, 9000))
    })

    expect(onAddZone).toHaveBeenCalledWith(deviceRect(32, 32, 480, 224))
  })

  it('المعاينة الحيّة تظهر أثناء السحب بنسب المسرح، وتزول بعد الرفع', async () => {
    const layer = mountLayer()

    await act(() => {
      layer.dispatchEvent(pointer('pointerdown', 24, 32))
      layer.dispatchEvent(pointer('pointermove', 88, 96))
    })
    const preview = layer.querySelector('[data-compare-zone-preview]') as HTMLElement
    expect(preview).toBeTruthy()
    // x 32/512 = 6.25% · y 32/256 = 12.5% · عرض 128/512 = 25% · ارتفاع 128/256 = 50%.
    expect(preview.style.left).toBe('6.25%')
    expect(preview.style.top).toBe('12.5%')
    expect(preview.style.width).toBe('25%')
    expect(preview.style.height).toBe('50%')
    // المعاينة ليست منطقة: الحارس يعدّ `data-compare-zone-box` وحدها.
    expect(layer.querySelector('[data-compare-zone-box]')).toBeNull()

    await act(() => {
      layer.dispatchEvent(pointer('pointerup', 88, 96))
    })
    expect(layer.querySelector('[data-compare-zone-preview]')).toBeNull()
  })

  it('نقرة أو سحبة أصغر من بكسلَي صورة لا تضيف شيئًا وتُنظَّف المعاينة', async () => {
    const onAddZone = vi.fn()
    const layer = mountLayer({ onAddZone })

    await act(() => {
      layer.dispatchEvent(pointer('pointerdown', 24, 32))
      layer.dispatchEvent(pointer('pointerup', 24.5, 96))
    })

    expect(onAddZone).not.toHaveBeenCalled()
    expect(layer.querySelector('[data-compare-zone-preview]')).toBeNull()
  })

  it('الزرّ غير الأساسي لا يبدأ رسمًا', async () => {
    const onAddZone = vi.fn()
    const layer = mountLayer({ onAddZone })

    await act(() => {
      layer.dispatchEvent(pointer('pointerdown', 24, 32, 2))
      layer.dispatchEvent(pointer('pointerup', 88, 96, 2))
    })

    expect(onAddZone).not.toHaveBeenCalled()
  })

  it('حركة أو رفع بلا ضغط سابق لا أثر لهما', async () => {
    const onAddZone = vi.fn()
    const layer = mountLayer({ onAddZone })

    await act(() => {
      layer.dispatchEvent(pointer('pointermove', 60, 70))
      layer.dispatchEvent(pointer('pointerup', 88, 96))
    })

    expect(onAddZone).not.toHaveBeenCalled()
    expect(layer.querySelector('[data-compare-zone-preview]')).toBeNull()
  })

  it('pointercancel يُسقط السحبة: الرفع بعده لا يضيف', async () => {
    const onAddZone = vi.fn()
    const layer = mountLayer({ onAddZone })

    await act(() => {
      layer.dispatchEvent(pointer('pointerdown', 24, 32))
      layer.dispatchEvent(pointer('pointercancel', 60, 70))
      layer.dispatchEvent(pointer('pointerup', 88, 96))
    })

    expect(onAddZone).not.toHaveBeenCalled()
  })

  it('Escape يلغي وضع الرسم، ومفتاحٌ آخر لا', async () => {
    const onCancel = vi.fn()
    // المستمع يُسجَّل في تأثير — لا يجري إلا بعد تفريغ الجدولة.
    await act(() => {
      mountLayer({ onCancel })
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onCancel).not.toHaveBeenCalled()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('لا يبقى مستمع Escape بعد إزالة الطبقة', async () => {
    const onCancel = vi.fn()
    let el: HTMLElement | null = null
    await act(() => {
      el = mount(<ZoneDrawLayer {...layerProps({ onCancel })} />)
    })
    // يثبت أن المستمع كان حيًّا قبل الإزالة — وإلا صار «لا يُستدعى» فراغًا يمرّ بلا معنى.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    await act(() => {
      render(null, el as unknown as HTMLElement)
    })
    onCancel.mockClear()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onCancel).not.toHaveBeenCalled()
  })
})

function stageProps(overrides: Partial<StageProps> = {}): StageProps {
  return {
    mode: 'adjacent',
    stageSizePx: STAGE,
    a: { url: 'blob:a', title: 'أ', size: STAGE },
    b: { url: 'blob:b', title: 'ب', size: STAGE },
    splitPosition: 50,
    onSplitPositionChange: vi.fn(),
    blinkShowingA: true,
    blinkPlaying: false,
    onBlinkTogglePlay: vi.fn(),
    onBlinkStep: vi.fn(),
    diffOutcome: null,
    regionItems: [],
    selectedRegionIndex: null,
    onSelectRegion: vi.fn(),
    zones: [],
    drawing: false,
    onAddZone: vi.fn(),
    onCancelDrawing: vi.fn(),
    ...overrides,
  }
}

describe('Stage — صناديق المناطق وطبقة الالتقاط', () => {
  const zones: readonly SessionZone[] = addZone(
    addZone([], deviceRect(32, 32, 128, 128)),
    deviceRect(0, 128, 256, 64),
  )

  it.each<CompareMode>(['adjacent', 'diff', 'blink'])(
    'طريقة «%s»: صندوقٌ لكل منطقة بنسب المسرح وبشارة «رقم · غير محفوظة»',
    (mode) => {
      const el = mount(<Stage {...stageProps({ mode, zones })} />)
      const boxes = [...el.querySelectorAll<HTMLElement>('[data-compare-zone-box]')]
      expect(boxes).toHaveLength(2)

      expect(boxes[0]?.style.left).toBe('6.25%')
      expect(boxes[0]?.style.top).toBe('12.5%')
      expect(boxes[0]?.style.width).toBe('25%')
      expect(boxes[0]?.style.height).toBe('50%')
      expect(boxes[0]?.textContent).toBe('١ · غير محفوظة')

      expect(boxes[1]?.style.left).toBe('0%')
      expect(boxes[1]?.style.top).toBe('50%')
      expect(boxes[1]?.style.width).toBe('50%')
      expect(boxes[1]?.style.height).toBe('25%')
      expect(boxes[1]?.textContent).toBe('٢ · غير محفوظة')
    },
  )

  it('بلا مناطق لا صناديق، وبلا وضع رسم لا طبقة التقاط', () => {
    const el = mount(<Stage {...stageProps()} />)
    expect(el.querySelector('[data-compare-zone-box]')).toBeNull()
    expect(el.querySelector('[data-compare-zone-layer]')).toBeNull()
  })

  it.each<CompareMode>(['adjacent', 'diff', 'blink'])(
    'طريقة «%s»: وضع الرسم يركّب الطبقة داخل المسرح، والسحب عليها يضيف منطقة',
    async (mode) => {
      const onAddZone = vi.fn()
      const el = mount(<Stage {...stageProps({ mode, drawing: true, onAddZone })} />)
      const layer = el.querySelector('[data-compare-zone-layer]') as HTMLElement
      expect(layer).toBeTruthy()
      // الطبقة آخر أبناء المسرح فتعلو ما تحتها (مقبض الفصل، أزرار المناطق).
      expect(layer.parentElement?.lastElementChild).toBe(layer)
      vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue(BOX)

      await act(() => {
        layer.dispatchEvent(pointer('pointerdown', 24, 32))
        layer.dispatchEvent(pointer('pointerup', 88, 96))
      })

      expect(onAddZone).toHaveBeenCalledWith(deviceRect(32, 32, 128, 128))
    },
  )

  it('Escape أثناء الرسم يستدعي onCancelDrawing', async () => {
    const onCancelDrawing = vi.fn()
    await act(() => {
      mount(<Stage {...stageProps({ drawing: true, onCancelDrawing })} />)
    })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onCancelDrawing).toHaveBeenCalledTimes(1)
  })
})
