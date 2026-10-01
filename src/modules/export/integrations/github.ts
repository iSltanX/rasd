/**
 * **عميل GitHub** — محصورٌ في `api.github.com`، ولا يخرج إلا من مخرج الشبكة الواحد، ولا يقرأ رمزه إلا من الخزنة
 * ([ADR 0046](../../../../Docs/ADR/0046-named-network-services.md) §6).
 *
 * أربعة أفعال: التحقّق من رمزٍ قبل حفظه (`connectGitHub`)، وقراءة مستودع (`getRepository`)، ورفع ملفٍّ إلى المستودع
 * (`uploadAsset` — صورة البلاغ أصلًا)، وفتح Issue (`createIssue`). **ولا يُستدعى أيٌّ من الأخيرين إلا بعد تأكيد
 * المستخدم** — والتأكيد واجهة المؤلِّف (`pages/integrations/IssueComposer.tsx`).
 *
 * **الرمز لا يخرج من هنا إلا في ترويسة `Authorization` إلى `api.github.com`:** لا يُعاد في نتيجة، ولا يُكتب في خطأ،
 * ولا في سجلّ. والأخطاء أسبابٌ مسمّاة تقابل إطارات `24 — Integrations`: `local-only` · `host-permission` ·
 * `auth` · `missing-permission` — لا رسالة عامّة.
 */

import { egressFetch, type EgressRefusal } from '@/shared/egress'
import { err, ok, type Result } from '@/shared/result'
import { forgetSecret, readSecret, saveSecret } from '@/shared/storage/vault'

export const GITHUB_API = 'https://api.github.com'
const API_VERSION = '2022-11-28'

export type GitHubFailure =
  | EgressRefusal
  /** لا رمز محفوظ — المستخدم لم يتّصل، أو قطع الاتّصال. */
  | 'not-connected'
  /** رمزٌ محفوظ لم يُقرأ أو لم يُحفظ — «أعد الاتّصال». */
  | 'vault'
  /** شكل الرمز أو اسم المستودع مرفوض قبل أيّ طلب. */
  | 'malformed'
  /** 401 — الرمز منتهٍ أو مسحوب أو خاطئ. الإطار `integrations / auth-error`. */
  | 'auth'
  /** 403 بلا حدّ معدّل — الرمز لا يملك الصلاحية على هذا المستودع. */
  | 'missing-permission'
  /** 404 — المستودع غير موجود، أو خاصٌّ لا يصله الرمز (GitHub لا يفرّق بينهما عمدًا). */
  | 'not-found'
  /** 410 — الـIssues معطَّلة في المستودع. */
  | 'issues-disabled'
  /** 429، أو 403 بحدٍّ مستنفَد. */
  | 'rate-limited'
  /** 409 — تعارضٌ مؤقّت مع التزامٍ آخر على الفرع: تُعاد المحاولة. */
  | 'conflict'
  /** 422 — الطلب مرفوض لمحتواه. */
  | 'invalid'
  /** 5xx. */
  | 'server'
  /** ردٌّ لا يُفهم. */
  | 'unexpected'

export interface GitHubError {
  readonly failure: GitHubFailure
  readonly status?: number | undefined
  /** ثوانٍ قبل المحاولة التالية، إن قالها الردّ. */
  readonly retryAfterSeconds?: number | undefined
}

export interface GitHubAccount {
  readonly login: string
}

export interface GitHubRepository {
  readonly fullName: string
  readonly private: boolean
  readonly hasIssues: boolean
}

export interface GitHubIssue {
  readonly number: number
  readonly url: string
}

/** ملفٌّ رُفع إلى المستودع: مساره، والتزامه — عنوان الصورة يُثبَّت على الالتزام لا على الفرع. */
export interface GitHubAsset {
  readonly path: string
  readonly commitSha: string
}

export interface IssueDraft {
  readonly title: string
  readonly body: string
}

/** رمز GitHub: محارف ASCII مرئية بلا مسافة. الشكل وحده — صحّته يقولها الخادم. */
const TOKEN = /^[\x21-\x7e]{20,255}$/u
/** اسم الحساب: حروف وأرقام وشرطات، حتى 39. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u
/** اسم المستودع: حروف وأرقام و`.` و`_` و`-`، حتى 100 — و`.` و`..` وحدهما ليسا اسمًا. */
const REPO = /^[A-Za-z0-9._-]{1,100}$/u

const failure = (f: GitHubFailure, status?: number, retryAfterSeconds?: number): GitHubError => ({
  failure: f,
  status,
  retryAfterSeconds,
})

/**
 * يتحقّق من الرمز بسؤال GitHub عن صاحبه، **ثمّ** يحفظه — فرمزٌ خاطئ لا يُحفظ أصلًا. ويمرّ من المخرج كأيّ طلب:
 * «الوضع المحلّي» يرفض الاتّصال نفسه.
 */
export async function connectGitHub(token: string): Promise<Result<GitHubAccount, GitHubError>> {
  const clean = token.trim()
  if (!TOKEN.test(clean)) return err(failure('malformed'))

  const response = await request('GET', '/user', clean)
  if (!response.ok) return response
  const login = (response.value as { login?: unknown } | null)?.login
  if (typeof login !== 'string' || login.length === 0) return err(failure('unexpected'))

  const saved = await saveSecret('github', clean)
  if (!saved.ok) return err(failure('vault'))
  return ok({ login })
}

/** يقطع الاتّصال: ينسى الرمز. صلاحية المضيف يسحبها المستخدم من شاشة الصلاحيات أو صفحة الإضافات. */
export async function disconnectGitHub(): Promise<Result<null, GitHubError>> {
  const forgotten = await forgetSecret('github')
  return forgotten.ok ? ok(null) : err(failure('vault'))
}

export async function getRepository(
  owner: string,
  repo: string,
): Promise<Result<GitHubRepository, GitHubError>> {
  const path = repoPath(owner, repo)
  if (!path) return err(failure('malformed'))
  const token = await storedToken()
  if (!token.ok) return token

  const response = await request('GET', path, token.value)
  if (!response.ok) return response
  const body = response.value as {
    full_name?: unknown
    private?: unknown
    has_issues?: unknown
  } | null
  if (typeof body?.full_name !== 'string') return err(failure('unexpected'))
  return ok({
    fullName: body.full_name,
    private: body.private === true,
    hasIssues: body.has_issues !== false,
  })
}

/** يفتح Issue. **لا يُستدعى إلا بعد تأكيد المستخدم** — والتأكيد واجهة المؤلِّف. */
export async function createIssue(
  owner: string,
  repo: string,
  draft: IssueDraft,
): Promise<Result<GitHubIssue, GitHubError>> {
  const path = repoPath(owner, repo)
  if (!path || draft.title.trim().length === 0) return err(failure('malformed'))
  const token = await storedToken()
  if (!token.ok) return token

  const response = await request('POST', `${path}/issues`, token.value, {
    title: draft.title,
    body: draft.body,
  })
  if (!response.ok) return response
  const body = response.value as { number?: unknown; html_url?: unknown } | null
  if (typeof body?.number !== 'number' || !isGitHubUrl(body.html_url)) {
    return err(failure('unexpected'))
  }
  return ok({ number: body.number, url: body.html_url })
}

/**
 * يرفع ملفًّا إلى الفرع الافتراضي للمستودع (`PUT /contents`) — صلاحية Contents على الرمز، لا Issues.
 * **لا يُستدعى إلا بعد تأكيد المستخدم.** `path` مسارٌ نسبيّ بلا `..` — كل مقطع منه يُرمَّز.
 */
export async function uploadAsset(
  owner: string,
  repo: string,
  path: string,
  bytes: Uint8Array,
  message: string,
): Promise<Result<GitHubAsset, GitHubError>> {
  const base = repoPath(owner, repo)
  const segments = path.split('/')
  if (!base || segments.some((s) => s === '' || s === '.' || s === '..')) {
    return err(failure('malformed'))
  }
  const token = await storedToken()
  if (!token.ok) return token

  const response = await request(
    'PUT',
    `${base}/contents/${segments.map(encodeURIComponent).join('/')}`,
    token.value,
    { message, content: toBase64(bytes) },
  )
  if (!response.ok) return response
  const body = response.value as {
    content?: { path?: unknown } | null
    commit?: { sha?: unknown } | null
  } | null
  const stored = body?.content?.path
  const sha = body?.commit?.sha
  if (typeof stored !== 'string' || typeof sha !== 'string' || !/^[0-9a-f]{7,64}$/u.test(sha)) {
    return err(failure('unexpected'))
  }
  return ok({ path: stored, commitSha: sha })
}

/** رابط الـIssue الراجع يُعرض زرًّا يُفتح — فلا يُقبَل إلا من `github.com` بـ`https`. */
function isGitHubUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.origin === 'https://github.com'
  } catch {
    return false
  }
}

/** بايتات إلى base64 — بدفعاتٍ كي لا يتجاوز `apply` سقف المكدّس. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * مستودعٌ كما يكتبه المستخدم: `owner/repo`، أو رابطه من المتصفّح (`https://github.com/owner/repo` — بـ`.git` أو
 * بمسارٍ بعده). **الشكل وحده** — وجوده وصلاحية الرمز عليه يقولهما GitHub عند الإرسال.
 */
export function parseRepoRef(input: string): { owner: string; repo: string } | null {
  const text = input.trim().replace(/^https:\/\/github\.com\//iu, '')
  const [owner, rawRepo] = text.split('/')
  const repo = rawRepo?.replace(/\.git$/iu, '')
  if (!owner || !repo) return null
  return repoPath(owner, repo) ? { owner, repo } : null
}

function repoPath(owner: string, repo: string): string | null {
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

async function storedToken(): Promise<Result<string, GitHubError>> {
  const secret = await readSecret('github')
  if (!secret.ok) return err(failure('vault'))
  if (secret.value === null) return err(failure('not-connected'))
  return ok(secret.value)
}

async function request(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  token: string,
  payload?: unknown,
): Promise<Result<unknown, GitHubError>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  }
  if (payload !== undefined) headers['Content-Type'] = 'application/json'

  const init: RequestInit = { method, headers }
  if (payload !== undefined) init.body = JSON.stringify(payload)
  const sent = await egressFetch(`${GITHUB_API}${path}`, init)
  if (!sent.ok) return err(failure(sent.error.refusal))

  const response = sent.value
  if (response.ok) {
    try {
      return ok(await response.json())
    } catch {
      return err(failure('unexpected', response.status))
    }
  }
  return err(classify(response))
}

/** رمز الحالة إلى سببٍ مسمًّى. 403 تحتمل أمرين، والترويسات تفصل بينهما. */
export function classify(response: Pick<Response, 'status' | 'headers'>): GitHubError {
  const { status, headers } = response
  const retryAfter = Number(headers.get('retry-after'))
  const retry = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
  if (status === 401) return failure('auth', status)
  if (status === 429) return failure('rate-limited', status, retry)
  if (status === 403) {
    const exhausted = headers.get('x-ratelimit-remaining') === '0'
    return exhausted || retry !== undefined
      ? failure('rate-limited', status, retry)
      : failure('missing-permission', status)
  }
  if (status === 404) return failure('not-found', status)
  if (status === 410) return failure('issues-disabled', status)
  if (status === 409) return failure('conflict', status)
  if (status === 422) return failure('invalid', status)
  if (status >= 500) return failure('server', status)
  return failure('unexpected', status)
}
