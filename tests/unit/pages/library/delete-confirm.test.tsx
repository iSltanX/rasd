import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CAPTURE_FORMS, DeleteConfirm, ITEM_FORMS } from '@/pages/library/parts/DeleteConfirm'

import type { CountForms } from '@/shared/bidi/numerals'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

async function mount(count: number, forms: CountForms = CAPTURE_FORMS) {
  container = document.createElement('div')
  document.body.appendChild(container)
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <DeleteConfirm
      count={count}
      forms={forms}
      note="تُحذف نهائيًّا."
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
    container,
  )
  // مستمع لوحة المفاتيح والتركيز في `useEffect` — Preact يؤجّله إلى ما بعد الإطار.
  await new Promise((r) => setTimeout(r, 40))
  const root = container
  const dialog = root.querySelector('[role="alertdialog"]') as HTMLElement
  const cancel = root.querySelector('[data-rasd-cancel="delete"]') as HTMLButtonElement
  const confirm = root.querySelector('[data-rasd-confirm="delete"]') as HTMLButtonElement
  return { root, dialog, cancel, confirm, onConfirm, onCancel }
}

const key = (k: string, shiftKey = false) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }))

describe('DeleteConfirm — `library / delete-confirm`', () => {
  it('العنوان بقاعدة العدد العربية، والحوار معنون وموصوف', async () => {
    const { dialog } = await mount(3)
    expect(dialog.querySelector('h2')?.textContent).toBe('حذف ٣ لقطات')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(
      document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('تُحذف نهائيًّا.')
  })

  it('المعدود يتبع العدد: لقطة واحدة · لقطتين · ١١ لقطة · ١٢ عنصرًا', async () => {
    const titles: string[] = []
    for (const [n, forms] of [
      [1, CAPTURE_FORMS],
      [2, CAPTURE_FORMS],
      [11, CAPTURE_FORMS],
      [12, ITEM_FORMS],
    ] as const) {
      const { dialog } = await mount(n, forms)
      titles.push(dialog.querySelector('h2')?.textContent ?? '')
      render(null, container!)
    }
    expect(titles).toEqual(['حذف لقطة واحدة', 'حذف لقطتين', 'حذف ١١ لقطة', 'حذف ١٢ عنصرًا'])
  })

  it('التركيز يبدأ على «ألغِ» لا على «احذف»', async () => {
    const { cancel } = await mount(3)
    expect(document.activeElement).toBe(cancel)
  })

  it('«احذف» يؤكّد، و«ألغِ» و«×» والغشاء وEsc تلغي', async () => {
    const m = await mount(3)
    m.confirm.click()
    expect(m.onConfirm).toHaveBeenCalledTimes(1)

    m.cancel.click()
    ;(m.root.querySelector('[aria-label="أغلق"]') as HTMLButtonElement).click()
    ;(m.root.firstElementChild as HTMLElement).click()
    key('Escape')
    expect(m.onCancel).toHaveBeenCalledTimes(4)
    expect(m.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('النقر داخل الحوار لا يلغي', async () => {
    const m = await mount(3)
    m.dialog.click()
    expect(m.onCancel).not.toHaveBeenCalled()
  })

  it('Tab يدور داخل الحوار في الاتجاهين', async () => {
    const m = await mount(3)
    const buttons = [...m.dialog.querySelectorAll('button')]
    const first = buttons[0] as HTMLButtonElement
    const last = buttons[buttons.length - 1] as HTMLButtonElement
    last.focus()
    key('Tab')
    expect(document.activeElement).toBe(first)
    key('Tab', true)
    expect(document.activeElement).toBe(last)
  })
})
