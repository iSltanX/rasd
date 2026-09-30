import { render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'

import { IconButton } from '@/ui/components/IconButton/IconButton'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

/** مقاس الأيقونة داخل كل مقاس زرّ — من مكوّن `Icon Button` (`45:122`): S ← 16 · M ← 20 · L ← 20. */
describe('IconButton — مقاس الأيقونة من إطار المكوّن', () => {
  it.each([
    ['s', 'rasd-icon-sm'],
    ['m', 'rasd-icon-md'],
    ['l', 'rasd-icon-md'],
  ] as const)('%s ← %s', (size, iconClass) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <IconButton icon="settings" aria-label="الإعدادات" size={size} onClick={() => undefined} />,
      container,
    )
    expect(container.querySelector('svg')?.classList.contains(iconClass)).toBe(true)
  })
})
