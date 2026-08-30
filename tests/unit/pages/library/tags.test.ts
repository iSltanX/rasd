import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  addTagToCaptures,
  loadTagsWithCounts,
  removeTagFromCapture,
  suggestTags,
} from '@/pages/library/tags'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { captures, tags } from '@/shared/storage/repository'

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

describe('addTagToCaptures', () => {
  it('يضيف الوسم إلى كل لقطة ويُنشئ عدّاده بقيمة صحيحة', async () => {
    await captures.putMany([capture('a'), capture('b'), capture('c')])
    const added = await addTagToCaptures(['a', 'b'], 'خطأ بصري')
    expect(added.ok && added.value).toBe(2)

    const a = await captures.get('a')
    const c = await captures.get('c')
    expect(a.ok && a.value.tags).toEqual(['خطأ بصري'])
    expect(c.ok && c.value.tags).toEqual([])

    const tag = await tags.get('خطأ بصري')
    expect(tag.ok && tag.value.count).toBe(2)
  })

  it('لقطة تحمل الوسم مسبقًا لا تُحتسَب مرّتين', async () => {
    await captures.put(capture('a', { tags: ['موجود'] }))
    await tags.put({ name: 'موجود', count: 1 })

    const added = await addTagToCaptures(['a'], 'موجود')
    expect(added.ok && added.value).toBe(0)

    const a = await captures.get('a')
    expect(a.ok && a.value.tags).toEqual(['موجود'])
    const tag = await tags.get('موجود')
    expect(tag.ok && tag.value.count).toBe(1)
  })

  it('اسم فارغ أو بياض محض لا يفعل شيئًا', async () => {
    await captures.put(capture('a'))
    const added = await addTagToCaptures(['a'], '   ')
    expect(added.ok && added.value).toBe(0)
    const a = await captures.get('a')
    expect(a.ok && a.value.tags).toEqual([])
  })

  it('يُقصّ البياض حول الاسم قبل الإضافة', async () => {
    await captures.put(capture('a'))
    await addTagToCaptures(['a'], '  عاجل  ')
    const a = await captures.get('a')
    expect(a.ok && a.value.tags).toEqual(['عاجل'])
  })

  it('معرِّفات غير موجودة تُتجاهَل بصمت', async () => {
    await captures.put(capture('a'))
    const added = await addTagToCaptures(['a', 'لا-وجود'], 'وسم')
    expect(added.ok && added.value).toBe(1)
  })
})

describe('removeTagFromCapture', () => {
  it('يزيل الوسم وينقص العدّاد', async () => {
    await captures.put(capture('a', { tags: ['x', 'y'] }))
    await tags.put({ name: 'x', count: 2 })

    const removed = await removeTagFromCapture('a', 'x')
    expect(removed.ok).toBe(true)

    const a = await captures.get('a')
    expect(a.ok && a.value.tags).toEqual(['y'])
    const tag = await tags.get('x')
    expect(tag.ok && tag.value.count).toBe(1)
  })

  it('العدّاد يصل إلى صفر ⇒ يُحذَف سجلّ الوسم لا يبقى بصفر', async () => {
    await captures.put(capture('a', { tags: ['وحيد'] }))
    await tags.put({ name: 'وحيد', count: 1 })

    await removeTagFromCapture('a', 'وحيد')

    expect((await tags.get('وحيد')).ok).toBe(false)
  })

  it('إزالة وسم لا تحمله اللقطة أصلًا لا تفعل شيئًا ولا تفشل', async () => {
    await captures.put(capture('a', { tags: [] }))
    const removed = await removeTagFromCapture('a', 'غير موجود')
    expect(removed.ok).toBe(true)
  })
})

describe('loadTagsWithCounts / suggestTags', () => {
  it('يُرجع كل الوسوم', async () => {
    await tags.putMany([
      { name: 'أ', count: 3 },
      { name: 'ب', count: 1 },
    ])
    const all = await loadTagsWithCounts()
    expect(all.ok && all.value).toHaveLength(2)
  })

  it('المقترحة مرتَّبة بالأكثر استعمالًا، محدودة بالحدّ', async () => {
    await tags.putMany([
      { name: 'نادر', count: 1 },
      { name: 'شائع', count: 10 },
      { name: 'متوسّط', count: 5 },
    ])
    const suggested = await suggestTags(2)
    expect(suggested.ok && suggested.value.map((t) => t.name)).toEqual(['شائع', 'متوسّط'])
  })
})
