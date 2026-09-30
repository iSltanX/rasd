import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Library } from '@/pages/library/Library'
import { GuidePage } from '@/pages/library/parts/GuidePage'
import { searchFor, viewFromSearch, viewId } from '@/pages/shell/library-views'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { captures, guides } from '@/shared/storage/repository'

import type { CaptureRecord, GuideRecord } from '@/shared/storage/schema'

/**
 * صفحة الدليل (`library / guide` و`guide / editor`) — التحرير في المكان يُحفظ، والترتيب بالأزرار يُحفظ،
 * والإنشاء من تحديد المكتبة يفتح الدليل الجديد.
 */

const NOW = 1_780_000_000_000

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://shop.example',
    url: `https://shop.example/${id}`,
    title: `صفحة ${id}`,
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 1440,
    height: 900,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
    ...over,
  }
}

const GUIDE: GuideRecord = {
  id: 'g1',
  title: 'كيف تُبلّغ عن خطأ بصري',
  projectId: null,
  captureIds: ['a', 'b', 'c'],
  createdAt: NOW,
  stepText: { a: { title: 'افتح الصفحة', note: 'اضغط الاختصار.' } },
  updatedAt: NOW,
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000) {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error('انتهت مهلة الانتظار')
    await flush()
  }
}

async function stored(): Promise<GuideRecord> {
  const found = await guides.get('g1')
  if (!found.ok) throw new Error('لا دليل')
  return found.value
}

let container: HTMLDivElement
let back = 0

beforeEach(async () => {
  history.replaceState(null, '', '/')
  back = 0
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await flush()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  render(null, container)
  container.remove()
})

async function mountGuide(): Promise<void> {
  await captures.putMany([capture('a'), capture('b'), capture('c', { title: 'السلّة' })])
  await guides.put(GUIDE)
  render(<GuidePage id="g1" onBack={() => (back += 1)} />, container)
  await waitFor(() => container.querySelectorAll('[data-guide-step]').length === 3)
}

const steps = () =>
  [...container.querySelectorAll('[data-guide-step]')].map((el) =>
    el.getAttribute('data-guide-step'),
  )

describe('صفحة الدليل', () => {
  it('العنوان والعدّ الهندي، وكل خطوة برقمها ونصّها، والفارغ بعنوان لقطته بديلًا', async () => {
    await mountGuide()
    expect(container.querySelector<HTMLInputElement>('[data-guide-title]')?.value).toBe(GUIDE.title)
    expect(container.textContent).toContain('٣ خطوات')
    const titles = [...container.querySelectorAll<HTMLInputElement>('[data-guide-step-title]')]
    expect(titles.map((t) => [t.value, t.placeholder])).toEqual([
      ['افتح الصفحة', 'صفحة a'],
      ['', 'صفحة b'],
      ['', 'السلّة'],
    ])
    expect(titles[0]?.getAttribute('aria-label')).toBe('عنوان الخطوة ١')
  })

  it('تحرير العنوان والملاحظة يُحفظ حين يغادر التركيز', async () => {
    await mountGuide()
    const title = container.querySelector<HTMLInputElement>('[data-guide-title]')!
    title.value = 'دليل الإبلاغ'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    const note = container.querySelectorAll<HTMLTextAreaElement>('[data-guide-step-note]')[1]!
    note.value = 'مرّر حتى يبرز العنصر.'
    note.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    note.dispatchEvent(new FocusEvent('blur'))
    await waitFor(async () => (await stored()).title === 'دليل الإبلاغ')
    const saved = await stored()
    expect(saved.stepText.b).toEqual({ title: '', note: 'مرّر حتى يبرز العنصر.' })
    expect(saved.stepText.a).toEqual(GUIDE.stepText.a)
  })

  it('«انقل إلى أسفل» و«أزل» يُحفظان فورًا بالترتيب المعروض — واللقطة المُزالة باقية في المكتبة', async () => {
    await mountGuide()
    container.querySelector<HTMLButtonElement>('[aria-label="انقل الخطوة ١ إلى أسفل"]')?.click()
    await waitFor(async () => (await stored()).captureIds[0] === 'b')
    expect(steps()).toEqual(['b', 'a', 'c'])
    expect((await stored()).captureIds).toEqual(['b', 'a', 'c'])

    container.querySelector<HTMLButtonElement>('[aria-label="أزل الخطوة ٣ من الدليل"]')?.click()
    await waitFor(async () => (await stored()).captureIds.length === 2)
    expect(steps()).toEqual(['b', 'a'])
    expect((await captures.get('c')).ok).toBe(true)
  })

  it('أوّل خطوة لا تصعد وآخرها لا تنزل — زرّان معطَّلان لا صامتان', async () => {
    await mountGuide()
    const up = container.querySelector<HTMLButtonElement>('[aria-label="انقل الخطوة ١ إلى أعلى"]')
    const down = container.querySelector<HTMLButtonElement>('[aria-label="انقل الخطوة ٣ إلى أسفل"]')
    expect(up?.disabled).toBe(true)
    expect(down?.disabled).toBe(true)
  })

  it('رقاقة الصيغة تفتح نافذة التصدير عليها', async () => {
    await mountGuide()
    container.querySelector<HTMLButtonElement>('[data-guide-chip="markdown"]')?.click()
    await waitFor(() => container.querySelector('[data-guide-export]') !== null)
    const checked = container.querySelector<HTMLInputElement>(
      '[data-guide-format="markdown"] input',
    )
    expect(
      checked?.checked ??
        container.querySelector<HTMLInputElement>('input[value="markdown"]')?.checked,
    ).toBe(true)
  })

  it('لقطةٌ لم تعد في المكتبة تُقال على خطوتها', async () => {
    await captures.putMany([capture('a'), capture('b')])
    await guides.put(GUIDE)
    render(<GuidePage id="g1" onBack={() => (back += 1)} />, container)
    await waitFor(() => container.querySelector('[data-guide-step-lost]') !== null)
    expect(container.querySelectorAll('[data-guide-step-lost]')).toHaveLength(1)
  })

  it('دليلٌ غير موجود: رسالةٌ وعودةٌ إلى الأدلّة', async () => {
    render(<GuidePage id="غائب" onBack={() => (back += 1)} />, container)
    await waitFor(() => container.querySelector('[data-guide-missing]') !== null)
    expect(container.textContent).toContain('الدليل غير موجود')
    const button = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'أدلة الخطوات',
    )
    button?.click()
    expect(back).toBe(1)
  })
})

describe('العرض `?guide=`', () => {
  it('يُقرأ ويُكتب، ويُضيء «أدلة الخطوات» في الشريط', () => {
    expect(viewFromSearch('?guide=g%201')).toEqual({ kind: 'guide', id: 'g 1' })
    expect(searchFor({ kind: 'guide', id: 'g 1' })).toBe('?guide=g%201')
    expect(viewId({ kind: 'guide', id: 'x' })).toBe('guides')
  })
})

describe('المكتبة', () => {
  const clickTab = (label: string) =>
    [...container.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((t) => t.textContent === label)
      ?.click()

  it('«أنشئ دليلًا» في شريط التحديد ينشئه بترتيب الالتقاط ويفتحه', async () => {
    await captures.putMany([
      capture('late', { createdAt: NOW + 5 }),
      capture('early', { createdAt: NOW + 1 }),
    ])
    render(<Library />, container)
    await waitFor(() => container.querySelector('[data-capture-id="late"]') !== null)
    for (const id of ['late', 'early']) {
      container
        .querySelector<HTMLInputElement>(`[data-capture-id="${id}"] input[type="checkbox"]`)
        ?.click()
      await flush()
    }
    const create = container.querySelector<HTMLButtonElement>(
      '[aria-label="أنشئ دليلًا من المحدَّد"]',
    )
    expect(create).not.toBeNull()
    create?.click()
    await waitFor(() => container.querySelector('[data-guide-page]') !== null)
    const all = await guides.getAll()
    expect(all.ok && all.value.map((g) => g.captureIds)).toEqual([['early', 'late']])
    expect(location.search).toMatch(/^\?guide=/)
  })

  it('بطاقة الدليل تفتح صفحته، وفراغ الأدلّة يعرض «أنشئ دليلًا»', async () => {
    render(<Library />, container)
    await flush()
    clickTab('أدلة الخطوات')
    await waitFor(() => container.querySelector('[data-guide-create-empty]') !== null)

    render(null, container)
    await guides.put(GUIDE)
    await captures.putMany([capture('a'), capture('b'), capture('c')])
    render(<Library />, container)
    await flush()
    clickTab('أدلة الخطوات')
    await waitFor(() => container.querySelector('[data-guide-id="g1"]') !== null)
    container.querySelector<HTMLElement>('[data-guide-id="g1"] button')?.click()
    await waitFor(() => container.querySelector('[data-guide-page="g1"]') !== null)
  })
})
