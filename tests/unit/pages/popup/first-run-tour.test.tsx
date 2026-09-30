/**
 * ترحيبيّة النافذة — «جولة سريعة» تفتح جولة التعريف و«ابدأ» يُتمّ التشغيل الأوّل.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FirstRun } from '@/pages/popup/views/FirstRun'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

describe('FirstRun', () => {
  it('«جولة سريعة» و«ابدأ» يستدعيان كلٌّ مساره', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const onStart = vi.fn()
    const onTour = vi.fn()
    render(<FirstRun onStart={onStart} onTour={onTour} />, container)
    const click = (label: string) =>
      [...container!.querySelectorAll('button')]
        .find((b) => b.textContent?.trim() === label)!
        .click()
    click('جولة سريعة')
    expect(onTour).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
    click('ابدأ')
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
