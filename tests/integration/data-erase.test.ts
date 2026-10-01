// @vitest-environment node
import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getSettings, resetSettingsCache, watchSettings } from '@/shared/settings'
import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import { eraseAllData } from '@/shared/storage/erase'
import { ALL_STORE_NAMES, DB_NAME } from '@/shared/storage/schema'

import {
  bytesBlob,
  libraryFixture,
  seedDatabase,
  settingsFixture,
} from '../unit/data/library-fixture'

/**
 * «احذف كل البيانات» — معيار قبول `STAGES/07`: بعد الحذف كل مخزن فارغ، ويحمرّ الاختبار إن أُغفل مخزن.
 *
 * المخازن تُعدّ من **القاعدة المفتوحة** لا من قائمةٍ هنا: مخزنٌ أضافه ترحيلٌ يُفحص تلقائيًّا، وعيّنة المكتبة
 * مكتوبة النوع لكل `StoreName` فلا يُفحص مخزنٌ فارغٌ أصلًا.
 */

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  resetSettingsCache()
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function seedEverything() {
  await seedDatabase(libraryFixture())
  // مسودة بلاغ بصورتها (ADR 0050) — ليست من المكتبة، والحذف الكامل يمسحها كذلك.
  const db = await database()
  await db.put('reportDrafts', {
    id: 'draft-1',
    createdAt: 1,
    updatedAt: 1,
    kind: 'bug',
    title: 'عطل',
    what: 'وصف',
    steps: '',
    expected: '',
    tool: null,
    errorCode: null,
    image: { blob: bytesBlob([1, 2, 3], 'image/png'), width: 1, height: 1, redactions: 0 },
  })
  await fakeBrowser.storage.local.set({
    'rasd:settings': settingsFixture(),
    'rasd:anything-else': { a: 1 },
  })
  await fakeBrowser.storage.session.set({
    'rasd:session': { modes: { 7: 'inspect' }, job: null },
    'export.downloadsRefused': true,
  })
  await fakeBrowser.storage.sync.set({ stray: 1 })
}

async function storeCounts(): Promise<Record<string, number>> {
  const db = await database()
  const out: Record<string, number> = {}
  for (const name of db.objectStoreNames) out[name] = await db.count(name as never)
  return out
}

describe('الحذف الكامل', () => {
  it('كل مخزن في القاعدة فارغ، وكل مساحة في `chrome.storage` فارغة', async () => {
    await seedEverything()
    const before = await storeCounts()
    for (const name of ALL_STORE_NAMES) expect(before[name], name).toBeGreaterThan(0)

    const r = await eraseAllData()
    expect(r.ok).toBe(true)

    const after = await storeCounts()
    expect(Object.keys(after).sort()).toEqual([...ALL_STORE_NAMES].sort())
    expect(Object.values(after).every((n) => n === 0)).toBe(true)
    expect(await fakeBrowser.storage.local.get(null)).toEqual({})
    expect(await fakeBrowser.storage.session.get(null)).toEqual({})
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({})
  })

  it('والإعدادات بعده افتراضية في الصفحة نفسها — المواقع المستثناة فارغة والذاكرة المؤقّتة تتبع', async () => {
    await seedEverything()
    const seen: string[][] = []
    watchSettings((s) => seen.push([...s.privacy.excludedSites]))
    await new Promise((r) => setTimeout(r, 0))
    expect((await getSettings()).privacy.excludedSites).toEqual(
      settingsFixture().privacy.excludedSites,
    )

    await eraseAllData()
    await new Promise((r) => setTimeout(r, 0))
    expect((await getSettings()).privacy.excludedSites).toEqual([])
    expect(seen.at(-1)).toEqual([])
  })

  it('عطلٌ في مكانٍ لا يُبقي غيره، والتقرير يسمّيه — والإعادة تُكمل', async () => {
    await seedEverything()
    vi.spyOn(chrome.storage.local, 'clear').mockRejectedValueOnce(new Error('busy'))

    const first = await eraseAllData()
    expect(first.ok).toBe(false)
    expect(!first.ok && first.error.failed).toEqual(['local'])
    // القاعدة والجلسة حُذفتا رغم تعثّر الإعدادات.
    expect(Object.values(await storeCounts()).every((n) => n === 0)).toBe(true)
    expect(await fakeBrowser.storage.session.get(null)).toEqual({})
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toContain('rasd:settings')

    const second = await eraseAllData()
    expect(second.ok).toBe(true)
    expect(await fakeBrowser.storage.local.get(null)).toEqual({})
  })

  it('القاعدة تعثّرت: `database` في التقرير، والإعدادات حُذفت', async () => {
    await seedEverything()
    const db = await database()
    vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    const r = await eraseAllData()
    expect(!r.ok && r.error.failed).toEqual(['database'])
    expect(await fakeBrowser.storage.local.get(null)).toEqual({})
  })
})
