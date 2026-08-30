import { options, render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectsPanel } from '@/pages/library/parts/ProjectsPanel'
import { PROJECT_COLORS } from '@/pages/library/project-colors'

import type { ProjectRecord } from '@/shared/storage/schema'

/** تصيير متزامن — لا آثار جانبية هنا تحديدًا، لكن يوحِّد سلوك الملفّ مع أخواته. */
options.debounceRendering = (cb) => {
  cb()
}

function project(id: string, over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id,
    name: `مشروع ${id}`,
    color: PROJECT_COLORS[0]!.value,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(list: ProjectRecord[] = []) {
  container = document.createElement('div')
  document.body.appendChild(container)

  const onCreate = vi.fn()
  const onRename = vi.fn()
  const onSetColor = vi.fn()
  const onDelete = vi.fn()
  const onClose = vi.fn()

  render(
    <ProjectsPanel
      projects={list}
      onCreate={onCreate}
      onRename={onRename}
      onSetColor={onSetColor}
      onDelete={onDelete}
      onClose={onClose}
    />,
    container,
  )

  return { root: container, onCreate, onRename, onSetColor, onDelete, onClose }
}

describe('ProjectsPanel — حالة فارغة', () => {
  it('لا مشاريع ⇒ رسالة فراغ لا قائمة', () => {
    const { root } = mount([])
    expect(root.textContent).toContain('لا مشاريع بعد')
    expect(root.querySelectorAll('[data-project-id]')).toHaveLength(0)
  })
})

describe('ProjectsPanel — الإنشاء', () => {
  it('اسم فارغ لا يستدعي onCreate', () => {
    const { root, onCreate } = mount([])
    const form = root.querySelector('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('اسم صالح ولون مختار يستدعيان onCreate بهما معًا', () => {
    const { root, onCreate } = mount([])
    const input = root.querySelector('input[aria-label="اسم المشروع الجديد"]') as HTMLInputElement
    input.value = 'مشروع تجريبي'
    input.dispatchEvent(new Event('input'))

    const secondSwatch = root.querySelectorAll(
      '[aria-label="لون المشروع الجديد"] [role="radio"]',
    )[2] as HTMLElement
    secondSwatch.click()

    const form = root.querySelector('form') as HTMLFormElement
    form.dispatchEvent(new Event('submit', { cancelable: true }))

    expect(onCreate).toHaveBeenCalledWith('مشروع تجريبي', PROJECT_COLORS[2]!.value)
  })
})

describe('ProjectsPanel — التحرير', () => {
  it('يعرض الاسم واللون الحاليَّين، ويستدعي onRename/onSetColor عند التغيير والحفظ', () => {
    const p = project('a', { name: 'قديم', color: PROJECT_COLORS[0]!.value })
    const { root, onRename, onSetColor } = mount([p])

    const editButton = root.querySelector('[aria-label="تعديل مشروع قديم"]') as HTMLButtonElement
    editButton.click()

    const nameInput = root.querySelector('input[aria-label="إعادة تسمية قديم"]') as HTMLInputElement
    nameInput.value = 'جديد'
    nameInput.dispatchEvent(new Event('input'))

    const newSwatch = root.querySelectorAll(
      '[aria-label="لون مشروع قديم"] [role="radio"]',
    )[3] as HTMLElement
    newSwatch.click()

    const saveButton = root.querySelector('[aria-label="حفظ"]') as HTMLButtonElement
    saveButton.click()

    expect(onRename).toHaveBeenCalledWith('a', 'جديد')
    expect(onSetColor).toHaveBeenCalledWith('a', PROJECT_COLORS[3]!.value)
  })

  it('لا تغيير فعلي ⇒ لا استدعاء لأي من الدالّتين', () => {
    const p = project('a', { name: 'ثابت', color: PROJECT_COLORS[0]!.value })
    const { root, onRename, onSetColor } = mount([p])

    const editButton = root.querySelector('[aria-label="تعديل مشروع ثابت"]') as HTMLButtonElement
    editButton.click()
    const saveButton = root.querySelector('[aria-label="حفظ"]') as HTMLButtonElement
    saveButton.click()

    expect(onRename).not.toHaveBeenCalled()
    expect(onSetColor).not.toHaveBeenCalled()
  })
})

describe('ProjectsPanel — الحذف مع نقل المحتوى', () => {
  it('التأكيد الافتراضي ينقل إلى «بلا مشروع»', () => {
    const p = project('a', { name: 'يُحذَف' })
    const { root, onDelete } = mount([p])

    const deleteButton = root.querySelector('[aria-label="حذف مشروع يُحذَف"]') as HTMLButtonElement
    deleteButton.click()

    const buttons = [...root.querySelectorAll('[aria-label="تأكيد حذف يُحذَف"] button')]
    const confirm = buttons.find((b) =>
      b.textContent?.includes('احذف نهائيًا'),
    ) as HTMLButtonElement
    confirm.click()

    expect(onDelete).toHaveBeenCalledWith('a', null)
  })

  it('اختيار مشروع هدف قبل التأكيد ينقل إليه لا إلى null', () => {
    const target = project('target', { name: 'وجهة' })
    const source = project('a', { name: 'يُحذَف' })
    const { root, onDelete } = mount([source, target])

    const deleteButton = root.querySelector('[aria-label="حذف مشروع يُحذَف"]') as HTMLButtonElement
    deleteButton.click()

    const select = root.querySelector('[aria-label="تأكيد حذف يُحذَف"] select') as HTMLSelectElement
    select.value = 'target'
    select.dispatchEvent(new Event('change'))

    const buttons = [...root.querySelectorAll('[aria-label="تأكيد حذف يُحذَف"] button')]
    const confirm = buttons.find((b) =>
      b.textContent?.includes('احذف نهائيًا'),
    ) as HTMLButtonElement
    confirm.click()

    expect(onDelete).toHaveBeenCalledWith('a', 'target')
  })

  it('لا تظهر المشروع نفسه ضمن خيارات وجهة النقل', () => {
    const p = project('a', { name: 'وحيد' })
    const { root } = mount([p])
    const deleteButton = root.querySelector('[aria-label="حذف مشروع وحيد"]') as HTMLButtonElement
    deleteButton.click()

    const select = root.querySelector('[aria-label="تأكيد حذف وحيد"] select') as HTMLSelectElement
    const values = [...select.options].map((o) => o.value)
    expect(values).not.toContain('a')
  })

  it('التراجع يُخفي صفّ التأكيد بلا استدعاء onDelete', () => {
    const p = project('a', { name: 'يُحذَف' })
    const { root, onDelete } = mount([p])
    const deleteButton = root.querySelector('[aria-label="حذف مشروع يُحذَف"]') as HTMLButtonElement
    deleteButton.click()

    const buttons = [...root.querySelectorAll('[aria-label="تأكيد حذف يُحذَف"] button')]
    const cancel = buttons.find((b) => b.textContent?.includes('تراجع')) as HTMLButtonElement
    cancel.click()

    expect(onDelete).not.toHaveBeenCalled()
    expect(root.querySelector('[aria-label="تأكيد حذف يُحذَف"]')).toBeFalsy()
  })
})

describe('ProjectsPanel — الإغلاق', () => {
  it('زرّ الإغلاق يستدعي onClose', () => {
    const { root, onClose } = mount([])
    const closeButton = root.querySelector(
      '[aria-label="إغلاق لوحة المشاريع"]',
    ) as HTMLButtonElement
    closeButton.click()
    expect(onClose).toHaveBeenCalled()
  })
})
