import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  classify,
  parseRepoRef,
  toBase64,
  uploadAsset,
  type GitHubFailure,
} from '@/modules/export/integrations/github'
import {
  DEFAULT_ISSUE_OPTIONS,
  planIssue,
  type IssuePlan,
} from '@/modules/export/integrations/issue'
import { sendIssue, type SendRequest } from '@/modules/export/integrations/send'
import { resetSettingsCache, updateSettings } from '@/shared/settings'
import { deleteVaultDatabase, saveSecret } from '@/shared/storage/vault'

import { KNOWN_ISSUE, META } from '../handoff/fixture'

/**
 * إرسال البلاغ — `STAGES/12`، معيار القبول الثاني: **فشل المصادقة والشبكة ونقص الصلاحيات، لكلٍّ سببٌ مميَّز**
 * (والرسالة العربية لكل سببٍ في `pages/integrations/text.ts`، يحرسها اختبار الواجهة).
 */

const TOKEN = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
let fetchSpy: ReturnType<typeof vi.fn>

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

const SHA = 'a'.repeat(40)
/** ردٌّ جديد في كل مرّة: جسم `Response` يُقرأ مرّةً واحدة. */
const uploaded = () => json(201, { content: { path: 'x' }, commit: { sha: SHA } })
const created = () =>
  json(201, { number: 482, html_url: 'https://github.com/northwind/web/issues/482' })

function plan(): IssuePlan {
  const planned = planIssue(
    {
      issues: [KNOWN_ISSUE],
      source: 'لقطة في المحرّر',
      generatedAt: META.generatedAt,
      version: META.version,
      baked: new Map([['capture-cta', PNG]]),
    },
    DEFAULT_ISSUE_OPTIONS,
  )
  if (!planned.ok) throw new Error(planned.error.message)
  return planned.value
}

const request = (over: Partial<SendRequest> = {}): SendRequest => ({
  owner: 'northwind',
  repo: 'web',
  title: 'الزرّ الأساسي يفقد 8px',
  intro: 'مقدّمة',
  plan: plan(),
  imageMode: 'asset',
  ...over,
})

const urlOf = (call: unknown[]): string => call[0] as string
const methodOf = (call: unknown[]): string => (call[1] as RequestInit).method ?? ''

beforeEach(async () => {
  fakeBrowser.reset()
  resetSettingsCache()
  await deleteVaultDatabase()
  Object.assign(globalThis.chrome, { permissions: { contains: vi.fn().mockResolvedValue(true) } })
  await updateSettings((current) => ({ privacy: { ...current.privacy, localOnly: false } }))
  await saveSecret('github', TOKEN)
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => vi.unstubAllGlobals())

describe('النجاح', () => {
  it('أصل في المستودع: يرفع الصورة أوّلًا ثمّ يفتح البلاغ بعنوانها المثبَّت على الالتزام', async () => {
    fetchSpy.mockResolvedValueOnce(uploaded()).mockResolvedValueOnce(created())
    const sent = await sendIssue(request())
    expect(sent).toEqual({
      ok: true,
      value: { number: 482, url: 'https://github.com/northwind/web/issues/482', uploaded: 1 },
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [put, post] = fetchSpy.mock.calls as unknown[][]
    expect(methodOf(put!)).toBe('PUT')
    expect(urlOf(put!)).toBe(
      'https://api.github.com/repos/northwind/web/contents/.rasd/issues/20260930-120000/issue-01.png',
    )
    const uploadBody = JSON.parse((put![1] as RequestInit).body as string) as {
      content: string
      message: string
    }
    expect(uploadBody.content).toBe(toBase64(PNG))
    expect(methodOf(post!)).toBe('POST')
    expect(urlOf(post!)).toBe('https://api.github.com/repos/northwind/web/issues')
    const issueBody = JSON.parse((post![1] as RequestInit).body as string) as { body: string }
    expect(issueBody.body).toContain(
      `https://github.com/northwind/web/blob/${SHA}/.rasd/issues/20260930-120000/issue-01.png?raw=true`,
    )
    expect(issueBody.body).not.toContain('data:image')
  })

  it('base64 في النصّ: طلبٌ واحد بلا رفع، والصورة داخل النصّ', async () => {
    fetchSpy.mockResolvedValueOnce(created())
    const sent = await sendIssue(request({ imageMode: 'inline' }))
    expect(sent.ok && sent.value.uploaded).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(methodOf(fetchSpy.mock.calls[0]!)).toBe('POST')
    const posted = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string) as {
      body: string
    }
    expect(posted.body).toContain(`data:image/png;base64,${toBase64(PNG)}`)
  })
})

describe('كل فشلٍ بسببه المميَّز', () => {
  const cases: [string, Response | Error, 'upload' | 'issue', GitHubFailure][] = [
    ['رمزٌ مرفوض عند الرفع', json(401, {}), 'upload', 'auth'],
    ['صلاحية Contents ناقصة عند الرفع', json(403, {}), 'upload', 'missing-permission'],
    ['مستودعٌ غير موجود عند الرفع', json(404, {}), 'upload', 'not-found'],
    ['تعارضٌ مؤقّت عند الرفع', json(409, {}), 'upload', 'conflict'],
    ['انقطاع الشبكة عند الرفع', new TypeError('Failed to fetch'), 'upload', 'network'],
  ]
  it.each(cases)('%s', async (_name, outcome, step, failure) => {
    if (outcome instanceof Error) fetchSpy.mockRejectedValueOnce(outcome)
    else fetchSpy.mockResolvedValueOnce(outcome)
    const sent = await sendIssue(request())
    expect(sent.ok).toBe(false)
    if (sent.ok) return
    expect(sent.error).toMatchObject({ step, uploaded: 0, error: { failure } })
    // فشل الرفع يوقف كل شيء: لا بلاغ بصورةٍ مكسورة.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  const issueCases: [string, Response | Error, GitHubFailure][] = [
    ['رمزٌ مرفوض عند الفتح', json(401, {}), 'auth'],
    ['صلاحية Issues ناقصة', json(403, {}), 'missing-permission'],
    ['حدّ المعدّل', json(403, {}, { 'x-ratelimit-remaining': '0' }), 'rate-limited'],
    ['Issues معطَّلة في المستودع', json(410, {}), 'issues-disabled'],
    ['طلبٌ مرفوض لمحتواه', json(422, {}), 'invalid'],
    ['خطأ الخادم', json(502, {}), 'server'],
    [
      'ردٌّ بلا رابط GitHub',
      json(201, { number: 1, html_url: 'https://evil.example/x' }),
      'unexpected',
    ],
    ['انقطاع الشبكة عند الفتح', new TypeError('Failed to fetch'), 'network'],
  ]
  it.each(issueCases)('%s', async (_name, outcome, failure) => {
    fetchSpy.mockResolvedValueOnce(uploaded())
    if (outcome instanceof Error) fetchSpy.mockRejectedValueOnce(outcome)
    else fetchSpy.mockResolvedValueOnce(outcome)
    const sent = await sendIssue(request())
    expect(sent.ok).toBe(false)
    // الصورة المرفوعة تُعدّ: ملفٌّ بقي في المستودع ولم يُفتح البلاغ.
    expect(!sent.ok && sent.error).toMatchObject({ step: 'issue', uploaded: 1, error: { failure } })
  })
})

describe('الإلغاء', () => {
  it('قبل الرفع: لا طلب', async () => {
    const controller = new AbortController()
    controller.abort()
    const sent = await sendIssue(request({ signal: controller.signal }))
    expect(sent).toEqual({ ok: false, error: { step: 'cancelled', uploaded: 0 } })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('بعد الرفع وقبل الفتح: لا بلاغ، والمرفوع يُعدّ', async () => {
    const controller = new AbortController()
    const aborting = vi.fn((): Promise<Response> => {
      controller.abort()
      return Promise.resolve(uploaded())
    })
    vi.stubGlobal('fetch', aborting)
    const sent = await sendIssue(request({ signal: controller.signal }))
    expect(sent).toEqual({ ok: false, error: { step: 'cancelled', uploaded: 1 } })
    expect(aborting).toHaveBeenCalledTimes(1)
  })
})

describe('حدود النصّ تُفحص قبل أيّ رفع', () => {
  it('عنوانٌ فارغ: لا طلب', async () => {
    const sent = await sendIssue(request({ title: '   ' }))
    expect(sent).toEqual({ ok: false, error: { step: 'check', problem: 'title-empty' } })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('نصٌّ فوق الحدّ بصورة base64 كبيرة: لا طلب — والأصل يبقى ممكنًا', async () => {
    const big = new Uint8Array(60_000).map((_, i) => i % 251)
    const heavy = planIssue(
      {
        issues: [KNOWN_ISSUE],
        source: 's',
        generatedAt: META.generatedAt,
        version: META.version,
        baked: new Map([['capture-cta', big]]),
      },
      DEFAULT_ISSUE_OPTIONS,
    )
    if (!heavy.ok) throw new Error('plan')
    const inline = await sendIssue(request({ plan: heavy.value, imageMode: 'inline' }))
    expect(inline).toEqual({ ok: false, error: { step: 'check', problem: 'body-too-long' } })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('رفع الأصل', () => {
  it('مسارٌ فيه «..» أو مقطعٌ فارغ مرفوضٌ قبل أي طلب', async () => {
    for (const path of ['../x.png', 'a//b.png', './x.png', '']) {
      const r = await uploadAsset('northwind', 'web', path, PNG, 'm')
      expect(r.ok ? 'ok' : r.error.failure).toBe('malformed')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('رمز التزامٍ ليس هاشًا مرفوض — لا عنوانٌ مبنيٌّ على ردٍّ مشوَّه', async () => {
    fetchSpy.mockResolvedValueOnce(
      json(201, { content: { path: 'x' }, commit: { sha: '../../x' } }),
    )
    const r = await uploadAsset('northwind', 'web', 'a/b.png', PNG, 'm')
    expect(r.ok ? 'ok' : r.error.failure).toBe('unexpected')
  })
})

describe('تصنيف الحالة والمرجع', () => {
  it('409 تعارض', () => {
    expect(classify({ status: 409, headers: new Headers() }).failure).toBe('conflict')
  })

  it('مرجع المستودع: «مالك/اسم» أو رابطه — والباقي مرفوض', () => {
    expect(parseRepoRef('northwind/web')).toEqual({ owner: 'northwind', repo: 'web' })
    expect(parseRepoRef(' https://github.com/northwind/web.git ')).toEqual({
      owner: 'northwind',
      repo: 'web',
    })
    expect(parseRepoRef('https://github.com/northwind/web/issues/4')).toEqual({
      owner: 'northwind',
      repo: 'web',
    })
    for (const bad of ['', 'web', 'a/', '/b', 'a b/c', 'a/..', 'https://evil.io/a/b']) {
      expect(parseRepoRef(bad), bad).toBeNull()
    }
  })
})
