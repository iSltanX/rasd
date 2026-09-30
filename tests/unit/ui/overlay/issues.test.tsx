import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IssueForm, LogIssueButton } from '@/ui/overlay/issues/IssueForm'
import { MeasurePanel } from '@/ui/overlay/issues/MeasurePanel'
import { IssueBoxes, PageIssues } from '@/ui/overlay/issues/PageIssues'

import { issueFixture } from '../../modules/issues/fixture'

import type { IssueFormModel } from '@/ui/overlay/issues/types'
import type { ComponentChild } from 'preact'

/**
 * واجهات المشكلة في الطبقة — ما تعرضه وما تطلبه، بلا صفحة ولا رسائل.
 */

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(node: ComponentChild): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(node, container)
  return container
}

const MODEL: IssueFormModel = {
  subject: '.cta-btn',
  options: [
    { kind: 'colour', property: 'background-color', label: 'background-color', value: '#3B82F6' },
    { kind: 'contrast', property: 'color/background-color', label: 'التباين', value: '3.68' },
  ],
}

const type = (el: Element | null, value: string) =>
  act(() => {
    ;(el as HTMLInputElement).value = value
    el?.dispatchEvent(new Event('input', { bubbles: true }))
  })

describe('IssueForm', () => {
  const setup = (over: Partial<Parameters<typeof IssueForm>[0]> = {}) => {
    const props = {
      model: MODEL,
      busy: false,
      error: null,
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
      onTyping: vi.fn(),
      ...over,
    }
    const root = mount(<IssueForm {...props} />)
    const q = <T extends Element>(s: string) => root.querySelector<T>(s)
    return { root, props, q }
  }

  it('«سجّل المشكلة» معطَّل حتى يُكتب عنوانٌ ومتوقَّعة، ثمّ يرسل الخيار وقيمه', async () => {
    const { q, props } = setup()
    const submit = q<HTMLButtonElement>('[data-rasd-ov="issue-submit"]')
    expect(submit?.disabled).toBe(true)
    expect(q('output')?.textContent).toBe('#3B82F6')

    await type(q('[data-issue-field="title"]'), 'خلفية الزرّ')
    await type(q('[data-issue-field="expected"]'), '#6D28D9')
    expect(submit?.disabled).toBe(false)

    await act(() => {
      q('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(props.onSubmit).toHaveBeenCalledWith({
      option: MODEL.options[0],
      expected: '#6D28D9',
      tolerance: 0,
      title: 'خلفية الزرّ',
      body: '',
      withNote: true,
    })
  })

  it('السماح بـΔE للّون، والتباين بلا سماح ومتوقَّعته حدٌّ أدنى يُملأ 4.5', async () => {
    const { q } = setup()
    expect(q<HTMLSelectElement>('select')?.options).toHaveLength(2)
    expect(q('[data-rasd-ov="issue-form"]')?.textContent).toContain('ΔE 2')

    await act(() => {
      const select = q<HTMLSelectElement>('select')
      if (select) select.value = '1'
      select?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(q('output')?.textContent).toBe('3.68 : 1')
    expect(q<HTMLInputElement>('[data-issue-field="expected"]')?.value).toBe('4.5')
    expect(q('[data-rasd-ov="issue-form"]')?.textContent).not.toContain('ΔE')
  })

  it('الفشل يعرض سببه ويصير الزرّ «أعد المحاولة»، والانشغال «جارٍ الحفظ»', () => {
    const { q, root } = setup({ error: 'تعذّر الحفظ: المساحة ممتلئة. ما كتبته باقٍ.' })
    expect(q('[data-rasd-ov="issue-error"]')?.textContent).toContain('ما كتبته باقٍ')
    expect(q('[data-rasd-ov="issue-submit"]')?.textContent).toBe('أعد المحاولة')
    render(null, root)
    const busy = setup({ busy: true })
    expect(busy.q('[data-rasd-ov="issue-submit"]')?.textContent).toBe('جارٍ الحفظ')
  })

  it('المفاتيح والنقرات لا تعبر النموذج، والتركيز يُبلَّغ', async () => {
    const { q, props } = setup()
    const outer = vi.fn()
    container?.addEventListener('keydown', outer)
    container?.addEventListener('pointerdown', outer)
    const title = q('[data-issue-field="title"]')
    title?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    title?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(outer).not.toHaveBeenCalled()

    await act(() => {
      title?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    expect(props.onTyping).toHaveBeenCalledWith(true)
    q<HTMLButtonElement>('button[type="button"]')?.click()
    expect(props.onCancel).toHaveBeenCalled()
  })
})

describe('LogIssueButton و MeasurePanel', () => {
  it('الزرّ يعمل، ومعطَّلٌ بسببٍ حين يُعطى', () => {
    const onClick = vi.fn()
    const root = mount(<LogIssueButton onClick={onClick} />)
    root.querySelector<HTMLButtonElement>('[data-rasd-ov="log-issue"]')?.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('لوحة القياس: قبل تثبيت الثاني تعرض سببها وتعطّل الزرّ، وبعده تُمكّنه', () => {
    const onLogIssue = vi.fn()
    let root = mount(<MeasurePanel gap="16px" pinned={false} onLogIssue={onLogIssue} />)
    expect(root.textContent).toContain('16px')
    expect(root.textContent).toContain('⇧')
    expect(root.querySelector<HTMLButtonElement>('[data-rasd-ov="log-issue"]')?.disabled).toBe(true)
    render(null, root)
    root = mount(<MeasurePanel gap="16px" pinned onLogIssue={onLogIssue} />)
    expect(root.textContent).not.toContain('⇧')
    root.querySelector<HTMLButtonElement>('[data-rasd-ov="log-issue"]')?.click()
    expect(onLogIssue).toHaveBeenCalled()
    render(null, root)
    root = mount(<MeasurePanel gap="تداخل" pinned />)
    expect(root.querySelector('[data-rasd-ov="log-issue"]')).toBeNull()
  })
})

describe('PageIssues و IssueBoxes', () => {
  const base = {
    lines: { i1: 'الآن 14px 24px · المتوقَّع 12px 24px' },
    checkedLabel: 'آخر فحص قبل ٣ دقائق',
    page: 'northwind.example/pricing',
    checked: false,
    onRecheck: vi.fn(),
    onOpenLibrary: vi.fn(),
    onClose: vi.fn(),
  }

  it('القائمة: الرقم والعنوان والسطر والحالة، و«آخر فحص»', () => {
    const root = mount(<PageIssues {...base} list={[issueFixture()]} phase="ready" />)
    const item = root.querySelector('[data-rasd-ov="issues-list"] li')
    expect(item?.getAttribute('data-status')).toBe('open')
    expect(item?.textContent).toContain('١')
    expect(item?.textContent).toContain('مفتوحة')
    expect(item?.textContent).toContain('.cta-btn · padding')
    expect(root.querySelector('[data-rasd-ov="issues-status"]')?.textContent).toBe(
      'آخر فحص قبل ٣ دقائق',
    )
    root.querySelector<HTMLButtonElement>('[data-rasd-ov="issues-recheck"]')?.click()
    expect(base.onRecheck).toHaveBeenCalled()
  })

  it('أثناء الجولة سطرٌ واحد وزرٌّ معطَّل، وبعدها عدّ الحالات جملةً', () => {
    let root = mount(<PageIssues {...base} list={[issueFixture()]} phase="rechecking" />)
    expect(root.querySelector('[data-rasd-ov="issues-status"]')?.textContent).toBe('جارٍ الفحص…')
    expect(root.querySelector<HTMLButtonElement>('[data-rasd-ov="issues-recheck"]')?.disabled).toBe(
      true,
    )
    render(null, root)
    const resolved = { ...issueFixture({ id: 'i2' }), status: 'resolved' as const }
    root = mount(<PageIssues {...base} list={[issueFixture(), resolved]} phase="ready" checked />)
    expect(root.querySelector('[data-rasd-ov="issues-status"]')?.textContent).toBe(
      'اكتمل الفحص: ١ مفتوحة · ١ محلولة',
    )
  })

  it('الفارغة بلا زرّ فحص، و«افتح في المكتبة» باقٍ', () => {
    const root = mount(<PageIssues {...base} list={[]} phase="ready" />)
    expect(root.querySelector('[data-rasd-ov="issues-empty"]')).not.toBeNull()
    expect(root.querySelector('[data-rasd-ov="issues-recheck"]')).toBeNull()
    expect(root.textContent).toContain('افتح في المكتبة')
  })

  it('الإطار لما له مستطيل وحده، برقمه ولون حالته', () => {
    const root = mount(
      <IssueBoxes
        list={[issueFixture(), issueFixture({ id: 'i2' })]}
        boxes={new Map([['i2', { x: 10, y: 20, width: 30, height: 40 }]])}
      />,
    )
    const boxes = root.querySelectorAll('[data-rasd-ov="issue-box"]')
    expect(boxes).toHaveLength(1)
    expect(boxes[0]?.textContent).toBe('٢')
    expect(boxes[0]?.getAttribute('data-tone')).toBe('danger')
  })
})
