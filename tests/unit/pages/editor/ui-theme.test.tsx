/**
 * ألوان واجهة المحرّر فوق القماش (التحديد والمقابض وحدّ الحجب) تتبع السمة الفعّالة — `colors.ts`
 * يقول ذلك، و`Editor.tsx` كان يثبّتها داكنة: في الوضع الفاتح مقابض داكنة وتحديد بدرجة الداكن
 * (لقطة `editor / annotating` الفاتحة، `STAGES/04`). ألوان التعليق نفسها مثبَّتة عمدًا — تُخبَز.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildRenderStyle } from '@/pages/editor/colors'
import { useUiTheme } from '@/pages/editor/use-ui-theme'
import { resolveColor } from '@/tokens/tokens'

let container: HTMLDivElement | null = null
const listeners = new Set<() => void>()
let systemLight = false

function stubSystem(light: boolean) {
  systemLight = light
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('light') && systemLight
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }))
}

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  document.documentElement.removeAttribute('data-theme')
  listeners.clear()
  vi.unstubAllGlobals()
})

const flush = () => new Promise((r) => setTimeout(r, 0))

function Probe() {
  return <i data-theme-probe={useUiTheme()} />
}

function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<Probe />, container)
  return () => container!.querySelector('[data-theme-probe]')!.getAttribute('data-theme-probe')
}

describe('useUiTheme — سمة الواجهة الفعّالة', () => {
  it('تتبع اختيار المستخدم الصريح حين يتغيّر', async () => {
    stubSystem(false)
    document.documentElement.setAttribute('data-theme', 'dark')
    const theme = mount()
    expect(theme()).toBe('dark')
    document.documentElement.setAttribute('data-theme', 'light')
    await flush()
    expect(theme()).toBe('light')
  })

  it('بلا اختيار صريح تتبع تفضيل النظام حين يتغيّر', async () => {
    stubSystem(true)
    const theme = mount()
    expect(theme()).toBe('light')
    systemLight = false
    for (const fn of listeners) fn()
    await flush()
    expect(theme()).toBe('dark')
  })
})

describe('buildRenderStyle — الواجهة تتبع، والتعليق مثبَّت', () => {
  it('الفاتح يغيّر المقابض والتحديد ولا يغيّر لوحة التعليق', () => {
    const dark = buildRenderStyle('dark')
    const light = buildRenderStyle('light')
    expect(light.handleHex).toBe(resolveColor('surface/inverse', 'light'))
    expect(light.handleHex).not.toBe(dark.handleHex)
    expect(light.palette).toEqual(dark.palette)
  })
})
