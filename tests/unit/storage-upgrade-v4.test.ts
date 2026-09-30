import 'fake-indexeddb/auto'

import { Blob as NodeBlob } from 'node:buffer'

import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import { MIGRATIONS } from '@/shared/storage/migrations'
import { DB_NAME, DB_VERSION, STORE_NAMES, type RasdDB } from '@/shared/storage/schema'

import { issueFixture } from './modules/issues/fixture'

/**
 * ترقية القاعدة من النسخة 3 إلى 4 ببيانات مراجع حقيقية — كُتب **قبل** خطوة الترحيل (`AGENTS.md` §7،
 * `STAGES/34` الدفعة 2).
 *
 * نفس منهج `storage-upgrade-v3.test.ts`: القاعدة القديمة تُبنى بخطوات النسخ 1 و2 و3 كما جرت عند المستخدمين،
 * لا بمخطّطٍ منسوخ يدويًّا، ثمّ تُفتح بـ`database()` كما تفتحها الخلفية عند أوّل إقلاع بعد التحديث.
 *
 * **ويسقط بلا خطوة الترحيل:** بلا الخطوة 4 تبقى السجلّات بلا `exclusions`، فيسقط التأكيد الأوّل أدناه —
 * جُرِّب قبل كتابتها وبعد استبدالها بخطوة فارغة (سجلّ `STAGES/34`).
 */

const bytesBlob = (bytes: number[], type: string) => new NodeBlob([new Uint8Array(bytes)], { type })

const at = 1_780_000_000_000

/** مراجع النسخة 3 بشكلها الحرفي: صفحةٌ بمقاسين، وأخرى على أصلٍ آخر، ومرجعٌ يتيمٌ بلا بايتات. */
const legacyReferences = [
  {
    id: 'r-desktop',
    projectId: 'p1',
    origin: 'https://shop.example',
    path: '/cart',
    viewport: 'desktop',
    blobId: 'r-desktop',
    createdAt: at,
  },
  {
    id: 'r-phone',
    projectId: null,
    origin: 'https://shop.example',
    path: '/cart',
    viewport: 'phone',
    blobId: 'r-phone',
    createdAt: at + 1000,
  },
  {
    id: 'r-other',
    projectId: null,
    origin: 'https://news.example',
    path: '/',
    viewport: 'tablet',
    blobId: 'r-other',
    createdAt: at + 2000,
  },
  {
    id: 'r-orphan',
    projectId: null,
    origin: 'https://news.example',
    path: '/live',
    viewport: 'custom',
    blobId: 'r-orphan',
    createdAt: at + 3000,
  },
] as const

async function seedVersion3() {
  const v3 = await openDB<RasdDB>(DB_NAME, 3, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      for (let v = oldVersion + 1; v <= 3; v++) MIGRATIONS[v]?.(db, transaction)
    },
  })
  expect(v3.version).toBe(3)

  const tx = v3.transaction(['references', 'blobs', 'issues', 'captures'], 'readwrite')
  await Promise.all([
    // شكل النسخة 3 بلا الحقل الجديد — ولهذا يُتجاوز نوع النسخة 4 عمدًا.
    ...legacyReferences.map((r) => tx.objectStore('references').put(r as never)),
    ...legacyReferences
      .filter((r) => r.id !== 'r-orphan')
      .map((r, i) =>
        tx.objectStore('blobs').put({
          id: r.blobId,
          blob: bytesBlob([137, 80, 78, 71, i], 'image/png') as unknown as Blob,
          mime: 'image/png',
          bytes: 5,
        }),
      ),
    tx.objectStore('issues').put(issueFixture()),
    tx.objectStore('captures').put({
      id: 'c1',
      createdAt: at,
      origin: 'https://shop.example',
      url: 'https://shop.example/cart',
      title: 'السلّة',
      kind: 'viewport',
      status: 'ready',
      projectId: 'p1',
      tags: [],
      width: 1440,
      height: 900,
      devicePixelRatio: 2,
      favorite: false,
      archived: false,
      trashedAt: null,
    }),
    tx.done,
  ])
  v3.close()
}

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

describe('الترقية من النسخة 3 إلى 4', () => {
  it('لكل مرجعٍ قائم `exclusions: []`، وبقيّة حقوله كما كُتبت بلا فقد', async () => {
    await seedVersion3()

    const db = await database()
    const after = await db.getAll('references')

    // `getAll` يُرجع بترتيب المفتاح لا بترتيب الكتابة.
    const byId = [...legacyReferences].sort((p, q) => p.id.localeCompare(q.id))
    expect(after.map((r) => r.exclusions)).toEqual(byId.map(() => []))
    expect(after).toEqual(byId.map((r) => ({ ...r, exclusions: [] })))
    expect(db.version).toBe(4)
    expect(DB_VERSION).toBe(4)
  })

  it('والفهارس تعمل بعد الترقية: مرجعا الصفحة يُقرآن بأصلها كما قبلها', async () => {
    await seedVersion3()
    const db = await database()
    const byOrigin = await db.getAllFromIndex('references', 'origin', 'https://shop.example')
    expect(byOrigin.map((r) => [r.id, r.viewport, r.exclusions])).toEqual([
      ['r-desktop', 'desktop', []],
      ['r-phone', 'phone', []],
    ])
    expect((await db.getAllFromIndex('references', 'viewport', 'custom')).map((r) => r.id)).toEqual(
      ['r-orphan'],
    )
  })

  it('والمخازن الأخرى لا تُمسّ: البايتات والمشكلة واللقطة كما هي', async () => {
    await seedVersion3()
    const db = await database()

    const blob = await db.get('blobs', 'r-phone')
    expect([...new Uint8Array(await (blob?.blob as Blob).arrayBuffer())]).toEqual([
      137, 80, 78, 71, 1,
    ])
    expect(await db.count('blobs')).toBe(3)
    expect(await db.get('issues', issueFixture().id)).toEqual(issueFixture())
    expect((await db.get('captures', 'c1'))?.title).toBe('السلّة')
    expect([...db.objectStoreNames].sort()).toEqual([...STORE_NAMES].sort())
  })

  it('ومن قاعدة جديدة (النسخة 0) تمرّ الخطوات الأربع إلى البنية نفسها', async () => {
    const db = await database()
    expect(db.version).toBe(DB_VERSION)
    expect(await db.count('references')).toBe(0)
  })
})
