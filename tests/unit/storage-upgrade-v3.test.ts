import 'fake-indexeddb/auto'

import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

import { asNodeId, type NoteNode, type PinNode, type Scene } from '@/modules/editor/scene'
import { emptyScene, parseScene } from '@/modules/editor/scene-schema'
import { devicePoint } from '@/shared/geometry'
import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import { MIGRATIONS } from '@/shared/storage/migrations'
import { DB_NAME, STORE_NAMES, type RasdDB } from '@/shared/storage/schema'

/**
 * ترقية القاعدة من النسخة 2 إلى 3 ببيانات حقيقية — كُتب **قبل** خطوة الترحيل (`AGENTS.md` §7).
 *
 * القاعدة القديمة تُبنى بخطوتي النسختين 1 و2 كما جرتا عند المستخدمين، لا بمخطّطٍ منسوخ يدويًّا: نسخةٌ
 * يدوية تشهد على نفسها، أمّا هاتان فهما ما ينفّذه كل متصفّح رُقّي من قبل. ثمّ تُفتح بـ`database()` كما
 * تفتحها الخلفية عند أوّل إقلاع بعد التحديث، ويُقارَن كل سجلّ بما كُتب.
 */

const DAY = 86_400_000
const at = 1_780_000_000_000

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 3, dash: [], opacity: 1 } as const

/** مشهدٌ فيه ملاحظة مربوطة بدبّوس — الشكل الذي تحمله `annotations` في النسخة 2. */
function sceneWithNote(captureId: string): Scene {
  const base = emptyScene({ captureId, width: 800, height: 600, dpr: 2 })
  const pin: PinNode = {
    kind: 'pin',
    id: asNodeId('pin-1'),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    at: devicePoint(40, 40),
    shape: 'circle',
    ordinal: 1,
    noteId: asNodeId('note-1'),
    radiusPx: 13,
  }
  const note: NoteNode = {
    kind: 'note',
    id: asNodeId('note-1'),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke,
    at: devicePoint(80, 40),
    widthPx: 240,
    title: 'المسافة أكبر من التصميم',
    body: 'الحشوة 24 والمطلوب 16',
    tag: 'spacing',
    font: { family: 'IBM Plex Sans Arabic', sizePx: 14, weight: 400, lineHeight: 1.5 },
    paddingPx: 12,
    pinId: asNodeId('pin-1'),
  }
  return { ...base, nodes: [pin, note], revision: 3 }
}

const captureRecord = (id: string, createdAt: number) => ({
  id,
  createdAt,
  origin: 'https://shop.example',
  url: 'https://shop.example/cart',
  title: 'السلّة',
  kind: 'element' as const,
  status: 'ready' as const,
  projectId: 'p1',
  tags: ['خطأ بصري'],
  width: 800,
  height: 600,
  devicePixelRatio: 2,
  favorite: true,
  archived: false,
  trashedAt: null,
})

/** يكتب قاعدة النسخة 2 بخطوتيها الحقيقيتين، ثمّ يغلقها. */
async function seedVersion2() {
  const v2 = await openDB<RasdDB>(DB_NAME, 2, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      for (let v = oldVersion + 1; v <= 2; v++) MIGRATIONS[v]?.(db, transaction)
    },
  })
  expect(v2.version).toBe(2)
  expect([...v2.objectStoreNames]).not.toContain('issues')

  const tx = v2.transaction([...v2.objectStoreNames] as never, 'readwrite')
  const put = (store: string, value: unknown) => tx.objectStore(store as never).put(value)
  await Promise.all([
    put('captures', captureRecord('c1', at)),
    put('captures', captureRecord('c2', at + DAY)),
    put('blobs', {
      id: 'c1',
      blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }),
      mime: 'image/png',
      bytes: 4,
    }),
    put('thumbnails', { id: 'c1', blob: new Blob(['t']), width: 160, height: 120 }),
    put('annotations', {
      captureId: 'c1',
      scene: sceneWithNote('c1'),
      updatedAt: at,
      schemaVersion: 1,
      redaction: { total: 0, irreversible: 0 },
    }),
    put('projects', { id: 'p1', name: 'المتجر', color: '#3b82f6', createdAt: at, updatedAt: at }),
    put('colors', {
      id: 'k1',
      hex: '#3B82F6',
      name: 'أزرق',
      note: '',
      source: 'css',
      projectId: 'p1',
      sourceUrl: 'https://shop.example/cart',
      createdAt: at,
    }),
    put('palettes', {
      id: 'l1',
      name: 'لوحة',
      colors: ['#000000', '#FFFFFF'],
      projectId: null,
      createdAt: at,
    }),
    put('references', {
      id: 'r1',
      projectId: 'p1',
      origin: 'https://shop.example',
      path: '/cart',
      viewport: 'desktop',
      blobId: 'rb1',
      createdAt: at,
    }),
    put('guides', { id: 'g1', title: 'دليل', projectId: 'p1', captureIds: ['c1'], createdAt: at }),
    put('tags', { name: 'خطأ بصري', count: 2 }),
    tx.done,
  ])
  v2.close()
}

/** كل سجلّات القاعدة، مخزنًا مخزنًا — الـBlob يُستبدَل ببايتاته كي تُقارَن القيمة لا المرجع. */
async function dump(names: readonly string[]) {
  const db = await database()
  const out: Record<string, unknown[]> = {}
  for (const name of names) {
    const rows = (await db.getAll(name as never)) as Record<string, unknown>[]
    out[name] = await Promise.all(
      rows.map(async (row) =>
        row.blob instanceof Blob
          ? { ...row, blob: [...new Uint8Array(await row.blob.arrayBuffer())] }
          : row,
      ),
    )
  }
  return out
}

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

describe('الترقية من النسخة 2 إلى 3', () => {
  it('المخازن العشرة تعبر بلا فقد، و`issues` يولد فارغًا بفهارسه الخمسة', async () => {
    await seedVersion2()

    const db = await database()
    expect(db.version).toBe(3)
    expect([...db.objectStoreNames].sort()).toEqual([...STORE_NAMES].sort())
    expect(STORE_NAMES).toContain('issues')

    const issues = db.transaction('issues' as never).store
    expect(await issues.count()).toBe(0)
    expect(issues.keyPath).toBe('id')
    const indexes = Object.fromEntries(
      [...issues.indexNames].map((name) => [name, issues.index(name).keyPath]),
    )
    expect(indexes).toEqual({
      projectId: 'projectId',
      origin: 'page.origin',
      status: 'status',
      updatedAt: 'updatedAt',
      captureId: 'evidence.captureId',
    })

    const legacy = STORE_NAMES.filter((name) => name !== 'issues')
    const after = await dump(legacy)
    expect(after.captures).toEqual([captureRecord('c1', at), captureRecord('c2', at + DAY)])
    expect(after.blobs).toEqual([
      { id: 'c1', blob: [137, 80, 78, 71], mime: 'image/png', bytes: 4 },
    ])
    expect(after.thumbnails).toEqual([{ id: 'c1', blob: [116], width: 160, height: 120 }])
    expect(after.references).toHaveLength(1)
    expect(after.colors).toHaveLength(1)
    expect(after.palettes).toHaveLength(1)
    expect(after.projects).toHaveLength(1)
    expect(after.guides).toEqual([
      { id: 'g1', title: 'دليل', projectId: 'p1', captureIds: ['c1'], createdAt: at },
    ])
    expect(after.tags).toEqual([{ name: 'خطأ بصري', count: 2 }])

    // المشهد يعبر كما هو، ويبقى مقروءًا بمخطّطه — الربط باتجاه واحد لا يمسّه.
    const [annotation] = after.annotations as { scene: unknown; redaction: unknown }[]
    expect(annotation?.redaction).toEqual({ total: 0, irreversible: 0 })
    const parsed = parseScene(annotation?.scene)
    expect(parsed.ok && parsed.value).toEqual(sceneWithNote('c1'))

    // فهارس المخازن القديمة سليمة بعد الترقية: الاستعلام بها يعمل كما كان.
    const byProject = await db.getAllFromIndex('captures', 'projectId', 'p1')
    expect(byProject.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('الترقية من قاعدة جديدة (النسخة 0) تمرّ بالخطوات الثلاث وتعطي البنية نفسها', async () => {
    const db = await database()
    expect(db.version).toBe(3)
    expect([...db.objectStoreNames].sort()).toEqual([...STORE_NAMES].sort())
  })
})
