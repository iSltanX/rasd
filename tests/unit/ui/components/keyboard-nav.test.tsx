import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { Menu, type MenuSection } from '@/ui/components/Menu/Menu'
import { SegmentedControl } from '@/ui/components/SegmentedControl/SegmentedControl'
import { Tabs } from '@/ui/components/Tabs/Tabs'

/**
 * تنقّل لوحة المفاتيح في `Tabs` و`Segmented Control` — كلاهما يقلب اتجاه
 * الأسهم حسب RTL/LTR عبر فحص كان يقرأ `element.dir` (خاصية العنصر نفسه)
 * بدل الاتجاه المُورَّث من `<html dir="rtl">`. بما أن لا مكوّن يضع `dir`
 * على عنصره الجذر بنفسه، كانت النتيجة عمليًا: لا انعكاس أبدًا — الأسهم
 * تتحرّك بمنطق LTR حتى داخل صفحة RTL كاملة. هذا الاختبار يثبّت الإصلاح:
 * القراءة عبر `getComputedStyle(...).direction`، الذي يتبع التوريث فعليًا.
 */

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(direction: 'rtl' | 'ltr', ui: preact.ComponentChild) {
  container = document.createElement('div')
  // `direction` صراحةً — لا اعتماد على قاعدة UA الضمنية لخاصية `dir`،
  // فـhappy-dom لا يطبّقها. هذا هو بالضبط ما يقرأه الإصلاح فعليًا.
  container.style.direction = direction
  document.body.appendChild(container)
  render(ui, container)
  return container
}

describe('Tabs — عكس اتجاه الأسهم حسب الاتجاه المُورَّث', () => {
  const items = [
    { value: 'a', label: 'أ' },
    { value: 'b', label: 'ب' },
    { value: 'c', label: 'ج' },
  ]

  it('LTR: ArrowRight يتقدّم للتبويب التالي', () => {
    let selected = 0
    mount('ltr', <Tabs items={items} selected={selected} onChange={(i) => (selected = i)} />)
    const list = container!.querySelector('[role="tablist"]') as HTMLElement
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(selected).toBe(1)
  })

  it('RTL: ArrowRight يرجع للتبويب السابق (لا يتقدّم)', () => {
    let selected = 1
    mount('rtl', <Tabs items={items} selected={selected} onChange={(i) => (selected = i)} />)
    const list = container!.querySelector('[role="tablist"]') as HTMLElement
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(selected).toBe(0)
  })

  it('RTL: ArrowLeft يتقدّم للتبويب التالي (معكوس LTR)', () => {
    let selected = 0
    mount('rtl', <Tabs items={items} selected={selected} onChange={(i) => (selected = i)} />)
    const list = container!.querySelector('[role="tablist"]') as HTMLElement
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(selected).toBe(1)
  })

  it('Home/End يذهبان للطرفين بصرف النظر عن الاتجاه', () => {
    let selected = 1
    mount('rtl', <Tabs items={items} selected={selected} onChange={(i) => (selected = i)} />)
    const list = container!.querySelector('[role="tablist"]') as HTMLElement
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(selected).toBe(2)
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(selected).toBe(0)
  })
})

describe('Segmented Control — عكس اتجاه الأسهم حسب الاتجاه المُورَّث', () => {
  const options = [
    { value: 'a', label: 'أ' },
    { value: 'b', label: 'ب' },
    { value: 'c', label: 'ج' },
  ]

  it('LTR: ArrowRight يتقدّم للعنصر التالي', () => {
    let selected = 0
    mount(
      'ltr',
      <SegmentedControl
        options={options}
        selected={selected}
        onChange={(i) => (selected = i)}
        aria-label="اختبار"
      />,
    )
    const group = container!.querySelector('[role="radiogroup"]') as HTMLElement
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(selected).toBe(1)
  })

  it('RTL: ArrowRight يرجع للعنصر السابق (لا يتقدّم)', () => {
    let selected = 1
    mount(
      'rtl',
      <SegmentedControl
        options={options}
        selected={selected}
        onChange={(i) => (selected = i)}
        aria-label="اختبار"
      />,
    )
    const group = container!.querySelector('[role="radiogroup"]') as HTMLElement
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(selected).toBe(0)
  })
})

describe('Menu — أسهم رأسية، تجاوز المعطَّل، Home/End، Esc', () => {
  const sections: MenuSection[] = [
    {
      items: [
        { value: 'a', label: 'نسخ' },
        { value: 'b', label: 'تنزيل', disabled: true },
        { value: 'c', label: 'حذف' },
      ],
    },
  ]

  function activeValue() {
    return (document.activeElement as HTMLElement | null)?.dataset.value
  }

  it('يركِّز أول عنصر مفعَّل عند الفتح', async () => {
    await act(() => {
      mount('ltr', <Menu sections={sections} />)
    })
    expect(activeValue()).toBe('a')
  })

  it('ArrowDown يتجاوز العنصر المعطَّل', async () => {
    await act(() => {
      mount('ltr', <Menu sections={sections} />)
    })
    const list = container!.querySelector('[role="menu"]') as HTMLElement
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(activeValue()).toBe('c')
  })

  it('ArrowUp من الأول يلتفّ إلى الأخير', async () => {
    await act(() => {
      mount('ltr', <Menu sections={sections} />)
    })
    const list = container!.querySelector('[role="menu"]') as HTMLElement
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(activeValue()).toBe('c')
  })

  it('End يذهب للعنصر المفعَّل الأخير، Home للأول', async () => {
    await act(() => {
      mount('ltr', <Menu sections={sections} />)
    })
    const list = container!.querySelector('[role="menu"]') as HTMLElement
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(activeValue()).toBe('c')
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(activeValue()).toBe('a')
  })

  it('Escape يستدعي onClose', async () => {
    let closed = false
    await act(() => {
      mount('ltr', <Menu sections={sections} onClose={() => (closed = true)} />)
    })
    const list = container!.querySelector('[role="menu"]') as HTMLElement
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(closed).toBe(true)
  })
})
