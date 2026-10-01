import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { errWith } from '@/shared/result'
import { eraseAllData } from '@/shared/storage/erase'
import {
  ATTEMPTS_KEY,
  forgetLockSnapshot,
  LOCK_KEY,
  lockMode,
  UNLOCK_KEY,
} from '@/shared/storage/lock-state'

import type * as Repository from '@/shared/storage/repository'

/**
 * «احذف كل البيانات» تعثّر في القاعدة والمكتبة مقفلة — **القفل يبقى على ما بقي** (ADR 0043 §4، المراجعة المستقلّة
 * في `STAGES/08`). كان `chrome.storage.local.clear()` يجري بعد الإفراغ الفاشل فيمحو `rasd:lock`: الواجهة تقول «لم
 * تُحذف القاعدة» والمكتبة كلّها مفتوحة بلا رمز. سقط هذا الاختبار قبل الإصلاح.
 */
vi.mock('@/shared/storage/repository', async (original) => ({
  ...(await original<typeof Repository>()),
  clearAllStores: () => Promise.resolve(errWith('unknown', 'إفراغٌ أُجهض')),
}))

const RECORD = {
  v: 1,
  salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
  iterations: 1000,
  verifier: 'dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnY=',
}

beforeEach(async () => {
  await chrome.storage.local.set({
    [LOCK_KEY]: RECORD,
    [ATTEMPTS_KEY]: { failures: 3, until: 0 },
    'rasd:settings': { schemaVersion: 1 },
  })
  await chrome.storage.session.set({ [UNLOCK_KEY]: RECORD.salt })
  forgetLockSnapshot()
})

describe('حذفٌ كامل تعثّر في القاعدة', () => {
  it('يُبلغ بما لم يُحذف، ويُبقي القفل وعدّاده، ويُقفل الجلسة', async () => {
    expect(await eraseAllData()).toEqual({ ok: false, error: { failed: ['database'] } })
    const local = await chrome.storage.local.get(null)
    expect(local[LOCK_KEY]).toEqual(RECORD)
    expect(local[ATTEMPTS_KEY]).toEqual({ failures: 3, until: 0 })
    // ما سوى القفل يُحذف كما طلب المستخدم.
    expect(local['rasd:settings']).toBeUndefined()
    forgetLockSnapshot()
    expect(await lockMode()).toBe('locked')
  })
})
