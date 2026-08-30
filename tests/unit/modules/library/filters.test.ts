import { describe, expect, it } from 'vitest'

import {
  ARCHIVE_FILTERS,
  DEFAULT_LIBRARY_FILTERS,
  filterRecords,
  matchesFilters,
  TRASH_FILTERS,
} from '@/modules/library/filters'

import type { CaptureRecord } from '@/shared/storage/schema'

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: 1_700_000_000_000,
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

describe('matchesFilters', () => {
  it('حقل غير مُمرَّر لا يُقيِّد شيئًا', () => {
    expect(matchesFilters(capture('a'), {})).toBe(true)
  })

  it('يفرِّق بين حيّ ومهمَل بواسطة trashed', () => {
    const live = capture('a', { trashedAt: null })
    const trashed = capture('b', { trashedAt: 1_700_000_100_000 })
    expect(matchesFilters(live, { trashed: false })).toBe(true)
    expect(matchesFilters(live, { trashed: true })).toBe(false)
    expect(matchesFilters(trashed, { trashed: true })).toBe(true)
    expect(matchesFilters(trashed, { trashed: false })).toBe(false)
  })

  it('التصفية بالوسم تتطلّب وجوده في مصفوفة الوسوم', () => {
    const tagged = capture('a', { tags: ['ui', 'bug'] })
    expect(matchesFilters(tagged, { tag: 'bug' })).toBe(true)
    expect(matchesFilters(tagged, { tag: 'perf' })).toBe(false)
  })
})

describe('filterRecords — تجميع تقاطعًا لا اتحادًا', () => {
  const records = [
    capture('a', { projectId: 'p1', favorite: true, kind: 'area' }),
    capture('b', { projectId: 'p1', favorite: false, kind: 'element' }),
    capture('c', { projectId: 'p2', favorite: true, kind: 'area' }),
  ]

  it('مرشِّح واحد يصفّي كما هو متوقَّع', () => {
    expect(filterRecords(records, { projectId: 'p1' }).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('مرشِّحان معًا يُضيّقان — التقاطع لا الاتحاد', () => {
    // كلاهما يطابق p1 وكلاهما يطابق favorite=true منفردَين، لكن السجلّ
    // الوحيد الذي يطابق الاثنين معًا هو 'a' فقط — لا 'a' و'c' معًا (اتحاد خاطئ).
    const result = filterRecords(records, { projectId: 'p1', favorite: true })
    expect(result.map((r) => r.id)).toEqual(['a'])
  })

  it('ثلاثة مرشِّحات معًا لا تُرجع أكثر ممّا يُرجعه أضيقها', () => {
    const narrower = filterRecords(records, { projectId: 'p1' })
    const combined = filterRecords(records, { projectId: 'p1', favorite: false, kind: 'element' })
    expect(combined.length).toBeLessThanOrEqual(narrower.length)
    expect(combined.map((r) => r.id)).toEqual(['b'])
  })

  it('لا مطابقة لأي سجلّ إن تناقضت المرشِّحات', () => {
    expect(filterRecords(records, { projectId: 'p1', kind: 'area', favorite: false })).toEqual([])
  })
})

describe('المرشِّحات الافتراضية المُصدَّرة', () => {
  const live = capture('a', { archived: false, trashedAt: null })
  const archived = capture('b', { archived: true, trashedAt: null })
  const trashed = capture('c', { archived: false, trashedAt: 1_700_000_100_000 })

  it('DEFAULT_LIBRARY_FILTERS يستثني الأرشيف والمهملات', () => {
    expect(matchesFilters(live, DEFAULT_LIBRARY_FILTERS)).toBe(true)
    expect(matchesFilters(archived, DEFAULT_LIBRARY_FILTERS)).toBe(false)
    expect(matchesFilters(trashed, DEFAULT_LIBRARY_FILTERS)).toBe(false)
  })

  it('ARCHIVE_FILTERS يُظهر المؤرشَف الحيّ وحده', () => {
    expect(matchesFilters(archived, ARCHIVE_FILTERS)).toBe(true)
    expect(matchesFilters(live, ARCHIVE_FILTERS)).toBe(false)
    expect(matchesFilters(trashed, ARCHIVE_FILTERS)).toBe(false)
  })

  it('TRASH_FILTERS يُظهر كل المهمَل بصرف النظر عن الأرشفة', () => {
    const trashedAndArchived = capture('d', { archived: true, trashedAt: 1_700_000_100_000 })
    expect(matchesFilters(trashed, TRASH_FILTERS)).toBe(true)
    expect(matchesFilters(trashedAndArchived, TRASH_FILTERS)).toBe(true)
    expect(matchesFilters(live, TRASH_FILTERS)).toBe(false)
  })
})
