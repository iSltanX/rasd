import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  calibrateIterations,
  codeLength,
  deriveVerifier,
  equalBytes,
  ITERATIONS_CEILING,
  ITERATIONS_FLOOR,
  normalizeCode,
} from '@/modules/privacy/kdf'
import {
  ATTEMPTS_PER_ROUND,
  BASE_COOLDOWN_MS,
  cooldownFor,
  disableLock,
  enableLock,
  forgetCodeAndErase,
  lockNow,
  lockStatus,
  MAX_COOLDOWN_MS,
  unlockLibrary,
} from '@/modules/privacy/lock'
import { bytesToBase64 } from '@/shared/base64'
import { closeDatabase } from '@/shared/storage/db'
import {
  ATTEMPTS_KEY,
  forgetLockSnapshot,
  LOCK_KEY,
  parseLockRecord,
  UNLOCK_KEY,
} from '@/shared/storage/lock-state'
import { captures, putCaptureWithBlob } from '@/shared/storage/repository'
import { DB_NAME, type CaptureRecord } from '@/shared/storage/schema'

/**
 * قفل المكتبة من التفعيل إلى النسيان — ADR 0043. الدورات صغيرة هنا (`iterations: 1000`) كي لا ينتظر الاختبار
 * 300ms لكل اشتقاق؛ القياس نفسه مختبَرٌ وحده.
 */

const CODE = 'رمز-سرّي-٢٠٢٦'
const FAST = { iterations: 1000 }
const now = 1_780_000_000_000

function capture(id: string): CaptureRecord {
  return {
    id,
    createdAt: now,
    origin: 'https://shop.example',
    url: 'https://shop.example/',
    title: 'لقطة',
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 1,
    height: 1,
    devicePixelRatio: 1,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}

/** إغلاق المتصفّح: `chrome.storage.session` يُمحى. */
async function restartBrowser(): Promise<void> {
  await chrome.storage.session.clear()
  forgetLockSnapshot()
}

/** كل ما في مناطق التخزين الثلاث نصًّا واحدًا. */
async function everythingStored(): Promise<string> {
  const areas = await Promise.all([
    chrome.storage.local.get(null),
    chrome.storage.session.get(null),
    chrome.storage.sync.get(null),
  ])
  return JSON.stringify(areas)
}

beforeEach(async () => {
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  forgetLockSnapshot()
  expect((await putCaptureWithBlob(capture('c1'), new Blob(['png']))).ok).toBe(true)
})

describe('التفعيل', () => {
  it('يرفض رمزًا دون ثمانية محارف — بالمحارف لا بوحدات UTF-16', async () => {
    expect(await enableLock('1234567', FAST)).toMatchObject({
      ok: false,
      error: { kind: 'too-short' },
    })
    expect(codeLength('😀😀😀😀')).toBe(4)
    expect(await enableLock('😀😀😀😀', FAST)).toMatchObject({
      ok: false,
      error: { kind: 'too-short' },
    })
    expect((await lockStatus()).mode).toBe('off')
  })

  it('يفعّل والجلسة التي فعّلته تبقى مفكوكة، ثمّ يُقفل بإغلاق المتصفّح', async () => {
    expect((await enableLock(CODE, FAST)).ok).toBe(true)
    expect((await lockStatus()).mode).toBe('unlocked')
    expect((await captures.get('c1')).ok).toBe(true)

    await restartBrowser()
    expect((await lockStatus()).mode).toBe('locked')
    expect((await captures.get('c1')).ok).toBe(false)
  })

  it('لا يُفعَّل مرّتين', async () => {
    await enableLock(CODE, FAST)
    expect(await enableLock('رمز-آخر-طويل', FAST)).toMatchObject({
      ok: false,
      error: { kind: 'already-enabled' },
    })
  })
})

describe('الرمز لا يُخزَّن نصًّا صريحًا', () => {
  it('لا الرمز ولا صيغه المرمَّزة في أيّ منطقة تخزين — والسجلّ مُتحقِّقٌ مشتقّ', async () => {
    await enableLock(CODE, FAST)
    await unlockLibrary(CODE, now)
    await unlockLibrary('خطأ-خطأ-خطأ', now)

    const stored = await everythingStored()
    const bytes = new TextEncoder().encode(CODE)
    for (const form of [
      CODE,
      normalizeCode(CODE),
      encodeURIComponent(CODE),
      JSON.stringify(CODE).slice(1, -1),
      bytesToBase64(bytes),
      [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''),
      'خطأ-خطأ-خطأ',
    ]) {
      expect(stored.includes(form), form).toBe(false)
    }

    const { [LOCK_KEY]: record } = await chrome.storage.local.get(LOCK_KEY)
    expect(Object.keys(record as object).sort()).toEqual(['iterations', 'salt', 'v', 'verifier'])
  })

  it('المُتحقِّق PBKDF2 بالملح والدورات المحفوظة — يُعاد اشتقاقه منها وحدها', async () => {
    await enableLock(CODE, FAST)
    const record = parseLockRecord((await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY])
    if (!record) throw new Error('لا سجلّ قفل')
    const salt = Uint8Array.from(atob(record.salt), (c) => c.charCodeAt(0))
    const again = await deriveVerifier(CODE, salt, record.iterations)
    expect(bytesToBase64(again)).toBe(record.verifier)
    expect(salt).toHaveLength(16)
    expect(again).toHaveLength(32)
  })

  it('ملحٌ جديد لكل تفعيل — الرمز نفسه لا يعطي المُتحقِّق نفسه', async () => {
    await enableLock(CODE, FAST)
    const first = (await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY] as { verifier: string }
    await disableLock(CODE, now)
    await enableLock(CODE, FAST)
    const second = (await chrome.storage.local.get(LOCK_KEY))[LOCK_KEY] as { verifier: string }
    expect(second.verifier).not.toBe(first.verifier)
  })
})

describe('الفكّ والمحاولات', () => {
  beforeEach(async () => {
    await enableLock(CODE, FAST)
    await restartBrowser()
  })

  it('الرمز الصحيح يفتح المكتبة لهذه الجلسة', async () => {
    expect((await unlockLibrary(CODE, now)).ok).toBe(true)
    expect((await captures.get('c1')).ok).toBe(true)
  })

  it('الرمز يُطبَّع: الهمزة حرفًا واحدًا أو حرفًا وعلامة', async () => {
    await disableLock(CODE, now)
    expect((await enableLock('أمان-المكتبة', FAST)).ok).toBe(true)
    await restartBrowser()
    expect((await unlockLibrary('أمان-المكتبة', now)).ok).toBe(true)
  })

  it('الخطأ يعدّ الباقي، والخامس يبدأ مهلة دقيقة — ولا اشتقاق أثناءها ولو بالرمز الصحيح', async () => {
    for (let i = 1; i < ATTEMPTS_PER_ROUND; i++) {
      expect(await unlockLibrary('رمز-خاطئ-تمامًا', now)).toMatchObject({
        ok: false,
        error: { kind: 'wrong-code', remaining: ATTEMPTS_PER_ROUND - i, until: null },
      })
    }
    expect(await unlockLibrary('رمز-خاطئ-تمامًا', now)).toMatchObject({
      ok: false,
      error: { kind: 'wrong-code', remaining: 0, until: now + BASE_COOLDOWN_MS },
    })
    expect(await unlockLibrary(CODE, now + 1000)).toMatchObject({
      ok: false,
      error: { kind: 'cooling-down', until: now + BASE_COOLDOWN_MS },
    })
    expect(await lockStatus(now + 1000)).toMatchObject({
      mode: 'locked',
      cooldownUntil: now + BASE_COOLDOWN_MS,
    })
    // بعد المهلة يُقبل الرمز الصحيح ويُصفَّر العدّاد.
    expect((await unlockLibrary(CODE, now + BASE_COOLDOWN_MS)).ok).toBe(true)
    expect((await chrome.storage.local.get(ATTEMPTS_KEY))[ATTEMPTS_KEY]).toBeUndefined()
  })

  it('العدّاد يبقى بعد إعادة التشغيل — إغلاق المتصفّح لا يصفّر المهلة', async () => {
    for (let i = 0; i < ATTEMPTS_PER_ROUND; i++) await unlockLibrary('رمز-خاطئ-تمامًا', now)
    await restartBrowser()
    expect(await unlockLibrary(CODE, now + 1000)).toMatchObject({
      ok: false,
      error: { kind: 'cooling-down' },
    })
  })

  it('المهلة تتضاعف كل جولة حتى ثلاثين دقيقة', () => {
    expect(cooldownFor(1)).toBe(60_000)
    expect(cooldownFor(2)).toBe(120_000)
    expect(cooldownFor(3)).toBe(240_000)
    expect(cooldownFor(10)).toBe(MAX_COOLDOWN_MS)
  })

  it('«اقفل الآن» يعيد طلب الرمز', async () => {
    await unlockLibrary(CODE, now)
    expect((await lockNow()).ok).toBe(true)
    expect((await captures.get('c1')).ok).toBe(false)
  })
})

describe('الإيقاف والنسيان', () => {
  beforeEach(async () => {
    await enableLock(CODE, FAST)
    await restartBrowser()
  })

  it('الإيقاف يطلب الرمز الحاليّ ويعدّ الخطأ كالفكّ', async () => {
    expect(await disableLock('رمز-خاطئ-تمامًا', now)).toMatchObject({
      ok: false,
      error: { kind: 'wrong-code', remaining: ATTEMPTS_PER_ROUND - 1 },
    })
    expect((await lockStatus()).mode).toBe('locked')
  })

  it('الإيقاف بالرمز يترك المكتبة مفتوحة بلا رمز ولو بعد إعادة التشغيل', async () => {
    expect((await disableLock(CODE, now)).ok).toBe(true)
    await restartBrowser()
    expect((await lockStatus()).mode).toBe('off')
    expect((await captures.get('c1')).ok).toBe(true)
  })

  it('النسيان يحذف المكتبة ثمّ يُزيل القفل — لا يفتح ما فيها، والإعدادات تبقى', async () => {
    await chrome.storage.local.set({ 'rasd:settings': { schemaVersion: 1 } })
    expect((await forgetCodeAndErase()).ok).toBe(true)
    expect((await lockStatus()).mode).toBe('off')
    const counted = await captures.count()
    expect(counted.ok && counted.value).toBe(0)
    expect((await chrome.storage.local.get('rasd:settings'))['rasd:settings']).toBeDefined()
    expect((await chrome.storage.session.get(UNLOCK_KEY))[UNLOCK_KEY]).toBeUndefined()
  })
})

describe('الاشتقاق', () => {
  it('الدورات مقيسةٌ بين الأرضية والسقف — تُمدّ خطّيًّا من اشتقاقٍ تجريبي', async () => {
    const clock = (elapsed: number) => {
      let calls = 0
      return () => (calls++ === 0 ? 0 : elapsed)
    }
    // 100,000 دورة في 20ms ← 1,500,000 تستغرق 300ms.
    expect(await calibrateIterations(clock(20))).toBe(1_500_000)
    // جهازٌ بطيء: الأرضية لا تُنزَل.
    expect(await calibrateIterations(clock(200))).toBe(ITERATIONS_FLOOR)
    // جهازٌ سريعٌ جدًّا: السقف.
    expect(await calibrateIterations(clock(1))).toBe(ITERATIONS_CEILING)
  })

  it('المقارنة تفحص الطول والبايتات كلّها', () => {
    expect(equalBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(equalBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false)
  })
})
