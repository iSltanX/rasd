import 'fake-indexeddb/auto'

import { openDB } from 'idb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import { MIGRATIONS } from '@/shared/storage/migrations'
import { ALL_STORE_NAMES, DB_NAME, DB_VERSION, type RasdDB } from '@/shared/storage/schema'

/**
 * ترقية القاعدة من النسخة 4 إلى 5 ببيانات أدلّة حقيقية — كُتب **قبل** خطوة الترحيل (`AGENTS.md` §7،
 * `STAGES/06` الدفعة 1).
 *
 * نفس منهج `storage-upgrade-v4.test.ts`: القاعدة القديمة تُبنى بخطوات النسخ 1–4 كما جرت عند المستخدمين، ثمّ
 * تُفتح بـ`database()` كما تفتحها الخلفية عند أوّل إقلاع بعد التحديث.
 *
 * **ويسقط بلا خطوة الترحيل:** بلاها يبقى الدليل بلا `stepText` ولا `updatedAt`، ولا مخزن `templates` — جُرِّب
 * قبل كتابتها (سجلّ `STAGES/06`).
 */

const at = 1_780_000_000_000

/** أدلّة النسخة 4 بشكلها الحرفي: دليلٌ بثلاث لقطات في مشروع، ودليلٌ فارغ، ودليلٌ بلقطةٍ حُذفت. */
const legacyGuides = [
  {
    id: 'g-cart',
    title: 'كيف تُبلّغ عن خطأ بصري',
    projectId: 'p1',
    captureIds: ['c3', 'c1', 'c2'],
    createdAt: at,
  },
  { id: 'g-empty', title: 'دليل فارغ', projectId: null, captureIds: [], createdAt: at + 1000 },
  { id: 'g-gone', title: 'لقطته حُذفت', projectId: null, captureIds: ['c9'], createdAt: at + 2000 },
] as const

function capture(id: string, offset: number) {
  return {
    id,
    createdAt: at + offset,
    origin: 'https://shop.example',
    url: `https://shop.example/${id}`,
    title: `لقطة ${id}`,
    kind: 'viewport' as const,
    status: 'ready' as const,
    projectId: 'p1',
    tags: [],
    width: 1440,
    height: 900,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}

async function seedVersion4() {
  const v4 = await openDB<RasdDB>(DB_NAME, 4, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      for (let v = oldVersion + 1; v <= 4; v++) MIGRATIONS[v]?.(db, transaction)
    },
  })
  expect(v4.version).toBe(4)

  const tx = v4.transaction(['guides', 'captures', 'references'], 'readwrite')
  await Promise.all([
    // شكل النسخة 4 بلا الحقلين الجديدين — ولهذا يُتجاوز نوع النسخة 5 عمدًا.
    ...legacyGuides.map((g) => tx.objectStore('guides').put(g as never)),
    ...['c1', 'c2', 'c3'].map((id, i) => tx.objectStore('captures').put(capture(id, i))),
    tx.objectStore('references').put({
      id: 'r1',
      projectId: null,
      origin: 'https://shop.example',
      path: '/cart',
      viewport: 'desktop',
      blobId: 'r1',
      createdAt: at,
      exclusions: [],
    }),
    tx.done,
  ])
  v4.close()
}

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

describe('الترقية من النسخة 4 إلى 5', () => {
  it('لكل دليلٍ قائم `stepText: {}` و`updatedAt` زمن إنشائه، وبقيّة حقوله كما كُتبت بترتيب لقطاته', async () => {
    await seedVersion4()

    const db = await database()
    const after = await db.getAll('guides')

    // `getAll` يُرجع بترتيب المفتاح لا بترتيب الكتابة.
    const byId = [...legacyGuides].sort((p, q) => p.id.localeCompare(q.id))
    expect(after).toEqual(byId.map((g) => ({ ...g, stepText: {}, updatedAt: g.createdAt })))
    expect(after.find((g) => g.id === 'g-cart')?.captureIds).toEqual(['c3', 'c1', 'c2'])
    expect(db.version).toBe(DB_VERSION)
    expect(DB_VERSION).toBeGreaterThanOrEqual(5)
  })

  it('ومخزن القوالب موجودٌ فارغًا، واسم القالب فريدٌ بفهرسه', async () => {
    await seedVersion4()
    const db = await database()
    expect(await db.count('templates')).toBe(0)

    const options = { format: 'pdf', pageSize: 'a4', numbered: true, notes: true } as const
    await db.put('templates', {
      id: 't1',
      name: 'تقرير الفريق',
      options,
      createdAt: at,
      updatedAt: at,
    })
    await expect(
      db.put('templates', {
        id: 't2',
        name: 'تقرير الفريق',
        options,
        createdAt: at,
        updatedAt: at,
      }),
    ).rejects.toBeTruthy()
    expect((await db.getFromIndex('templates', 'name', 'تقرير الفريق'))?.id).toBe('t1')
  })

  it('وفهرس المشروع يعمل بعد الترقية، والمخازن الأخرى لا تُمسّ', async () => {
    await seedVersion4()
    const db = await database()
    expect((await db.getAllFromIndex('guides', 'projectId', 'p1')).map((g) => g.id)).toEqual([
      'g-cart',
    ])
    expect(await db.count('captures')).toBe(3)
    expect((await db.get('references', 'r1'))?.exclusions).toEqual([])
    expect([...db.objectStoreNames].sort()).toEqual([...ALL_STORE_NAMES].sort())
  })

  it('ومن قاعدة جديدة (النسخة 0) تمرّ الخطوات الخمس إلى البنية نفسها', async () => {
    const db = await database()
    expect(db.version).toBe(DB_VERSION)
    expect(await db.count('guides')).toBe(0)
    expect(await db.count('templates')).toBe(0)
  })
})

/** نفس ضمان الخطوة 4: رميٌ متزامن في منتصف الخطوة يُجهض الترقية كلّها ولا يُثبّتها نصف مُرحَّلة. */
describe('الترقية إلى 5 — كلّها أو لا شيء', () => {
  it('رميٌ متزامن في منتصف الخطوة يُبقي القاعدة على النسخة 4 بلا نصف ترحيل، والنداء التالي يعيد المحاولة', async () => {
    await seedVersion4()
    const update = Reflect.get(IDBCursor.prototype, 'update')
    let calls = 0
    const spy = vi.spyOn(IDBCursor.prototype, 'update').mockImplementation(function (
      this: IDBCursor,
      value: unknown,
    ) {
      if (++calls === 2) throw new DOMException('لا يُستنسخ', 'DataCloneError')
      return update.call(this, value)
    })

    await expect(database()).rejects.toBeTruthy()
    spy.mockRestore()

    const raw = await openDB(DB_NAME)
    expect(raw.version).toBe(4)
    expect(raw.objectStoreNames.contains('templates')).toBe(false)
    const untouched = await raw.getAll('guides')
    expect(untouched.map((g) => (g as { stepText?: unknown }).stepText)).toEqual(
      legacyGuides.map(() => undefined),
    )
    raw.close()

    const retried = await database()
    expect(retried.version).toBe(DB_VERSION)
    expect((await retried.getAll('guides')).every((g) => typeof g.updatedAt === 'number')).toBe(
      true,
    )
  })
})
