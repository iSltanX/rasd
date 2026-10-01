/**
 * حبس التركيز في الحوارات المشروطة (`STAGES/24`) — `useFocusTrap`.
 *
 * العلّة المقيسة: `aria-modal="true"` بلا حبس يترك `Tab` يخرج إلى الصفحة خلف الحوار (نافذتا التصدير و«مغادرة بلا
 * حفظ» في المحرّر، وعشرة حوارات غيرهما). والاختبار الأخير يقفل الباب: ملفّ فيه `aria-modal` بلا الخطّاف يُسقطه.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { render } from 'preact'
import { useRef } from 'preact/hooks'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { focusableIn, useFocusTrap } from '@/ui/use-focus-trap'

import type { ComponentChildren } from 'preact'

function Dialog(props: { children: ComponentChildren; id?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  return (
    <div ref={ref} role="dialog" aria-modal="true" id={props.id ?? 'dlg'} tabIndex={-1}>
      {props.children}
    </div>
  )
}

let host: HTMLDivElement | null = null
const cleanup: Array<() => void> = []

afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  host?.remove()
  host = null
})

function mount(ui: ComponentChildren): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  // `act` يفرغ الآثار تزامنيًّا حين يكون نداؤه تزامنيًّا؛ وعدُه المُرجَع لا يُنتظَر.
  void act(() => {
    render(ui, host!)
  })
  cleanup.push(() => {
    void act(() => {
      render(null, host!)
    })
  })
  return host
}

function tab(shift = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
  return event
}

const flush = () => Promise.resolve()

describe('useFocusTrap', () => {
  it('Tab من آخر عنصرٍ إلى أوّله، وShift+Tab من أوّله إلى آخره', async () => {
    const root = mount(
      <Dialog>
        <button id="a">أ</button>
        <input id="b" />
        <button id="c">ج</button>
      </Dialog>,
    )
    await flush()
    const [a, , c] = [...root.querySelectorAll<HTMLElement>('button, input')] as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ]
    c.focus()
    expect(tab().defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(a)
    expect(tab(true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(c)
  })

  it('في الوسط لا يتدخّل: المتصفّح يتولّى', async () => {
    const root = mount(
      <Dialog>
        <button id="a">أ</button>
        <button id="b">ب</button>
        <button id="c">ج</button>
      </Dialog>,
    )
    await flush()
    root.querySelector<HTMLElement>('#b')!.focus()
    expect(tab().defaultPrevented).toBe(false)
    expect(tab(true).defaultPrevented).toBe(false)
  })

  it('تركيزٌ خارج الحوار (حاجب) يعود إلى أوّل عنصر، وShift+Tab إلى آخره', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    cleanup.push(() => outside.remove())
    const root = mount(
      <Dialog>
        <button id="a">أ</button>
        <button id="b">ب</button>
      </Dialog>,
    )
    await flush()
    outside.focus()
    tab()
    expect(document.activeElement).toBe(root.querySelector('#a'))
    outside.focus()
    tab(true)
    expect(document.activeElement).toBe(root.querySelector('#b'))
  })

  it('حوارٌ بلا عنصرٍ قابل للتركيز يُبقي التركيز عليه هو', async () => {
    const root = mount(<Dialog>نصٌّ فقط</Dialog>)
    await flush()
    expect(tab().defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(root.querySelector('#dlg'))
  })

  it('المخفيّ والمعطَّل لا يُحسبان محطّات', async () => {
    const root = mount(
      <Dialog>
        <button id="a">أ</button>
        <button id="off" disabled>
          معطَّل
        </button>
        <div hidden>
          <button id="hidden">مخفيّ</button>
        </div>
        <button id="shown" style={{ display: 'none' }}>
          بلا عرض
        </button>
        <button id="z">ز</button>
      </Dialog>,
    )
    await flush()
    const ids = focusableIn(root.querySelector<HTMLElement>('#dlg')!).map((el) => el.id)
    expect(ids).toEqual(['a', 'z'])
    root.querySelector<HTMLElement>('#z')!.focus()
    tab()
    expect(document.activeElement).toBe(root.querySelector('#a'))
  })

  it('حوارٌ فوق حوار: الأعلى وحده يحكم', async () => {
    const root = mount(
      <div>
        <Dialog id="outer">
          <button id="o1">١</button>
          <button id="o2">٢</button>
        </Dialog>
        <Dialog id="inner">
          <button id="i1">أ</button>
          <button id="i2">ب</button>
        </Dialog>
      </div>,
    )
    await flush()
    root.querySelector<HTMLElement>('#i2')!.focus()
    tab()
    // لو حكم الخارجيّ أيضًا لخطف التركيز إلى «١» لأن التركيز خارجه
    expect(document.activeElement).toBe(root.querySelector('#i1'))
  })

  it('عند الإغلاق يعود التركيز إلى ما كان عليه قبل الفتح', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'افتح'
    document.body.appendChild(opener)
    cleanup.push(() => opener.remove())
    opener.focus()
    const root = mount(
      <Dialog>
        <button id="a">أ</button>
      </Dialog>,
    )
    await flush()
    root.querySelector<HTMLElement>('#a')!.focus()
    expect(document.activeElement).not.toBe(opener)
    void act(() => {
      render(null, root)
    })
    await flush()
    expect(document.activeElement).toBe(opener)
  })

  it('زرّ الفتح الذي زال من الصفحة لا يكسر الإغلاق', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const root = mount(
      <Dialog>
        <button id="a">أ</button>
      </Dialog>,
    )
    await flush()
    opener.remove()
    expect(() => act(() => render(null, root))).not.toThrow()
  })

  it('بعد الإغلاق لا يبقى مستمعٌ يخطف Tab', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    cleanup.push(() => outside.remove())
    const root = mount(
      <Dialog>
        <button id="a">أ</button>
      </Dialog>,
    )
    await flush()
    void act(() => {
      render(null, root)
    })
    await flush()
    outside.focus()
    expect(tab().defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(outside)
  })
})

describe('كل حوارٍ مشروط يحبس التركيز', () => {
  const SRC = join(__dirname, '..', '..', '..', 'src')
  const tsx = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return tsx(path)
      return name.endsWith('.tsx') ? [path] : []
    })
  const modal = tsx(SRC).filter((p) => readFileSync(p, 'utf8').includes('aria-modal="true"'))

  it('الحوارات المشروطة معدودة — لا يمرّ الاختبار على قائمة فارغة', () => {
    expect(modal.length).toBeGreaterThanOrEqual(14)
  })

  it.each(modal.map((p) => relative(SRC, p)))('%s يستدعي useFocusTrap', (file) => {
    expect(readFileSync(join(SRC, file), 'utf8')).toContain('useFocusTrap(')
  })
})
