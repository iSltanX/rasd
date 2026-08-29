import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Default } from '@/pages/popup/views/Default'

/**
 * تنقّل لوحة المفاتيح في `Default` — شبكة الالتقاط وصفّ الفحص أزرار HTML
 * أصيلة (`<button type="button">`) بلا `tabIndex` مُدار يدويًا، فترتيب Tab
 * والتفعيل بـEnter/Space يأتيان من سلوك المتصفح القياسي مجّانًا — لا منطق
 * سهم مخصَّص كما في `Tabs`/`Menu` (انظر `keyboard-nav.test.tsx` الأصلي).
 *
 * ما يستحقّ إثباتًا هنا تحديدًا هو ما **لا** يأتي مجّانًا: أن ترتيب DOM نفسه
 * (لا أي إعادة ترتيب بصري بـCSS) يطابق ترتيب قراءة RTL في Figma، وأنه
 * ثابت بصرف النظر عن اتجاه الحاوية — Tab يتبع DOM لا الاتجاه المرئي.
 */

let container: HTMLDivElement | null = null

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

function mount(direction: 'rtl' | 'ltr', onTool: (tool: string) => void) {
  container = document.createElement('div')
  container.style.direction = direction
  document.body.appendChild(container)
  render(
    <Default
      onTool={onTool}
      recent={[]}
      onOpenRecent={() => undefined}
      onOpenLibrary={() => undefined}
    />,
    container,
  )
  return container
}

function buttonLabels(root: HTMLElement, selector: string): string[] {
  return [...root.querySelectorAll<HTMLButtonElement>(selector)].map(
    (btn) => btn.textContent?.trim() ?? '',
  )
}

/**
 * حرف الاختصار المطبوع على كل بطاقة — بترتيب `13 — Extension Popup` نفسه.
 * `T` لا `F` لبطاقة «منطقة»: Chrome يحجز ⇧⌘F صامتًا — انظر التعليق أعلى
 * `commands` في `manifest.config.ts`.
 */
function shortcutOrder(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[aria-label="الالتقاط"] kbd')].map(
    (el) => el.textContent?.trim() ?? '',
  )
}

describe('Default — ترتيب Tab لشبكة الالتقاط', () => {
  it('ترتيب DOM: E عنصر، T منطقة، S صفحة كاملة، V الظاهر — كما في 13 — Extension Popup', () => {
    mount('rtl', () => undefined)
    expect(shortcutOrder(container!)).toEqual(['E', 'T', 'S', 'V'])
  })

  it('لا يتغيّر بتبديل الاتجاه — Tab يتبع DOM لا CSS', () => {
    mount('ltr', () => undefined)
    const ltrOrder = shortcutOrder(container!)
    render(null, container!)
    mount('rtl', () => undefined)
    const rtlOrder = shortcutOrder(container!)
    expect(rtlOrder).toEqual(ltrOrder)
  })

  it('كل بطاقة زرّ HTML أصيل بلا tabIndex مخصَّص', () => {
    mount('rtl', () => undefined)
    const buttons = [
      ...container!.querySelectorAll<HTMLButtonElement>('[aria-label="الالتقاط"] button'),
    ]
    expect(buttons).toHaveLength(4)
    for (const btn of buttons) {
      expect(btn.tagName).toBe('BUTTON')
      expect(btn.getAttribute('type')).toBe('button')
      expect(btn.hasAttribute('tabindex')).toBe(false)
    }
  })

  it('كل بطاقة تُفعِّل أداتها الصحيحة عند النقر (يعادل تفعيل Enter/Space على زرّ أصيل)', () => {
    const onTool = vi.fn()
    mount('rtl', onTool)
    const buttons = [
      ...container!.querySelectorAll<HTMLButtonElement>('[aria-label="الالتقاط"] button'),
    ]
    const expected = ['element', 'area', 'full-page', 'viewport']
    buttons.forEach((btn, i) => {
      btn.click()
      expect(onTool).toHaveBeenNthCalledWith(i + 1, expected[i])
    })
  })
})

describe('Default — ترتيب Tab لصفّ الفحص', () => {
  it('ترتيب DOM الفعلي: مقارنة، ألوان، قياس، فحص — يطابق Figma لا نصّ الخطة', () => {
    mount('rtl', () => undefined)
    const labels = buttonLabels(container!, '[aria-label="الفحص"] button')
    expect(labels).toEqual(['مقارنة', 'ألوان', 'قياس', 'فحص'])
  })

  it('كل أداة تُفعِّل قيمة Mode الصحيحة عند النقر', () => {
    const onTool = vi.fn()
    mount('rtl', onTool)
    const buttons = [
      ...container!.querySelectorAll<HTMLButtonElement>('[aria-label="الفحص"] button'),
    ]
    const expected = ['compare', 'colour', 'measure', 'inspect']
    buttons.forEach((btn, i) => {
      btn.click()
      expect(onTool).toHaveBeenNthCalledWith(i + 1, expected[i])
    })
  })
})
