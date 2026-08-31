import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  deleteColors,
  deleteGuides,
  deletePalettes,
  deleteReferences,
} from '@/pages/library/bulk-delete'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, colors, guides, palettes, references } from '@/shared/storage/repository'

const NOW = 1_700_000_000_000

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

describe('deleteColors', () => {
  it('يحذف الألوان المُحدَّدة ويُرجع عدد ما حُذف فعلًا', async () => {
    await colors.putMany([
      {
        id: 'a',
        hex: '#111',
        name: '',
        note: '',
        source: 'pixel',
        projectId: null,
        sourceUrl: null,
        createdAt: NOW,
      },
      {
        id: 'b',
        hex: '#222',
        name: '',
        note: '',
        source: 'pixel',
        projectId: null,
        sourceUrl: null,
        createdAt: NOW,
      },
      {
        id: 'c',
        hex: '#333',
        name: '',
        note: '',
        source: 'pixel',
        projectId: null,
        sourceUrl: null,
        createdAt: NOW,
      },
    ])

    const deleted = await deleteColors(['a', 'b'])
    expect(deleted.ok && deleted.value).toBe(2)
    expect((await colors.get('a')).ok).toBe(false)
    expect((await colors.get('b')).ok).toBe(false)
    expect((await colors.get('c')).ok).toBe(true)
  })

  it('معرِّفات غير موجودة تُتجاهَل بصمت — لا فشل كامل بسبب واحد', async () => {
    await colors.put({
      id: 'a',
      hex: '#111',
      name: '',
      note: '',
      source: 'pixel',
      projectId: null,
      sourceUrl: null,
      createdAt: NOW,
    })
    const deleted = await deleteColors(['a', 'لا-وجود'])
    expect(deleted.ok && deleted.value).toBe(1)
  })
})

describe('deletePalettes', () => {
  it('يحذف اللوحات المُحدَّدة', async () => {
    await palettes.putMany([
      { id: 'p1', name: 'أولى', colors: ['#111', '#222'], projectId: null, createdAt: NOW },
      { id: 'p2', name: 'ثانية', colors: ['#333'], projectId: null, createdAt: NOW },
    ])

    const deleted = await deletePalettes(['p1'])
    expect(deleted.ok && deleted.value).toBe(1)
    expect((await palettes.get('p1')).ok).toBe(false)
    expect((await palettes.get('p2')).ok).toBe(true)
  })
})

describe('deleteGuides', () => {
  it('يحذف الأدلة المُحدَّدة', async () => {
    await guides.putMany([
      { id: 'g1', title: 'دليل أوّل', projectId: null, captureIds: [], createdAt: NOW },
      { id: 'g2', title: 'دليل ثانٍ', projectId: null, captureIds: ['cap1'], createdAt: NOW },
    ])

    const deleted = await deleteGuides(['g1'])
    expect(deleted.ok && deleted.value).toBe(1)
    expect((await guides.get('g1')).ok).toBe(false)
    expect((await guides.get('g2')).ok).toBe(true)
  })
})

describe('deleteReferences — يحذف البايتات معًا لا السجلّ وحده', () => {
  it('يحذف المرجع وسجلّ blobs المرتبط به معًا', async () => {
    await blobs.put({ id: 'blob1', blob: new Blob(['x']), mime: 'image/png', bytes: 1 })
    await references.put({
      id: 'ref1',
      projectId: null,
      origin: 'https://figma.com',
      path: '1:1',
      viewport: 'desktop',
      blobId: 'blob1',
      createdAt: NOW,
    })

    const deleted = await deleteReferences(['ref1'])
    expect(deleted.ok && deleted.value).toBe(1)
    expect((await references.get('ref1')).ok).toBe(false)
    // العلّة الحقيقية لوجود هذا الملفّ: بلوب بلا مرجع بايتاتٌ ميتة —
    // نفس منطق deleteCaptureWithBlob (repository.ts).
    expect((await blobs.get('blob1')).ok).toBe(false)
  })

  it('مرجعان بـblobId منفصلَين — حذف أحدهما لا يمسّ بلوب الآخر', async () => {
    await blobs.putMany([
      { id: 'blobA', blob: new Blob(['a']), mime: 'image/png', bytes: 1 },
      { id: 'blobB', blob: new Blob(['b']), mime: 'image/png', bytes: 1 },
    ])
    await references.putMany([
      {
        id: 'refA',
        projectId: null,
        origin: 'https://a.com',
        path: '/',
        viewport: 'desktop',
        blobId: 'blobA',
        createdAt: NOW,
      },
      {
        id: 'refB',
        projectId: null,
        origin: 'https://b.com',
        path: '/',
        viewport: 'phone',
        blobId: 'blobB',
        createdAt: NOW,
      },
    ])

    await deleteReferences(['refA'])
    expect((await blobs.get('blobA')).ok).toBe(false)
    expect((await blobs.get('blobB')).ok).toBe(true)
    expect((await references.get('refB')).ok).toBe(true)
  })

  it('معرِّف غير موجود لا يحذف شيئًا ولا يفشل', async () => {
    const deleted = await deleteReferences(['لا-وجود'])
    expect(deleted.ok && deleted.value).toBe(0)
  })
})
