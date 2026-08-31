import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  assignCaptureAsReference,
  assignImageAsReference,
  findReferenceForPage,
  type PageKey,
} from '@/modules/compare/reference'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, captures, references } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

const KEY: PageKey = { origin: 'https://example.com', path: '/pricing', viewport: 'desktop' }

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://example.com',
    url: 'https://example.com/pricing',
    title: 'التسعير',
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 1440,
    height: 900,
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

describe('findReferenceForPage', () => {
  it('لا مرجع بعد ⇒ null', async () => {
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value).toBeNull()
  })

  it('يجد مرجعًا بمطابقة origin+path+viewport الثلاثة معًا', async () => {
    await references.put({
      id: 'ref1',
      projectId: null,
      origin: KEY.origin,
      path: KEY.path,
      viewport: KEY.viewport,
      blobId: 'ref1',
      createdAt: NOW,
    })
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value?.id).toBe('ref1')
  })

  it('نفس origin بمسار مختلف لا يُطابَق', async () => {
    await references.put({
      id: 'ref1',
      projectId: null,
      origin: KEY.origin,
      path: '/other-page',
      viewport: KEY.viewport,
      blobId: 'ref1',
      createdAt: NOW,
    })
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value).toBeNull()
  })

  it('نفس origin+path بمقاس مختلف لا يُطابَق', async () => {
    await references.put({
      id: 'ref1',
      projectId: null,
      origin: KEY.origin,
      path: KEY.path,
      viewport: 'phone',
      blobId: 'ref1',
      createdAt: NOW,
    })
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value).toBeNull()
  })
})

describe('assignCaptureAsReference', () => {
  it('ينسخ بايتات اللقطة تحت معرِّف مرجع مستقلّ — لا يشارك blobId اللقطة', async () => {
    await captures.put(capture('cap1'))
    await blobs.put({ id: 'cap1', blob: new Blob(['x']), mime: 'image/png', bytes: 1 })

    const assigned = await assignCaptureAsReference('cap1', KEY, null, NOW)
    expect(assigned.ok).toBe(true)
    const record = assigned.ok ? assigned.value : null
    expect(record?.blobId).toBe(record?.id)
    expect(record?.blobId).not.toBe('cap1')

    // بلوب اللقطة الأصلية سليم، وبلوب المرجع منسوخ بمعرِّفه الخاصّ.
    expect((await blobs.get('cap1')).ok).toBe(true)
    expect((await blobs.get(record!.blobId)).ok).toBe(true)
  })

  it('حذف بلوب المرجع لاحقًا لا يمسّ بلوب اللقطة المصدر', async () => {
    await captures.put(capture('cap1'))
    await blobs.put({ id: 'cap1', blob: new Blob(['original']), mime: 'image/png', bytes: 8 })
    const assigned = await assignCaptureAsReference('cap1', KEY, null, NOW)
    const refBlobId = assigned.ok ? assigned.value.blobId : ''

    await blobs.remove(refBlobId)

    expect((await blobs.get('cap1')).ok).toBe(true)
    expect((await blobs.get(refBlobId)).ok).toBe(false)
  })

  it('تعيين ثانٍ على نفس الصفحة يستبدل المرجع بنفس المعرِّف — لا يضيف سجلًّا موازيًا', async () => {
    await captures.put(capture('cap1'))
    await captures.put(capture('cap2', { id: 'cap2' }))
    await blobs.put({ id: 'cap1', blob: new Blob(['a']), mime: 'image/png', bytes: 1 })
    await blobs.put({ id: 'cap2', blob: new Blob(['b']), mime: 'image/png', bytes: 1 })

    const first = await assignCaptureAsReference('cap1', KEY, null, NOW)
    const firstId = first.ok ? first.value.id : ''

    const second = await assignCaptureAsReference('cap2', KEY, null, NOW + 1000)
    expect(second.ok && second.value.id).toBe(firstId)
    expect(second.ok && second.value.createdAt).toBe(NOW) // createdAt الأصلي يبقى — استبدالٌ لا سجلّ جديد.

    const all = await references.getAll()
    expect(all.ok && all.value).toHaveLength(1)
  })

  it('لقطة غير موجودة تُرجع فشلًا — لا مرجع يُكتَب بلا مصدر', async () => {
    const assigned = await assignCaptureAsReference('لا-وجود', KEY, null, NOW)
    expect(assigned.ok).toBe(false)
    const all = await references.getAll()
    expect(all.ok && all.value).toHaveLength(0)
  })
})

describe('assignImageAsReference', () => {
  it('يحفظ صورة مرفوعة مرجعًا جديدًا', async () => {
    const image = new Blob(['png-bytes'], { type: 'image/png' })
    const assigned = await assignImageAsReference(image, KEY, 'proj1', NOW)
    expect(assigned.ok).toBe(true)
    expect(assigned.ok && assigned.value.projectId).toBe('proj1')

    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value?.id).toBe(assigned.ok ? assigned.value.id : '')
  })

  it('يستبدل مرجعًا من لقطة بصورة مرفوعة على نفس الصفحة', async () => {
    await captures.put(capture('cap1'))
    await blobs.put({ id: 'cap1', blob: new Blob(['a']), mime: 'image/png', bytes: 1 })
    const fromCapture = await assignCaptureAsReference('cap1', KEY, null, NOW)
    const id = fromCapture.ok ? fromCapture.value.id : ''

    const image = new Blob(['uploaded'], { type: 'image/png' })
    const fromImage = await assignImageAsReference(image, KEY, null, NOW + 500)
    expect(fromImage.ok && fromImage.value.id).toBe(id)

    const all = await references.getAll()
    expect(all.ok && all.value).toHaveLength(1)
  })
})
