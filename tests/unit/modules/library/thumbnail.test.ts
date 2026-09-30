import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureThumbnail, fitDimensions, type ThumbnailEncoder } from '@/modules/library/thumbnail'
import { errWith } from '@/shared/result'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, thumbnails } from '@/shared/storage/repository'

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
})

describe('fitDimensions', () => {
  it('لا يكبِّر أصلًا أصغر من الحدّ من أي بُعد', () => {
    expect(fitDimensions(100, 60, 320)).toEqual({ width: 100, height: 60 })
    expect(fitDimensions(320, 320, 320)).toEqual({ width: 320, height: 320 })
  })

  it('يصغِّر حافظًا النسبة — العرض هو الضلع الأطول', () => {
    expect(fitDimensions(3200, 1600, 320)).toEqual({ width: 320, height: 160 })
  })

  it('يصغِّر حافظًا النسبة — الارتفاع هو الضلع الأطول', () => {
    expect(fitDimensions(1600, 3200, 320)).toEqual({ width: 160, height: 320 })
  })

  it('لا يُرجع صفرًا أبدًا حتى لأصل شديد الطول', () => {
    const { width, height } = fitDimensions(100_000, 1, 320)
    expect(width).toBe(320)
    expect(height).toBeGreaterThanOrEqual(1)
  })
})

describe('ensureThumbnail', () => {
  it('يُرجع مصغَّرة موجودة بلا استدعاء المُرمِّز إطلاقًا', async () => {
    await thumbnails.put({ id: 'c1', blob: new Blob(['x']), width: 10, height: 10 })

    let called = false
    const encoder: ThumbnailEncoder = {
      encode() {
        called = true
        return Promise.resolve(null)
      },
    }

    const result = await ensureThumbnail('c1', encoder)
    expect(result.ok && result.value?.width).toBe(10)
    expect(called).toBe(false)
  })

  it('يولِّد ويخزِّن حين تغيب المصغَّرة', async () => {
    await blobs.put({ id: 'c1', blob: new Blob(['abc']), mime: 'image/png', bytes: 3 })
    const encoder: ThumbnailEncoder = {
      encode() {
        return Promise.resolve({ blob: new Blob(['thumb']), width: 80, height: 60 })
      },
    }

    const result = await ensureThumbnail('c1', encoder)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toMatchObject({ id: 'c1', width: 80, height: 60 })

    const stored = await thumbnails.get('c1')
    expect(stored.ok && stored.value.width).toBe(80)
  })

  it('لا يُعيد استدعاء المُرمِّز في المرّة الثانية — يقرأ المخزَّن', async () => {
    await blobs.put({ id: 'c1', blob: new Blob(['abc']), mime: 'image/png', bytes: 3 })
    let calls = 0
    const encoder: ThumbnailEncoder = {
      encode() {
        calls += 1
        return Promise.resolve({ blob: new Blob(['t']), width: 1, height: 1 })
      },
    }

    await ensureThumbnail('c1', encoder)
    await ensureThumbnail('c1', encoder)
    expect(calls).toBe(1)
  })

  it('تعذُّر الترميز يُرجع ok(null) لا عطلًا — ولا يكتب سجلًّا', async () => {
    await blobs.put({ id: 'c1', blob: new Blob(['abc']), mime: 'image/png', bytes: 3 })
    const encoder: ThumbnailEncoder = { encode: () => Promise.resolve(null) }

    const result = await ensureThumbnail('c1', encoder)
    expect(result.ok && result.value).toBeNull()
    expect((await thumbnails.get('c1')).ok).toBe(false)
  })

  it('غياب اللقطة الأصلية خطأ حقيقي — لا تدهور صامت', async () => {
    const encoder: ThumbnailEncoder = {
      encode: () => Promise.resolve({ blob: new Blob(), width: 1, height: 1 }),
    }
    const result = await ensureThumbnail('لا-وجود', encoder)
    expect(result.ok).toBe(false)
  })
})

describe('ensureThumbnail — مسارات الفشل', () => {
  /** مُرمِّز يعدّ نداءاته ويُنتج مصغَّرة صالحة. */
  function countingEncoder() {
    const encode = vi.fn(() =>
      Promise.resolve({ blob: new Blob(['thumb']), width: 80, height: 60 }),
    )
    return { encode } satisfies ThumbnailEncoder
  }

  /**
   * «غير موجود» وحده يعني «ولِّد». أي خطأ آخر في قراءة المصغَّرة (تلف، مخزن
   * تعذّر فتحه) لا يُعامَل كغياب — وإلا وُلِّدت فوق سجلّ لا نعرف حاله.
   */
  it('خطأ في قراءة المصغَّرة غير «غير موجود» يُرجَع ولا يُولَّد شيء', async () => {
    await blobs.put({ id: 'c1', blob: new Blob(['abc']), mime: 'image/png', bytes: 3 })
    vi.spyOn(thumbnails, 'get').mockResolvedValueOnce(errWith('unknown', 'قراءة معطوبة'))
    const encoder = countingEncoder()

    const result = await ensureThumbnail('c1', encoder)

    expect(!result.ok && result.error.detail).toBe('قراءة معطوبة')
    expect(encoder.encode).not.toHaveBeenCalled()
  })

  it('فشل حفظ المصغَّرة المولَّدة يُرجَع كما هو ولا يبقى سجلّ', async () => {
    await blobs.put({ id: 'c1', blob: new Blob(['abc']), mime: 'image/png', bytes: 3 })
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    setIncognitoWritePolicy(true)
    const encoder = countingEncoder()

    const result = await ensureThumbnail('c1', encoder)

    // الترميز جرى فعلًا — الفشل في الكتابة لا في التوليد.
    expect(encoder.encode).toHaveBeenCalledTimes(1)
    expect(!result.ok && result.error.code).toBe('incognito-blocked')
    expect((await thumbnails.get('c1')).ok).toBe(false)
  })
})
