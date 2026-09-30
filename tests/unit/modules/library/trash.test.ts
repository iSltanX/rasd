import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  daysRemaining,
  isExpired,
  moveToTrash,
  purgeCapture,
  purgeExpired,
  restoreFromTrash,
  TRASH_RETENTION_DAYS,
  TRASH_RETENTION_MS,
} from '@/modules/library/trash'
import { errWith } from '@/shared/result'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { annotations, blobs, captures } from '@/shared/storage/repository'

import { failCaptureDeleteAt } from '../../../helpers/fail-capture-delete'

import type { CaptureRecord } from '@/shared/storage/schema'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://example.com',
    url: 'https://example.com/page',
    title: 'صفحة',
    kind: 'area',
    status: 'ready',
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

afterEach(() => {
  vi.restoreAllMocks()
  Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
})

/** يفعّل منع الكتابة كما في التصفّح الخاص — القراءة تبقى تعمل. */
function blockWrites() {
  Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
  setIncognitoWritePolicy(true)
}

describe('isExpired / daysRemaining — منطق محض', () => {
  it('لا تنتهي الصلاحية قبل 30 يومًا بالضبط', () => {
    expect(isExpired(NOW, NOW + TRASH_RETENTION_MS - 1)).toBe(false)
    expect(isExpired(NOW, NOW + TRASH_RETENTION_MS)).toBe(true)
  })

  it(`TRASH_RETENTION_DAYS يساوي 30 فعلًا`, () => {
    expect(TRASH_RETENTION_DAYS).toBe(30)
  })

  it('daysRemaining تتناقص ولا تنزل عن صفر', () => {
    expect(daysRemaining(NOW, NOW)).toBe(30)
    expect(daysRemaining(NOW, NOW + 29 * DAY)).toBe(1)
    expect(daysRemaining(NOW, NOW + 30 * DAY)).toBe(0)
    expect(daysRemaining(NOW, NOW + 60 * DAY)).toBe(0)
  })
})

describe('moveToTrash / restoreFromTrash', () => {
  it('ينقل لقطة حيّة إلى المهملات ويعلِّم trashedAt', async () => {
    await captures.put(capture('a'))
    const moved = await moveToTrash('a', NOW + DAY)
    expect(moved.ok).toBe(true)

    const found = await captures.get('a')
    expect(found.ok && found.value.trashedAt).toBe(NOW + DAY)
  })

  it('يستعيد لقطة من المهملات — trashedAt يعود null', async () => {
    await captures.put(capture('a', { trashedAt: NOW }))
    const restored = await restoreFromTrash('a')
    expect(restored.ok).toBe(true)

    const found = await captures.get('a')
    expect(found.ok && found.value.trashedAt).toBeNull()
  })

  it('ينقل معرِّفًا غير موجود إلى المهملات فيفشل — لا يكتب سجلًّا وهميًّا', async () => {
    const moved = await moveToTrash('لا-وجود', NOW)
    expect(moved.ok).toBe(false)
  })
})

describe('مسارات الفشل في النقل والاستعادة', () => {
  it('منع الكتابة يوقف النقل إلى المهملات ويبقي اللقطة حيّة', async () => {
    await captures.put(capture('a'))
    blockWrites()

    const moved = await moveToTrash('a', NOW)

    expect(!moved.ok && moved.error.code).toBe('incognito-blocked')
    const found = await captures.get('a')
    expect(found.ok && found.value.trashedAt).toBeNull()
  })

  it('استعادة معرِّف غير موجود تفشل — لا تُكتب لقطة وهمية', async () => {
    const restored = await restoreFromTrash('لا-وجود')

    expect(!restored.ok && restored.error.code).toBe('not-found')
    const count = await captures.count()
    expect(count.ok && count.value).toBe(0)
  })

  it('منع الكتابة يوقف الاستعادة وتبقى اللقطة في المهملات', async () => {
    await captures.put(capture('a', { trashedAt: NOW }))
    blockWrites()

    const restored = await restoreFromTrash('a')

    expect(!restored.ok && restored.error.code).toBe('incognito-blocked')
    const found = await captures.get('a')
    expect(found.ok && found.value.trashedAt).toBe(NOW)
  })
})

describe('purgeCapture — حذف نهائي', () => {
  it('يحذف اللقطة والبايتات والمشهد معًا', async () => {
    await captures.put(capture('a', { trashedAt: NOW }))
    await blobs.put({ id: 'a', blob: new Blob(['x']), mime: 'image/png', bytes: 1 })
    await annotations.put({ captureId: 'a', scene: {}, updatedAt: NOW })

    const purged = await purgeCapture('a')
    expect(purged.ok).toBe(true)

    expect((await captures.get('a')).ok).toBe(false)
    expect((await blobs.get('a')).ok).toBe(false)
    expect((await annotations.get('a')).ok).toBe(false)
  })
})

describe('purgeExpired', () => {
  it('يطهِّر ما تجاوز 30 يومًا فقط، ويترك ما لم يتجاوز والحيّ', async () => {
    await captures.put(capture('expired', { trashedAt: NOW - TRASH_RETENTION_MS }))
    await captures.put(capture('fresh-trash', { trashedAt: NOW - DAY }))
    await captures.put(capture('live', { trashedAt: null }))

    const purged = await purgeExpired(NOW)
    expect(purged.ok && purged.value).toBe(1)

    expect((await captures.get('expired')).ok).toBe(false)
    expect((await captures.get('fresh-trash')).ok).toBe(true)
    expect((await captures.get('live')).ok).toBe(true)
  })

  it('لا شيء منتهي الصلاحية ⇒ صفر مُطهَّر بلا فشل', async () => {
    await captures.put(capture('live', { trashedAt: null }))
    const purged = await purgeExpired(NOW)
    expect(purged.ok && purged.value).toBe(0)
  })
})

describe('purgeExpired — مسارات الفشل', () => {
  it('فشل قراءة المخزن يُرجَع كما هو ولا يُحذف شيء', async () => {
    await captures.put(capture('expired', { trashedAt: NOW - TRASH_RETENTION_MS }))
    vi.spyOn(captures, 'getAll').mockResolvedValueOnce(errWith('unknown', 'تعذّرت القراءة'))

    const purged = await purgeExpired(NOW)

    expect(!purged.ok && purged.error.detail).toBe('تعذّرت القراءة')
    expect((await captures.get('expired')).ok).toBe(true)
  })

  /**
   * التسلسل لا يتوازى كي يكون الحال بعد الفشل معلومًا: ما قبل الفاشلة حُذف،
   * والفاشلة باقية، وما بعدها لم يُحاوَل — والنتيجة **الفشل** لا عدد ما نجح.
   */
  it('يتوقّف عند أوّل حذف فاشل فلا يحاول ما بعده ويُرجع الفشل', async () => {
    for (const id of ['a', 'b', 'c']) {
      await captures.put(capture(id, { trashedAt: NOW - TRASH_RETENTION_MS - 1 }))
    }
    failCaptureDeleteAt(2)

    const purged = await purgeExpired(NOW)

    expect(purged.ok).toBe(false)
    expect((await captures.get('a')).ok, 'الأولى قبل الفشل حُذفت').toBe(false)
    expect((await captures.get('b')).ok, 'الفاشلة باقية').toBe(true)
    expect((await captures.get('c')).ok, 'ما بعد الفشل لم يُحاوَل').toBe(true)
  })
})
