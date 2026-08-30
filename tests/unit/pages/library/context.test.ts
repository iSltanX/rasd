import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_LIBRARY_FILTERS } from '@/modules/library/filters'
import { TRASH_RETENTION_MS } from '@/modules/library/trash'
import {
  loadCounts,
  loadProjectNames,
  loadTab,
  purgeExpiredOnOpen,
  resolveThumbnailUrl,
  type ObjectUrls,
} from '@/pages/library/context'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, captures, colors, projects } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://example.com',
    url: 'https://example.com/page',
    title: 'صفحة',
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

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

describe('loadTab', () => {
  it('تبويب اللقطات: يبحث ثم يصفّي ثم يرتِّب', async () => {
    await captures.putMany([
      capture('a', { title: 'مراجعة التصميم', createdAt: 100, favorite: true }),
      capture('b', { title: 'مراجعة النص', createdAt: 200, favorite: false }),
      capture('c', { title: 'صفحة أخرى', createdAt: 300, favorite: true }),
    ])

    const result = await loadTab({
      tab: 'captures',
      searchQuery: 'مراجعة',
      captureQuery: {
        filters: { ...DEFAULT_LIBRARY_FILTERS, favorite: true },
        sortKey: 'date',
        sortDirection: 'asc',
      },
      projectNameLookup: () => '',
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.map((r) => r.id)).toEqual(['a'])
  })

  it('تبويب الألوان: بحث فقط، والأحدث أوّلًا افتراضيًا بلا شريط تصفية', async () => {
    await colors.putMany([
      {
        id: 'a',
        hex: '#111',
        name: 'أزرق',
        note: '',
        source: 'pixel',
        projectId: null,
        sourceUrl: null,
        createdAt: 100,
      },
      {
        id: 'b',
        hex: '#222',
        name: 'أزرق فاتح',
        note: '',
        source: 'pixel',
        projectId: null,
        sourceUrl: null,
        createdAt: 200,
      },
    ])

    const result = await loadTab({
      tab: 'colors',
      searchQuery: 'أزرق',
      captureQuery: { filters: {}, sortKey: 'date', sortDirection: 'desc' },
      projectNameLookup: () => '',
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.map((r) => (r as { id: string }).id)).toEqual(['b', 'a'])
  })
})

describe('loadProjectNames', () => {
  it('يبني خريطة معرِّف ← اسم', async () => {
    await projects.put({ id: 'p1', name: 'مشروع أ', color: '#fff', createdAt: 1, updatedAt: 1 })
    const names = await loadProjectNames()
    expect(names.p1).toBe('مشروع أ')
  })

  it('مخزن مشاريع فارغ ⇒ خريطة فارغة لا خطأ', async () => {
    expect(await loadProjectNames()).toEqual({})
  })
})

describe('loadCounts', () => {
  it('يعدّ الحالات الأربع بلا تداخل خاطئ', async () => {
    await captures.putMany([
      capture('live'),
      capture('fav', { favorite: true }),
      capture('archived', { archived: true }),
      capture('trashed', { trashedAt: NOW }),
    ])
    const result = await loadCounts()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ total: 2, favorites: 1, archived: 1, trashed: 1 })
    }
  })
})

describe('purgeExpiredOnOpen', () => {
  it('يطهِّر المنتهي عند الفتح', async () => {
    await captures.put(capture('expired', { trashedAt: NOW - TRASH_RETENTION_MS }))
    await purgeExpiredOnOpen(NOW)
    expect((await captures.get('expired')).ok).toBe(false)
  })
})

describe('resolveThumbnailUrl', () => {
  it('يولِّد ويحوِّل إلى عنوان كائن عبر المُحقَن', async () => {
    await blobs.put({ id: 'c1', blob: new Blob(['abc']), mime: 'image/png', bytes: 3 })
    const fakeUrls: ObjectUrls = { create: () => 'blob:fake-url' }
    const url = await resolveThumbnailUrl(
      'c1',
      { encode: () => Promise.resolve({ blob: new Blob(['t']), width: 10, height: 10 }) },
      fakeUrls,
    )
    expect(url).toBe('blob:fake-url')
  })

  it('تعذُّر التوليد ⇒ null بلا استدعاء صانع العناوين', async () => {
    await blobs.put({ id: 'c1', blob: new Blob(['abc']), mime: 'image/png', bytes: 3 })
    let called = false
    const fakeUrls: ObjectUrls = {
      create: () => {
        called = true
        return 'blob:should-not-happen'
      },
    }
    const url = await resolveThumbnailUrl('c1', { encode: () => Promise.resolve(null) }, fakeUrls)
    expect(url).toBeNull()
    expect(called).toBe(false)
  })
})
