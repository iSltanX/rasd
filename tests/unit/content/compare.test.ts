/**
 * أداة المقارنة — الحالة والتفاعل. رياضيات التحويل مُختبَرة في
 * `modules/compare/overlay.test.ts`؛ هنا يُختبَر ما يربطها بالمؤشِّر
 * ولوحة المفاتيح والتمرير.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCompare, type CompareTool, type ReferenceImage } from '@/content/tools/compare'

const REF: ReferenceImage = { url: 'blob:ref', naturalWidth: 1200, naturalHeight: 800 }

function pointer(x: number, y: number): PointerEvent {
  return { clientX: x, clientY: y } as PointerEvent
}

function wheel(
  x: number,
  y: number,
  deltaY: number,
  preventDefault: () => void = vi.fn(),
): WheelEvent {
  return { clientX: x, clientY: y, deltaY, preventDefault } as unknown as WheelEvent
}

function makeTool(overrides: Partial<Parameters<typeof createCompare>[0]> = {}): CompareTool {
  return createCompare({ win: window, onBusy: vi.fn(), ...overrides })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setReference', () => {
  it('يبدأ بتحويل محايد', () => {
    const tool = makeTool()
    tool.setReference(REF)
    expect(tool.state.reference.value).toEqual(REF)
    expect(tool.state.transform.value).toEqual({ scale: 1, tx: 0, ty: 0, rotation: 0 })
  })

  it('null يمسح المرجع ويعيد التحويل محايدًا', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onPointerDown(pointer(0, 0))
    tool.onPointerMove(pointer(50, 50))
    tool.setReference(null)
    expect(tool.state.reference.value).toBeNull()
    expect(tool.state.transform.value.tx).toBe(0)
  })
})

describe('السحب', () => {
  it('لا مرجع بعد: السحب لا يفعل شيئًا', () => {
    const tool = makeTool()
    tool.onPointerDown(pointer(0, 0))
    tool.onPointerMove(pointer(50, 50))
    expect(tool.state.transform.value.tx).toBe(0)
  })

  it('سحب من (10,10) إلى (60,45) يزيح بمقدار الدلتا بالضبط', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onPointerDown(pointer(10, 10))
    tool.onPointerMove(pointer(60, 45))
    expect(tool.state.transform.value.tx).toBe(50)
    expect(tool.state.transform.value.ty).toBe(35)
  })

  it('onBusy(true) عند بدء السحب، و(false) عند رفع المؤشِّر', () => {
    const onBusy = vi.fn()
    const tool = makeTool({ onBusy })
    tool.setReference(REF)
    tool.onPointerDown(pointer(0, 0))
    expect(onBusy).toHaveBeenLastCalledWith(true)
    tool.onPointerUp()
    expect(onBusy).toHaveBeenLastCalledWith(false)
  })

  it('حركة بعد رفع المؤشِّر لا تُحرِّك شيئًا', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onPointerDown(pointer(0, 0))
    tool.onPointerUp()
    tool.onPointerMove(pointer(100, 100))
    expect(tool.state.transform.value.tx).toBe(0)
  })
})

describe('عجلة الفأرة — تكبير نحو المؤشِّر', () => {
  it('تمرير سالب (بعيدًا عن المستخدم) يكبِّر', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onWheel(wheel(100, 100, -100))
    expect(tool.state.transform.value.scale).toBeGreaterThan(1)
  })

  it('تمرير موجب (نحو المستخدم) يصغِّر', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.onWheel(wheel(100, 100, 100))
    expect(tool.state.transform.value.scale).toBeLessThan(1)
  })

  it('التحجيم محدود بسقفٍ أعلى وأدنى', () => {
    const tool = makeTool()
    tool.setReference(REF)
    for (let i = 0; i < 200; i++) tool.onWheel(wheel(0, 0, -1000))
    expect(tool.state.transform.value.scale).toBeLessThanOrEqual(50)

    tool.setReference(REF)
    for (let i = 0; i < 200; i++) tool.onWheel(wheel(0, 0, 1000))
    expect(tool.state.transform.value.scale).toBeGreaterThanOrEqual(0.02)
  })

  it('لا مرجع: العجلة لا تفعل شيئًا ولا تستدعي preventDefault', () => {
    const tool = makeTool()
    const preventDefault = vi.fn()
    tool.onWheel(wheel(0, 0, -100, preventDefault))
    expect(preventDefault).not.toHaveBeenCalled()
    expect(tool.state.transform.value.scale).toBe(1)
  })
})

describe('nudge', () => {
  it('يزيح بالدلتا المُمرَّرة مباشرة — الاستدعاء يحسب الخطوة لا هذا الملفّ', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.nudge(10, 0)
    tool.nudge(0, -1)
    expect(tool.state.transform.value).toEqual({ scale: 1, tx: 10, ty: -1, rotation: 0 })
  })
})

describe('matchWidth', () => {
  it('يحسب التحجيم الصحيح ويُبقي الزاوية العلوية اليسرى في مكانها', () => {
    const tool = makeTool()
    tool.setReference(REF) // عرض طبيعي 1200
    tool.onPointerDown(pointer(0, 0))
    tool.onPointerMove(pointer(20, 30)) // إزاحة أوّلية قبل المطابقة
    tool.onPointerUp()

    const before = tool.state.transform.value
    const topLeftBefore = { x: before.tx, y: before.ty } // مرجع (0,0) بلا دوران = (tx,ty) مباشرة

    tool.matchWidth(600) // 600/1200 = 0.5
    const after = tool.state.transform.value
    expect(after.scale).toBeCloseTo(0.5, 10)
    expect(after.tx).toBeCloseTo(topLeftBefore.x, 6)
    expect(after.ty).toBeCloseTo(topLeftBefore.y, 6)
  })

  it('لا مرجع: لا يفعل شيئًا', () => {
    const tool = makeTool()
    tool.matchWidth(600)
    expect(tool.state.transform.value.scale).toBe(1)
  })
})

describe('أنماط العرض والإعدادات', () => {
  it('setDisplayMode يقبل الأنماط الأربعة', () => {
    const tool = makeTool()
    for (const m of ['blink', 'opacity', 'blend', 'split'] as const) {
      tool.setDisplayMode(m)
      expect(tool.state.displayMode.value).toBe(m)
    }
  })

  it('setOpacity وsetSplitPosition يُحصَران بين 0 و100', () => {
    const tool = makeTool()
    tool.setOpacity(150)
    expect(tool.state.opacity.value).toBe(100)
    tool.setOpacity(-20)
    expect(tool.state.opacity.value).toBe(0)
    tool.setSplitPosition(200)
    expect(tool.state.splitPosition.value).toBe(100)
  })

  it('togglePinned يعكس القيمة، والافتراضي true', () => {
    const tool = makeTool()
    expect(tool.state.pinned.value).toBe(true)
    tool.togglePinned()
    expect(tool.state.pinned.value).toBe(false)
  })
})

describe('التثبيت أثناء التمرير — frame()', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  it('مثبَّت (الافتراضي): التمرير لا يُحرِّك التحويل', () => {
    const tool = makeTool()
    tool.setReference(REF)
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true })
    tool.frame(new Set(['scroll']))
    expect(tool.state.transform.value.ty).toBe(0)
  })

  it('غير مثبَّت: يتحرّك بعكس دلتا التمرير كي يبقى فوق نفس محتوى الصفحة', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.togglePinned()
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    tool.frame(new Set(['scroll']))
    expect(tool.state.transform.value.ty).toBe(-120)
  })

  it('سبب غير scroll لا يُحرِّك شيئًا حتى لو تغيّر التمرير', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.togglePinned()
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true })
    tool.frame(new Set(['manual']))
    expect(tool.state.transform.value.ty).toBe(0)
  })
})

describe('reset', () => {
  it('يعيد كل الحالة إلى الافتراضي', () => {
    const tool = makeTool()
    tool.setReference(REF)
    tool.setDisplayMode('blend')
    tool.setOpacity(80)
    tool.togglePinned()
    tool.reset()

    expect(tool.state.reference.value).toBeNull()
    expect(tool.state.transform.value).toEqual({ scale: 1, tx: 0, ty: 0, rotation: 0 })
    expect(tool.state.displayMode.value).toBe('split')
    expect(tool.state.opacity.value).toBe(50)
    expect(tool.state.pinned.value).toBe(true)
  })
})

/**
 * المناطق المستثناة (ADR 0034) — رسم المستطيل فوق المرجع واختيار العنصر من الصفحة، وحلّ منطقة العنصر ساعة
 * القياس. `elementsFromPoint` غائبة في happy-dom فتُحقن، والصندوق يُعطى للعنصر — سابقة `eyedropper.test.ts`.
 */
describe('المناطق المستثناة', () => {
  const space = () => ({ dpr: 2 }) as never

  function boxedAt(el: Element, x: number, y: number, w: number, h: number): Element {
    const rect = new DOMRect(x, y, w, h)
    Object.defineProperty(el, 'getBoundingClientRect', { value: () => rect, configurable: true })
    Object.defineProperty(el, 'getClientRects', { value: () => [rect], configurable: true })
    return el
  }

  function stubHit(el: Element | null): void {
    const doc = document as unknown as { elementsFromPoint: () => Element[] }
    doc.elementsFromPoint = vi.fn(() => (el ? [el] : []))
  }

  beforeEach(() => {
    document.body.innerHTML =
      '<header><time id="clock">10:42</time></header><aside class="ad">إعلان</aside>'
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'elementsFromPoint')
  })

  it('رسم مستطيل فوق مرجعٍ مصغَّر يُحفظ ببكسل المرجع، ويُبلَّغ للحفظ مع القائمة السابقة', () => {
    const onZonesChange = vi.fn()
    const tool = makeTool({ onZonesChange, space })
    tool.setReference(REF)
    tool.matchWidth(600) // مقياس 0.5: بكسل الشاشة = بكسلا مرجع
    tool.setZoneTool('draw')

    tool.onPointerDown(pointer(10, 20))
    tool.onPointerMove(pointer(60, 40))
    expect(tool.state.zoneDraft.value?.rect).toMatchObject({ x: 10, y: 20, width: 50, height: 20 })
    tool.onPointerUp(pointer(60, 40))

    const [zone] = tool.state.zones.value
    expect(zone?.anchor).toEqual({
      kind: 'rect',
      rect: { space: 'device', x: 20, y: 40, width: 100, height: 40 },
    })
    expect(onZonesChange).toHaveBeenCalledWith(tool.state.zones.value)
    // والإعداد ينتهي بمنطقته، والسحب لم يحرّك المرجع.
    expect(tool.state.zoneTool.value).toBeNull()
    expect(tool.state.transform.value.tx).toBe(0)
  })

  /**
   * المراجعة المستقلّة (`STAGES/34`): `crypto.randomUUID` غائبة عن سكربت المحتوى في صفحة `http` غير محلّية —
   * قِيس في كروم: `isSecureContext:false` و`typeof crypto.randomUUID === 'undefined'`. فلم تكن تُنشأ منطقة هناك.
   */
  it('سياقٌ غير آمن بلا `randomUUID`: المنطقة تُنشأ بمعرّفٍ فريد', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    try {
      const tool = makeTool({ space })
      tool.setReference(REF)
      for (const x of [10, 100]) {
        tool.setZoneTool('draw')
        tool.onPointerDown(pointer(x, 10))
        tool.onPointerUp(pointer(x + 40, 40))
      }
      const ids = tool.state.zones.value.map((z) => z.id)
      expect(ids).toHaveLength(2)
      expect(new Set(ids).size).toBe(2)
      expect(ids.every((id) => /^[0-9a-f]{32}$/.test(id))).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('سحبٌ أصغر من بكسلين لا يُنشئ منطقة', () => {
    const onZonesChange = vi.fn()
    const tool = makeTool({ onZonesChange, space })
    tool.setReference(REF)
    tool.setZoneTool('draw')
    tool.onPointerDown(pointer(10, 10))
    tool.onPointerUp(pointer(11, 30))
    expect(tool.state.zones.value).toEqual([])
    expect(onZonesChange).not.toHaveBeenCalled()
  })

  it('إفلاتٌ فوق اللوحة (بلا حدث) يُسقط الرسم الجاري ولا يُنشئ شيئًا', () => {
    const tool = makeTool({ space })
    tool.setReference(REF)
    tool.setZoneTool('draw')
    tool.onPointerDown(pointer(10, 10))
    tool.onPointerMove(pointer(80, 80))
    tool.onPointerUp()
    expect(tool.state.zoneDraft.value).toBeNull()
    expect(tool.state.zones.value).toEqual([])
  })

  it('اختيار عنصر يحفظ محدِّده وبصمته ومستطيله ببكسل الجهاز — بلا نصّه', () => {
    const clock = boxedAt(document.getElementById('clock')!, 300, 12, 60, 24)
    stubHit(clock)
    const tool = makeTool({ space })
    tool.setReference(REF)
    tool.setZoneTool('pick')

    tool.onPointerMove(pointer(310, 20))
    expect(tool.state.zoneDraft.value?.selector).toBe('#clock')
    tool.onPointerUp(pointer(310, 20))

    const anchor = tool.state.zones.value[0]?.anchor
    expect(anchor).toMatchObject({
      kind: 'element',
      selector: '#clock',
      hosts: [],
      rect: { space: 'device', x: 600, y: 24, width: 120, height: 48 },
    })
    expect(JSON.stringify(anchor)).not.toContain('10:42')
    expect(tool.state.resolved.value[tool.state.zones.value[0]!.id]?.fallback).toBe(false)
  })

  it('منطقة العنصر تتبع موضعه الحيّ ساعة القياس، والغائب يسقط إلى مستطيله ويُعلَم', () => {
    const clock = boxedAt(document.getElementById('clock')!, 300, 12, 60, 24)
    stubHit(clock)
    const tool = makeTool({ space })
    tool.setReference(REF)
    tool.setZoneTool('pick')
    tool.onPointerUp(pointer(310, 20))
    const id = tool.state.zones.value[0]!.id

    // تغيّر نصّ الساعة (بصمةٌ أخرى) وتحرّكت — ما زالت هي.
    clock.textContent = '10:43'
    boxedAt(clock, 320, 12, 60, 24)
    expect(tool.liveRects()).toEqual({
      [id]: { space: 'device', x: 640, y: 24, width: 120, height: 48 },
    })

    clock.remove()
    expect(tool.liveRects()).toEqual({})
    expect(tool.state.resolved.value[id]).toEqual({
      rect: { space: 'device', x: 600, y: 24, width: 120, height: 48 },
      fallback: true,
    })
  })

  it('حذف منطقة يُبلَّغ بالقائمة الجديدة والسابقة', () => {
    const onZonesChange = vi.fn()
    const tool = makeTool({ onZonesChange, space })
    tool.setReference(REF)
    const zone = {
      id: 'z1',
      label: null,
      createdAt: 1,
      anchor: {
        kind: 'rect' as const,
        rect: { space: 'device' as const, x: 0, y: 0, width: 5, height: 5 },
      },
    }
    tool.setZones([zone], [])
    tool.removeZone('z1')
    expect(tool.state.zones.value).toEqual([])
    expect(onZonesChange).toHaveBeenCalledWith([])
  })

  it('المقترح يُعرض إن وُجد عنصره الآن وحده، ويُضاف بمستطيله في هذه الصفحة بمعرّفٍ جديد', () => {
    boxedAt(document.querySelector('.ad')!, 0, 400, 300, 250)
    const onZonesChange = vi.fn()
    const tool = makeTool({ onZonesChange, space })
    tool.setReference(REF)
    const fp = { tag: 'aside', attrs: ['class'], textHash: '00000000', textLength: 5 }
    const rect = { space: 'device' as const, x: 1, y: 1, width: 1, height: 1 }
    const suggestion = (id: string, selector: string) => ({
      id,
      label: null,
      createdAt: 1,
      anchor: { kind: 'element' as const, selector, hosts: [], fingerprint: fp, rect },
    })
    tool.setZones([], [suggestion('s1', 'aside.ad'), suggestion('s2', '#gone')])
    expect(tool.state.suggested.value.map((s) => s.id)).toEqual(['s1'])

    tool.addSuggested()
    const [added] = tool.state.zones.value
    expect(added?.id).not.toBe('s1')
    expect(added?.anchor).toMatchObject({
      selector: 'aside.ad',
      rect: { space: 'device', x: 0, y: 800, width: 600, height: 500 },
    })
    expect(tool.state.suggested.value).toEqual([])
  })

  it('مرجعٌ جديد يمسح مناطق السابق وإعداده الجاري، ولا إعداد بلا مرجع', () => {
    const tool = makeTool({ space })
    tool.setZoneTool('draw')
    expect(tool.state.zoneTool.value).toBeNull()
    tool.setReference(REF)
    tool.setZones(
      [
        {
          id: 'z',
          label: null,
          createdAt: 1,
          anchor: { kind: 'rect', rect: { space: 'device', x: 0, y: 0, width: 5, height: 5 } },
        },
      ],
      [],
    )
    tool.setZoneTool('pick')
    tool.setReference({ ...REF, url: 'blob:other' })
    expect(tool.state.zones.value).toEqual([])
    expect(tool.state.zoneTool.value).toBeNull()
  })
})
