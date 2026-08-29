/**
 * حالة الجلسة — `chrome.storage.session`.
 *
 * لا تُكتب على القرص وتُمحى بإغلاق المتصفح. هنا تعيش الحالة التي لا يجوز أن
 * تنجو من الجلسة: الوضع النشط، ومهمة الالتقاط الجارية. حفظها في `local`
 * يعني أن انهيارًا يترك رصد في وضع فحص عالق بعد إعادة التشغيل.
 */

import { attempt, ok, type Result } from '../result'

const KEY = 'rasd:session'

export type ActiveMode = 'idle' | 'area' | 'element' | 'inspect' | 'measure' | 'colour' | 'compare'

export interface SessionState {
  /** الوضع النشط في كل تبويب على حدة. */
  modes: Record<number, ActiveMode>
  /** مهمة طويلة جارية، إن وُجدت. */
  job: {
    id: string
    kind: string
    tabId: number
    startedAt: number
    done: number
    total: number
  } | null
}

export function defaultSession(): SessionState {
  return { modes: {}, job: null }
}

export async function getSession(): Promise<SessionState> {
  const stored = await attempt(async () => (await chrome.storage.session.get(KEY))[KEY])
  if (!stored.ok || !stored.value || typeof stored.value !== 'object') return defaultSession()
  const value = stored.value as Partial<SessionState>
  return {
    modes: value.modes ?? {},
    job: value.job ?? null,
  }
}

export async function patchSession(patch: Partial<SessionState>): Promise<Result<SessionState>> {
  const current = await getSession()
  const next: SessionState = { ...current, ...patch }
  const written = await attempt(() => chrome.storage.session.set({ [KEY]: next }))
  if (!written.ok) return written
  return ok(next)
}

export async function setTabMode(tabId: number, mode: ActiveMode): Promise<Result<SessionState>> {
  const current = await getSession()
  const modes = { ...current.modes }
  if (mode === 'idle') delete modes[tabId]
  else modes[tabId] = mode
  return patchSession({ modes })
}

export async function clearSession(): Promise<Result<null>> {
  const removed = await attempt(() => chrome.storage.session.remove(KEY))
  return removed.ok ? ok(null) : removed
}
