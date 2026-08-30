import { describe, expect, it } from 'vitest'

import { DEFAULT_LIBRARY_FILTERS } from '@/modules/library/filters'
import { queryCaptures } from '@/modules/library/query'

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

const noProjectNames = () => ''

describe('queryCaptures', () => {
  it('يصفّي ثم يرتِّب — الترتيب لا يُسقط سجلًّا استبعدته التصفية', () => {
    const records = [
      capture('a', { favorite: true, createdAt: 300 }),
      capture('b', { favorite: false, createdAt: 200 }),
      capture('c', { favorite: true, createdAt: 100 }),
    ]
    const result = queryCaptures(
      records,
      {
        filters: { ...DEFAULT_LIBRARY_FILTERS, favorite: true },
        sortKey: 'date',
        sortDirection: 'asc',
      },
      noProjectNames,
    )
    expect(result.map((r) => r.id)).toEqual(['c', 'a'])
  })

  it('التصفية الافتراضية تستثني الأرشيف والمهملات قبل الترتيب', () => {
    const records = [
      capture('live', { createdAt: 100 }),
      capture('archived', { createdAt: 200, archived: true }),
      capture('trashed', { createdAt: 300, trashedAt: 500 }),
    ]
    const result = queryCaptures(
      records,
      { filters: DEFAULT_LIBRARY_FILTERS, sortKey: 'date', sortDirection: 'desc' },
      noProjectNames,
    )
    expect(result.map((r) => r.id)).toEqual(['live'])
  })

  it('قائمة مبحوثة سلفًا فارغة ⇒ نتيجة فارغة بلا خطأ', () => {
    const result = queryCaptures(
      [],
      { filters: DEFAULT_LIBRARY_FILTERS, sortKey: 'date', sortDirection: 'desc' },
      noProjectNames,
    )
    expect(result).toEqual([])
  })
})
