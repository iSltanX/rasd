import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it } from 'vitest'

import { getSettingsResult, resetSettingsCache } from '@/shared/settings'
import { closeDatabase, database, setIncognitoWritePolicy } from '@/shared/storage/db'
import { ALL_STORE_NAMES, DB_NAME, STORE_NAMES } from '@/shared/storage/schema'

import {
  comparable,
  seedDatabase,
  settingsFixture,
  v010Fixture,
  V010_DB_VERSION,
} from './library-fixture'

/**
 * بيانات الإصدار `0.1.0` تنجو كاملةً — **كُتب قبل أي تغيير تخزين في `STAGES/07`** (`AGENTS.md` §7).
 *
 * المرحلة تبني النسخ والاستعادة والحذف الكامل واستيراد الإعدادات وإعادة ضبطها — كلّها تمسّ القاعدة
 * و`chrome.storage`. فهذا يثبّت نقطة البداية: قاعدةٌ بنتها خطوات الترحيل كما جرت عند المستخدمين، في كل
 * مخزن منها سجلّات، وإعداداتُ مستخدمٍ حقيقية — تُفتح بما تفتح به الإضافة اليوم وتُقرأ كما كُتبت.
 *
 * **ويبقى صالحًا بعد أي ترحيل لاحق:** البذرة بنسخة `0.1.0` الثابتة لا `DB_VERSION`، فترحيلٌ يضيف مخزنًا
 * يمرّ به، وترحيلٌ يمسّ سجلًّا قائمًا يُسقطه — وذلك بعينه ما يجب أن يُرى ويُكتب له اختباره.
 */

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  resetSettingsCache()
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

describe('مكتبة 0.1.0 تُفتح كاملة', () => {
  it('كل مخزن يُقرأ كما كُتب، سجلًّا سجلًّا وبايتًا ببايت', async () => {
    const written = v010Fixture()
    await seedDatabase(written, V010_DB_VERSION)

    // ترحيل النسخة 5 يمسّ الأدلّة وحدها بحقلين يضيفهما ولا يغيّر غيرهما (`storage-upgrade-v5.test.ts`)،
    // ومخزن القوالب يولد فارغًا. وكل ما سواهما كما كُتب.
    const upgraded: Record<string, readonly object[]> = {
      ...written,
      guides: (written.guides ?? []).map((g) => {
        const guide = g as { createdAt: number }
        return { ...guide, stepText: {}, updatedAt: guide.createdAt }
      }),
      templates: [],
    }

    const db = await database()
    for (const store of STORE_NAMES) {
      const expected = await comparable(upgraded[store] ?? [])
      const actual = await comparable(await db.getAll(store))
      const byKey = (list: unknown[]) =>
        [...list].sort((a, b) => {
          const key = (r: unknown) => {
            const o = r as Record<string, unknown>
            return String(o.id ?? o.captureId ?? o.name)
          }
          return key(a).localeCompare(key(b))
        })
      expect(byKey(actual), store).toEqual(byKey(expected))
    }
  })

  it('والمخازن نفسها لا أقلّ ولا أكثر — `ALL_STORE_NAMES` يطابق القاعدة المفتوحة', async () => {
    await seedDatabase(v010Fixture(), V010_DB_VERSION)
    const db = await database()
    expect([...db.objectStoreNames].sort()).toEqual([...ALL_STORE_NAMES].sort())
  })
})

describe('إعدادات 0.1.0 تُقرأ كاملة', () => {
  it('القراءة تعيد المحفوظ نفسه: المواقع المستثناة والاختصار والجولة', async () => {
    const stored = settingsFixture()
    await fakeBrowser.storage.local.set({ 'rasd:settings': stored })

    const read = await getSettingsResult()
    expect(read.ok && read.value).toEqual(stored)
  })

  it('والمفتاح القديم `blockIncognitoWrites` ما يزال يُرحَّل ولا يُمحى اختيار صاحبه', async () => {
    const stored = settingsFixture()
    const { incognito: _dropped, ...privacy } = stored.privacy
    await fakeBrowser.storage.local.set({
      'rasd:settings': { ...stored, privacy: { ...privacy, blockIncognitoWrites: false } },
    })

    const read = await getSettingsResult()
    expect(read.ok && read.value.privacy.incognito).toBe('allow')
    expect(read.ok && read.value.privacy.excludedSites).toEqual(stored.privacy.excludedSites)
  })
})
