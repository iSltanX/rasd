import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyCheck } from '@/modules/issues/status'
import { IssuesPage } from '@/pages/library/parts/IssuesPage'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { issues, projects } from '@/shared/storage/repository'

import { issueFixture } from '../../modules/issues/fixture'

import type { LibraryView } from '@/pages/shell/library-views'
import type { IssueRecord } from '@/shared/issue-schema'
import type { ProjectRecord } from '@/shared/storage/schema'

/**
 * `library / issues` (`380:9549`) و`library / issues-empty` (`381:9699`): جدول المشكلات ومرشّحاته وحالتاه الفارغتان.
 */

const NOW = Date.now()
const MIN = 60_000

const P1: ProjectRecord = {
  id: 'p1',
  name: 'مشروع الأسعار',
  color: '#3B82F6',
  createdAt: 1,
  updatedAt: 1,
}

function pageOf(path: string): IssueRecord['page'] {
  return {
    url: `https://northwind.example${path}`,
    origin: 'https://northwind.example',
    path,
    title: 'منصّة',
    viewport: { width: 1440, height: 900, dpr: 2 },
  }
}

/** مفتوحة، بلا فحص بعد — الأحدث. */
const OPEN = issueFixture({
  id: 'open',
  title: 'حشوة الزرّ الرئيسي أكبر من التصميم',
  status: 'open',
  projectId: 'p1',
  page: pageOf('/pricing'),
  updatedAt: NOW - 1 * MIN,
})

/** محلولة بعد فحص قبل ثلاث دقائق. */
const RESOLVED = {
  ...applyCheck(
    issueFixture({
      id: 'resolved',
      title: 'لون العنوان',
      page: pageOf('/about'),
      check: {
        kind: 'colour',
        property: 'color',
        actual: '#111111',
        expected: '#222222',
        tolerance: 2,
      },
    }),
    { id: 'resolved', outcome: 'match', observed: '#222222', reason: null },
    NOW - 3 * MIN,
  ),
  updatedAt: NOW - 2 * MIN,
}

/** تحتاج تحققًا: العنصر لم يُعثر عليه. */
const VERIFY = {
  ...applyCheck(
    issueFixture({
      id: 'verify',
      title: 'تباين النصّ الثانوي',
      page: pageOf('/pricing'),
      check: {
        kind: 'contrast',
        property: 'color/background-color',
        actual: '3.68',
        expected: '4.5',
        tolerance: 0,
      },
    }),
    { id: 'verify', outcome: 'not-found', observed: null, reason: 'missing' },
    NOW - 5 * MIN,
  ),
  updatedAt: NOW - 5 * MIN,
}

let container: HTMLDivElement | null = null

beforeEach(async () => {
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

const navigate = vi.fn<(view: LibraryView) => void>()

async function mount(): Promise<HTMLDivElement> {
  navigate.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<IssuesPage view={{ kind: 'issues' }} projects={[P1]} onNavigate={navigate} />, container)
  await vi.waitFor(() => expect(container!.querySelector('[aria-busy="true"]')).toBeNull())
  return container
}

async function seed(...list: IssueRecord[]) {
  for (const issue of list) await issues.put(issue)
  await projects.put(P1)
}

const q = <T extends Element = HTMLElement>(root: ParentNode, selector: string) =>
  root.querySelector<T>(selector)
const rowIds = (root: ParentNode) =>
  [...root.querySelectorAll('tbody tr')].map((tr) => tr.getAttribute('data-issue-id'))
const tabs = (root: ParentNode) =>
  [...root.querySelectorAll('[role="tab"]')].map((t) => t.textContent)

function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function choose(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('library / issues-empty', () => {
  it('لا مشكلات أصلًا: تقول من أين تُسجَّل وأن إعادة الفحص في الصفحة', async () => {
    const root = await mount()
    expect(root.textContent).toContain('لا مشكلات مسجَّلة بعد')
    expect(root.textContent).toContain('سجّل مشكلة')
    expect(root.textContent).toContain('لوحات الفحص والقياس واللون')
    expect(root.textContent).toContain('إعادة الفحص تجري على الصفحة نفسها')
    expect(q(root, 'table')).toBeNull()
    expect(q(root, '[role="tablist"]')).toBeNull()
    // لا عدد ولا «مرتّبة من الأحدث» فوق فراغ.
    expect(root.textContent).not.toContain('مرتّبة من الأحدث')
  })
})

describe('library / issues', () => {
  it('العنوان والعدد بأرقام هندية و«مرتّبة من الأحدث»', async () => {
    await seed(VERIFY, OPEN, RESOLVED)
    const root = await mount()
    expect(q(root, 'h1')?.textContent).toBe('المشكلات')
    expect(root.textContent).toContain('٣ مشكلات')
    expect(root.textContent).toContain('مرتّبة من الأحدث')
  })

  it('الصفوف من الأحدث تعديلًا', async () => {
    await seed(VERIFY, OPEN, RESOLVED)
    const root = await mount()
    expect(rowIds(root)).toEqual(['open', 'resolved', 'verify'])
  })

  it('الأعمدة السبعة برؤوسٍ حقيقية', async () => {
    await seed(OPEN)
    const root = await mount()
    const heads = [...root.querySelectorAll('thead th')]
    expect(heads.map((h) => h.textContent)).toEqual([
      'المشكلة',
      'الصفحة',
      'النوع',
      'الآن',
      'المتوقّعة',
      'الحالة',
      'آخر فحص',
    ])
    expect(heads.every((h) => h.getAttribute('scope') === 'col')).toBe(true)
    expect(q(root, 'table')?.getAttribute('aria-label')).toBe('المشكلات المسجَّلة')
  })

  it('صفّ المفتوحة: العنوان والمحدِّد والصفحة والنوع والقيمتان والحالة و«لم تُفحص بعد»', async () => {
    await seed(OPEN)
    const root = await mount()
    const cells = [...root.querySelectorAll('tbody tr td')].map((td) => td.textContent)
    expect(cells).toEqual([
      'حشوة الزرّ الرئيسي أكبر من التصميم.cta-btn · padding',
      'northwind.example/pricing',
      'نمط',
      '14px 24px',
      '12px 24px',
      'مفتوحة',
      'لم تُفحص بعد',
    ])
  })

  it('«الآن» من آخر فحص لا من وقت التسجيل، و«آخر فحص» زمنٌ نسبيّ', async () => {
    await seed(RESOLVED)
    const root = await mount()
    const cells = [...root.querySelectorAll('tbody tr td')].map((td) => td.textContent)
    expect(cells.slice(2)).toEqual(['لون', '#222222', '#222222', 'محلولة', 'قبل ٣ دقائق'])
  })

  it('«تحتاج تحققًا» لا قيمة مرصودة فيها: «—» لا قيمة التسجيل القديمة، والتباين بصيغته', async () => {
    await seed(VERIFY)
    const root = await mount()
    const cells = [...root.querySelectorAll('tbody tr td')].map((td) => td.textContent)
    expect(cells.slice(2)).toEqual(['تباين', '—', '≥ 4.5 : 1', 'تحتاج تحققًا', 'قبل ٥ دقائق'])
  })

  it('لون الحالة واحد: رقاقة الحالة و«الآن» بدرجة الحالة، والمحلولة بلا تلوين', async () => {
    await seed(OPEN, RESOLVED, VERIFY)
    const root = await mount()
    const chip = (id: string) => q(root, `[data-issue-id="${id}"] td:nth-child(6) span`)!.className
    const now = (id: string) => q(root, `[data-issue-id="${id}"] td:nth-child(4) bdi`)!.className
    expect(chip('open')).toContain('tone-danger')
    expect(chip('verify')).toContain('tone-warning')
    expect(chip('resolved')).toContain('tone-success')
    expect(now('open')).toContain('now-danger')
    expect(now('verify')).toContain('now-warning')
    expect(now('resolved')).not.toMatch(/now-/)
  })

  it('المحدِّد والصفحة والقيم معزولة LTR', async () => {
    await seed(OPEN)
    const root = await mount()
    const isolated = [...root.querySelectorAll('tbody bdi[dir="ltr"]')].map((b) => b.textContent)
    expect(isolated).toEqual([
      '.cta-btn · padding',
      'northwind.example/pricing',
      '14px 24px',
      '12px 24px',
    ])
  })

  it('لا مربّعات تحديد ولا «حزمة التسليم» — لا محرّك لها بعد', async () => {
    await seed(OPEN, RESOLVED)
    const root = await mount()
    expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    expect(root.textContent).not.toContain('حزمة التسليم')
    // الأزرار الوحيدة رقاقات الحالات — لا زرّ آخر بلا محرّك.
    const buttons = [...root.querySelectorAll('button')]
    expect(buttons).toHaveLength(4)
    expect(buttons.every((b) => b.getAttribute('role') === 'tab')).toBe(true)
  })
})

describe('رقاقات الحالات', () => {
  it('«الكل» ثم الحالات الثلاث بعدّادها بأرقام هندية', async () => {
    await seed(OPEN, RESOLVED, VERIFY)
    const root = await mount()
    expect(tabs(root)).toEqual(['الكل · ٣', 'مفتوحة · ١', 'تحتاج تحققًا · ١', 'محلولة · ١'])
    expect(q(root, '[role="tab"][aria-selected="true"]')?.textContent).toBe('الكل · ٣')
    expect(q(root, '[role="tablist"]')?.getAttribute('aria-label')).toBe('حالة المشكلة')
  })

  it('اختيار رقاقة يصفّي الصفوف والعدد فوق الجدول', async () => {
    await seed(OPEN, RESOLVED, VERIFY)
    const root = await mount()
    const tab = (label: string) =>
      [...root.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
        t.textContent.startsWith(label),
      )!
    tab('محلولة').click()
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['resolved']))
    expect(root.textContent).toContain('مشكلة واحدة')
    expect(q(root, '[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tab('محلولة').id)
    // العدّادات لا تتبدّل باختيار حالة: هي بعد البحث والمشروع والصفحة فقط.
    expect(tabs(root)).toEqual(['الكل · ٣', 'مفتوحة · ١', 'تحتاج تحققًا · ١', 'محلولة · ١'])
    tab('الكل').click()
    await vi.waitFor(() => expect(rowIds(root)).toHaveLength(3))
  })
})

describe('البحث والمشروع والصفحة', () => {
  it('البحث بالعنوان أو المحدِّد أو الخاصية أو رابط الصفحة، وعدّادات الرقاقات تتبعه', async () => {
    await seed(OPEN, RESOLVED, VERIFY)
    const root = await mount()
    const search = q<HTMLInputElement>(root, 'input[type="search"]')!
    expect(search.placeholder).toBe('ابحث في المشكلات والمحدّدات…')

    type(search, 'PRICING')
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['open', 'verify']))
    expect(tabs(root)).toEqual(['الكل · ٢', 'مفتوحة · ١', 'تحتاج تحققًا · ١', 'محلولة · ٠'])

    type(search, 'cta-btn')
    await vi.waitFor(() => expect(rowIds(root)).toHaveLength(3)) // المحدِّد نفسه للثلاث في العيّنة
    type(search, 'لون')
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['resolved']))
  })

  it('لا نتائج: حالة قصيرة بزرّ لمسح المرشّحات يعيد كل شيء', async () => {
    await seed(OPEN, RESOLVED)
    const root = await mount()
    type(q<HTMLInputElement>(root, 'input[type="search"]')!, 'لا يطابق شيئًا أبدًا')
    await vi.waitFor(() => expect(root.textContent).toContain('لا نتائج لهذه المرشّحات'))
    expect(q(root, 'table')).toBeNull()
    // هذه ليست حالة «لا مشكلات أصلًا»: الرقاقات باقية والتلميح مختلف.
    expect(root.textContent).not.toContain('لا مشكلات مسجَّلة بعد')
    expect(tabs(root)[0]).toBe('الكل · ٠')

    const reset = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'امسح المرشّحات',
    )!
    reset.click()
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['open', 'resolved']))
    expect(q<HTMLInputElement>(root, 'input[type="search"]')!.value).toBe('')
  })

  it('قائمة المشاريع: كل المشاريع · المشاريع · بلا مشروع — وتصفّي', async () => {
    await seed(OPEN, RESOLVED, VERIFY)
    const root = await mount()
    const select = q<HTMLSelectElement>(root, 'select[aria-label="المشروع"]')!
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'كل المشاريع',
      'مشروع الأسعار',
      'بلا مشروع',
    ])
    choose(select, 'p1')
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['open']))
    choose(select, '__none__')
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['resolved', 'verify']))
    choose(select, '')
    await vi.waitFor(() => expect(rowIds(root)).toHaveLength(3))
  })

  it('قائمة الصفحات: كل الصفحات ثم الصفحات المتمايزة مضيفًا ومسارًا — وتصفّي', async () => {
    await seed(OPEN, RESOLVED, VERIFY)
    const root = await mount()
    const select = q<HTMLSelectElement>(root, 'select[aria-label="الصفحة"]')!
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'كل الصفحات',
      'northwind.example/about',
      'northwind.example/pricing',
    ])
    choose(select, 'https://northwind.example/pricing')
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['open', 'verify']))
  })

  it('المرشّحات تبقى بعد فتح مشكلة والرجوع إلى القائمة', async () => {
    await seed(OPEN, RESOLVED)
    const view = { kind: 'issues' } as const
    container = document.createElement('div')
    document.body.appendChild(container)
    render(<IssuesPage view={view} projects={[P1]} onNavigate={navigate} />, container)
    await vi.waitFor(() => expect(container!.querySelector('[aria-busy="true"]')).toBeNull())
    type(q<HTMLInputElement>(container, 'input[type="search"]')!, 'لون')
    await vi.waitFor(() => expect(rowIds(container!)).toEqual(['resolved']))

    render(
      <IssuesPage view={{ kind: 'issue', id: 'resolved' }} projects={[P1]} onNavigate={navigate} />,
      container,
    )
    await vi.waitFor(() => expect(q(container!, 'h1')?.textContent).toBe('لون العنوان'))
    render(<IssuesPage view={view} projects={[P1]} onNavigate={navigate} />, container)
    await vi.waitFor(() => expect(rowIds(container!)).toEqual(['resolved']))
    expect(q<HTMLInputElement>(container, 'input[type="search"]')!.value).toBe('لون')
  })
})

describe('فتح المشكلة', () => {
  it('النقر على الصفّ يفتح التفصيل', async () => {
    await seed(OPEN, RESOLVED)
    const root = await mount()
    q(root, '[data-issue-id="resolved"]')!.click()
    expect(navigate).toHaveBeenCalledWith({ kind: 'issue', id: 'resolved' })
  })

  it('العنوان رابطٌ حقيقيّ بعنوان التفصيل، والنقر عليه يفتح مرّةً واحدة', async () => {
    await seed(OPEN)
    const root = await mount()
    const link = q<HTMLAnchorElement>(root, '[data-issue-id="open"] a')!
    expect(link.getAttribute('href')).toContain('?issue=open')
    link.click()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({ kind: 'issue', id: 'open' })
  })

  it('النقر مع Ctrl يترك للمتصفح فتح الرابط في تبويب ولا يبدّل العرض هنا', async () => {
    await seed(OPEN)
    const root = await mount()
    const link = q<HTMLAnchorElement>(root, '[data-issue-id="open"] a')!
    // `preventDefault` لا يُستدعى: الافتراضي (التنقّل) هو المطلوب.
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('حالات القراءة', () => {
  it('السجلّ غير المقروء يُقال عدده والباقي يُعرض', async () => {
    await seed(OPEN)
    await issues.put({ ...issueFixture({ id: 'bad' }), title: '' })
    const root = await mount()
    expect(rowIds(root)).toEqual(['open'])
    expect(root.textContent).toContain('تعذّرت قراءة مشكلة واحدة فلم تُعرض')
  })

  it('فشل قراءة المخزن يُقال بزرّ إعادة المحاولة لا فراغًا كاذبًا', async () => {
    await seed(OPEN)
    const getAll = vi.spyOn(issues, 'getAll').mockResolvedValueOnce({
      ok: false,
      error: { code: 'unknown', message: 'فشل' },
    })
    const root = await mount()
    expect(root.textContent).toContain('تعذّرت قراءة المشكلات')
    expect(root.textContent).not.toContain('لا مشكلات مسجَّلة بعد')
    const retry = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'أعد المحاولة',
    )!
    retry.click()
    await vi.waitFor(() => expect(rowIds(root)).toEqual(['open']))
    getAll.mockRestore()
  })
})
