import 'fake-indexeddb/auto'

import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyCheck } from '@/modules/issues/status'
import { IssueDetail } from '@/pages/library/parts/IssueDetail'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, captures, issues, projects, thumbnails } from '@/shared/storage/repository'

import { issueFixture } from '../../modules/issues/fixture'

import type { IssueRecord } from '@/shared/issue-schema'
import type { CaptureRecord, ProjectRecord } from '@/shared/storage/schema'

/**
 * `library / issue-detail` (`382:9828`): رأس بحالته وإجراءاته، وبطاقات القيمة والعنصر والصفحة واللقطة
 * والتاريخ والخطوات والملاحظة.
 */

const send = vi.fn<(type: string, payload: unknown) => Promise<unknown>>()
vi.mock('@/shared/messaging', () => ({
  send: (type: string, payload: unknown) => send(type, payload),
}))

const NOW = Date.now()
const MIN = 60_000

const P1: ProjectRecord = {
  id: 'p1',
  name: 'مشروع الأسعار',
  color: '#3B82F6',
  createdAt: 1,
  updatedAt: 1,
}
const P2: ProjectRecord = {
  id: 'p2',
  name: 'مشروع آخر',
  color: '#10B981',
  createdAt: 2,
  updatedAt: 2,
}

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://northwind.example',
    url: 'https://northwind.example/pricing',
    title: 'دليل',
    kind: 'element',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 464,
    height: 192,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
    ...over,
  }
}

/** مشكلة سُجّلت قبل يوم وفُحصت مرّتين: عدم تطابق ثم تطابق، وعليها ملاحظة وخطوتان. */
function subject(over: Partial<IssueRecord> = {}): IssueRecord {
  const base = issueFixture({
    id: 'a',
    projectId: 'p1',
    createdAt: NOW - 24 * 60 * MIN,
    updatedAt: NOW - 24 * 60 * MIN,
    history: [
      {
        kind: 'created',
        at: NOW - 24 * 60 * MIN,
        status: 'open',
        observed: '14px 24px',
      },
    ],
    evidence: {
      captureId: 'c1',
      snapshot: { padding: '14px 24px' },
      crop: { x: 48, y: 48, width: 368, height: 96 },
    },
  })
  const mismatch = applyCheck(
    base,
    { id: 'a', outcome: 'mismatch', observed: '14px 24px', reason: null },
    NOW - 60 * MIN,
  )
  const matched = applyCheck(
    mismatch,
    { id: 'a', outcome: 'match', observed: '12px 24px', reason: null },
    NOW - 3 * MIN,
  )
  return { ...matched, ...over }
}

let container: HTMLDivElement | null = null
const onBack = vi.fn<() => void>()
let createObjectURL: ReturnType<typeof vi.spyOn>
let revokeObjectURL: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  send.mockReset()
  send.mockResolvedValue({ ok: true, value: { tabId: 1 } })
  onBack.mockReset()
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
  // happy-dom لا يقبل Blob قاعدةٍ وهمية في `createObjectURL` (انظر `library/context.ts`).
  createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:evidence')
  revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.restoreAllMocks()
})

async function mount(id = 'a', projectList: readonly ProjectRecord[] = [P1, P2]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(<IssueDetail id={id} projects={projectList} onBack={onBack} now={NOW} />, container)
  await vi.waitFor(() => expect(container!.querySelector('[aria-busy="true"]')).toBeNull())
  return container
}

async function seed(issue: IssueRecord = subject()) {
  await projects.put(P1)
  await projects.put(P2)
  await issues.put(issue)
}

const q = <T extends Element = HTMLElement>(root: ParentNode, selector: string) =>
  root.querySelector<T>(selector)

/** البطاقة بعنوانها. */
function card(root: ParentNode, title: string): HTMLElement {
  const heading = [...root.querySelectorAll('h2')].find((h) => h.textContent === title)
  if (!heading) throw new Error(`لا بطاقة بعنوان «${title}»`)
  return heading.closest('section') as HTMLElement
}

/** أزواج «الاسم ← القيمة» في بطاقة. */
function facts(section: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    [...section.querySelectorAll('dl > div')].map((row) => [
      row.querySelector('dt')!.textContent,
      row.querySelector('dd')!.textContent,
    ]),
  )
}

const button = (root: ParentNode, name: string) =>
  [...root.querySelectorAll('button')].find(
    (b) => b.textContent === name || b.getAttribute('aria-label') === name,
  )

function choose(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('الرأس', () => {
  it('مسار التنقّل يعود إلى «المشكلات»، والعنوان وحالته، وسطر الوصف', async () => {
    await seed()
    const root = await mount()
    const nav = q(root, 'nav[aria-label="مسار التنقّل"]')!
    expect(nav.textContent).toContain('المشكلات')
    button(nav, 'المشكلات')!.click()
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(q(nav, '[aria-current="page"]')?.textContent).toBe('حشوة الزرّ الرئيسي أكبر من التصميم')

    expect(q(root, 'h1')?.textContent).toBe('حشوة الزرّ الرئيسي أكبر من التصميم')
    expect(q(root, 'h1 + span')?.textContent).toBe('محلولة')
    const meta = q(root, 'p')!.textContent
    expect(meta).toMatch(/^سُجّلت .+ · مشروع الأسعار · آخر فحص قبل ٣ دقائق$/)
    // التاريخ عدٌّ بشريّ: أرقامه هندية.
    expect(meta).toMatch(/[٠-٩]/)
  })

  it('بلا مشروع وبلا فحص: «بلا مشروع · لم تُفحص بعد»', async () => {
    await seed({ ...issueFixture({ id: 'a' }), projectId: null })
    const root = await mount()
    expect(q(root, 'p')!.textContent).toMatch(/ · بلا مشروع · لم تُفحص بعد$/)
  })

  it('لا «أعد الفحص» في المكتبة — الفحص في الصفحة وحدها', async () => {
    await seed()
    const root = await mount()
    expect(root.textContent).not.toContain('أعد الفحص')
    expect(button(root, 'أعد الفحص')).toBeUndefined()
  })
})

describe('تغيير الحالة', () => {
  it('قائمة «الحالة» بالحالات الثلاث بتسمياتها', async () => {
    await seed()
    const root = await mount()
    const select = q<HTMLSelectElement>(root, 'select[aria-label="الحالة"]')!
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['open', 'مفتوحة'],
      ['needs-verification', 'تحتاج تحققًا'],
      ['resolved', 'محلولة'],
    ])
    expect(select.value).toBe('resolved')
  })

  it('اختيار حالة يكتبها في المخزن بحدثٍ يدويّ في التاريخ، ويُحدّث الرقاقة والبطاقات', async () => {
    await seed()
    const root = await mount()
    choose(q<HTMLSelectElement>(root, 'select[aria-label="الحالة"]')!, 'open')
    await vi.waitFor(() => expect(q(root, 'h1 + span')?.textContent).toBe('مفتوحة'))

    const stored = await issues.get('a')
    expect(stored.ok && stored.value.status).toBe('open')
    expect(stored.ok && stored.value.history[0]?.kind).toBe('manual')
    // التاريخ يعرض الحدث الجديد أوّلًا.
    const first = q(card(root, 'التاريخ'), 'li')!
    expect(first.getAttribute('data-history-kind')).toBe('manual')
    expect(first.textContent).toContain('غُيّرت يدويًّا')
    expect(first.textContent).toContain('مفتوحة')
  })

  it('الكتابة المرفوضة تُقال فوق البطاقات والحالة المعروضة هي المخزَّنة', async () => {
    await seed()
    const root = await mount()
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    setIncognitoWritePolicy(true)
    try {
      choose(q<HTMLSelectElement>(root, 'select[aria-label="الحالة"]')!, 'open')
      await vi.waitFor(() => expect(q(root, '[role="alert"]')).not.toBeNull())
    } finally {
      Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
      setIncognitoWritePolicy(false)
    }
    expect(q(root, '[role="alert"]')!.textContent).toContain('تعذّر حفظ التغيير')
    expect(q(root, '[role="alert"]')!.textContent).toContain('التصفّح الخاص')
    expect(q(root, 'h1 + span')?.textContent).toBe('محلولة')
    const stored = await issues.get('a')
    expect(stored.ok && stored.value.status).toBe('resolved')
  })
})

describe('المشروع', () => {
  it('يُسند إلى مشروع آخر ثم يُفكّ، ويظهر في سطر الوصف', async () => {
    await seed()
    const root = await mount()
    const select = q<HTMLSelectElement>(root, 'select[aria-label="المشروع"]')!
    expect([...select.options].map((o) => o.textContent)).toEqual([
      'بلا مشروع',
      'مشروع الأسعار',
      'مشروع آخر',
    ])
    expect(select.value).toBe('p1')

    choose(select, 'p2')
    await vi.waitFor(() => expect(q(root, 'p')!.textContent).toContain('مشروع آخر'))
    let stored = await issues.get('a')
    expect(stored.ok && stored.value.projectId).toBe('p2')

    choose(q<HTMLSelectElement>(root, 'select[aria-label="المشروع"]')!, '__none__')
    await vi.waitFor(() => expect(q(root, 'p')!.textContent).toContain('بلا مشروع'))
    stored = await issues.get('a')
    expect(stored.ok && stored.value.projectId).toBeNull()
  })

  it('مشروعٌ حُذف والصفحة مفتوحة: الفشل يُقال والإسناد السابق يبقى', async () => {
    await seed()
    await projects.remove('p2')
    const root = await mount('a', [P1, P2])
    choose(q<HTMLSelectElement>(root, 'select[aria-label="المشروع"]')!, 'p2')
    await vi.waitFor(() => expect(q(root, '[role="alert"]')).not.toBeNull())
    expect(q(root, '[role="alert"]')!.textContent).toContain('المشروع لم يعد موجودًا')
    const stored = await issues.get('a')
    expect(stored.ok && stored.value.projectId).toBe('p1')
  })
})

describe('افتح الصفحة', () => {
  it('https: يفتح الرابط في تبويب جديد', async () => {
    await seed()
    const create = vi.spyOn(chrome.tabs, 'create')
    const root = await mount()
    const open = button(root, 'افتح الصفحة')!
    expect(open.disabled).toBe(false)
    open.click()
    expect(create).toHaveBeenCalledWith({ url: 'https://northwind.example/pricing' })
  })

  it('رابطٌ ليس http ولا https: الزرّ معطَّل وسببه مكتوب ولا يفتح شيئًا', async () => {
    const base = subject()
    await seed({ ...base, page: { ...base.page, url: 'file:///Users/a/page.html' } })
    const create = vi.spyOn(chrome.tabs, 'create')
    const root = await mount()
    const open = button(root, 'افتح الصفحة')!
    expect(open.disabled).toBe(true)
    expect(open.closest('span')?.getAttribute('title')).toContain('ليس صفحة ويب')
    expect(open.getAttribute('aria-label')).toContain('ليس صفحة ويب')
    open.click()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('بطاقة «القيمة»', () => {
  it('نوع الفحص والخاصية والآن والمتوقّعة والسماح', async () => {
    await seed()
    const root = await mount()
    expect(facts(card(root, 'القيمة'))).toEqual({
      'نوع الفحص': 'نمط',
      الخاصية: 'padding',
      الآن: '12px 24px',
      المتوقّعة: '12px 24px',
      السماح: '±0px',
    })
  })

  it('المسافة بتسميتها العربية، واللون بـΔE، والتباين بصيغته وحدّه الأدنى', async () => {
    const spacing = subject({
      check: {
        kind: 'spacing',
        property: 'gap-top',
        actual: '8px',
        expected: '16px',
        tolerance: 1,
      },
      lastCheck: null,
    })
    await seed(spacing)
    let root = await mount()
    let f = facts(card(root, 'القيمة'))
    expect(f['نوع الفحص']).toBe('مسافة')
    expect(f['الخاصية']).toBe('الفجوة (أعلى)')
    expect(f['الآن']).toBe('8px')
    expect(f['السماح']).toBe('±1px')

    render(null, container!)
    container!.remove()
    container = null
    await issues.put(
      subject({
        check: {
          kind: 'contrast',
          property: 'color/background-color',
          actual: '3.68',
          expected: '4.5',
          tolerance: 0,
        },
        lastCheck: null,
      }),
    )
    root = await mount()
    f = facts(card(root, 'القيمة'))
    expect(f['الآن']).toBe('3.68 : 1')
    expect(f['المتوقّعة']).toBe('≥ 4.5 : 1')
    expect(f['السماح']).toBe('—')
  })

  it('«الآن» بدرجة الحالة ما دامت غير محلولة', async () => {
    await seed(subject({ status: 'open' }))
    const root = await mount()
    const now = [...card(root, 'القيمة').querySelectorAll('dl > div')].find(
      (r) => r.querySelector('dt')!.textContent === 'الآن',
    )!
    expect(now.querySelector('bdi')!.className).toContain('now-danger')
  })
})

describe('بطاقة «العنصر»', () => {
  it('المحدّد وثباته والوسم وسماته وبصمة النصّ — لا نصّ خام', async () => {
    await seed()
    const root = await mount()
    const section = card(root, 'العنصر')
    expect(facts(section)).toEqual({
      المحدّد: '.cta-btn',
      ثباته: 'فريدغير موضعي',
      'الوسم وسماته الثابتة': 'button · data-cta',
      النصّ: 'بصمته وطوله ١١ حرفًا — لا يُحفظ النصّ نفسه',
    })
    expect(section.textContent).not.toContain('0a1b2c3d')
  })

  it('غير فريد وموضعي بدرجة تحذير، وفريد وغير موضعي بدرجة نجاح', async () => {
    const tones = (root: ParentNode) =>
      [...card(root, 'العنصر').querySelectorAll('dl > div:nth-child(2) dd > span')].map(
        (c) => c.className.match(/tone-[a-z]+/)?.[0],
      )
    const base = subject()
    await seed({ ...base, element: { ...base.element, unique: false, positional: true } })
    let root = await mount()
    expect(facts(card(root, 'العنصر'))['ثباته']).toBe('غير فريدموضعي')
    expect(tones(root)).toEqual(['tone-warning', 'tone-warning'])

    render(null, container!)
    container!.remove()
    container = null
    await issues.put(base)
    root = await mount()
    expect(tones(root)).toEqual(['tone-success', 'tone-success'])
  })

  it('فحص المسافة يعرض العنصر الثاني أيضًا', async () => {
    const base = subject()
    await seed({
      ...base,
      check: {
        kind: 'spacing',
        property: 'gap-top',
        actual: '8px',
        expected: '16px',
        tolerance: 0,
      },
      pair: { ...base.element, selector: '.hero-title' },
    })
    const root = await mount()
    expect(facts(card(root, 'العنصر'))['العنصر الثاني']).toBe('.hero-title')
  })
})

describe('بطاقة «الصفحة»', () => {
  it('الرابط مضيفًا ومسارًا، والعنوان، والمقاس بأرقام غربية', async () => {
    await seed()
    const root = await mount()
    expect(facts(card(root, 'الصفحة'))).toEqual({
      الرابط: 'northwind.example/pricing',
      العنوان: 'منصّة — الأسعار',
      المقاس: '1440 × 900 · DPR 2',
    })
  })
})

describe('بطاقة «لقطة الدليل»', () => {
  const blob = new Blob(['png'], { type: 'image/png' })

  it('تعرض اللقطة من blobs بإطارٍ حول العنصر بنسبٍ من أبعاد الصورة الطبيعية', async () => {
    await seed()
    await blobs.put({ id: 'c1', blob, mime: 'image/png', bytes: 3 })
    const root = await mount()
    const section = card(root, 'لقطة الدليل')
    await vi.waitFor(() => expect(q(section, 'img')).not.toBeNull())
    const img = q<HTMLImageElement>(section, 'img')!
    expect(img.getAttribute('src')).toBe('blob:evidence')
    expect(section.textContent).toContain('مقتطع حول العنصر من لقطة الصفحة وقت التسجيل')

    // الإطار يحتاج أبعاد الصورة الطبيعية — تصل بحدث التحميل.
    expect(q(section, '[data-evidence-outline]')).toBeNull()
    Object.defineProperty(img, 'naturalWidth', { value: 464 })
    Object.defineProperty(img, 'naturalHeight', { value: 192 })
    img.dispatchEvent(new Event('load'))
    await vi.waitFor(() => expect(q(section, '[data-evidence-outline]')).not.toBeNull())
    const outline = q(section, '[data-evidence-outline]')!
    // crop 48,48 368×96 على 464×192.
    expect(outline.style.getPropertyValue('--rasd-crop-x')).toBe(
      `${Math.round((48 / 464) * 10000) / 100}%`,
    )
    expect(outline.style.getPropertyValue('--rasd-crop-y')).toBe('25%')
    expect(outline.style.getPropertyValue('--rasd-crop-w')).toBe(
      `${Math.round((368 / 464) * 10000) / 100}%`,
    )
    expect(outline.style.getPropertyValue('--rasd-crop-h')).toBe('50%')
    // لون الإطار لون حالة المشكلة (محلولة).
    expect(outline.className).toContain('outline-success')
  })

  it('عنوان الكائن يُسحب عند إزالة الصفحة', async () => {
    await seed()
    await blobs.put({ id: 'c1', blob, mime: 'image/png', bytes: 3 })
    const root = await mount()
    await vi.waitFor(() => expect(q(root, 'figure img')).not.toBeNull())
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    render(null, container!)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:evidence')
  })

  it('لا أصل بل مصغَّرة: تُعرض ويُقاس الإطار على أبعاد اللقطة الأصلية لا المصغَّرة', async () => {
    await seed()
    await thumbnails.put({ id: 'c1', blob, width: 116, height: 48 })
    await captures.put(capture('c1', { width: 464, height: 192 }))
    const root = await mount()
    await vi.waitFor(() => expect(q(root, '[data-evidence-outline]')).not.toBeNull())
    expect(q(root, '[data-evidence-outline]')!.style.getPropertyValue('--rasd-crop-y')).toBe('25%')
  })

  it('اللقطة محذوفة: «حُذفت لقطة الدليل من المكتبة» والمشكلة تبقى مقروءة', async () => {
    await seed()
    const root = await mount()
    await vi.waitFor(() =>
      expect(card(root, 'لقطة الدليل').textContent).toContain('حُذفت لقطة الدليل من المكتبة'),
    )
    expect(q(card(root, 'لقطة الدليل'), 'img')).toBeNull()
    expect(q(root, 'h1')?.textContent).toBe('حشوة الزرّ الرئيسي أكبر من التصميم')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('تعذّر إنشاء عنوان للصورة يُعامَل كغيابها لا كصورة مكسورة', async () => {
    await seed()
    await blobs.put({ id: 'c1', blob, mime: 'image/png', bytes: 3 })
    createObjectURL.mockImplementation(() => {
      throw new Error('غير مدعوم')
    })
    const root = await mount()
    await vi.waitFor(() =>
      expect(card(root, 'لقطة الدليل').textContent).toContain('حُذفت لقطة الدليل من المكتبة'),
    )
  })
})

describe('بطاقة «التاريخ»', () => {
  it('الأحدث أوّلًا بتسمياته وحالاته وقيمه المرصودة وزمنه', async () => {
    await seed()
    const root = await mount()
    const items = [...card(root, 'التاريخ').querySelectorAll('li')]
    expect(items.map((li) => li.getAttribute('data-history-kind'))).toEqual([
      'check',
      'check',
      'created',
    ])
    expect(items[0]!.textContent).toContain('أعيد الفحص')
    expect(items[0]!.textContent).toContain('محلولة')
    expect(items[0]!.textContent).toContain('قبل ٣ دقائق')
    expect(items[0]!.textContent).toContain('12px 24px')
    expect(items[1]!.textContent).toContain('مفتوحة')
    expect(items[1]!.textContent).toContain('قبل ساعة')
    expect(items[2]!.textContent).toContain('سُجّلت')
    expect(items[2]!.textContent).toContain('قبل يوم')
    // وقتٌ مطلق بجوار النسبيّ.
    expect(items[2]!.querySelector('time')!.getAttribute('datetime')).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(items[2]!.textContent).toMatch(/[٠-٩]/)
  })

  it('«تحتاج تحققًا» تُظهر سببها، والحدث اليدويّ بلا قيمة', async () => {
    const base = subject()
    const verify = applyCheck(
      base,
      { id: 'a', outcome: 'not-found', observed: null, reason: 'missing' },
      NOW - MIN,
    )
    await seed({
      ...verify,
      history: [{ kind: 'manual', at: NOW, status: 'resolved' }, ...verify.history],
    })
    const root = await mount()
    const items = [...card(root, 'التاريخ').querySelectorAll('li')]
    expect(items[0]!.getAttribute('data-history-kind')).toBe('manual')
    expect(items[0]!.textContent).not.toContain('القيمة')
    expect(items[1]!.textContent).toContain('لم يُعثر على العنصر في آخر فحص')
    expect(items[1]!.textContent).not.toContain('القيمة')
  })
})

describe('بطاقة «خطوات إعادة المشكلة»', () => {
  const field = (root: ParentNode) => q<HTMLTextAreaElement>(root, '#issue-steps-field')!
  function edit(el: HTMLTextAreaElement, value: string) {
    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('قائمة مرقَّمة من الخطوات المخزَّنة، والنموذج بها سطرًا سطرًا', async () => {
    await seed()
    const root = await mount()
    const section = card(root, 'خطوات إعادة المشكلة')
    expect([...section.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual([
      'افتح الصفحة بعرض 1440',
      'مرّر إلى البطل',
    ])
    expect(field(root).value).toBe('افتح الصفحة بعرض 1440\nمرّر إلى البطل')
    expect(q(section, 'label[for="issue-steps-field"]')).not.toBeNull()
  })

  it('«احفظ الخطوات» معطَّل ما لم يتغيّر النصّ', async () => {
    await seed()
    const root = await mount()
    const save = button(root, 'احفظ الخطوات')!
    expect(save.disabled).toBe(true)
    edit(field(root), 'خطوة جديدة')
    await vi.waitFor(() => expect(button(root, 'احفظ الخطوات')!.disabled).toBe(false))
  })

  it('الحفظ يكتب الخطوات المطبَّعة ويُحدّث القائمة و updatedAt', async () => {
    await seed()
    const root = await mount()
    edit(field(root), 'أولى\n\n  ثانية  \nثالثة\n')
    await vi.waitFor(() => expect(button(root, 'احفظ الخطوات')!.disabled).toBe(false))
    button(root, 'احفظ الخطوات')!.click()
    await vi.waitFor(() =>
      expect(
        [...card(root, 'خطوات إعادة المشكلة').querySelectorAll('ol > li')].map(
          (li) => li.textContent,
        ),
      ).toEqual(['أولى', 'ثانية', 'ثالثة']),
    )
    const stored = await issues.get('a')
    expect(stored.ok && stored.value.steps).toEqual(['أولى', 'ثانية', 'ثالثة'])
    expect(stored.ok && stored.value.updatedAt).toBeGreaterThan(NOW - 3 * MIN)
    // عاد النموذج إلى «لا تغيير» بالنصّ المطبَّع.
    expect(field(root).value).toBe('أولى\nثانية\nثالثة')
    expect(button(root, 'احفظ الخطوات')!.disabled).toBe(true)
  })

  it('أكثر من عشرين خطوة: تُقال ولا يُكتب شيء', async () => {
    await seed()
    const root = await mount()
    edit(field(root), Array.from({ length: 21 }, (_, i) => `خطوة ${i}`).join('\n'))
    await vi.waitFor(() => expect(button(root, 'احفظ الخطوات')!.disabled).toBe(false))
    button(root, 'احفظ الخطوات')!.click()
    await vi.waitFor(() => expect(field(root).getAttribute('aria-invalid')).toBe('true'))
    expect(card(root, 'خطوات إعادة المشكلة').textContent).toContain('أكثر من ٢٠ خطوة')
    const stored = await issues.get('a')
    expect(stored.ok && stored.value.steps).toEqual(['افتح الصفحة بعرض 1440', 'مرّر إلى البطل'])
  })

  it('خطوة أطول من خمسمئة حرف: تُقال برقمها', async () => {
    await seed()
    const root = await mount()
    edit(field(root), `أولى\n${'ب'.repeat(501)}`)
    await vi.waitFor(() => expect(button(root, 'احفظ الخطوات')!.disabled).toBe(false))
    button(root, 'احفظ الخطوات')!.click()
    await vi.waitFor(() =>
      expect(card(root, 'خطوات إعادة المشكلة').textContent).toContain('الخطوة ٢ أطول من ٥٠٠ حرف'),
    )
  })

  it('فشل الكتابة يُقال والمكتوب في النموذج باقٍ', async () => {
    await seed()
    const root = await mount()
    edit(field(root), 'جديدة')
    await vi.waitFor(() => expect(button(root, 'احفظ الخطوات')!.disabled).toBe(false))
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    setIncognitoWritePolicy(true)
    try {
      button(root, 'احفظ الخطوات')!.click()
      await vi.waitFor(() => expect(field(root).getAttribute('aria-invalid')).toBe('true'))
    } finally {
      Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
      setIncognitoWritePolicy(false)
    }
    expect(field(root).value).toBe('جديدة')
  })

  it('بلا خطوات: تُقال، والنموذج فارغ', async () => {
    await seed(subject({ steps: [] }))
    const root = await mount()
    expect(card(root, 'خطوات إعادة المشكلة').textContent).toContain('لم تُسجَّل خطوات بعد')
    expect(field(root).value).toBe('')
  })
})

describe('بطاقة «الملاحظة»', () => {
  it('نصّ المشكلة، و«افتح في المحرّر» يرسل page/open بلقطة الملاحظة', async () => {
    await seed()
    await captures.put(capture('c1'))
    const root = await mount()
    const section = card(root, 'الملاحظة')
    expect(section.textContent).toContain('الحشوة الرأسية في التصميم 12 بكسل.')
    await vi.waitFor(() => expect(button(section, 'افتح في المحرّر')).toBeDefined())
    button(section, 'افتح في المحرّر')!.click()
    expect(send).toHaveBeenCalledWith('page/open', { page: 'editor', params: { capture: 'c1' } })
  })

  it('بلا ملاحظة مرتبطة: لا رابط', async () => {
    await seed(subject({ note: null }))
    await captures.put(capture('c1'))
    const root = await mount()
    expect(card(root, 'الملاحظة').textContent).toContain('الحشوة الرأسية')
    expect(button(root, 'افتح في المحرّر')).toBeUndefined()
  })

  it('لقطة الملاحظة محذوفة فيسقط مشهدها: لا رابط يفتح محرّرًا على لا شيء', async () => {
    await seed()
    const root = await mount()
    // اللقطة غائبة — نمنح المؤجَّلات فرصة تُنتج رابطًا لو كان سيظهر.
    await new Promise((r) => setTimeout(r, 30))
    expect(button(root, 'افتح في المحرّر')).toBeUndefined()
  })

  it('فشل فتح المحرّر يُقال', async () => {
    await seed()
    await captures.put(capture('c1'))
    send.mockResolvedValue({ ok: false, error: { code: 'no-receiver', message: 'لا مستقبِل' } })
    const root = await mount()
    await vi.waitFor(() => expect(button(root, 'افتح في المحرّر')).toBeDefined())
    button(root, 'افتح في المحرّر')!.click()
    await vi.waitFor(() =>
      expect(card(root, 'الملاحظة').textContent).toContain('تعذّر فتح المحرّر'),
    )
  })

  it('نصّ فارغ: يُقال', async () => {
    await seed(subject({ body: '' }))
    const root = await mount()
    expect(card(root, 'الملاحظة').textContent).toContain('لا نصّ للملاحظة')
  })
})

describe('معرّف مجهول أو سجلّ غير مقروء', () => {
  it('المعرّف الغائب: حالة خطأ بلا إعادة محاولة وبطريق عودة إلى القائمة', async () => {
    const root = await mount('nope')
    expect(q(root, '[role="alert"]')!.textContent).toContain('هذه المشكلة غير موجودة')
    expect(button(root, 'أعد المحاولة')).toBeUndefined()
    button(root, 'ارجع إلى المشكلات')!.click()
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(q(root, 'select')).toBeNull()
  })

  it('السجلّ التالف: رسالة المخطّط وطريق العودة، بلا بطاقات ولا كتابة', async () => {
    const bad = { ...issueFixture({ id: 'bad' }), title: '' }
    await issues.put(bad)
    const root = await mount('bad')
    expect(q(root, '[role="alert"]')!.textContent).toContain('تعذّرت قراءة هذه المشكلة')
    expect(q(root, '[role="alert"]')!.textContent).toContain('سجلّ مشكلة غير مقروء')
    expect(root.querySelectorAll('section')).toHaveLength(0)
    expect(button(root, 'ارجع إلى المشكلات')).toBeDefined()
  })

  it('السجلّ من نسخة أحدث يقول ذلك', async () => {
    await issues.put({ ...issueFixture({ id: 'newer' }), schemaVersion: 99 })
    const root = await mount('newer')
    expect(q(root, '[role="alert"]')!.textContent).toContain('نسخة أحدث')
  })
})
