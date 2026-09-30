// @vitest-environment node
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildArchive, openArchive, type ArchiveEntry } from '@/modules/backup/archive'
import {
  createBackup,
  readBackup,
  RECORD_UPGRADES,
  restoreBackup,
  type RawRecords,
  type BackupOutcome,
  type RestorePlan,
} from '@/modules/backup/backup'
import { FIRST_DATABASE, MANIFEST_ENTRY } from '@/modules/backup/format'
import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import { libraryCounts } from '@/shared/storage/library'
import { clearAllStores } from '@/shared/storage/repository'
import { DB_NAME, DB_VERSION, STORE_NAMES, type StoreName } from '@/shared/storage/schema'

import {
  bytesBlob,
  comparable,
  libraryFixture,
  seedDatabase,
  type LibraryRecords,
} from '../unit/data/library-fixture'

/**
 * النسخ الاحتياطي والاستعادة على قاعدة حقيقية (`fake-indexeddb`) — معايير قبول `STAGES/07`:
 *
 * - نسخةٌ ثمّ حذفٌ كامل ثمّ استعادة يعيد المكتبة نفسها عددًا ومحتوًى — بايتًا ببايت.
 * - استعادة ملفٍّ تالف أو من مخطّطٍ أحدث لا تكتب شيئًا وتبلّغ الخطأ.
 */

const NOW = Date.UTC(2026, 8, 30, 9, 0, 0)

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

async function backupOf(): Promise<Extract<BackupOutcome, { kind: 'ready' }>> {
  const r = await createBackup({ now: NOW, app: '0.1.0' })
  if (!r.ok || r.value.kind !== 'ready') throw new Error(`backup: ${JSON.stringify(r)}`)
  return r.value
}

async function planOf(blob: Blob): Promise<RestorePlan> {
  const r = await readBackup(blob)
  if (!r.ok || r.value === 'cancelled') throw new Error(`read: ${JSON.stringify(r)}`)
  return r.value
}

/** كل مخزن بشكلٍ يقارَن، مرتّبًا بالمفتاح. */
async function snapshot(): Promise<Record<string, unknown[]>> {
  const db = await database()
  const out: Record<string, unknown[]> = {}
  for (const store of STORE_NAMES) out[store] = await comparable(await db.getAll(store))
  return out
}

async function expected(records: LibraryRecords): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {}
  for (const store of STORE_NAMES) {
    const sorted = [...records[store]].sort((a, b) => {
      const key = (r: object) => {
        const o = r as Record<string, unknown>
        return String(o.id ?? o.captureId ?? o.name)
      }
      return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0
    })
    out[store] = await comparable(sorted)
  }
  return out
}

/** يعيد بناء النسخة بعد تعديل مدخلٍ فيها — ملفٌّ «من غيرنا» بالبنية نفسها. */
async function rebuilt(
  blob: Blob,
  edit: (name: string, bytes: Uint8Array) => Uint8Array | null,
): Promise<Blob> {
  const opened = await openArchive(blob)
  if (!opened.ok) throw new Error('open')
  const entries: ArchiveEntry[] = []
  for (const file of opened.value.files.values()) {
    const bytes = (await opened.value.read(file))!
    const next = edit(file.name, bytes)
    if (next) entries.push({ name: file.name, data: next })
  }
  const r = await buildArchive(entries, { modified: NOW })
  if (!r.ok || r.value === 'cancelled') throw new Error('rebuild')
  return r.value
}

const editJson =
  (target: string, change: (value: unknown) => unknown) =>
  (name: string, bytes: Uint8Array): Uint8Array => {
    if (name !== target) return bytes
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    return new TextEncoder().encode(JSON.stringify(change(value)))
  }

async function counts(): Promise<Record<StoreName, number>> {
  const r = await libraryCounts()
  if (!r.ok) throw new Error('counts')
  return r.value
}

describe('نسخةٌ ثمّ حذفٌ كامل ثمّ استعادة', () => {
  it('تعيد المكتبة نفسها عددًا ومحتوًى، في كل مخزن، بايتًا ببايت', async () => {
    const library = libraryFixture()
    await seedDatabase(library)
    const before = await snapshot()
    expect(before).toEqual(await expected(library))

    const backup = await backupOf()
    expect(backup.filename).toBe('rasd-backup-2026-09-30.zip')
    expect(backup.skipped).toEqual(Object.fromEntries(STORE_NAMES.map((n) => [n, 0])))

    expect((await clearAllStores()).ok).toBe(true)
    expect(Object.values(await counts()).every((n) => n === 0)).toBe(true)

    const plan = await planOf(backup.blob)
    const restored = await restoreBackup(plan)
    expect(restored.ok).toBe(true)

    expect(await snapshot()).toEqual(before)
    // كل مخزن فيه شيء — العيّنة لا تمرّ على مخزنٍ فارغ فتُثبت ما لا تختبره.
    for (const store of STORE_NAMES) expect(before[store]!.length, store).toBeGreaterThan(0)
  })

  it('وترتيب مفاتيح كل سجلّ كما كان — JSON السجلّ نفسه قبل النسخ وبعد الاستعادة', async () => {
    await seedDatabase(libraryFixture())
    const db0 = await database()
    const issue0 = JSON.stringify(await db0.get('issues', 'i1'))
    const backup = await backupOf()
    await clearAllStores()
    await restoreBackup(await planOf(backup.blob))
    const db = await database()
    expect(JSON.stringify(await db.get('issues', 'i1'))).toBe(issue0)
  })

  it('يُفكّ بأداة قياسية: البيان وملفّ كل مخزن وصور المكتبة', async () => {
    await seedDatabase(libraryFixture())
    const backup = await backupOf()
    const opened = await openArchive(backup.blob)
    if (!opened.ok) throw new Error('open')
    const names = [...opened.value.files.keys()]
    expect(names[0]).toBe(MANIFEST_ENTRY)
    for (const store of STORE_NAMES) expect(names).toContain(`stores/${store}.json`)
    expect(names.filter((n) => n.startsWith('files/blobs/'))).toHaveLength(4)
    expect(names.filter((n) => n.startsWith('files/thumbnails/'))).toHaveLength(2)
    expect(names).toContain('files/blobs/000001.png')
  })
})

describe('الاستعادة إضافةٌ لا استبدال', () => {
  it('ما في المكتبة بمفتاحه يبقى كما هو، والباقي يُضاف، والوسوم تُحسب من اللقطات', async () => {
    const library = libraryFixture()
    await seedDatabase(library)
    const backup = await backupOf()
    await clearAllStores()

    // مكتبةٌ جديدة فيها لقطة c1 نفسها معدّلة العنوان، ولقطةٌ ليست في الملفّ.
    const local = libraryFixture()
    await seedDatabase({
      captures: [
        { ...local.captures[0]!, title: 'عنوانٌ أحدث' },
        { ...local.captures[1]!, id: 'c9', tags: ['هبوط', 'جديد'] },
      ],
      blobs: [local.blobs[0]!, { ...local.blobs[1]!, id: 'c9' }],
      tags: [
        { name: 'هبوط', count: 2 },
        { name: 'نموذج', count: 1 },
        { name: 'جديد', count: 1 },
      ],
    })

    const restored = await restoreBackup(await planOf(backup.blob))
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.value.kept.captures).toBe(1)
    expect(restored.value.added.captures).toBe(2)
    expect(restored.value.kept.blobs).toBe(1)
    expect(restored.value.added.blobs).toBe(3)

    const db = await database()
    expect((await db.get('captures', 'c1'))?.title).toBe('عنوانٌ أحدث')
    expect((await db.getAll('captures')).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c9'])
    // c1 (هبوط، نموذج) · c2 (هبوط) · c3 (قديم) · c9 (هبوط، جديد)
    expect(await db.getAll('tags')).toEqual([
      { name: 'جديد', count: 1 },
      { name: 'قديم', count: 1 },
      { name: 'نموذج', count: 1 },
      { name: 'هبوط', count: 3 },
    ])
  })

  it('استعادة الملفّ مرّتين لا تكرّر شيئًا', async () => {
    await seedDatabase(libraryFixture())
    const backup = await backupOf()
    const before = await counts()
    const again = await restoreBackup(await planOf(backup.blob))
    expect(again.ok && Object.values(again.value.added).reduce((a, b) => a + b, 0)).toBe(0)
    expect(await counts()).toEqual(before)
  })
})

describe('ملفٌّ تالف أو أحدث لا يكتب شيئًا ويبلّغ الخطأ', () => {
  async function setup(): Promise<Blob> {
    await seedDatabase(libraryFixture())
    const backup = await backupOf()
    await clearAllStores()
    return backup.blob
  }

  async function rejects(blob: Blob, kind: string) {
    const r = await readBackup(blob)
    expect(r.ok, JSON.stringify(r)).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe(kind)
    // لا شيء كُتب — ولا خطّة يُستعاد منها أصلًا.
    expect(Object.values(await counts()).every((n) => n === 0)).toBe(true)
  }

  it('بايتٌ تغيّر في صورة: `damaged`', async () => {
    const blob = await setup()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const opened = await openArchive(blob)
    if (!opened.ok) throw new Error('open')
    const png = opened.value.files.get('files/blobs/000001.png')!
    bytes[png.start] = (bytes[png.start] ?? 0) ^ 0xff
    await rejects(new Blob([bytes]), 'damaged')
  })

  it('ملفٌّ مقطوع أو ليس ZIP: `invalid`', async () => {
    const blob = await setup()
    await rejects(blob.slice(0, blob.size - 30), 'invalid')
    await rejects(new Blob(['{"format":"rasd.backup"}']), 'invalid')
  })

  it('ZIP ليس نسخة رصد: `invalid`', async () => {
    const blob = await setup()
    await rejects(
      await rebuilt(
        blob,
        editJson(MANIFEST_ENTRY, () => ({ format: 'other' })),
      ),
      'invalid',
    )
    await rejects(await rebuilt(blob, (n, b) => (n === MANIFEST_ENTRY ? null : b)), 'invalid')
  })

  it('صيغةٌ أحدث أو قاعدةٌ أحدث: `newer` — قبل أن يُحكم على حقول البيان', async () => {
    const blob = await setup()
    const newerFormat = editJson(MANIFEST_ENTRY, (m) => ({
      ...(m as object),
      version: 2,
      extra: 1,
    }))
    await rejects(await rebuilt(blob, newerFormat), 'newer')
    const newerDb = editJson(MANIFEST_ENTRY, (m) => ({
      ...(m as object),
      database: DB_VERSION + 1,
    }))
    await rejects(await rebuilt(blob, newerDb), 'newer')
  })

  it('سجلٌّ لا يطابق مخطّطه، أو عددٌ يخالف البيان، أو مفتاحٌ مكرّر: `invalid`', async () => {
    const blob = await setup()
    const badKind = editJson('stores/captures.json', (list) =>
      (list as object[]).map((c, i) => (i === 0 ? { ...c, kind: 'svg' } : c)),
    )
    await rejects(await rebuilt(blob, badKind), 'invalid')

    const dropOne = editJson('stores/palettes.json', (list) => (list as object[]).slice(1))
    await rejects(await rebuilt(blob, dropOne), 'invalid')

    const duplicate = editJson('stores/colors.json', (list) => {
      const [first] = list as object[]
      return [first, first]
    })
    const manifestTwo = editJson(MANIFEST_ENTRY, (m) => m)
    await rejects(
      await rebuilt(blob, (n, b) =>
        n === 'stores/colors.json' ? duplicate(n, b) : manifestTwo(n, b),
      ),
      'invalid',
    )
  })

  it('صورةٌ مفقودة أو بحجمٍ آخر أو خارج مجلّد مخزنها: `invalid`', async () => {
    const blob = await setup()
    await rejects(
      await rebuilt(blob, (n, b) => (n === 'files/blobs/000002.webp' ? null : b)),
      'invalid',
    )

    const wrongSize = editJson('stores/blobs.json', (list) =>
      (list as { blob: { size: number } }[]).map((r, i) =>
        i === 0 ? { ...r, blob: { ...r.blob, size: r.blob.size + 1 } } : r,
      ),
    )
    await rejects(await rebuilt(blob, wrongSize), 'invalid')

    const foreign = editJson('stores/blobs.json', (list) =>
      (list as { blob: { file: string } }[]).map((r, i) =>
        i === 0 ? { ...r, blob: { ...r.blob, file: 'files/thumbnails/000001.webp' } } : r,
      ),
    )
    await rejects(await rebuilt(blob, foreign), 'invalid')
  })

  it('خطّةٌ صحيحة ثمّ رفضُ القاعدة (التصفّح الخاص): `storage` ولا شيء يُكتب', async () => {
    const blob = await setup()
    const plan = await planOf(blob)
    setIncognitoWritePolicy(true)
    Object.defineProperty(chrome, 'extension', {
      value: { inIncognitoContext: true },
      configurable: true,
    })
    try {
      const r = await restoreBackup(plan)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.kind).toBe('storage')
      expect(Object.values(await counts()).every((n) => n === 0)).toBe(true)
    } finally {
      setIncognitoWritePolicy(false)
      Object.defineProperty(chrome, 'extension', { value: undefined, configurable: true })
    }
  })
})

describe('النسخ', () => {
  it('مكتبةٌ فارغة: `empty` ولا ملفّ', async () => {
    const r = await createBackup({ now: NOW, app: '0.1.0' })
    expect(r.ok && r.value.kind).toBe('empty')
  })

  it('الإلغاء: `cancelled` ولا ملفّ', async () => {
    await seedDatabase(libraryFixture())
    const controller = new AbortController()
    controller.abort()
    const r = await createBackup({ now: NOW, app: '0.1.0', signal: controller.signal })
    expect(r.ok && r.value.kind).toBe('cancelled')
  })

  it('التقدّم يعدّ الصور وحدها، حتى آخرها', async () => {
    await seedDatabase(libraryFixture())
    const seen: string[] = []
    await createBackup({
      now: NOW,
      app: '0.1.0',
      onProgress: ({ done, total }) => seen.push(`${done}/${total}`),
    })
    expect(seen).toEqual(['1/6', '2/6', '3/6', '4/6', '5/6', '6/6'])
  })

  it('سجلٌّ لا يمرّ بالمخطّط يُترك ويُعدّ — والنسخة تُستعاد كاملةً بغيره', async () => {
    const library = libraryFixture()
    library.captures.push({ ...library.captures[0]!, id: 'c-bad', kind: 'svg' as never })
    library.thumbnails.push({ id: 'c-nob', blob: 'not a blob' as never, width: 1, height: 1 })
    await seedDatabase(library)

    const backup = await backupOf()
    expect(backup.skipped.captures).toBe(1)
    expect(backup.skipped.thumbnails).toBe(1)
    expect(backup.counts.captures).toBe(3)

    await clearAllStores()
    const plan = await planOf(backup.blob)
    expect(plan.counts.captures).toBe(3)
    expect((await restoreBackup(plan)).ok).toBe(true)
  })

  it('صورةٌ فارغة تُنسخ وتُستعاد', async () => {
    await seedDatabase({
      blobs: [{ id: 'z', blob: bytesBlob([], 'image/png'), mime: 'image/png', bytes: 0 }],
    })
    const backup = await backupOf()
    await clearAllStores()
    expect((await restoreBackup(await planOf(backup.blob))).ok).toBe(true)
    const db = await database()
    expect((await db.get('blobs', 'z'))?.blob.size).toBe(0)
  })
})

describe('ترقية سجلّات النسخ الأقدم', () => {
  it('لكل نسخة قاعدةٍ بعد أولى الصيغة خطوةٌ في `RECORD_UPGRADES` — ولو «لا تغيير»', () => {
    for (let version = FIRST_DATABASE + 1; version <= DB_VERSION; version++) {
      expect(RECORD_UPGRADES[version], `ترقية سجلّات القاعدة ${version}`).toBeTypeOf('function')
    }
  })
})

/*
 * ما كشفته المراجعة المستقلّة (`STAGES/07`) — كُتبت قبل إصلاحاتها وسقطت عليها.
 */
describe('المراجعة: قراءةٌ تُرفض لا تُجمّد النافذة', () => {
  it('صورةٌ في القاعدة تتعذّر قراءة بايتاتها: تُترك وتُعدّ، والنسخة تكتمل بغيرها', async () => {
    await seedDatabase(libraryFixture())
    const real = Object.getOwnPropertyDescriptor(Blob.prototype, 'arrayBuffer')!.value as (
      this: Blob,
    ) => Promise<ArrayBuffer>
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
      if (this.size === 6 && this.type === 'image/webp') {
        return Promise.reject(new DOMException('gone', 'NotFoundError'))
      }
      return real.call(this)
    })
    const r = await createBackup({ now: NOW, app: '0.1.0' })
    vi.restoreAllMocks()
    expect(r.ok && r.value.kind).toBe('ready')
    if (!r.ok || r.value.kind !== 'ready') return
    expect(r.value.skipped.blobs).toBe(1)
    expect(r.value.counts.blobs).toBe(3)
    await clearAllStores()
    expect((await restoreBackup(await planOf(r.value.blob))).ok).toBe(true)
  })

  it('ملفٌّ تتعذّر قراءته أثناء الفحص: `damaged` لا رفضٌ غير ملتقَط', async () => {
    await seedDatabase(libraryFixture())
    const backup = await backupOf()
    const bytes = new Uint8Array(await backup.blob.arrayBuffer())
    let reads = 0
    const flaky = new Blob([bytes])
    // ملفٌّ بواجهة `Blob` التي يستعملها القارئ (`size` · `slice`)، تتعذّر قراءة شرائحه بعد البيان والدليل —
    // كملفٍّ أُزيل من القرص أثناء الفحص.
    const file = {
      size: flaky.size,
      type: '',
      slice: (a?: number, b?: number, t?: string): Blob => {
        const part = flaky.slice(a, b, t)
        reads += 1
        if (reads <= 8) return part
        return {
          size: part.size,
          type: part.type,
          arrayBuffer: () => Promise.reject(new DOMException('file gone', 'NotReadableError')),
          slice: part.slice.bind(part),
        } as unknown as Blob
      },
    } as unknown as Blob
    const r = await readBackup(file)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('damaged')
  })
})

describe('المراجعة: أرقامٌ خارج مداها وحدودٌ يفرضها كل كاتبٍ آخر', () => {
  async function withRecord(store: string, edit: (records: object[]) => object[]) {
    await seedDatabase(libraryFixture())
    const blob = (await backupOf()).blob
    await clearAllStores()
    return rebuilt(
      blob,
      editJson(`stores/${store}.json`, (list) => edit(list as object[])),
    )
  }

  it('تاريخ البيان خارج مدى `Date`: `invalid` — لا معاينة ترمي أثناء الرسم', async () => {
    await seedDatabase(libraryFixture())
    const blob = (await backupOf()).blob
    await clearAllStores()
    const far = editJson(MANIFEST_ENTRY, (m) => ({ ...(m as object), createdAt: 1e20 }))
    const r = await readBackup(await rebuilt(blob, far))
    expect(!r.ok && r.error.kind).toBe('invalid')
  })

  it('زمن لقطةٍ لا يصير تاريخًا، أو عددٌ غير منتهٍ: `invalid`', async () => {
    const future = await withRecord('captures', (l) =>
      l.map((c, i) => (i ? c : { ...c, createdAt: 1e20 })),
    )
    expect(await readBackup(future).then((r) => !r.ok && r.error.kind)).toBe('invalid')

    await closeDatabase()
    indexedDB.deleteDatabase(DB_NAME)
    await new Promise((r) => setTimeout(r, 0))
    // `1e400` في JSON يُقرأ `Infinity`.
    const infinite = await withRecord('issues', (l) => l)
    const text = (
      await openArchive(infinite).then(async (o) => {
        if (!o.ok) throw new Error('open')
        return new TextDecoder().decode(
          (await o.value.read(o.value.files.get('stores/issues.json')!))!,
        )
      })
    ).replace('"updatedAt":1000', '"updatedAt":1e400')
    const patched = await rebuilt(infinite, (n, b) =>
      n === 'stores/issues.json' ? new TextEncoder().encode(text) : b,
    )
    expect(await readBackup(patched).then((r) => !r.ok && r.error.kind)).toBe('invalid')
  })

  it('مرجعٌ بمناطق فوق حدّها، ومشكلةٌ بتاريخٍ فوق حدّه: `invalid`', async () => {
    const zones = await withRecord('references', (l) =>
      l.map((r, i) => {
        if (i) return r
        const zone = (r as { exclusions: object[] }).exclusions[0]!
        return {
          ...r,
          exclusions: Array.from({ length: 33 }, (_, k) => ({ ...zone, id: `z${k}` })),
        }
      }),
    )
    expect(await readBackup(zones).then((r) => !r.ok && r.error.kind)).toBe('invalid')

    await closeDatabase()
    indexedDB.deleteDatabase(DB_NAME)
    await new Promise((r) => setTimeout(r, 0))
    const history = await withRecord('issues', (l) =>
      l.map((issue, i) => {
        if (i) return issue
        const entry = (issue as { history: object[] }).history[0]!
        return { ...issue, history: Array.from({ length: 21 }, () => entry) }
      }),
    )
    expect(await readBackup(history).then((r) => !r.ok && r.error.kind)).toBe('invalid')
  })
})

describe('المراجعة: الترقية قبل التحقّق', () => {
  it('سجلٌّ من قاعدةٍ أقدم يمرّ بخطوة ترقيته قبل أن يُحكم عليه بمخطّط اليوم', async () => {
    await seedDatabase(libraryFixture())
    const blob = (await backupOf()).blob
    await clearAllStores()
    // قاعدةٌ «سابقة» كانت تسمّي نوع اللقطة `screenshot`، وخطوة ترقيتها تعيده `viewport`.
    const older = await rebuilt(blob, (name, bytes) => {
      const text = new TextDecoder().decode(bytes)
      if (name === MANIFEST_ENTRY) {
        return new TextEncoder().encode(
          JSON.stringify({ ...(JSON.parse(text) as object), database: DB_VERSION - 1 }),
        )
      }
      if (name === 'stores/captures.json') {
        return new TextEncoder().encode(text.replaceAll('"kind":"viewport"', '"kind":"screenshot"'))
      }
      return bytes
    })
    const upgrades = {
      [DB_VERSION]: (raw: RawRecords): RawRecords => ({
        ...raw,
        captures: raw.captures.map((c) =>
          (c as { kind: string }).kind === 'screenshot'
            ? { ...(c as object), kind: 'viewport' }
            : c,
        ),
      }),
    }
    const r = await readBackup(older, { upgrades, firstDatabase: DB_VERSION - 1 })
    expect(r.ok, JSON.stringify(!r.ok && r.error)).toBe(true)
    if (!r.ok || r.value === 'cancelled') return
    expect(r.value.records.captures.map((c) => c.kind)).toEqual([
      'viewport',
      'full-page',
      'viewport',
    ])
  })
})
