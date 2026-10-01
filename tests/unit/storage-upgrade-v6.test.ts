import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { openDB } from 'idb'
import { beforeEach, describe, expect, it } from 'vitest'

import { getSettingsResult, resetSettingsCache } from '@/shared/settings'
import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import {
  ALL_STORE_NAMES,
  DB_NAME,
  DB_VERSION,
  STORE_NAMES,
  type ReportDraftRecord,
} from '@/shared/storage/schema'

import {
  bytesBlob,
  comparable,
  libraryFixture,
  seedDatabase,
  settingsFixture,
} from './data/library-fixture'

/**
 * ترقية القاعدة من النسخة 5 إلى 6 — مخزن مسودات البلاغ (`STAGES/13`). كُتب **قبل** خطوة الترحيل
 * (`AGENTS.md` §7): بلاها لا مخزن `reportDrafts` فيسقط الوصف الأوّل، ولا يتغيّر `DB_VERSION` فيسقط الثاني.
 *
 * الشرط في المواصفة: «يثبت بقاء المكتبة والإعدادات بعد إضافة مخزن المسودات». فالمكتبة تُبنى بخطوات النسخ 1–5
 * كما جرت عند المستخدمين، في كل مخزنٍ منها سجلّات، وإعداداتُ مستخدمٍ حقيقية في `chrome.storage` — ثمّ تُفتح
 * بـ`database()` كما تفتحها الخلفية عند أوّل إقلاع بعد التحديث.
 */

beforeEach(async () => {
  fakeBrowser.reset()
  setIncognitoWritePolicy(false)
  resetSettingsCache()
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

/** `getAll` يُرجع بترتيب المفتاح لا بترتيب الكتابة. */
const byKey = (list: unknown[]) =>
  [...list].sort((a, b) => {
    const key = (r: unknown) => {
      const o = r as Record<string, unknown>
      return String(o.id ?? o.captureId ?? o.name)
    }
    return key(a).localeCompare(key(b))
  })

async function seedVersion5() {
  const written = libraryFixture()
  await seedDatabase(written, 5)
  const settings = settingsFixture()
  await chrome.storage.local.set({ 'rasd:settings': settings })
  return { written, settings }
}

describe('الترقية من النسخة 5 إلى 6', () => {
  it('كل مخزنٍ في المكتبة يُقرأ كما كُتب بعد الترقية، سجلًّا سجلًّا وبايتًا ببايت', async () => {
    const { written } = await seedVersion5()

    const db = await database()
    expect(db.version).toBe(6)
    expect(DB_VERSION).toBe(6)
    for (const store of STORE_NAMES) {
      const before = byKey(await comparable(written[store]))
      expect(byKey(await comparable(await db.getAll(store))), store).toEqual(before)
    }
  })

  it('والإعدادات كما حُفظت — الترحيل لا يمسّ `chrome.storage`', async () => {
    const { settings } = await seedVersion5()
    await database()
    resetSettingsCache()
    const read = await getSettingsResult()
    expect(read.ok && read.value).toEqual(settings)
  })

  it('ومخزن المسودات موجودٌ فارغًا ويقبل مسودةً بصورتها، والمخازن كلّها هي `ALL_STORE_NAMES`', async () => {
    await seedVersion5()
    const db = await database()
    expect(await db.count('reportDrafts')).toBe(0)

    const draft: ReportDraftRecord = {
      id: '0b9b6a0e-7c1f-4d8e-9a55-2f5d3c1e8b41',
      createdAt: 1_790_000_000_000,
      updatedAt: 1_790_000_000_000,
      kind: 'bug',
      title: 'اللقطة الكاملة تتوقّف',
      what: 'توقّف الشريط عند ٦٠٪',
      steps: '',
      expected: '',
      tool: 'full-page',
      errorCode: 'CAPTURE_STITCH_TIMEOUT',
      image: {
        blob: bytesBlob([137, 80, 78, 71], 'image/png'),
        width: 4,
        height: 2,
        redactions: 1,
      },
    }
    await db.put('reportDrafts', draft)
    const back = await db.get('reportDrafts', draft.id)
    expect(back && (await comparable([back]))).toEqual(await comparable([draft]))
    expect([...db.objectStoreNames].sort()).toEqual([...ALL_STORE_NAMES].sort())
  })

  it('والمسودات ليست من المكتبة: لا تدخل `STORE_NAMES` (النسخة الاحتياطية والعدّادات)', () => {
    expect(STORE_NAMES as readonly string[]).not.toContain('reportDrafts')
    expect(ALL_STORE_NAMES).toContain('reportDrafts')
  })

  it('ومن قاعدة جديدة (النسخة 0) تمرّ الخطوات الستّ إلى البنية نفسها', async () => {
    const db = await database()
    expect(db.version).toBe(DB_VERSION)
    expect([...db.objectStoreNames].sort()).toEqual([...ALL_STORE_NAMES].sort())
    const raw = await openDB(DB_NAME)
    expect(raw.version).toBe(6)
    raw.close()
  })
})
