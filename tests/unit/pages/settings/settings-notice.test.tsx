/**
 * إشعار الحفظ بسطرين كما في `settings / saved` و`save-error` (`319:12812` · `319:12777`): ما حدث
 * عريضًا، ثمّ أثره أخفّ تحته — كان سطرًا عريضًا واحدًا يجمعهما بشرطة.
 */
import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsNotice } from '@/pages/settings/Settings'

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(ui: preact.ComponentChild): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(ui, container)
  return container
}

const lines = (root: HTMLElement) => {
  const status = root.querySelector('[role="status"], [role="alert"]')!
  const [title, detail] = [...status.querySelectorAll('span > span')].map((el) => el.textContent)
  return { title, detail }
}

describe('SettingsNotice — سطران', () => {
  it('الحفظ: «حُفظ الإعداد» ثمّ أثره', () => {
    const root = mount(
      <SettingsNotice notice={{ tone: 'success' }} onRetry={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(lines(root)).toEqual({
      title: 'حُفظ الإعداد',
      detail: 'يسري على كل صفحات رصد المفتوحة.',
    })
  })

  it('نجاح بنصّه — إضافة موقع مستثنى', () => {
    const root = mount(
      <SettingsNotice
        notice={{ tone: 'success', title: 'أُضيف الموقع', detail: 'رصد لا يعمل فيه بعد الآن.' }}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(lines(root)).toEqual({ title: 'أُضيف الموقع', detail: 'رصد لا يعمل فيه بعد الآن.' })
  })

  it('الفشل: «تعذّر حفظ الإعداد» ثمّ أن شيئًا لم يتغيّر، و«أعد المحاولة» تعيد العملية', () => {
    const onRetry = vi.fn()
    const root = mount(
      <SettingsNotice
        notice={{ tone: 'danger', retry: vi.fn() }}
        onRetry={onRetry}
        onDismiss={vi.fn()}
      />,
    )
    expect(lines(root)).toEqual({
      title: 'تعذّر حفظ الإعداد',
      detail: 'لم يتغيّر شيء، والقيمة السابقة باقية.',
    })
    const retry = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'أعد المحاولة',
    )!
    retry.click()
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
