import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearDrafts, deleteDraft, latestDraft, saveDraft } from '@/modules/report/drafts'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { forgetLockSnapshot, LOCK_KEY, UNLOCK_KEY } from '@/shared/storage/lock-state'
import { DB_NAME, type ReportDraftRecord } from '@/shared/storage/schema'

import { bytesBlob } from '../../data/library-fixture'

/**
 * مسودة البلاغ — ADR 0050 §6: مسودةٌ واحدة في كل مرّة، تُمسح بعد النجاح، وخلف قفل المكتبة كلقطاتها.
 *
 * وحالة «المسودة الأقدم يتيمة» (المراجعة المستقلّة): بلاغٌ فُتح من رسالة خطأ بمعرّفٍ جديد ثمّ حُفظ أو وصل كان يترك مسودةً
 * أقدم بصورتها على القرص بلا سقف. فالحفظ يستبدل، والنجاح يمسح.
 */

const LOCK = {
  v: 1,
  salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
  iterations: 1000,
  verifier: 'dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnY=',
}

const draft = (id: string, updatedAt: number): ReportDraftRecord => ({
  id,
  createdAt: updatedAt,
  updatedAt,
  kind: 'bug',
  title: `عطل ${id}`,
  what: 'وصف',
  steps: '',
  expected: '',
  tool: null,
  errorCode: null,
  image: { blob: bytesBlob([1, 2, 3], 'image/png'), width: 1, height: 1, redactions: 1 },
})

beforeEach(async () => {
  fakeBrowser.reset()
  setIncognitoWritePolicy(false)
  forgetLockSnapshot()
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  await new Promise((r) => setTimeout(r, 0))
})

describe('مسودةٌ واحدة في كل مرّة', () => {
  it('حفظ مسودةٍ ثانية يستبدل الأولى — لا يتيمة بصورتها', async () => {
    expect((await saveDraft(draft('old', 1))).ok).toBe(true)
    expect((await saveDraft(draft('new', 2))).ok).toBe(true)
    const latest = await latestDraft()
    expect(latest.ok && latest.value?.id).toBe('new')
    await deleteDraft('new')
    const none = await latestDraft()
    expect(none.ok && none.value).toBeNull()
  })

  it('النجاح يمسح المخزن كلّه', async () => {
    await saveDraft(draft('a', 1))
    expect((await clearDrafts()).ok).toBe(true)
    const none = await latestDraft()
    expect(none.ok && none.value).toBeNull()
  })

  it('وبصمة المحاولة تُحفظ مع المسودة وتُقرأ', async () => {
    await saveDraft({ ...draft('k', 1), attempted: 'abc123' })
    const back = await latestDraft()
    expect(back.ok && back.value?.attempted).toBe('abc123')
  })
})

describe('خلف قفل المكتبة', () => {
  it('مكتبةٌ مقفلة: لا تُقرأ المسودة ولا تُكتب ولا تُمسح', async () => {
    await saveDraft(draft('a', 1))
    await chrome.storage.local.set({ [LOCK_KEY]: LOCK })
    await chrome.storage.session.remove(UNLOCK_KEY)
    forgetLockSnapshot()

    const locked = (r: { ok: boolean; error?: { code: string } }) =>
      !r.ok && r.error?.code === 'library-locked'
    expect(locked(await latestDraft())).toBe(true)
    expect(locked(await saveDraft(draft('b', 2)))).toBe(true)
    expect(locked(await clearDrafts())).toBe(true)
  })
})

describe('التصفّح الخاص', () => {
  it('لا تُحفظ مسودة حين يُمنع الحفظ في التصفّح الخاص', async () => {
    setIncognitoWritePolicy(true)
    Object.assign(globalThis.chrome.extension ?? (globalThis.chrome.extension = {} as never), {
      inIncognitoContext: true,
    })
    const saved = await saveDraft(draft('a', 1))
    Object.assign(globalThis.chrome.extension, { inIncognitoContext: false })
    expect(!saved.ok && saved.error.code).toBe('incognito-blocked')
  })
})
