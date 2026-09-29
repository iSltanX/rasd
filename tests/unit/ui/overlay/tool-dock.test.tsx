import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DOCK_BOTTOM_PX, DOCK_MODES, ToolDock } from '@/content/overlay-app'

import type { CoordSpace } from '@/shared/geometry'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

const SPACE = {
  scrollX: 0,
  scrollY: 0,
  layoutWidth: 1280,
  layoutHeight: 800,
  pageWidth: 1280,
  pageHeight: 2000,
  dpr: 1,
  rtl: true,
} as unknown as CoordSpace

function mount(mode: Parameters<typeof ToolDock>[0]['mode'], onSwitchMode = vi.fn()) {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<ToolDock mode={mode} space={SPACE} onSwitchMode={onSwitchMode} />, container)
  return { root: container, onSwitchMode }
}

describe('ToolDock — الشريط العائم للأدوات', () => {
  it('لا شيء في الخمول', () => {
    const { root } = mount('idle')
    expect(root.innerHTML).toBe('')
  })

  it('الأدوات الستّ بترتيب القراءة ثمّ الإغلاق، والنشطة مضغوطة', () => {
    const { root } = mount('measure')
    const buttons = [...root.querySelectorAll('button')]
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'تصوير منطقة',
      'تصوير عنصر',
      'فحص',
      'قياس',
      'لون',
      'مقارنة',
      'إغلاق رصد',
    ])
    expect(DOCK_MODES).toHaveLength(6)
    const pressed = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed.map((b) => b.getAttribute('aria-label'))).toEqual(['قياس'])
  })

  it('النقر يبدّل الأداة، والإغلاق يعود إلى الخمول', () => {
    const { root, onSwitchMode } = mount('inspect')
    ;(root.querySelector('[aria-label="لون"]') as HTMLButtonElement).click()
    expect(onSwitchMode).toHaveBeenLastCalledWith('colour')
    ;(root.querySelector('[aria-label="إغلاق رصد"]') as HTMLButtonElement).click()
    expect(onSwitchMode).toHaveBeenLastCalledWith('idle')
  })

  it('مرساته منتصف الحافّة السفلى: منتصف العرض وعلى بُعد الإطار من الأسفل', () => {
    const { root } = mount('area')
    const place = root.querySelector('[data-rasd-ov="toolbar"]') as HTMLElement
    expect(place.getAttribute('data-anchor')).toBe('bottom-center')
    expect(place.style.getPropertyValue('--rasd-ov-x')).toBe('640px')
    expect(DOCK_BOTTOM_PX).toBe(40)
    expect(place.style.getPropertyValue('--rasd-ov-y')).toBe(`${800 - DOCK_BOTTOM_PX}px`)
  })
})
