import 'fake-indexeddb/auto'

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { closeDatabase } from '@/shared/storage/db'
import { eraseAllData } from '@/shared/storage/erase'
import { libraryCounts, mergeLibrary, readLibrary } from '@/shared/storage/library'
import { forgetLockSnapshot, LOCK_KEY, UNLOCK_KEY } from '@/shared/storage/lock-state'
import {
  annotations,
  blobs,
  captures,
  clearAllStores,
  issues,
  putCaptureWithBlob,
  thumbnails,
  updateIssues,
} from '@/shared/storage/repository'
import { DB_NAME, STORE_NAMES, type CaptureRecord } from '@/shared/storage/schema'

import type { Result } from '@/shared/result'

/**
 * حارس القفل في طبقة البيانات — `STAGES/08` معيار القبول الثاني، ADR 0043 §1.
 *
 * القراءة ممتنعة قبل الفكّ **من طبقة التخزين لا من الواجهة**: كل مستودعٍ ومعاملةٍ ذرّية وقراءةٍ للنسخ الاحتياطي، ومنها
 * مخزن المشكلات (32). **ويحمرّ عند تعطيل الحارس:** حُذف سطر الفحص من `withDb` فسقطت حالات «مقفلة» كلّها (سجلّ
 * `STAGES/08`).
 */

const SALT = 'c2FsdHNhbHRzYWx0c2FsdA=='
const RECORD = {
  v: 1,
  salt: SALT,
  iterations: 1000,
  verifier: 'dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnY=',
}

function capture(id: string): CaptureRecord {
  return {
    id,
    createdAt: 1_780_000_000_000,
    origin: 'https://shop.example',
    url: 'https://shop.example/cart',
    title: 'السلّة',
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 10,
    height: 10,
    devicePixelRatio: 1,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}

async function lock(): Promise<void> {
  await chrome.storage.local.set({ [LOCK_KEY]: RECORD })
  await chrome.storage.session.remove(UNLOCK_KEY)
  forgetLockSnapshot()
}

function lockedOut(result: Result<unknown>): boolean {
  return !result.ok && result.error.code === 'library-locked'
}

beforeEach(async () => {
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  forgetLockSnapshot()
  const saved = await putCaptureWithBlob(capture('c1'), new Blob(['png'], { type: 'image/png' }))
  expect(saved.ok).toBe(true)
})

describe('المكتبة المقفلة لا تُقرأ ولا تُكتب من طبقة التخزين', () => {
  it('كل قراءة: بالمعرّف والكلّ والفهرس والأحدث والعدّ', async () => {
    await lock()
    expect(lockedOut(await captures.get('c1'))).toBe(true)
    expect(lockedOut(await blobs.get('c1'))).toBe(true)
    expect(lockedOut(await thumbnails.getAll())).toBe(true)
    expect(lockedOut(await annotations.get('c1'))).toBe(true)
    expect(lockedOut(await captures.byIndex('origin', 'https://shop.example'))).toBe(true)
    expect(lockedOut(await captures.latest('createdAt', 2))).toBe(true)
    expect(lockedOut(await captures.count())).toBe(true)
  })

  it('ومخزن المشكلات (32) كغيره', async () => {
    await lock()
    expect(lockedOut(await issues.getAll())).toBe(true)
    expect(lockedOut(await issues.byIndex('origin', 'https://shop.example'))).toBe(true)
    expect(lockedOut(await updateIssues(['i1'], (i) => i))).toBe(true)
  })

  it('والنسخ الاحتياطي والاستعادة — المكتبة كلّها دفعةً واحدة', async () => {
    await lock()
    expect(lockedOut(await readLibrary())).toBe(true)
    expect(lockedOut(await libraryCounts())).toBe(true)
    const empty = Object.fromEntries(STORE_NAMES.map((n) => [n, []])) as never
    expect(lockedOut(await mergeLibrary(empty, 0))).toBe(true)
  })

  it('والكتابة كذلك — لقطةٌ لا تُحفظ في مكتبةٍ مقفلة', async () => {
    await lock()
    expect(lockedOut(await putCaptureWithBlob(capture('c2'), new Blob(['x'])))).toBe(true)
    expect(lockedOut(await captures.put(capture('c3')))).toBe(true)
    expect(lockedOut(await captures.remove('c1'))).toBe(true)
  })

  it('والرسالة تُعرض كما هي', async () => {
    await lock()
    const read = await captures.get('c1')
    expect(!read.ok && read.error.message).toBe('المكتبة مقفلة. افتحها برمزها من صفحة المكتبة.')
  })

  it('الفكّ لملح السجلّ الحاليّ يفتحها، وفكٌّ لقفلٍ سابق لا يفتحها', async () => {
    await lock()
    await chrome.storage.session.set({ [UNLOCK_KEY]: 'b2xkc2FsdG9sZHNhbHQ=' })
    expect(lockedOut(await captures.get('c1'))).toBe(true)

    await chrome.storage.session.set({ [UNLOCK_KEY]: SALT })
    const read = await captures.get('c1')
    expect(read.ok && read.value.title).toBe('السلّة')
  })

  it('إغلاق المتصفّح يمحو الفكّ فتُقفل من جديد — `onChanged` يُبطل ما في الذاكرة', async () => {
    await lock()
    await chrome.storage.session.set({ [UNLOCK_KEY]: SALT })
    expect((await captures.get('c1')).ok).toBe(true)
    // لا `forgetLockSnapshot` هنا: الحالة المحفوظة تُبطَل من المستمع وحده، كما في سياقٍ آخر.
    await chrome.storage.session.remove(UNLOCK_KEY)
    expect(lockedOut(await captures.get('c1'))).toBe(true)
  })

  it('سجلٌّ تالف قفلٌ لا يفتحه شيء — لا «بلا قفل»', async () => {
    await chrome.storage.local.set({ [LOCK_KEY]: { v: 1, salt: '!!', iterations: 0 } })
    await chrome.storage.session.set({ [UNLOCK_KEY]: '!!' })
    forgetLockSnapshot()
    expect(lockedOut(await captures.get('c1'))).toBe(true)
  })

  it('إفراغ القاعدة وحده يمرّ والمكتبة مقفلة — النسيان والحذف الكامل', async () => {
    await lock()
    expect((await clearAllStores()).ok).toBe(true)
    await chrome.storage.local.remove(LOCK_KEY)
    forgetLockSnapshot()
    const counted = await captures.count()
    expect(counted.ok && counted.value).toBe(0)
  })

  it('«احذف كل البيانات» يُفرغ المكتبة المقفلة ويُزيل القفل معها', async () => {
    await lock()
    expect((await eraseAllData()).ok).toBe(true)
    const counted = await captures.count()
    expect(counted.ok && counted.value).toBe(0)
  })
})

/** كل ملفّ `.ts`/`.tsx` تحت `src/`. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('لا طريق إلى القاعدة يتجاوز الحارس', () => {
  const files = sources('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }))

  it('`withDbForErase` في `clearAllStores` وحدها', () => {
    // النداء لا التعريف (`withDbForErase<T>(` في `db.ts`).
    const users = files.filter((f) => /withDbForErase\(/.test(f.text)).map((f) => f.path)
    expect(users).toEqual(['src/shared/storage/repository.ts'])
    const repository = files.find((f) => f.path === 'src/shared/storage/repository.ts')?.text ?? ''
    expect(repository.match(/withDbForErase\(/g)).toHaveLength(1)
    expect(repository).toMatch(/clearAllStores\(\)[^{]*\{[^}]*withDbForErase\(/)
  })

  it('ولا أحد يفتح القاعدة بـ`database()` خارج `db.ts`', () => {
    const users = files.filter((f) => /\bdatabase\(\)/.test(f.text)).map((f) => f.path)
    expect(users).toEqual(['src/shared/storage/db.ts'])
  })
})
