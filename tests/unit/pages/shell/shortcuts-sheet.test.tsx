/**
 * ورقة الاختصارات — `shortcuts / sheet` (`292:1691`): زرّ تغيير الاختصارات ثانويّ بأيقونة لوحة
 * المفاتيح في طرف ذيل الورقة، لا شريط بعرضها كلّه بلا أيقونة.
 */
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ShortcutsSheet } from '@/pages/shell/ShortcutsSheet'

let container: HTMLDivElement | null = null

beforeEach(() => {
  Object.assign(globalThis.chrome, {
    commands: { getAll: vi.fn().mockResolvedValue([]) },
  })
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

describe('ShortcutsSheet — زرّ التغيير', () => {
  it('يحمل أيقونة لوحة المفاتيح قبل نصّه', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<ShortcutsSheet onClose={vi.fn()} />, container)
    const change = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('غيّر اختصارات الالتقاط'),
    )!
    const icon = change.querySelector('svg.rasd-icon')
    expect(icon).not.toBeNull()
    // أوّل ما في الزرّ ترتيبًا: الأيقونة في بداية السطر (يمينًا في RTL) كما في الإطار.
    expect(icon?.nextElementSibling?.textContent).toBe('غيّر اختصارات الالتقاط')
  })
})
