import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  classify,
  parseRetryAfter,
  REPORTS_ENDPOINT,
  retryable,
  sendReport,
} from '@/modules/report/client'
import { deleteDraft, latestDraft, saveDraft } from '@/modules/report/drafts'
import { failureMessage } from '@/modules/report/messages'
import { buildPayload, type Diagnostics, type ReportForm } from '@/modules/report/payload'
import { resetSettingsCache, updateSettings } from '@/shared/settings'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { DB_NAME, type ReportDraftRecord } from '@/shared/storage/schema'

import { bytesBlob } from '../../data/library-fixture'

/**
 * إرسال البلاغ — معايير `STAGES/13`:
 *   - «الفشل: انقطاع الشبكة وردّ 500 وردّ 429، ولكلٍّ رسالة مميّزة والمسودة محفوظة بصورتها».
 *   - «إعادة المحاولة: ينجح بعد الفشل بلا إعادة كتابة، ولا يُنشئ بلاغين» — المفتاح نفسه والجسم نفسه في المحاولتين.
 *   - ومع «الوضع المحلّي فقط» (الافتراضي) لا طلب واحد.
 */

const diag: Diagnostics = {
  appVersion: '1.0.0',
  os: 'macos',
  osVersion: '15.3.0',
  arch: 'arm64',
  browser: 'Google Chrome',
  browserVersion: '153',
  browserId: 'chrome',
  engine: 'Chromium 153.0.7990.12',
  buildTarget: 'chromium',
  installSource: 'chrome-web-store',
}
const form: ReportForm = {
  kind: 'bug',
  title: 'عطل',
  what: 'وصف',
  steps: '',
  expected: '',
  tool: null,
  errorCode: null,
}
const payload = buildPayload(form, diag, { type: 'image/png', bytes: new Uint8Array([1, 2, 3]) })
const KEY = '9a4bd2a4-3c47-4f0e-8f3f-1d7c0d6b2a11'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

const setLocalOnly = (on: boolean) =>
  updateSettings((current) => ({ privacy: { ...current.privacy, localOnly: on } }))

let fetchSpy: ReturnType<typeof vi.fn<(input: string, init: RequestInit) => Promise<Response>>>
let contains: ReturnType<typeof vi.fn>

beforeEach(async () => {
  fakeBrowser.reset()
  resetSettingsCache()
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase(DB_NAME)
  contains = vi.fn().mockResolvedValue(true)
  Object.assign(globalThis.chrome, { permissions: { contains } })
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('«الوضع المحلّي فقط» — الافتراضي', () => {
  it('لا طلب واحد، والسبب `local-only`', async () => {
    const outcome = await sendReport(payload, { key: KEY })
    expect(outcome).toEqual({ ok: false, error: { failure: 'local-only' } })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('وبلا صلاحية المضيف المسمّاة لا طلب كذلك', async () => {
    await setLocalOnly(false)
    contains.mockResolvedValue(false)
    const outcome = await sendReport(payload, { key: KEY })
    expect(outcome.ok === false && outcome.error.failure).toBe('host-permission')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(contains).toHaveBeenCalledWith({
      origins: ['https://app-reports.isultantf.workers.dev/*'],
    })
  })
})

describe('الطلب', () => {
  beforeEach(() => setLocalOnly(false))

  it('POST إلى النقطة المسمّاة بالجسم مسلسلًا ومفتاح عدم التكرار، بلا ملفّات تعريف', async () => {
    fetchSpy.mockResolvedValue(json(201, { id: 12 }))
    const outcome = await sendReport(payload, { key: KEY })
    expect(outcome).toEqual({ ok: true, id: 12, replayed: false })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('https://app-reports.isultantf.workers.dev/v1/reports')
    expect(url).toBe(REPORTS_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(payload))
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'Idempotency-Key': KEY })
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('error')
  })
})

describe('الفشل — لكلٍّ سببه ورسالته، والمسودة محفوظة بصورتها', () => {
  beforeEach(() => setLocalOnly(false))

  const draft = (): ReportDraftRecord => ({
    id: KEY,
    createdAt: 1,
    updatedAt: 1,
    ...form,
    image: { blob: bytesBlob([9, 8, 7, 6], 'image/png'), width: 2, height: 2, redactions: 1 },
  })

  it('انقطاع الشبكة و500 و429: ثلاثة أسباب وثلاث رسائل مختلفة، وكلّها تُعاد', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(500, { error: 'internal' }))
      .mockResolvedValueOnce(json(429, { error: 'rate_limited' }, { 'Retry-After': '1800' }))

    const outcomes = [
      await sendReport(payload, { key: KEY }),
      await sendReport(payload, { key: KEY }),
      await sendReport(payload, { key: KEY }),
    ]
    const errors = outcomes.map((o) => (o.ok ? null : o.error))
    expect(errors.map((e) => e?.failure)).toEqual(['network', 'server', 'rate-limited'])
    expect(errors[2]?.retryAfterSeconds).toBe(1800)

    const messages = errors.map((e) => failureMessage(e!))
    expect(new Set(messages).size).toBe(3)
    expect(messages[2]).toMatch(/٣٠ دقيقة/u)
    expect(errors.every((e) => retryable(e!.failure))).toBe(true)

    // ما تفعله الواجهة على كل فشل: تحفظ المسودة كما هي — ثمّ تُقرأ بصورتها بايتًا ببايت.
    for (const _ of errors) expect((await saveDraft(draft())).ok).toBe(true)
    const back = await latestDraft()
    expect(back.ok && back.value?.id).toBe(KEY)
    const bytes = back.ok && back.value?.image ? await back.value.image.blob.arrayBuffer() : null
    expect(bytes && [...new Uint8Array(bytes)]).toEqual([9, 8, 7, 6])
    expect(back.ok && back.value?.what).toBe('وصف')
  })

  it('والمسودة تُحذف بعد نجاح الإرسال', async () => {
    await saveDraft(draft())
    await deleteDraft(KEY)
    const back = await latestDraft()
    expect(back.ok && back.value).toBeNull()
  })

  it('مهلةٌ انقضت فشلُ شبكة يُعاد، وإلغاء المستخدم `cancelled`', async () => {
    fetchSpy.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const timedOut = await sendReport(payload, { key: KEY, timeoutMs: 5 })
    expect(timedOut.ok === false && timedOut.error).toMatchObject({
      failure: 'network',
      detail: 'timeout',
    })

    const user = new AbortController()
    const pending = sendReport(payload, { key: KEY, signal: user.signal })
    await new Promise((r) => setTimeout(r, 0))
    user.abort()
    const cancelled = await pending
    expect(cancelled.ok === false && cancelled.error.failure).toBe('cancelled')
  })
})

describe('إعادة المحاولة — بلا إعادة كتابة، ولا بلاغين', () => {
  beforeEach(() => setLocalOnly(false))

  it('فشلٌ ثمّ نجاح: الجسم نفسه والمفتاح نفسه في المحاولتين، ورقمٌ واحد', async () => {
    fetchSpy
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(201, { id: 41 }))
    const first = await sendReport(payload, { key: KEY })
    expect(first.ok).toBe(false)
    const second = await sendReport(payload, { key: KEY })
    expect(second).toEqual({ ok: true, id: 41, replayed: false })

    const [a, b] = fetchSpy.mock.calls.map(([, init]) => init)
    expect(b?.body).toBe(a?.body)
    expect((b?.headers as Record<string, string>)['Idempotency-Key']).toBe(KEY)
    expect((a?.headers as Record<string, string>)['Idempotency-Key']).toBe(KEY)
  })

  it('ردٌّ ضاع بعد أن فُتح البلاغ: المحاولة التالية تُجاب `200` بالرقم نفسه', async () => {
    fetchSpy
      .mockResolvedValueOnce(json(201, { id: 77 }))
      .mockResolvedValueOnce(json(200, { id: 77 }))
    const first = await sendReport(payload, { key: KEY })
    const replay = await sendReport(payload, { key: KEY })
    expect(first.ok && first.id).toBe(77)
    expect(replay).toEqual({ ok: true, id: 77, replayed: true })
  })
})

describe('تفسير الردّ بجدول العقد', () => {
  it('400 و413 و415 لا تُعاد، و2xx بلا رقمٍ صحيح ردٌّ غير متوقَّع', async () => {
    const statuses = [400, 413, 415]
    const failures = await Promise.all(
      statuses.map(async (s) => {
        const o = await classify(json(s, { error: 'x' }))
        return o.ok ? null : o.error.failure
      }),
    )
    expect(failures).toEqual(['invalid', 'too-large', 'unsupported'])
    expect(failures.some((f) => retryable(f!))).toBe(false)
    const noId = await classify(json(201, { id: '12' }))
    expect(noId.ok === false && noId.error.failure).toBe('unexpected')
  })

  it('`Retry-After` بالثواني أو بتاريخ', () => {
    expect(parseRetryAfter('120')).toBe(120)
    expect(parseRetryAfter('Wed, 01 Oct 2026 10:00:30 GMT', Date.UTC(2026, 9, 1, 10))).toBe(30)
    expect(parseRetryAfter('later')).toBeUndefined()
  })
})
