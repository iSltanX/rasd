/**
 * حالة الاتّصال بـGitHub كما تُرى من الواجهة — تُقرأ كلّها محلّيًّا، **بلا طلب شبكة**: فتح شاشةٍ لا يتّصل بشيء.
 *
 * الحالات الأربع التي يعرضها المنتج (`Docs/Design.md`): غير متّصل · متّصل · خطأ مصادقة · صلاحيات ناقصة؛ ومعها
 * ثلاثة أسبابٍ تمنع الاستعمال قبل أن تبدأ: «الوضع المحلّي فقط»، وصلاحية المضيف المسحوبة، ورمزٌ لا يُقرأ من الخزنة.
 *
 * **«متّصل» تعني أن رمزًا محفوظًا قابلًا للقراءة موجود**، لا أن GitHub قبله الآن: ذلك لا يُعرف إلا بسؤاله، ولا
 * سؤال بلا فعلِ المستخدم. فآخر ما رآه رصد من GitHub محفوظٌ في `status` (`preferences.ts`).
 */

import { useCallback, useEffect, useState } from 'preact/hooks'

import { NETWORK_SERVICES } from '@/shared/permission-policy'
import { hasHostPermission, watchPermissions } from '@/shared/permissions'
import { getSettingsResult, watchSettings } from '@/shared/settings'
import { hasSecret, readSecret } from '@/shared/storage/vault'

import { DEFAULT_PREFS, loadPrefs, type GitHubPrefs } from './preferences'

export type Connection =
  | { readonly kind: 'loading' }
  /** «الوضع المحلّي فقط» مفعَّل — لا اتّصال بأي خدمة. */
  | { readonly kind: 'local-only'; readonly connected: boolean; readonly prefs: GitHubPrefs }
  /** لا رمز محفوظ. */
  | { readonly kind: 'disconnected'; readonly prefs: GitHubPrefs }
  /** رمزٌ محفوظ لا يُقرأ (مفتاحه ضاع أو عُبث بسجلّه). */
  | { readonly kind: 'vault-error'; readonly prefs: GitHubPrefs }
  /** رمزٌ محفوظ وصلاحية المضيف مسحوبة. */
  | { readonly kind: 'host-revoked'; readonly prefs: GitHubPrefs }
  | { readonly kind: 'auth-error'; readonly prefs: GitHubPrefs }
  | { readonly kind: 'missing-permission'; readonly prefs: GitHubPrefs }
  | { readonly kind: 'connected'; readonly prefs: GitHubPrefs }

const GITHUB = NETWORK_SERVICES.find((service) => service.id === 'github')

/** نمط صلاحية المضيف الذي يُطلب من «اتّصل». */
export const GITHUB_HOST_PATTERN: string = GITHUB?.hostPattern ?? ''

export async function readConnection(): Promise<Connection> {
  const [settings, prefs, stored] = await Promise.all([
    getSettingsResult(),
    loadPrefs(),
    hasSecret('github'),
  ])
  // قراءةٌ فاشلة للإعدادات جهلٌ لا سماح: يُعامَل كأن «الوضع المحلّي» مفعَّل (كمخرج الشبكة).
  const localOnly = settings.ok ? settings.value.privacy.localOnly : true
  const connected = stored.ok && stored.value
  if (localOnly) return { kind: 'local-only', connected, prefs: connected ? prefs : DEFAULT_PREFS }
  if (!stored.ok) return { kind: 'vault-error', prefs }
  if (!stored.value) return { kind: 'disconnected', prefs: DEFAULT_PREFS }

  // وجود السجلّ لا يعني قابليته للقراءة — «متّصل» لا تُعرض إلا بعد قراءةٍ ناجحة.
  const secret = await readSecret('github')
  if (!secret.ok || secret.value === null) return { kind: 'vault-error', prefs }
  if (!(await hasHostPermission(GITHUB_HOST_PATTERN))) return { kind: 'host-revoked', prefs }
  if (prefs.status === 'auth-error') return { kind: 'auth-error', prefs }
  if (prefs.status === 'missing-permission') return { kind: 'missing-permission', prefs }
  return { kind: 'connected', prefs }
}

/** الحالة الحيّة: تُقرأ عند الفتح، وتُعاد بعد كل تغيّرٍ في الإعدادات أو الصلاحيات، أو بطلب `refresh`. */
export function useConnection(): { connection: Connection; refresh: () => void } {
  const [connection, setConnection] = useState<Connection>({ kind: 'loading' })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let live = true
    void readConnection().then((next) => {
      if (live) setConnection(next)
    })
    return () => {
      live = false
    }
  }, [tick])

  // كلاهما يستدعي مشتركه فورًا بالقيمة الحالية — والقراءة الأولى فوق؛ فيُتجاوَز النداء الأوّل.
  useEffect(() => skipFirst(watchSettings, refresh), [refresh])
  useEffect(() => skipFirst(watchPermissions, refresh), [refresh])

  return { connection, refresh }
}

function skipFirst(watch: (listener: () => void) => () => void, onChange: () => void): () => void {
  let first = true
  return watch(() => {
    if (first) {
      first = false
      return
    }
    onChange()
  })
}
