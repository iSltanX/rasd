import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { MODES, MODE_META, TOOL_MODES, isMode } from '@/shared/modes'
import {
  BoxModel,
  Crosshair,
  Dimension,
  DimensionVertical,
  FrameBlocked,
  Marquee,
  NodeLabel,
  Toolbar,
  at,
  box,
} from '@/ui/overlay'

/**
 * بدائيّات الطبقة — ما يمكن إثباته في happy-dom.
 *
 * **حدّ صريح:** happy-dom بلا محرّك تخطيط، فـ`getBoundingClientRect` ترجع
 * أصفارًا. لذلك يُختبَر هنا **العقد**: البنية، والسمات، والقيم المنسَّقة،
 * والحساب الهندسي الذي يجري في JS. أمّا التموضع الفعلي على الشاشة فيُقاس في
 * متصفّح حقيقي عبر Playwright — ولا يُدّعى هنا.
 */

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

const RECT = { x: 40, y: 60, width: 210, height: 120 }
const edges = (n: number) =>
  Object.fromEntries((['top', 'right', 'bottom', 'left'] as const).map((s) => [s, n])) as {
    top: number
    right: number
    bottom: number
    left: number
  }

describe('geometry — متغيّرات الموضع', () => {
  it('at() يعطي متغيّرَي الموضع بالبكسل', () => {
    expect(at({ x: 12, y: -8 })).toEqual({ '--rasd-ov-x': '12px', '--rasd-ov-y': '-8px' })
  })

  it('box() يضيف المقاس إلى الموضع', () => {
    expect(box(RECT)).toEqual({
      '--rasd-ov-x': '40px',
      '--rasd-ov-y': '60px',
      '--rasd-ov-w': '210px',
      '--rasd-ov-h': '120px',
    })
  })
})

describe('كل بدائيّة تُصيَّر بلا رمي', () => {
  const cases: [string, preact.ComponentChild][] = [
    ['Marquee', <Marquee rect={RECT} />],
    [
      'NodeLabel',
      <NodeLabel origin={RECT} tag="section" selector=".hero" width={1280} height={420} />,
    ],
    ['Dimension', <Dimension rect={RECT} />],
    ['DimensionVertical', <DimensionVertical rect={RECT} />],
    ['BoxModel', <BoxModel rect={RECT} />],
    ['Toolbar', <Toolbar origin={RECT} items={[{ mode: 'area' }]} active="area" />],
    ['Crosshair', <Crosshair point={RECT} />],
    ['FrameBlocked', <FrameBlocked rect={RECT} />],
  ]

  for (const [name, ui] of cases) {
    it(name, () => {
      expect(() => mount(ui)).not.toThrow()
      expect(host?.childNodes.length).toBeGreaterThan(0)
    })
  }
})

describe('Marquee', () => {
  it('يعرض المقاس بأرقام غربية — قيمة تُنسخ لا عدّ بشري', () => {
    const el = mount(<Marquee rect={RECT} />)
    const badge = el.querySelector('[data-rasd-ov-size]')
    expect(badge?.textContent).toBe('210 × 120')
    expect(badge?.textContent).not.toMatch(/[٠-٩]/)
  })

  it('يقرّب الكسور — `getBoundingClientRect` تعطي قيمًا كسرية', () => {
    const el = mount(<Marquee rect={{ x: 0, y: 0, width: 210.4, height: 119.6 }} />)
    expect(el.querySelector('[data-rasd-ov-size]')?.textContent).toBe('210 × 120')
  })

  it('أربع زوايا لا ثماني قطع', () => {
    const el = mount(<Marquee rect={RECT} />)
    expect(el.querySelectorAll('.rasd-ov-corner')).toHaveLength(4)
  })

  it('`showBadge=false` يُخفي الشارة ويُبقي الإطار', () => {
    const el = mount(<Marquee rect={RECT} showBadge={false} />)
    expect(el.querySelector('[data-rasd-ov-size]')).toBeNull()
    expect(el.querySelector('.rasd-ov-marquee-fill')).not.toBeNull()
  })

  it('`flipBadge` يُعلَّم على الشارة لا يُحسب في JS', () => {
    const el = mount(<Marquee rect={RECT} flipBadge />)
    expect(el.querySelector('[data-rasd-ov-size]')?.getAttribute('data-flip')).toBe('true')
  })
})

describe('NodeLabel', () => {
  it('يعرض المقاس والمحدِّد والوسم بترتيب Figma البصري', () => {
    const el = mount(
      <NodeLabel
        origin={{ x: 0, y: 0 }}
        tag="section"
        selector=".hero-section"
        width={1280}
        height={420}
      />,
    )
    const parts = [...el.querySelectorAll('.rasd-ov-node-label > *')].map((n) => n.className)
    expect(parts[0]).toContain('rasd-ov-node-size')
    expect(parts[1]).toContain('rasd-ov-node-divider')
    expect(parts[2]).toContain('rasd-ov-node-selector')
    expect(parts[3]).toContain('rasd-ov-node-tag')
    expect(el.textContent).toContain('1280 × 420')
    expect(el.textContent).toContain('.hero-section')
    expect(el.textContent).toContain('section')
  })

  it('المحدِّد الطويل يحمل `title` كاملًا رغم القصّ البصري', () => {
    const long = '.a > .b > .c > .d > .e > .f > .g > .h > .i > .j > .k'
    const el = mount(
      <NodeLabel origin={{ x: 0, y: 0 }} tag="div" selector={long} width={10} height={10} />,
    )
    expect(el.querySelector('.rasd-ov-node-selector')?.getAttribute('title')).toBe(long)
  })
})

describe('Dimension', () => {
  it('يعرض عرض المستطيل حين لا تُمرَّر قيمة', () => {
    const el = mount(<Dimension rect={RECT} />)
    expect(el.textContent).toBe('210px')
  })

  it('القيمة الصريحة تتقدّم على العرض', () => {
    const el = mount(<Dimension rect={RECT} value={48} />)
    expect(el.textContent).toBe('48px')
  })

  it('الوحدة قابلة للتبديل', () => {
    const el = mount(<Dimension rect={RECT} value={2} unit="rem" />)
    expect(el.textContent).toBe('2rem')
  })

  it('الرأسي يستعمل الارتفاع لا العرض', () => {
    const el = mount(<DimensionVertical rect={RECT} />)
    expect(el.textContent).toBe('120px')
  })
})

describe('BoxModel', () => {
  it('يطرح الطبقات الثلاث من المستطيل ليعطي مقاس المحتوى', () => {
    // 210 − 2×(24+16+20) = 90 ، 120 − 2×60 = 0
    const el = mount(
      <BoxModel rect={RECT} margin={edges(24)} border={edges(16)} padding={edges(20)} />,
    )
    expect(el.querySelector('.rasd-ov-box-label')?.textContent).toBe('90 × 0')
  })

  it('لا مقاس سالب حين تتجاوز الحواف المستطيل', () => {
    const el = mount(<BoxModel rect={{ x: 0, y: 0, width: 10, height: 10 }} margin={edges(40)} />)
    expect(el.querySelector('.rasd-ov-box-label')?.textContent).toBe('0 × 0')
  })

  it('بلا حواف: مقاس المحتوى = مقاس المستطيل', () => {
    const el = mount(<BoxModel rect={RECT} />)
    expect(el.querySelector('.rasd-ov-box-label')?.textContent).toBe('210 × 120')
  })

  it('أربع أصداف مرسومة', () => {
    const el = mount(<BoxModel rect={RECT} />)
    expect(el.querySelectorAll('.rasd-ov-box-ring')).toHaveLength(4)
  })
})

describe('Toolbar', () => {
  it('زرّ لكل أداة، وزرّ إغلاق زائد', () => {
    const items = TOOL_MODES.map((mode) => ({ mode }))
    const el = mount(<Toolbar origin={{ x: 0, y: 0 }} items={items} active="area" />)
    expect(el.querySelectorAll('button')).toHaveLength(items.length + 1)
    expect(el.querySelector('.rasd-ov-tool-close')).not.toBeNull()
  })

  it('النشط وحده يحمل `aria-pressed=true`', () => {
    const items = TOOL_MODES.map((mode) => ({ mode }))
    const el = mount(<Toolbar origin={{ x: 0, y: 0 }} items={items} active="measure" />)
    const pressed = [...el.querySelectorAll('[aria-pressed="true"]')]
    expect(pressed).toHaveLength(1)
    expect(pressed[0]?.getAttribute('aria-label')).toBe(MODE_META.measure.label)
  })

  it('كل زرّ يحمل اسمًا عربيًا مُعلَنًا', () => {
    const items = TOOL_MODES.map((mode) => ({ mode }))
    const el = mount(<Toolbar origin={{ x: 0, y: 0 }} items={items} active="area" />)
    for (const b of el.querySelectorAll('button')) {
      expect(b.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('`onPick` يعطي الوضع المضغوط', () => {
    let picked = ''
    const el = mount(
      <Toolbar
        origin={{ x: 0, y: 0 }}
        items={[{ mode: 'colour' }]}
        active="area"
        onPick={(m) => (picked = m)}
      />,
    )
    el.querySelector<HTMLButtonElement>('.rasd-ov-tool')?.click()
    expect(picked).toBe('colour')
  })

  it('الشريط وحده يستقبل المؤشِّر — دور `toolbar` مُعلَن', () => {
    const el = mount(<Toolbar origin={{ x: 0, y: 0 }} items={[{ mode: 'area' }]} active="area" />)
    expect(el.querySelector('[role="toolbar"]')).not.toBeNull()
  })
})

describe('Crosshair', () => {
  it('خطّان دائمًا', () => {
    const el = mount(<Crosshair point={{ x: 10, y: 20 }} />)
    expect(el.querySelector('.rasd-ov-cross-h')).not.toBeNull()
    expect(el.querySelector('.rasd-ov-cross-v')).not.toBeNull()
  })

  it('بلا عيّنة: لا شارة سداسية', () => {
    const el = mount(<Crosshair point={{ x: 10, y: 20 }} />)
    expect(el.querySelector('[data-rasd-ov-sample]')).toBeNull()
  })

  it('العيّنة تُعرض بأحرف كبيرة وتُمرَّر لونًا للعدسة', () => {
    const el = mount(<Crosshair point={{ x: 10, y: 20 }} sample="#3b82f6" />)
    expect(el.querySelector('[data-rasd-ov-sample]')?.textContent).toBe('#3B82F6')
    const anchor = el.querySelector<HTMLElement>('.rasd-ov-cross-anchor')
    expect(anchor?.style.getPropertyValue('--rasd-ov-sample')).toBe('#3b82f6')
  })

  it('`linesOnly` يُبقي الخطّين ويُسقط العدسة', () => {
    const el = mount(<Crosshair point={{ x: 10, y: 20 }} sample="#fff" linesOnly />)
    expect(el.querySelector('.rasd-ov-cross-h')).not.toBeNull()
    expect(el.querySelector('.rasd-ov-loupe')).toBeNull()
  })
})

describe('FrameBlocked', () => {
  it('يشرح السبب بالعربية في جزيرة RTL', () => {
    const el = mount(<FrameBlocked rect={RECT} />)
    const note = el.querySelector('.rasd-ov-frame-blocked-note')
    expect(note?.className).toContain('rasd-ov-ar')
    expect(note?.textContent).toContain('أصل آخر')
  })

  it('النصّ قابل للتخصيص', () => {
    const el = mount(<FrameBlocked rect={RECT} note="سبب آخر" />)
    expect(el.textContent).toContain('سبب آخر')
  })
})

describe('مفردات الأوضاع', () => {
  it('سبعة أوضاع، `idle` بينها', () => {
    expect(MODES).toHaveLength(7)
    expect(MODES).toContain('idle')
  })

  it('`TOOL_MODES` هي الستّة بلا `idle`', () => {
    expect(TOOL_MODES).toHaveLength(6)
    expect(TOOL_MODES as readonly string[]).not.toContain('idle')
  })

  it('لكل وضع تسمية وأيقونة ومرحلة بناء', () => {
    for (const m of MODES) {
      expect(MODE_META[m].label.length).toBeGreaterThan(0)
      expect(MODE_META[m].icon.length).toBeGreaterThan(0)
      expect(MODE_META[m].builtIn).toBeGreaterThanOrEqual(6)
    }
  })

  it('`isMode` يرفض ما ليس وضعًا', () => {
    expect(isMode('inspect')).toBe(true)
    expect(isMode('nope')).toBe(false)
    expect(isMode(null)).toBe(false)
  })
})
