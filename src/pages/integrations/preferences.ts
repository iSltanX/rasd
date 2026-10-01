/**
 * تفضيلات GitHub — الحساب، والمستودع الافتراضي، وطريقة الصورة، وآخر حالةٍ عُرفت للاتّصال.
 *
 * **لا سرّ هنا:** الرمز في الخزنة المشفَّرة وحدها (`shared/storage/vault.ts`). وما يُحفظ هنا نصٌّ يقرؤه المستخدم
 * على الشاشة نفسها: اسم حسابه ومستودعه. مفتاحٌ واحد في `chrome.storage.local` بلا ترحيل — يُمحى مع «احذف كل
 * البيانات» كسائر المفاتيح، ويُقرأ بتحمّلٍ لشكلٍ لا يُفهم (يرجع الافتراضي لا خطأ).
 *
 * **و`status` آخر ما رآه رصد من GitHub لا ما يسأل عنه الآن:** لا استطلاع في الخلفية (لا شبكة بلا فعلِ المستخدم)،
 * فالحالة تتغيّر حين يفشل إرسالٌ بـ401 أو 403، وتعود سليمةً بإعادة الاتّصال أو بإرسالٍ ناجح.
 */

import { parseRepoRef } from '@/modules/export/integrations/github'
import { DEFAULT_ISSUE_OPTIONS, type ImageMode } from '@/modules/export/integrations/issue'

export const PREFS_KEY = 'rasd:integrations:github'

/** سليمة · الرمز مرفوض (401) · الرمز بلا صلاحية كافية (403). */
export type ConnectionStatus = 'ok' | 'auth-error' | 'missing-permission'

export interface GitHubPrefs {
  /** اسم الحساب الذي تحقّق منه GitHub عند الاتّصال. */
  readonly account: string | null
  /** `owner/repo` — بصيغته المُسوَّقة، أو `null`. */
  readonly repo: string | null
  readonly imageMode: ImageMode
  readonly status: ConnectionStatus
}

export const DEFAULT_PREFS: GitHubPrefs = {
  account: null,
  repo: null,
  imageMode: DEFAULT_ISSUE_OPTIONS.imageMode,
  status: 'ok',
}

const STATUSES: readonly string[] = ['ok', 'auth-error', 'missing-permission']

/** أيّ شكلٍ مخزَّن يُقرأ حقلًا حقلًا — حقلٌ فاسد يرجع افتراضيَّه ولا يُسقط الباقي. */
export function readPrefs(raw: unknown): GitHubPrefs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_PREFS
  const bag = raw as Record<string, unknown>
  const repo = typeof bag.repo === 'string' ? parseRepoRef(bag.repo) : null
  return {
    account: typeof bag.account === 'string' && bag.account !== '' ? bag.account : null,
    repo: repo ? `${repo.owner}/${repo.repo}` : null,
    imageMode: bag.imageMode === 'inline' ? 'inline' : DEFAULT_PREFS.imageMode,
    status:
      typeof bag.status === 'string' && STATUSES.includes(bag.status)
        ? (bag.status as ConnectionStatus)
        : 'ok',
  }
}

export async function loadPrefs(): Promise<GitHubPrefs> {
  try {
    return readPrefs((await chrome.storage.local.get(PREFS_KEY))[PREFS_KEY])
  } catch {
    return DEFAULT_PREFS
  }
}

/** يدمج تغييرًا في المخزَّن الحالي ويحفظه. `false` إن تعذّرت الكتابة. */
export async function savePrefs(patch: Partial<GitHubPrefs>): Promise<boolean> {
  try {
    const next = { ...(await loadPrefs()), ...patch }
    await chrome.storage.local.set({ [PREFS_KEY]: next })
    return true
  } catch {
    return false
  }
}

/** يمحو التفضيلات كلّها — عند قطع الاتّصال. */
export async function clearPrefs(): Promise<void> {
  try {
    await chrome.storage.local.remove(PREFS_KEY)
  } catch {
    // لا شيء يُحفظ هنا يضرّ بقاؤه: حسابٌ ومستودعٌ يقرؤهما صاحبهما.
  }
}
