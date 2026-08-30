import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import { LATEST_MIGRATION, MIGRATIONS, migrationPath } from '@/shared/storage/migrations'
import { BLOCK_RATIO, levelFor, WARN_RATIO } from '@/shared/storage/quota'
import {
  annotations,
  blobs,
  captures,
  clearAllStores,
  colors,
  deleteCaptureWithBlob,
  guides,
  palettes,
  projects,
  putCaptureWithBlob,
  references,
  repository,
  tags,
  thumbnails,
} from '@/shared/storage/repository'
import { DB_VERSION, STORE_NAMES } from '@/shared/storage/schema'

function capture(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    createdAt: 1_700_000_000_000,
    origin: 'https://example.com',
    url: 'https://example.com/page',
    title: 'صفحة',
    kind: 'area' as const,
    status: 'ready' as const,
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

describe('المخطّط', () => {
  it('يُنشئ المخازن العشرة كلها', async () => {
    const db = await database()
    expect([...db.objectStoreNames].sort()).toEqual([...STORE_NAMES].sort())
    expect(db.version).toBe(DB_VERSION)
  })

  it('يُنشئ فهارس captures الخمسة', async () => {
    const db = await database()
    const tx = db.transaction('captures')
    expect([...tx.store.indexNames].sort()).toEqual(
      ['createdAt', 'kind', 'origin', 'projectId', 'status'].sort(),
    )
  })

  it('blobs بلا فهارس — يُقرأ بالمعرّف فقط', async () => {
    const db = await database()
    expect([...db.transaction('blobs').store.indexNames]).toEqual([])
  })

  it('thumbnails بلا فهارس أيضًا — نفس منطق blobs (المرحلة 18)', async () => {
    const db = await database()
    expect([...db.transaction('thumbnails').store.indexNames]).toEqual([])
  })
})

describe('CRUD على كل مخزن', () => {
  const cases: [string, () => Promise<unknown>][] = [
    ['captures', async () => captures.put(capture('c1'))],
    [
      'blobs',
      async () => blobs.put({ id: 'b1', blob: new Blob(['x']), mime: 'image/png', bytes: 1 }),
    ],
    [
      'projects',
      async () =>
        projects.put({ id: 'p1', name: 'مشروع', color: '#fff', createdAt: 1, updatedAt: 1 }),
    ],
    [
      'colors',
      async () =>
        colors.put({
          id: 'k1',
          hex: '#3B82F6',
          name: 'أزرق',
          note: '',
          source: 'css',
          projectId: null,
          sourceUrl: null,
          createdAt: 1,
        }),
    ],
    [
      'palettes',
      async () =>
        palettes.put({ id: 'l1', name: 'لوحة', colors: ['#000'], projectId: null, createdAt: 1 }),
    ],
    [
      'references',
      async () =>
        references.put({
          id: 'r1',
          projectId: null,
          origin: 'https://a.com',
          path: '/',
          viewport: 'desktop',
          blobId: 'b1',
          createdAt: 1,
        }),
    ],
    ['annotations', async () => annotations.put({ captureId: 'c1', scene: {}, updatedAt: 1 })],
    [
      'guides',
      async () =>
        guides.put({ id: 'g1', title: 'دليل', projectId: null, captureIds: [], createdAt: 1 }),
    ],
    ['tags', async () => tags.put({ name: 'خطأ بصري', count: 3 })],
    [
      'thumbnails',
      async () => thumbnails.put({ id: 'c1', blob: new Blob(['x']), width: 100, height: 60 }),
    ],
  ]

  it.each(cases)('يكتب ويقرأ ويعدّ ويحذف في %s', async (name, write) => {
    const repo = repository(name as never)
    const written = (await write()) as { ok: boolean }
    expect(written.ok, `الكتابة في ${name}`).toBe(true)

    const counted = await repo.count()
    expect(counted.ok && counted.value).toBe(1)

    const all = await repo.getAll()
    expect(all.ok && all.value.length).toBe(1)

    const cleared = await repo.clear()
    expect(cleared.ok).toBe(true)
    const after = await repo.count()
    expect(after.ok && after.value).toBe(0)
  })

  it('القراءة بمفتاح غير موجود تعطي not-found', async () => {
    const missing = await captures.get('nope')
    expect(missing.ok).toBe(false)
    expect(missing.ok === false && missing.error.code).toBe('not-found')
  })

  it('الاستعلام بالفهرس يصفّي', async () => {
    await captures.putMany([
      capture('a', { origin: 'https://one.com' }),
      capture('b', { origin: 'https://two.com' }),
      capture('c', { origin: 'https://one.com' }),
    ])
    const found = await captures.byIndex('origin', 'https://one.com')
    expect(found.ok && found.value.map((r) => r.id).sort()).toEqual(['a', 'c'])
  })
})

describe('اللقطة وبايتاتها ذرّيًا', () => {
  it('يكتب السجلّ والـBlob معًا', async () => {
    const saved = await putCaptureWithBlob(capture('x1'), new Blob(['abc'], { type: 'image/png' }))
    expect(saved.ok).toBe(true)

    const meta = await captures.get('x1')
    const bytes = await blobs.get('x1')
    expect(meta.ok).toBe(true)
    expect(bytes.ok && bytes.value.bytes).toBe(3)
    expect(bytes.ok && bytes.value.mime).toBe('image/png')
  })

  it('الحذف لا يترك بايتات يتيمة — بما فيها المصغَّرة (المرحلة 18)', async () => {
    await putCaptureWithBlob(capture('x2'), new Blob(['abc']))
    await thumbnails.put({ id: 'x2', blob: new Blob(['t']), width: 10, height: 10 })
    await deleteCaptureWithBlob('x2')
    expect((await captures.get('x2')).ok).toBe(false)
    expect((await blobs.get('x2')).ok).toBe(false)
    expect((await thumbnails.get('x2')).ok).toBe(false)
  })

  it('clearAllStores يُفرِغ كل شيء', async () => {
    await putCaptureWithBlob(capture('x3'), new Blob(['abc']))
    await tags.put({ name: 'وسم', count: 1 })
    const result = await clearAllStores()
    expect(result.ok && result.value).toBe(10)
    const capturesLeft = await captures.count()
    const tagsLeft = await tags.count()
    expect(capturesLeft.ok && capturesLeft.value).toBe(0)
    expect(tagsLeft.ok && tagsLeft.value).toBe(0)
  })
})

describe('الترحيل', () => {
  it('نسخة المخطّط تطابق أعلى ترحيل', () => {
    expect(LATEST_MIGRATION).toBe(DB_VERSION)
  })

  it('مسار الترحيل مرتَّب ومتّصل', () => {
    expect(migrationPath(0, 1)).toEqual([1])
    expect(migrationPath(0, 3)).toEqual([1, 2, 3])
    expect(migrationPath(2, 2)).toEqual([])
  })

  it('الترقية من 0 إلى DB_VERSION الحالية تُنشئ البنية كاملة', async () => {
    const db = await database()
    expect(db.objectStoreNames.length).toBe(STORE_NAMES.length)
  })

  it('نسخة بلا خطوة تفشل بأمان بدل ترك القاعدة نصف مُرحَّلة', async () => {
    const { runMigrations } = await import('@/shared/storage/migrations')
    // من نسخة مُرحَّلة أصلًا: الخطوة 2 غير موجودة، فيتوقّف قبل لمس القاعدة.
    expect(() => runMigrations({} as never, {} as never, DB_VERSION, DB_VERSION + 5)).toThrowError(
      /لا خطوة ترحيل/,
    )
  })

  it('البيانات المكتوبة تبقى بعد إعادة الفتح', async () => {
    await captures.put(capture('persist'))
    await closeDatabase()
    const again = await captures.get('persist')
    expect(again.ok && again.value.title).toBe('صفحة')
  })

  it('لكل نسخة حتى DB_VERSION خطوة معرَّفة', () => {
    for (let v = 1; v <= DB_VERSION; v++) {
      expect(MIGRATIONS[v], `النسخة ${v} بلا خطوة`).toBeTypeOf('function')
    }
  })
})

describe('الحصّة', () => {
  it.each([
    [0, 'ok'],
    [0.5, 'ok'],
    [WARN_RATIO, 'warn'],
    [0.9, 'warn'],
    [BLOCK_RATIO, 'block'],
    [1, 'block'],
  ])('النسبة %s → %s', (ratio, level) => {
    expect(levelFor(ratio)).toBe(level)
  })

  it('تجاوز الحدّ يعطي خطأً واضحًا لا فشلًا صامتًا', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: () => Promise.resolve({ usage: 99, quota: 100 }) },
    })
    const blocked = await captures.put(capture('blocked'))
    expect(blocked.ok).toBe(false)
    expect(blocked.ok === false && blocked.error.code).toBe('quota-exceeded')
    expect(blocked.ok === false && blocked.error.message).toMatch(/ممتلئة/)
    vi.unstubAllGlobals()
  })

  it('الحجم الوارد يُحتسب قبل الكتابة', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: () => Promise.resolve({ usage: 50, quota: 100 }) },
    })
    // 50 مستخدَمة + 46 واردة = 96% ≥ 95%
    const blocked = await putCaptureWithBlob(capture('big'), new Blob(['x'.repeat(46)]))
    expect(blocked.ok).toBe(false)
    expect(blocked.ok === false && blocked.error.code).toBe('quota-exceeded')
    vi.unstubAllGlobals()
  })
})

describe('التصفّح الخاص', () => {
  it('الكتابة مرفوضة عند تفعيل السياسة', async () => {
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    setIncognitoWritePolicy(true)

    const blocked = await captures.put(capture('incognito'))
    expect(blocked.ok).toBe(false)
    expect(blocked.ok === false && blocked.error.code).toBe('incognito-blocked')

    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
  })

  it('الكتابة مسموحة عند تعطيل السياسة', async () => {
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    setIncognitoWritePolicy(false)
    expect((await captures.put(capture('allowed'))).ok).toBe(true)
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
  })

  it('القراءة غير متأثّرة بالسياسة', async () => {
    setIncognitoWritePolicy(false)
    await captures.put(capture('readable'))
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
    setIncognitoWritePolicy(true)
    expect((await captures.get('readable')).ok).toBe(true)
    Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
  })
})
