import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SelectionBar, type LibraryViewMode } from '@/pages/library/parts/SelectionBar'

import type { ProjectRecord } from '@/shared/storage/schema'

let container: HTMLDivElement | null = null
/** happy-dom لا يعرِّف `window.confirm` أصلًا — لا شيء لـ`vi.spyOn` ليستبدله، فنُسنِده مباشرةً. */
const originalConfirm: typeof window.confirm = window.confirm?.bind(window)

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  window.confirm = originalConfirm
})

function mount(viewMode: LibraryViewMode, projects: readonly ProjectRecord[] = []) {
  container = document.createElement('div')
  document.body.appendChild(container)

  const handlers = {
    onFavorite: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onTrash: vi.fn(),
    onRestore: vi.fn(),
    onPurge: vi.fn(),
    onMoveToProject: vi.fn(),
    onAddTag: vi.fn(),
    onClear: vi.fn(),
  }

  render(
    <SelectionBar count={3} viewMode={viewMode} projects={projects} {...handlers} />,
    container,
  )

  return { root: container, ...handlers }
}

describe('SelectionBar — وضع live', () => {
  it('يعرض تفضيل وأرشفة ومهملات ووسمًا — لا استعادة ولا حذفًا نهائيًا', () => {
    const { root } = mount('live')
    expect(root.querySelector('[aria-label="تفضيل المحدَّد"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="أرشفة المحدَّد"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="نقل المحدَّد إلى المهملات"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="استعادة المحدَّد"]')).toBeFalsy()
    expect(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]')).toBeFalsy()
  })

  it('نموذج الوسم يستدعي onAddTag بالقيمة المُدخَلة ويُفرِغ الحقل', () => {
    const { root, onAddTag } = mount('live')
    const input = root.querySelector('input[name="tag"]') as HTMLInputElement
    input.value = 'خطأ بصري'
    const form = input.closest('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(onAddTag).toHaveBeenCalledWith('خطأ بصري')
    expect(input.value).toBe('')
  })

  it('وسم فارغ لا يستدعي onAddTag', () => {
    const { root, onAddTag } = mount('live')
    const form = root.querySelector('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(onAddTag).not.toHaveBeenCalled()
  })
})

describe('SelectionBar — وضع archived', () => {
  it('يعرض استعادة من الأرشيف بدل أرشفة', () => {
    const { root } = mount('archived')
    expect(root.querySelector('[aria-label="استعادة المحدَّد من الأرشيف"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="أرشفة المحدَّد"]')).toBeFalsy()
  })

  it('يستدعي onUnarchive عند النقر', () => {
    const { root, onUnarchive } = mount('archived')
    ;(root.querySelector('[aria-label="استعادة المحدَّد من الأرشيف"]') as HTMLButtonElement).click()
    expect(onUnarchive).toHaveBeenCalled()
  })
})

describe('SelectionBar — وضع trashed', () => {
  it('يعرض استعادة وحذفًا نهائيًا فقط — لا تفضيل ولا أرشفة ولا وسم', () => {
    const { root } = mount('trashed')
    expect(root.querySelector('[aria-label="استعادة المحدَّد"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]')).toBeTruthy()
    expect(root.querySelector('[aria-label="تفضيل المحدَّد"]')).toBeFalsy()
    expect(root.querySelector('input[name="tag"]')).toBeFalsy()
  })

  it('استعادة تستدعي onRestore مباشرة بلا تأكيد', () => {
    const { root, onRestore } = mount('trashed')
    ;(root.querySelector('[aria-label="استعادة المحدَّد"]') as HTMLButtonElement).click()
    expect(onRestore).toHaveBeenCalled()
  })

  it('الحذف النهائي يطلب تأكيدًا — القبول يستدعي onPurge', () => {
    const confirmFn = vi.fn(() => true)
    window.confirm = confirmFn
    const { root, onPurge } = mount('trashed')
    ;(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]') as HTMLButtonElement).click()
    expect(confirmFn).toHaveBeenCalled()
    expect(onPurge).toHaveBeenCalled()
  })

  it('رفض التأكيد لا يستدعي onPurge', () => {
    window.confirm = vi.fn(() => false)
    const { root, onPurge } = mount('trashed')
    ;(root.querySelector('[aria-label="حذف المحدَّد نهائيًا"]') as HTMLButtonElement).click()
    expect(onPurge).not.toHaveBeenCalled()
  })
})

describe('SelectionBar — الإلغاء والعدّاد', () => {
  it('العدّاد هندي', () => {
    const { root } = mount('live')
    expect(root.textContent).toContain('٣ محدَّدة')
  })

  it('زرّ الإلغاء يستدعي onClear في كل الأوضاع', () => {
    const { root, onClear } = mount('trashed')
    ;(root.querySelector('[aria-label="إلغاء التحديد"]') as HTMLButtonElement).click()
    expect(onClear).toHaveBeenCalled()
  })
})
