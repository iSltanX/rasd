import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  classify,
  connectGitHub,
  createIssue,
  disconnectGitHub,
  getRepository,
} from '@/modules/export/integrations/github'
import { resetSettingsCache, updateSettings } from '@/shared/settings'
import { deleteVaultDatabase, readSecret, saveSecret } from '@/shared/storage/vault'

/**
 * عميل GitHub — ADR 0046 §6، و`STAGES/11` معيار القبول الثاني: **مع `localOnly` كل مسار رفع يُرفَض.**
 *
 * المسارات الثلاثة التي تُرسل شيئًا (التحقّق من الرمز وقراءة المستودع وفتح Issue) تُرفض بـ`local-only` ولا يُستدعى
 * `fetch` في أيٍّ منها. **ويحمرّ عند تعطيل الإنفاذ:** حُذف سطر `localOnly` من `egressAllowed` فسقط هذا الوصف كلّه
 * (الدليل في سجلّ `STAGES/11`). ومنعُ تجاوز المخرج نفسه — مسار رفعٍ يُكتب بـ`fetch` مباشرةً — يحرسه
 * `tests/unit/egress-single-exit.test.ts`.
 */

const TOKEN = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP'
let fetchSpy: ReturnType<typeof vi.fn>

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers })

const localOnly = (on: boolean) =>
  updateSettings((current) => ({ privacy: { ...current.privacy, localOnly: on } }))

beforeEach(async () => {
  fakeBrowser.reset()
  resetSettingsCache()
  await deleteVaultDatabase()
  Object.assign(globalThis.chrome, {
    permissions: { contains: vi.fn().mockResolvedValue(true) },
  })
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('«الوضع المحلّي فقط» يرفض كل مسار رفع', () => {
  it('التحقّق من الرمز وقراءة المستودع وفتح Issue — ولا طلب واحد', async () => {
    await saveSecret('github', TOKEN)
    const outcomes = [
      await connectGitHub(TOKEN),
      await getRepository('octo', 'site'),
      await createIssue('octo', 'site', { title: 'عطل', body: 'وصف' }),
    ]
    expect(outcomes.map((o) => (o.ok ? 'sent' : o.error.failure))).toEqual([
      'local-only',
      'local-only',
      'local-only',
    ])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('وهو الافتراضي: تثبيتٌ جديد لم يلمس الإعدادات', async () => {
    const connected = await connectGitHub(TOKEN)
    expect(connected.ok ? 'sent' : connected.error.failure).toBe('local-only')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
  })
})

describe('بعد إيقاف «الوضع المحلّي» ومنح الصلاحية', () => {
  beforeEach(() => localOnly(false))

  it('connectGitHub يسأل عن صاحب الرمز ثمّ يحفظه', async () => {
    fetchSpy.mockResolvedValue(json(200, { login: 'octocat' }))
    expect(await connectGitHub(`  ${TOKEN}  `)).toEqual({ ok: true, value: { login: 'octocat' } })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/user')
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(init.credentials).toBe('omit')
    expect(await readSecret('github')).toEqual({ ok: true, value: TOKEN })
  })

  it('رمزٌ يرفضه GitHub لا يُحفظ', async () => {
    fetchSpy.mockResolvedValue(json(401, { message: 'Bad credentials' }))
    const connected = await connectGitHub(TOKEN)
    expect(connected.ok ? 'ok' : connected.error).toEqual({ failure: 'auth', status: 401 })
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
  })

  it('رمزٌ بشكلٍ مرفوض لا يُرسل أصلًا', async () => {
    for (const bad of ['', 'short', `${TOKEN} x`, `${TOKEN}\n`.repeat(2)]) {
      const connected = await connectGitHub(bad)
      expect(connected.ok ? 'ok' : connected.error.failure, JSON.stringify(bad)).toBe('malformed')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('createIssue يُرسل العنوان والنصّ إلى مستودعه وحده', async () => {
    await saveSecret('github', TOKEN)
    fetchSpy.mockResolvedValue(
      json(201, { number: 42, html_url: 'https://github.com/octo/site/issues/42' }),
    )
    const created = await createIssue('octo', 'site', { title: 'عطل', body: 'وصف' })
    expect(created).toEqual({
      ok: true,
      value: { number: 42, url: 'https://github.com/octo/site/issues/42' },
    })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/octo/site/issues')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'عطل', body: 'وصف' })
  })

  it('بلا رمز محفوظ ⇐ `not-connected` بلا طلب', async () => {
    const created = await createIssue('octo', 'site', { title: 'عطل', body: '' })
    expect(created.ok ? 'ok' : created.error.failure).toBe('not-connected')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('اسم مستودعٍ يخرج من مساره لا يُرسل', async () => {
    await saveSecret('github', TOKEN)
    for (const [owner, repo] of [
      ['..', 'x'],
      ['octo', '..'],
      ['octo/../../user', 'x'],
      ['octo', 'site/issues?x'],
      ['-octo', 'site'],
    ] as const) {
      const read = await getRepository(owner, repo)
      expect(read.ok ? 'ok' : read.error.failure, `${owner}/${repo}`).toBe('malformed')
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getRepository يقرأ ما يلزم وحده', async () => {
    await saveSecret('github', TOKEN)
    fetchSpy.mockResolvedValue(
      json(200, { full_name: 'octo/site', private: true, has_issues: true }),
    )
    expect(await getRepository('octo', 'site')).toEqual({
      ok: true,
      value: { fullName: 'octo/site', private: true, hasIssues: true },
    })
  })

  it('الرمز لا يظهر في أي خطأ', async () => {
    await saveSecret('github', TOKEN)
    for (const status of [401, 403, 404, 410, 422, 429, 500, 302]) {
      fetchSpy.mockResolvedValueOnce(json(status, { message: TOKEN }))
      const created = await createIssue('octo', 'site', { title: 't', body: 'b' })
      expect(created.ok).toBe(false)
      expect(JSON.stringify(created)).not.toContain(TOKEN)
    }
    fetchSpy.mockRejectedValueOnce(new TypeError(`Failed ${TOKEN}`))
    expect(
      JSON.stringify(await createIssue('octo', 'site', { title: 't', body: 'b' })),
    ).not.toContain(TOKEN)
  })

  it('disconnectGitHub ينسى الرمز', async () => {
    await saveSecret('github', TOKEN)
    expect((await disconnectGitHub()).ok).toBe(true)
    expect(await readSecret('github')).toEqual({ ok: true, value: null })
  })
})

describe('classify — رمز الحالة إلى سببٍ مسمًّى', () => {
  const at = (status: number, headers: Record<string, string> = {}) =>
    classify({ status, headers: new Headers(headers) })

  it.each([
    [401, {}, 'auth'],
    [403, {}, 'missing-permission'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rate-limited'],
    [403, { 'retry-after': '60' }, 'rate-limited'],
    [429, {}, 'rate-limited'],
    [404, {}, 'not-found'],
    [410, {}, 'issues-disabled'],
    [422, {}, 'invalid'],
    [502, {}, 'server'],
    [302, {}, 'unexpected'],
  ] as const)('%i %o ⇐ %s', (status, headers, expected) => {
    expect(at(status, headers).failure).toBe(expected)
  })

  it('مهلة إعادة المحاولة تُقرأ من retry-after', () => {
    expect(at(429, { 'retry-after': '30' }).retryAfterSeconds).toBe(30)
  })
})
