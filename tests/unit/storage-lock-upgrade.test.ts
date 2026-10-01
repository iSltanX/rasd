import 'fake-indexeddb/auto'

import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

import { closeDatabase } from '@/shared/storage/db'
import { libraryCounts, readLibrary } from '@/shared/storage/library'
import { MIGRATIONS } from '@/shared/storage/migrations'
import { blobs, captures, issues } from '@/shared/storage/repository'
import { DB_NAME, DB_VERSION, STORE_NAMES, type RasdDB, type StoreName } from '@/shared/storage/schema'

/**
 * مكتبةٌ قائمة بلا قفل تبقى مقروءةً كاملة بعد الترقية — كُتب **قبل** حارس القفل في `withDb` (`AGENTS.md` §7،
 * `STAGES/08` معيار القبول الأوّل، ADR 0043 §6).
 *
 * القفل لا يغيّر القاعدة (`DB_VERSION` باقٍ)، فالخطر ليس ترحيلًا يُسقط سجلًّا بل حارسٌ يُغلق افتراضيًّا: مستخدمٌ لم
 * يفعّل القفل قطّ يجد مكتبته «مقفلة» بعد التحديث. فالقاعدة تُبنى بخطوات النسخ 1–5 كما جرت عند المستخدمين وفي كل
 * مخزنٍ سجلّ، و`chrome.storage` بما كتبه الإصدار السابق وحده (الإعدادات و«آخر نسخة»)، ثمّ تُقرأ كما تقرؤها
 * المكتبة والنسخة الاحتياطية.
 */

const at = 1_780_000_000_000

/** سجلٌّ واحد لكل مخزن بشكل النسخة 5 — الحقول التي تحملها المفاتيح والفهارس وحدها تكفي هنا. */
const SEED: { [S in StoreName]: object } = {
  captures: {
    id: 'c1',
    createdAt: at,
    origin: 'https://shop.example',
    url: 'https://shop.example/cart',
    title: 'السلّة',
    kind: 'viewport',
    status: 'ready',
    projectId: 'p1',
    tags: ['سلّة'],
    width: 1440,
    height: 900,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
  },
  blobs: { id: 'c1', blob: new Blob(['png'], { type: 'image/png' }), mime: 'image/png', bytes: 3 },
  projects: { id: 'p1', name: 'المتجر', color: '#00d1b2', createdAt: at, updatedAt: at },
  colors: {
    id: 'k1',
    hex: '#00d1b2',
    name: 'فيروزي',
    note: '',
    source: 'css',
    projectId: 'p1',
    sourceUrl: null,
    createdAt: at,
  },
  palettes: { id: 'pl1', name: 'العلامة', colors: ['#00d1b2'], projectId: 'p1', createdAt: at },
  references: {
    id: 'r1',
    projectId: 'p1',
    origin: 'https://shop.example',
    path: '/cart',
    viewport: 'desktop',
    blobId: 'r1-blob',
    createdAt: at,
    exclusions: [],
  },
  annotations: { captureId: 'c1', scene: { shapes: [] }, updatedAt: at, schemaVersion: 1 },
  guides: {
    id: 'g1',
    title: 'دليل',
    projectId: 'p1',
    captureIds: ['c1'],
    createdAt: at,
    stepText: {},
    updatedAt: at,
  },
  tags: { name: 'سلّة', count: 1 },
  thumbnails: { id: 'c1', blob: new Blob(['webp'], { type: 'image/webp' }), width: 320, height: 200 },
  issues: {
    id: 'i1',
    projectId: 'p1',
    status: 'open',
    updatedAt: at,
    page: { origin: 'https://shop.example', path: '/cart' },
    evidence: { captureId: 'c1' },
  },
  templates: { id: 't1', name: 'PDF المعتاد', options: {}, createdAt: at, updatedAt: at },
}

async function seedPreviousVersion() {
  const previous = await openDB<RasdDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      for (let v = oldVersion + 1; v <= DB_VERSION; v++) MIGRATIONS[v]?.(db, transaction)
    },
  })
  const tx = previous.transaction([...STORE_NAMES], 'readwrite')
  await Promise.all([
    ...STORE_NAMES.map((name) => tx.objectStore(name).put(SEED[name] as never)),
    tx.done,
  ])
  previous.close()
}

beforeEach(async () => {
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await seedPreviousVersion()
  // ما كتبه الإصدار السابق في `chrome.storage` — ولا مفتاح قفلٍ بينه.
  await chrome.storage.local.set({
    'rasd:settings': { schemaVersion: 1 },
    'rasd:last-backup': { at, skipped: 0 },
  })
})

describe('الترقية إلى إصدار القفل — مكتبةٌ بلا قفل', () => {
  it('كل مخزنٍ يُقرأ كاملًا كما كُتب في النسخة السابقة', async () => {
    const library = await readLibrary()
    expect(library.ok).toBe(true)
    if (!library.ok) return
    for (const name of STORE_NAMES) {
      expect(library.value[name], name).toHaveLength(1)
    }
    expect(library.value.captures[0]).toMatchObject({ id: 'c1', title: 'السلّة' })
    expect(library.value.issues[0]).toMatchObject({ id: 'i1', status: 'open' })
  })

  it('العدّ والقراءة بالمعرّف والفهرس تعمل كما كانت', async () => {
    const counts = await libraryCounts()
    expect(counts.ok && Object.values(counts.value).every((n) => n === 1)).toBe(true)

    const shot = await captures.get('c1')
    expect(shot.ok && shot.value.origin).toBe('https://shop.example')
    const bytes = await blobs.get('c1')
    expect(bytes.ok && bytes.value.bytes).toBe(3)
    const byOrigin = await issues.byIndex('origin', 'https://shop.example')
    expect(byOrigin.ok && byOrigin.value.map((i) => i.id)).toEqual(['i1'])
  })

  it('والكتابة كذلك — المكتبة بلا قفل لا يمسّها الحارس', async () => {
    const written = await captures.put({ ...(SEED.captures as RasdDB['captures']['value']), id: 'c2' })
    expect(written.ok).toBe(true)
    const counted = await captures.count()
    expect(counted.ok && counted.value).toBe(2)
  })
})
