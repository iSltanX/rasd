import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { loadProjectOverview, OVERVIEW_THUMBS } from '@/pages/library/project-overview'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { captures, colors, palettes, projects } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://example.com',
    url: 'https://example.com/',
    title: id,
    kind: 'area',
    status: 'ready',
    projectId: 'p1',
    tags: [],
    width: 10,
    height: 10,
    devicePixelRatio: 1,
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

describe('loadProjectOverview', () => {
  it('يعدّ الحيّ وحده لكل مشروع، ويرتّب أحدث اللقطات أوّلًا بحدّ الخمس', async () => {
    await projects.put({ id: 'p1', name: 'أ', color: '#0090FF', createdAt: NOW, updatedAt: NOW })
    await projects.put({
      id: 'p2',
      name: 'ب',
      color: '#E5484D',
      createdAt: NOW + 1,
      updatedAt: NOW,
    })
    for (let i = 0; i < 7; i++) await captures.put(capture(`c${i}`, { createdAt: NOW + i * 1000 }))
    await captures.put(capture('trashed', { trashedAt: NOW, createdAt: NOW + 99_000 }))
    await captures.put(capture('archived', { archived: true, createdAt: NOW + 98_000 }))
    await captures.put(capture('other', { projectId: 'p2' }))
    await palettes.put({ id: 'pal', name: 'ل', colors: ['#111'], projectId: 'p1', createdAt: NOW })
    await colors.put({
      id: 'col',
      hex: '#111111',
      name: '',
      note: '',
      source: 'manual',
      projectId: 'p2',
      sourceUrl: null,
      createdAt: NOW,
    })

    const result = await loadProjectOverview()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [a, b] = result.value
    expect(a?.id).toBe('p1')
    expect(a?.captures).toBe(7)
    expect(a?.palettes).toBe(1)
    expect(a?.colors).toBe(0)
    expect(a?.recent).toEqual(['c6', 'c5', 'c4', 'c3', 'c2'])
    expect(a?.recent).toHaveLength(OVERVIEW_THUMBS)
    expect(a?.updatedAt).toBe(NOW + 6000)
    expect(b?.captures).toBe(1)
    expect(b?.colors).toBe(1)
  })

  it('مشروع بلا لقطات: آخر تحديثه تعديلُه هو، ولا مصغّرات', async () => {
    await projects.put({
      id: 'p1',
      name: 'أ',
      color: '#0090FF',
      createdAt: NOW,
      updatedAt: NOW + 5,
    })
    const result = await loadProjectOverview()
    expect(result.ok && result.value[0]).toMatchObject({
      captures: 0,
      recent: [],
      updatedAt: NOW + 5,
    })
  })
})
