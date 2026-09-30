import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { applyCheck, countByStatus } from '@/modules/issues/status'
import {
  ANY,
  DEFAULT_ISSUE_FILTERS,
  filterIssues,
  filterIssuesBase,
  isOpenableUrl,
  loadEvidence,
  loadIssue,
  loadIssues,
  matchesQuery,
  NO_PROJECT,
  noteAvailable,
  pageKey,
  pageLabel,
  pageOptions,
  parseSteps,
  setProject,
  setStatus,
  setSteps,
  sortNewest,
} from '@/pages/library/issues'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, captures, issues, projects, thumbnails } from '@/shared/storage/repository'

import { issueFixture } from '../../modules/issues/fixture'

import type { IssueRecord } from '@/shared/issue-schema'

const T0 = 1_700_000_000_000

function page(host: string, path: string): IssueRecord['page'] {
  return {
    url: `https://${host}${path}`,
    origin: `https://${host}`,
    path,
    title: `صفحة ${host}`,
    viewport: { width: 1440, height: 900, dpr: 2 },
  }
}

/** مشكلة بمعرّف وزمن تعديل — الباقي من عيّنة الاختبارات المشتركة. */
function issue(id: string, over: Partial<IssueRecord> = {}): IssueRecord {
  return issueFixture({ id, createdAt: T0, updatedAt: T0, ...over })
}

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

describe('القراءة', () => {
  it('تُرتَّب من الأحدث تعديلًا، وعند التساوي من الأحدث تسجيلًا', async () => {
    await issues.put(issue('old', { updatedAt: T0 }))
    await issues.put(issue('new', { updatedAt: T0 + 5_000 }))
    await issues.put(issue('tie-b', { updatedAt: T0 + 1_000, createdAt: T0 + 10 }))
    await issues.put(issue('tie-a', { updatedAt: T0 + 1_000, createdAt: T0 + 20 }))
    const loaded = await loadIssues()
    expect(loaded.ok && loaded.value.issues.map((i) => i.id)).toEqual([
      'new',
      'tie-a',
      'tie-b',
      'old',
    ])
    expect(loaded.ok && loaded.value.unreadable).toBe(0)
  })

  it('السجلّ التالف أو من نسخة أحدث لا يُعرض ويُعدّ — والباقي يُقرأ', async () => {
    await issues.put(issue('ok'))
    await issues.put({ ...issue('bad'), title: '' })
    await issues.put({ ...issue('newer'), schemaVersion: 99 })
    const loaded = await loadIssues()
    expect(loaded.ok && loaded.value.issues.map((i) => i.id)).toEqual(['ok'])
    expect(loaded.ok && loaded.value.unreadable).toBe(2)
  })

  it('loadIssue: المعرّف الغائب not-found، والتالف invalid-data برسالته', async () => {
    await issues.put(issue('ok'))
    await issues.put({ ...issue('bad'), title: '' })
    await issues.put({ ...issue('newer'), schemaVersion: 99 })

    const found = await loadIssue('ok')
    expect(found.ok && found.value.id).toBe('ok')
    const missing = await loadIssue('nope')
    expect(missing.ok === false && missing.error.code).toBe('not-found')
    const bad = await loadIssue('bad')
    expect(bad.ok === false && bad.error.code).toBe('invalid-data')
    const newer = await loadIssue('newer')
    expect(newer.ok === false && newer.error.message).toContain('نسخة أحدث')
  })

  it('sortNewest لا يغيّر مصفوفة الإدخال', () => {
    const input = [issue('a', { updatedAt: 1 }), issue('b', { updatedAt: 2 })]
    expect(sortNewest(input).map((i) => i.id)).toEqual(['b', 'a'])
    expect(input.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('التصفية', () => {
  const list = [
    issue('a', {
      title: 'حشوة الزرّ كبيرة',
      projectId: 'p1',
      status: 'open',
      page: page('northwind.example', '/pricing'),
    }),
    issue('b', {
      title: 'لون العنوان',
      projectId: null,
      status: 'resolved',
      page: page('northwind.example', '/about'),
      check: {
        kind: 'colour',
        property: 'color',
        actual: '#111111',
        expected: '#222222',
        tolerance: 2,
      },
    }),
    issue('c', {
      title: 'تباين النصّ',
      projectId: 'p2',
      status: 'needs-verification',
      page: page('Other.example', '/pricing'),
    }),
  ]

  it('البحث في العنوان والمحدِّد والخاصية ورابط الصفحة بلا اعتبار حالة الأحرف', () => {
    expect(matchesQuery(list[0]!, 'حشوة')).toBe(true) // عنوان
    expect(matchesQuery(list[0]!, 'CTA-BTN')).toBe(true) // محدِّد `.cta-btn`
    expect(matchesQuery(list[0]!, 'PADDING')).toBe(true) // خاصية
    expect(matchesQuery(list[0]!, 'NORTHWIND.example/PRICING')).toBe(true) // رابط
    expect(matchesQuery(list[2]!, 'other.example')).toBe(true) // رابط بأحرف كبيرة في الأصل
    expect(matchesQuery(list[0]!, 'لا يطابق شيئًا')).toBe(false)
    expect(matchesQuery(list[0]!, '   ')).toBe(true)
  })

  it('المشروع: كل المشاريع · بلا مشروع · مشروعٌ بعينه', () => {
    const ids = (f: Partial<typeof DEFAULT_ISSUE_FILTERS>) =>
      filterIssues(list, { ...DEFAULT_ISSUE_FILTERS, ...f }).map((i) => i.id)
    expect(ids({ project: ANY })).toEqual(['a', 'b', 'c'])
    expect(ids({ project: NO_PROJECT })).toEqual(['b'])
    expect(ids({ project: 'p1' })).toEqual(['a'])
    expect(ids({ project: 'غائب' })).toEqual([])
  })

  it('الصفحة بالأصل والمسار معًا — المسار نفسه على موقع آخر صفحةٌ أخرى', () => {
    const ids = (pageFilter: string) =>
      filterIssues(list, { ...DEFAULT_ISSUE_FILTERS, page: pageFilter }).map((i) => i.id)
    expect(ids(pageKey(list[0]!.page))).toEqual(['a'])
    expect(ids('https://northwind.example/about')).toEqual(['b'])
  })

  it('رقاقات الحالات تُعدّ بعد المرشّحات الأخرى وقبل مرشّح الحالة نفسه', () => {
    const filters = { ...DEFAULT_ISSUE_FILTERS, status: 'resolved' as const, query: 'pricing' }
    const base = filterIssuesBase(list, filters)
    expect(base.map((i) => i.id)).toEqual(['a', 'c'])
    expect(countByStatus(base)).toEqual({ open: 1, 'needs-verification': 1, resolved: 0 })
    expect(filterIssues(list, filters)).toEqual([])
    expect(filterIssues(list, { ...filters, status: 'open' }).map((i) => i.id)).toEqual(['a'])
  })

  it('pageLabel: المضيف والمسار، وأصلٌ تالف يبقى كما هو', () => {
    expect(pageLabel(list[0]!.page)).toBe('northwind.example/pricing')
    expect(pageLabel({ origin: 'ليس رابطًا', path: '/x' })).toBe('ليس رابطًا/x')
  })

  it('pageOptions: صفحات متمايزة مرتَّبة بتسميتها', () => {
    const options = pageOptions([
      ...list,
      issue('d', { page: page('northwind.example', '/about') }),
    ])
    expect(options.map((o) => o.label)).toEqual([
      'northwind.example/about',
      'northwind.example/pricing',
      // المضيف يُعرض كما يطبّعه `URL` — بأحرف صغيرة.
      'other.example/pricing',
    ])
    expect(options[0]!.value).toBe('https://northwind.example/about')
  })
})

describe('setStatus', () => {
  it('يكتب الحالة ويضيف حدثًا manual إلى التاريخ ويُحدّث updatedAt', async () => {
    await issues.put(issue('a', { status: 'open' }))
    const result = await setStatus('a', 'resolved', T0 + 9_000)
    expect(result.ok && result.value.status).toBe('resolved')
    expect(result.ok && result.value.updatedAt).toBe(T0 + 9_000)

    const stored = await loadIssue('a')
    expect(stored.ok && stored.value.status).toBe('resolved')
    expect(stored.ok && stored.value.history[0]).toEqual({
      kind: 'manual',
      at: T0 + 9_000,
      status: 'resolved',
    })
  })

  it('الحالة ذاتها لا تضيف حدثًا', async () => {
    await issues.put(issue('a', { status: 'open' }))
    const result = await setStatus('a', 'open', T0 + 9_000)
    expect(result.ok && result.value.history).toHaveLength(1)
    expect(result.ok && result.value.updatedAt).toBe(T0)
  })

  it('يقرأ ثم يكتب في معاملة واحدة: فحصٌ كتبته الخلفية بعد قراءة الصفحة لا يضيع', async () => {
    const original = issue('a', { status: 'open' })
    await issues.put(original)
    // الصفحة قرأت `original` فبقيت نسخةٌ قديمة في الذاكرة، ثم كتبت الخلفية نتيجة فحص.
    const rechecked = applyCheck(
      original,
      { id: 'a', outcome: 'match', observed: '12px 24px', reason: null },
      T0 + 1_000,
    )
    await issues.put(rechecked)

    const result = await setStatus('a', 'open', T0 + 2_000)
    expect(result.ok).toBe(true)
    const stored = await loadIssue('a')
    expect(stored.ok && stored.value.history.map((h) => h.kind)).toEqual([
      'manual',
      'check',
      'created',
    ])
    expect(stored.ok && stored.value.lastCheck?.outcome).toBe('match')
  })

  it('المعرّف الغائب والسجلّ غير المقروء يُقالان ولا يُكتب شيء', async () => {
    const missing = await setStatus('nope', 'resolved')
    expect(missing.ok === false && missing.error.code).toBe('not-found')

    const bad = { ...issue('bad'), title: '' }
    await issues.put(bad)
    const unreadable = await setStatus('bad', 'resolved')
    expect(unreadable.ok === false && unreadable.error.code).toBe('not-found')
    const raw = await issues.get('bad')
    expect(raw.ok && raw.value).toEqual(bad)
  })

  it('التصفّح الخاص يمنع الكتابة والفشل يُرجَع لا يُبتلع، والسجلّ كما كان', async () => {
    await issues.put(issue('a', { status: 'open' }))
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    setIncognitoWritePolicy(true)
    try {
      const blocked = await setStatus('a', 'resolved')
      expect(blocked.ok === false && blocked.error.code).toBe('incognito-blocked')
    } finally {
      Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
      setIncognitoWritePolicy(false)
    }
    const stored = await loadIssue('a')
    expect(stored.ok && stored.value.status).toBe('open')
  })
})

describe('setProject', () => {
  it('يُسند إلى مشروع ثم يُفكّ', async () => {
    await projects.put({ id: 'p1', name: 'مشروع', color: '#3B82F6', createdAt: T0, updatedAt: T0 })
    await issues.put(issue('a'))

    const assigned = await setProject('a', 'p1', T0 + 1_000)
    expect(assigned.ok && assigned.value.projectId).toBe('p1')
    expect(assigned.ok && assigned.value.updatedAt).toBe(T0 + 1_000)
    const byProject = await issues.byIndex('projectId', 'p1')
    expect(byProject.ok && byProject.value.map((i) => i.id)).toEqual(['a'])

    const cleared = await setProject('a', null, T0 + 2_000)
    expect(cleared.ok && cleared.value.projectId).toBeNull()
    const stored = await loadIssue('a')
    expect(stored.ok && stored.value.projectId).toBeNull()
  })

  it('مشروعٌ لم يعد موجودًا لا يُكتب معرّفًا يتيمًا', async () => {
    await issues.put(issue('a'))
    const result = await setProject('a', 'deleted', T0 + 1_000)
    expect(result.ok === false && result.error.code).toBe('not-found')
    const stored = await loadIssue('a')
    expect(stored.ok && stored.value.projectId).toBeNull()
  })
})

describe('الخطوات', () => {
  it('parseSteps: خطوة في كل سطر، والفارغ يُسقط، والمسافات تُقصّ', () => {
    const parsed = parseSteps('  افتح الصفحة \r\n\n   \nمرّر إلى البطل\n')
    expect(parsed.ok && parsed.value).toEqual(['افتح الصفحة', 'مرّر إلى البطل'])
    const empty = parseSteps('')
    expect(empty.ok && empty.value).toEqual([])
  })

  it('parseSteps: عشرون خطوة مقبولة والحادية والعشرون مرفوضة برسالة', () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `خطوة ${i + 1}`).join('\n')
    expect(parseSteps(lines(20)).ok).toBe(true)
    const over = parseSteps(lines(21))
    expect(over.ok === false && over.error.code).toBe('invalid-data')
    expect(over.ok === false && over.error.message).toContain('٢٠')
  })

  it('parseSteps: خمسمئة حرف مقبولة وما فوقها مرفوض بذكر رقم الخطوة', () => {
    expect(parseSteps('ب'.repeat(500)).ok).toBe(true)
    const over = parseSteps(`قصيرة\n${'ب'.repeat(501)}`)
    expect(over.ok === false && over.error.message).toContain('الخطوة ٢')
  })

  it('setSteps يكتب الخطوات ويُحدّث updatedAt، والمطابقة لا تمسّ الزمن', async () => {
    await issues.put(issue('a', { steps: ['واحدة'] }))
    const written = await setSteps('a', ['واحدة', 'اثنتان'], T0 + 3_000)
    expect(written.ok && written.value.steps).toEqual(['واحدة', 'اثنتان'])
    expect(written.ok && written.value.updatedAt).toBe(T0 + 3_000)

    const same = await setSteps('a', ['واحدة', 'اثنتان'], T0 + 9_000)
    expect(same.ok && same.value.updatedAt).toBe(T0 + 3_000)

    const cleared = await setSteps('a', [], T0 + 10_000)
    expect(cleared.ok && cleared.value.steps).toEqual([])
    const stored = await loadIssue('a')
    expect(stored.ok && stored.value.steps).toEqual([])
  })

  it('الغائبة تُقال، والمكتوب دائمًا مما يقبله مخطّط القراءة', async () => {
    const missing = await setSteps('nope', ['x'])
    expect(missing.ok === false && missing.error.code).toBe('not-found')
    await issues.put(issue('a'))
    await setSteps('a', ['ب'.repeat(500)])
    expect((await loadIssue('a')).ok).toBe(true)
  })
})

describe('رابط الصفحة', () => {
  it('http وhttps وحدهما يُفتحان', () => {
    expect(isOpenableUrl('https://northwind.example/pricing')).toBe(true)
    expect(isOpenableUrl('http://localhost:3000/x')).toBe(true)
    expect(isOpenableUrl('file:///Users/a/page.html')).toBe(false)
    expect(isOpenableUrl('chrome://extensions')).toBe(false)
    expect(isOpenableUrl('chrome-extension://abc/page.html')).toBe(false)
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false)
    expect(isOpenableUrl('ليس رابطًا')).toBe(false)
    expect(isOpenableUrl('')).toBe(false)
  })
})

describe('لقطة الدليل والملاحظة', () => {
  const blob = new Blob(['x'], { type: 'image/png' })

  it('الأصل من blobs أولًا', async () => {
    await blobs.put({ id: 'c1', blob, mime: 'image/png', bytes: 1 })
    await thumbnails.put({ id: 'c1', blob, width: 10, height: 10 })
    const image = await loadEvidence('c1')
    expect(image?.thumbnail).toBe(false)
    expect(image?.originalSize).toBeNull()
  })

  it('المصغَّرة بديلٌ عند غياب الأصل، بأبعاد اللقطة الأصلية من سجلّها', async () => {
    await thumbnails.put({ id: 'c1', blob, width: 10, height: 10 })
    await captures.put({
      id: 'c1',
      createdAt: T0,
      origin: 'https://example.com',
      url: 'https://example.com',
      title: 't',
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
    })
    const image = await loadEvidence('c1')
    expect(image?.thumbnail).toBe(true)
    expect(image?.originalSize).toEqual({ width: 464, height: 192 })
  })

  it('لا أصل ولا مصغَّرة: null — والمشكلة تبقى', async () => {
    await issues.put(issue('a'))
    expect(await loadEvidence('c1')).toBeNull()
    expect((await loadIssue('a')).ok).toBe(true)
  })

  it('الملاحظة تُعدّ متاحة ما بقيت لقطتها', async () => {
    const note = { captureId: 'c9', noteId: 'n1' }
    expect(await noteAvailable(note)).toBe(false)
    await captures.put({
      id: 'c9',
      createdAt: T0,
      origin: 'https://example.com',
      url: 'https://example.com',
      title: 't',
      kind: 'element',
      status: 'ready',
      projectId: null,
      tags: [],
      width: 1,
      height: 1,
      devicePixelRatio: 1,
      favorite: false,
      archived: false,
      trashedAt: null,
    })
    expect(await noteAvailable(note)).toBe(true)
  })
})
