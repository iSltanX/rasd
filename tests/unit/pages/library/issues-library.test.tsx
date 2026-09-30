import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Library } from '@/pages/library/Library'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { captures, issues } from '@/shared/storage/repository'

import { issueFixture } from '../../modules/issues/fixture'

/**
 * مكتبة المشكلات داخل صفحة المكتبة نفسها: مدخلها في الشريط الجانبي، وعرضاها يتبدّلان في مكانهما بالرابط،
 * وصفّ أنواع السجلّات ومبدّل العرض لا يتغيّران لغيرها.
 */

vi.mock('@/shared/messaging', () => ({
  send: vi.fn(() => Promise.resolve({ ok: true, value: { tabId: 1 } })),
}))

let container: HTMLDivElement | null = null

beforeEach(async () => {
  history.replaceState(null, '', '/')
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
})

async function mount(search = ''): Promise<HTMLDivElement> {
  history.replaceState(null, '', `/${search}`)
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<Library />, container)
  await vi.waitFor(() => expect(container!.querySelector('[aria-busy="true"]')).toBeNull())
  return container
}

const q = <T extends Element = HTMLElement>(root: ParentNode, selector: string) =>
  root.querySelector<T>(selector)
const rowIds = (root: ParentNode) =>
  [...root.querySelectorAll('tbody tr')].map((tr) => tr.getAttribute('data-issue-id'))

function sidebarEntry(root: ParentNode, label: string): HTMLAnchorElement | undefined {
  return [...root.querySelectorAll<HTMLAnchorElement>('nav[aria-label="المكتبة"] a')].find((a) =>
    a.textContent.startsWith(label),
  )
}

async function seedIssues() {
  await issues.put(issueFixture({ id: 'a', updatedAt: 3_000 }))
  await issues.put(issueFixture({ id: 'b', updatedAt: 2_000, title: 'مشكلة ثانية' }))
  await issues.put(issueFixture({ id: 'c', updatedAt: 1_000, status: 'resolved' }))
}

describe('الشريط الجانبي', () => {
  it('«المشكلات» آخر «المجموعات» بأيقونة alert وعدّاد كل المشكلات بأرقام هندية', async () => {
    await seedIssues()
    const root = await mount()
    await vi.waitFor(() => expect(sidebarEntry(root, 'المشكلات')?.textContent).toContain('٣'))

    const entry = sidebarEntry(root, 'المشكلات')!
    const group = entry.parentElement!
    expect(group.querySelector('p')?.textContent).toBe('المجموعات')
    expect(group.lastElementChild).toBe(entry)
    expect(
      [...group.querySelectorAll('a')].map((a) => a.textContent.replace(/[٠-٩]+$/, '')),
    ).toEqual(['اللوحات', 'الألوان', 'المراجع', 'أدلة الخطوات', 'المشكلات'])
    expect(entry.getAttribute('href')).toContain('?view=issues')
    expect(entry.getAttribute('aria-current')).toBeNull()
  })

  it('العدّاد صفر حين لا مشكلات، لا غيابًا', async () => {
    const root = await mount()
    await vi.waitFor(() => expect(sidebarEntry(root, 'المشكلات')?.textContent).toContain('٠'))
  })
})

describe('التنقّل', () => {
  it('اختيار «المشكلات» من الشريط يفتح القائمة بلا تنقّل، ويُضيء العنصر، ويكتب الرابط', async () => {
    await seedIssues()
    const root = await mount()
    expect(q(root, '[role="tablist"][aria-label="أنواع السجلّات"]')).not.toBeNull()

    sidebarEntry(root, 'المشكلات')!.click()
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['a', 'b', 'c']))
    expect(location.search).toBe('?view=issues')
    expect(sidebarEntry(root, 'المشكلات')!.getAttribute('aria-current')).toBe('page')
    expect(q(root, 'h1')?.textContent).toBe('المشكلات')
  })

  it('عرض المشكلات لا يمسّ صفّ أنواع السجلّات ولا مبدّل «عرض المكتبة» ولا بحث اللقطات', async () => {
    await seedIssues()
    const root = await mount('?view=issues')
    await vi.waitFor(() => expect(rowIds(root)).toHaveLength(3))
    expect(q(root, '[role="tablist"][aria-label="أنواع السجلّات"]')).toBeNull()
    expect(q(root, '[aria-label="عرض المكتبة"]')).toBeNull()
    expect(q(root, 'input[aria-label="ابحث في المكتبة"]')).toBeNull()
    // تبويبات الحالات وحدها.
    expect([...root.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual([
      'الكل · ٣',
      'مفتوحة · ٢',
      'تحتاج تحققًا · ٠',
      'محلولة · ١',
    ])
  })

  it('العودة إلى «كل اللقطات» ترجع الشبكة وصفّ الأنواع كما كانا', async () => {
    await seedIssues()
    await captures.put({
      id: 'cap1',
      createdAt: 1,
      origin: 'https://example.com',
      url: 'https://example.com',
      title: 'لقطة',
      kind: 'area',
      status: 'ready',
      projectId: null,
      tags: [],
      width: 10,
      height: 10,
      devicePixelRatio: 1,
      favorite: false,
      archived: false,
      trashedAt: null,
    })
    const root = await mount('?view=issues')
    await vi.waitFor(() => expect(rowIds(root)).toHaveLength(3))

    sidebarEntry(root, 'كل اللقطات')!.click()
    await vi.waitFor(() => expect(q(root, '[data-capture-id="cap1"]')).not.toBeNull())
    expect(q(root, '[role="tablist"][aria-label="أنواع السجلّات"]')).not.toBeNull()
    expect(q(root, 'table')).toBeNull()
    expect(location.search).toBe('')
  })

  it('الصفّ يفتح التفصيل في مكانه بـ?issue=، والمسار يعيد القائمة', async () => {
    await seedIssues()
    const root = await mount('?view=issues')
    await vi.waitFor(() => expect(rowIds(root)).toHaveLength(3))

    q(root, '[data-issue-id="b"]')!.click()
    await vi.waitFor(() => expect(q(root, 'h1')?.textContent).toBe('مشكلة ثانية'))
    expect(location.search).toBe('?issue=b')
    // التفصيل يُضيء «المشكلات» في الشريط.
    expect(sidebarEntry(root, 'المشكلات')!.getAttribute('aria-current')).toBe('page')

    const back = [...root.querySelectorAll('nav[aria-label="مسار التنقّل"] button')].find(
      (b) => b.textContent === 'المشكلات',
    ) as HTMLButtonElement
    back.click()
    await vi.waitFor(() => expect(rowIds(root)).toHaveLength(3))
    expect(location.search).toBe('?view=issues')
  })

  it('رابطٌ يحمل ?issue= يفتح التفصيل مباشرةً (من المحرّر أو النافذة)', async () => {
    await seedIssues()
    const root = await mount('?issue=b')
    await vi.waitFor(() => expect(q(root, 'h1')?.textContent).toBe('مشكلة ثانية'))
    expect(q(root, 'table')).toBeNull()
  })

  it('?issue= بمعرّفٍ مجهول: خطأ بطريق عودة، لا صفحة فارغة', async () => {
    const root = await mount('?issue=nope')
    await vi.waitFor(() => expect(q(root, '[role="alert"]')).not.toBeNull())
    expect(q(root, '[role="alert"]')!.textContent).toContain('هذه المشكلة غير موجودة')
    const back = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'ارجع إلى المشكلات',
    ) as HTMLButtonElement
    back.click()
    await vi.waitFor(() => expect(root.textContent).toContain('لا مشكلات مسجَّلة بعد'))
    expect(location.search).toBe('?view=issues')
  })

  it('«مشروع جديد» في الشريط من عرض المشكلات يفتح لوحة المشاريع لا زرًّا بلا أثر', async () => {
    const root = await mount('?view=issues')
    await vi.waitFor(() => expect(root.textContent).toContain('لا مشكلات مسجَّلة بعد'))
    const create = [...root.querySelectorAll('nav[aria-label="المكتبة"] button')].find(
      (b) => b.textContent === 'مشروع جديد',
    ) as HTMLButtonElement
    create.click()
    await vi.waitFor(() => expect(q(root, '[aria-label="إغلاق لوحة المشاريع"]')).not.toBeNull())
    expect(location.search).toBe('?view=projects')
  })
})
