import { describe, expect, it } from 'vitest'

import { DEFAULT_SORT_DIRECTION, DEFAULT_SORT_KEY, sortRecords } from '@/modules/library/sort'

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

const NAMES: Record<string, string> = { p1: 'ألف', p2: 'باء' }
const lookup = (id: string) => NAMES[id] ?? id

describe('sortRecords', () => {
  it('يرتِّب بالتاريخ تصاعديًا وتنازليًا', () => {
    const records = [
      capture('a', { createdAt: 300 }),
      capture('b', { createdAt: 100 }),
      capture('c', { createdAt: 200 }),
    ]
    expect(sortRecords(records, 'date', 'asc', lookup).map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(sortRecords(records, 'date', 'desc', lookup).map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })

  it('لا يُبدِّل المصفوفة الأصلية', () => {
    const records = [capture('a', { createdAt: 300 }), capture('b', { createdAt: 100 })]
    const original = [...records]
    sortRecords(records, 'date', 'asc', lookup)
    expect(records).toEqual(original)
  })

  it('يرتِّب بالمشروع أبجديًّا عربيًّا، ولا-مشروع يأتي أخيرًا دومًا', () => {
    const records = [
      capture('a', { projectId: 'p2' }),
      capture('b', { projectId: null }),
      capture('c', { projectId: 'p1' }),
    ]
    expect(sortRecords(records, 'project', 'asc', lookup).map((r) => r.id)).toEqual(['c', 'a', 'b'])
    // حتى تنازليًّا، «لا مشروع» يبقى أخيرًا — لا ترتيب معكوس زائف.
    expect(sortRecords(records, 'project', 'desc', lookup).map((r) => r.id)).toEqual([
      'a',
      'c',
      'b',
    ])
  })

  it('يرتِّب بالنوع أبجديًّا', () => {
    const records = [
      capture('a', { kind: 'full-page' }),
      capture('b', { kind: 'area' }),
      capture('c', { kind: 'element' }),
    ]
    expect(sortRecords(records, 'kind', 'asc', lookup).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('يرتِّب بالأصل (الموقع) أبجديًّا تصاعديًا وتنازليًا', () => {
    const records = [
      capture('b', { origin: 'https://b.example' }),
      capture('c', { origin: 'https://c.example' }),
      capture('a', { origin: 'https://a.example' }),
    ]
    expect(sortRecords(records, 'origin', 'asc', lookup).map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(sortRecords(records, 'origin', 'desc', lookup).map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  /**
   * لقطتان بلا مشروع متساويتان في الترتيب — لا تُبدَّل إحداهما بالأخرى. الترتيب
   * ثابت (stable)، فيبقى ترتيبهما الأصلي في الاتجاهين، ومعهما «لا مشروع» أخيرًا.
   */
  it('لقطات بلا مشروع تحفظ ترتيبها النسبي في الاتجاهين وتبقى أخيرًا', () => {
    const records = [
      capture('n1', { projectId: null }),
      capture('p', { projectId: 'p1' }),
      capture('n2', { projectId: null }),
    ]
    expect(sortRecords(records, 'project', 'asc', lookup).map((r) => r.id)).toEqual([
      'p',
      'n1',
      'n2',
    ])
    expect(sortRecords(records, 'project', 'desc', lookup).map((r) => r.id)).toEqual([
      'p',
      'n1',
      'n2',
    ])
  })

  it('الترتيب الافتراضي: الأحدث أولًا', () => {
    const records = [capture('a', { createdAt: 100 }), capture('b', { createdAt: 200 })]
    expect(
      sortRecords(records, DEFAULT_SORT_KEY, DEFAULT_SORT_DIRECTION, lookup).map((r) => r.id),
    ).toEqual(['b', 'a'])
  })
})
