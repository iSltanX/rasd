import { render } from 'preact'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Grid } from '@/pages/library/parts/Grid'

import type { CaptureRecord } from '@/shared/storage/schema'

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: 1_700_000_000_000,
    origin: 'https://example.com',
    url: 'https://example.com/page',
    title: `صفحة ${id}`,
    kind: 'area',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 800,
    height: 600,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
    ...over,
  }
}

/**
 * ينتظر تدفّق آثار Preact الجانبية (`useEffect`) — تُجدوَل عبر
 * `requestAnimationFrame` داخليًا بصرف النظر عن `options.debounceRendering`
 * (ذلك يضبط جدولة **إعادة الرسم** لا تدفّق الآثار). `Grid` يقيس الحاوية
 * ويطلب المصغَّرات داخل `useEffect`، فأي تأكيد متزامن بلا هذا الانتظار يقيس
 * حالةً سابقة للتأثير الأوّل لا نتيجته.
 */
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

let container: HTMLDivElement | null = null
let restoreSize: (() => void) | null = null

/**
 * يُثبِّت `clientWidth`/`clientHeight` على مستوى النموذج الأوّلي (prototype)
 * **قبل** أوّل رسم — لا على عنصر الحاوية بعد إنشائه، كي تقرأ أوّل قراءة
 * داخل `useEffect` القيمة الصحيحة مباشرةً.
 */
function stubViewportSize(width: number, height: number) {
  const widthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  const heightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => height,
  })

  restoreSize = () => {
    if (widthDesc) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDesc)
    if (heightDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDesc)
  }
}

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  restoreSize?.()
  restoreSize = null
})

async function mount(records: CaptureRecord[], width = 1000, height = 600) {
  stubViewportSize(width, height)

  container = document.createElement('div')
  document.body.appendChild(container)

  const onToggleSelect = vi.fn()
  const onOpen = vi.fn()
  const onNeedThumbnail = vi.fn()

  render(
    <Grid
      records={records}
      thumbnailUrls={new Map()}
      onNeedThumbnail={onNeedThumbnail}
      projectNames={{}}
      selection={new Set()}
      onToggleSelect={onToggleSelect}
      onOpen={onOpen}
      now={1_700_000_000_000}
    />,
    container,
  )
  await flush()

  return { root: container, onToggleSelect, onOpen, onNeedThumbnail }
}

describe('Grid', () => {
  it('يعرض القوائم بلا عناصر — لا خطأ ولا بطاقات', async () => {
    const { root } = await mount([])
    expect(root.querySelectorAll('[data-capture-id]')).toHaveLength(0)
  })

  it('عدد قليل من العناصر ضمن نافذة العرض: كلّها تُرسَم', async () => {
    const records = Array.from({ length: 5 }, (_, i) => capture(`c${i}`))
    const { root } = await mount(records)
    expect(root.querySelectorAll('[data-capture-id]')).toHaveLength(5)
  })

  it('5000 عنصر: لا تُرسَم كلّها — التمرير الافتراضي فعليّ لا اسمي', async () => {
    const records = Array.from({ length: 5000 }, (_, i) => capture(`c${i}`))
    const { root } = await mount(records)
    const rendered = root.querySelectorAll('[data-capture-id]').length
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(5000)
  })

  it('النقر على بطاقة يستدعي onOpen بمعرِّفها', async () => {
    const records = [capture('a'), capture('b')]
    const { root, onOpen } = await mount(records)
    const target = root.querySelector('[data-capture-id="b"]')
    expect(target).toBeTruthy()
    ;(target as HTMLButtonElement).click()
    expect(onOpen).toHaveBeenCalledWith('b')
  })

  it('يطلب مصغَّرة لكل عنصر مرئي لم تُحمَّل بعد', async () => {
    const records = [capture('a'), capture('b')]
    const { onNeedThumbnail } = await mount(records)
    expect(onNeedThumbnail).toHaveBeenCalledWith('a')
    expect(onNeedThumbnail).toHaveBeenCalledWith('b')
  })

  it('يستعمل عنوان مصغَّرة موجودًا مسبقًا بلا طلبه ثانيةً', async () => {
    stubViewportSize(1000, 600)
    container = document.createElement('div')
    document.body.appendChild(container)
    const onNeedThumbnail = vi.fn()
    render(
      <Grid
        records={[capture('a')]}
        thumbnailUrls={new Map([['a', 'blob:cached']])}
        onNeedThumbnail={onNeedThumbnail}
        projectNames={{}}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onOpen={vi.fn()}
      />,
      container,
    )
    await flush()
    expect(onNeedThumbnail).not.toHaveBeenCalledWith('a')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:cached')
  })
})
