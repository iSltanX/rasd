/**
 * شاشة الاتّصالات — `integrations / connections` وأخواتها (`Docs/Design.md`): غير متّصل · متّصل · خطأ مصادقة ·
 * صلاحيات ناقصة، ومعها «الوضع المحلّي فقط» الذي يعطّل الاتّصال بسببه.
 *
 * **تُقرأ الحالة محلّيًّا ولا شبكة عند الفتح** (`connection.ts`): لا طلب إلى GitHub قبل أن يضغط المستخدم «اتّصل» أو
 * يؤكّد بلاغًا. وكل ضابطٍ هنا يعمل: «اتّصل» يفتح نافذة الرمز، والمستودع وطريقة الصورة يُحفظان ويقرؤهما المؤلِّف،
 * و«افصل» ينسى الرمز فورًا.
 *
 * **ما يختلف عن الإطار** (§11): المستودع الافتراضي حقل نصٍّ بصيغة «المالك/الاسم» لا قائمة، لأن سرد مستودعات
 * الحساب طلبٌ شبكيٌّ إضافيٌّ لا يفعله رصد قبل أن يطلب المستخدم بلاغًا.
 */

import { useEffect, useState } from 'preact/hooks'

import { disconnectGitHub, parseRepoRef } from '@/modules/export/integrations/github'
import { requestHostPermission } from '@/shared/permissions'
import { Banner, Button, Chip, Input, Select, SettingRow } from '@/ui/components'
import { cx } from '@/ui/cx'

import { Group } from '../settings/parts/Group'

import { ConnectDialog } from './ConnectDialog'
import { GITHUB_HOST_PATTERN, useConnection, type Connection } from './connection'
import styles from './integrations.module.css'
import { clearPrefs, savePrefs, type GitHubPrefs } from './preferences'

import type { ImageMode } from '@/modules/export/integrations/issue'
import type { JSX } from 'preact'

export interface ConnectionsPanelProps {
  /** ينقل الصفحة إلى قسم الخصوصية حيث يُوقَف «الوضع المحلّي فقط». */
  readonly onOpenPrivacy: () => void
}

const IMAGE_OPTIONS = [
  { value: 'asset', label: 'أصل في المستودع' },
  { value: 'inline', label: 'مضمَّنة في النصّ' },
] as const

export const REPO_FORMAT_HINT = 'اكتب المستودع بصيغة «المالك/الاسم»، مثل northwind/web.'

/** ما يظهر بعد اسم الحساب لكل حالة — يقول الحالة بكلمات لا بلونٍ وحده. */
const STATUS_CHIP: Partial<
  Record<Connection['kind'], { tone: 'success' | 'danger' | 'warning'; label: string }>
> = {
  connected: { tone: 'success', label: 'متّصل' },
  'auth-error': { tone: 'danger', label: 'خطأ مصادقة' },
  'missing-permission': { tone: 'warning', label: 'صلاحيات ناقصة' },
  'host-revoked': { tone: 'warning', label: 'صلاحية مسحوبة' },
  'vault-error': { tone: 'danger', label: 'الرمز غير مقروء' },
}

function banner(
  connection: Connection,
): { tone: 'info' | 'warning' | 'danger'; text: string } | null {
  switch (connection.kind) {
    case 'disconnected':
      return {
        tone: 'info',
        text: 'التكاملات اختيارية. رصد لا يتّصل بـGitHub قبل أن تربطه، ولا يرسل بلاغًا قبل أن تراجعه وتؤكّده.',
      }
    case 'local-only':
      return {
        tone: 'info',
        text: 'الوضع المحلّي فقط مفعَّل، فلا يتّصل رصد بأي خدمة. أوقفه من الخصوصية لربط GitHub.',
      }
    case 'auth-error':
      return {
        tone: 'danger',
        text: 'رفض GitHub رمز الوصول: انتهت صلاحيته أو سُحب. أعد الاتّصال لتكمل.',
      }
    case 'missing-permission':
      return {
        tone: 'warning',
        text: 'رمز الوصول لا يسمح بفتح Issue في هذا المستودع. امنحه صلاحية Issues ثمّ أعد المحاولة.',
      }
    case 'host-revoked':
      return {
        tone: 'warning',
        text: 'سحبتَ صلاحية الوصول إلى api.github.com، فلا يستطيع رصد التواصل مع GitHub. امنحها لتكمل.',
      }
    case 'vault-error':
      return {
        tone: 'danger',
        text: 'تعذّرت قراءة رمز الوصول المحفوظ على هذا الجهاز. أعد الاتّصال برمزٍ جديد.',
      }
    default:
      return null
  }
}

export function ConnectionsPanel({ onOpenPrivacy }: ConnectionsPanelProps): JSX.Element | null {
  const { connection, refresh } = useConnection()
  const [connecting, setConnecting] = useState(false)
  const [busy, setBusy] = useState<'disconnect' | 'host' | null>(null)
  const [disconnectFailed, setDisconnectFailed] = useState(false)

  if (connection.kind === 'loading') return null

  const { prefs } = connection
  const lit = banner(connection)
  const hasToken =
    connection.kind !== 'disconnected' && (connection.kind !== 'local-only' || connection.connected)
  const chip = STATUS_CHIP[connection.kind]

  const disconnect = async (): Promise<void> => {
    setBusy('disconnect')
    setDisconnectFailed(false)
    try {
      // فشل النسيان يُقال: محو الحساب والمستودع والرمز باقٍ كان سيعرض «متّصل» بلا حساب، وزرّ «افصل» صامتًا.
      const forgotten = await disconnectGitHub()
      if (forgotten.ok) await clearPrefs()
      else setDisconnectFailed(true)
    } finally {
      setBusy(null)
      refresh()
    }
  }

  /** **من النقرة مباشرةً** — الصلاحية تشترط إيماءة. */
  const grantHost = (): void => {
    setBusy('host')
    void requestHostPermission([GITHUB_HOST_PATTERN]).finally(() => {
      setBusy(null)
      refresh()
    })
  }

  const reconnect = (label: string): JSX.Element => (
    <Button
      variant="primary"
      size="s"
      icon="plug"
      onClick={() => setConnecting(true)}
      data-connect-open=""
    >
      {label}
    </Button>
  )

  return (
    <div class={styles.panel} data-integrations={connection.kind}>
      {lit ? <Banner tone={lit.tone}>{lit.text}</Banner> : null}
      {disconnectFailed ? (
        <Banner tone="danger">
          <span data-disconnect-failed="">
            تعذّر حذف رمز الوصول من هذا الجهاز، فما زال محفوظًا. أعد المحاولة، أو احذف كل البيانات
            من إعدادات البيانات.
          </span>
        </Banner>
      ) : null}

      {hasToken ? (
        <Group title="GitHub" id="integrations-github">
          <SettingRow
            id="github-account"
            label="الحساب"
            hint={
              prefs.account
                ? `الحساب ${prefs.account}${connection.kind === 'auth-error' ? '، وتعثّرت المصادقة' : connection.kind === 'missing-permission' ? '، والصلاحية ناقصة' : ''}`
                : undefined
            }
            divider
            control={
              chip ? (
                <Chip tone={chip.tone} dot>
                  {chip.label}
                </Chip>
              ) : (
                <Chip tone="neutral">{connection.kind === 'local-only' ? 'محفوظ' : '—'}</Chip>
              )
            }
          />
          {connection.kind === 'connected' || connection.kind === 'missing-permission' ? (
            <RepoRow prefs={prefs} onSaved={refresh} />
          ) : null}
          {connection.kind === 'connected' ? (
            <SettingRow
              id="github-image"
              label="صورة البلاغ"
              hint="ترفع أصلًا في المستودع، أو تُضمِّن في نصّ البلاغ"
              divider
              control={
                <Select
                  value={prefs.imageMode}
                  options={IMAGE_OPTIONS}
                  aria-label="صورة البلاغ"
                  aria-describedby="github-image-hint"
                  onChange={(v) => {
                    void savePrefs({ imageMode: v as ImageMode }).then(refresh)
                  }}
                />
              }
            />
          ) : null}
          {connection.kind === 'auth-error' || connection.kind === 'vault-error' ? (
            <SettingRow
              label="أعد الاتّصال"
              hint="يُطلب منك رمز وصول جديد"
              divider
              control={reconnect('أعد الاتّصال')}
            />
          ) : null}
          {connection.kind === 'missing-permission' ? (
            <SettingRow
              label="حدّث رمز الوصول"
              hint="يلزم رمز بصلاحية Issues على المستودع المختار"
              divider
              control={reconnect('حدّث الرمز')}
            />
          ) : null}
          {connection.kind === 'host-revoked' ? (
            <SettingRow
              label="امنح صلاحية الوصول"
              hint="يطلبها المتصفّح منك لـapi.github.com وحده"
              divider
              control={
                <Button
                  variant="primary"
                  size="s"
                  state={busy === 'host' ? 'loading' : 'default'}
                  onClick={grantHost}
                  data-host-grant=""
                >
                  امنح الصلاحية
                </Button>
              }
            />
          ) : null}
          <SettingRow
            label="افصل الحساب"
            hint="يُحذف رمز الوصول من هذا الجهاز فورًا، وتبقى صلاحية المتصفّح حتى تسحبها من الصلاحيات"
            control={
              <Button
                variant={connection.kind === 'connected' ? 'danger' : 'secondary'}
                size="s"
                state={busy === 'disconnect' ? 'loading' : 'default'}
                onClick={() => void disconnect()}
                data-github-disconnect=""
              >
                افصل
              </Button>
            }
          />
        </Group>
      ) : (
        <Group title="المتاحة" id="integrations-available">
          <SettingRow
            label="GitHub"
            hint={
              connection.kind === 'local-only'
                ? 'معطَّل ما دام الوضع المحلّي فقط مفعَّلًا'
                : 'حوّل لقطة مشروحة إلى Issue في مستودعك'
            }
            divider={connection.kind === 'local-only'}
            control={
              <Button
                variant="primary"
                size="s"
                icon="plug"
                {...(connection.kind === 'local-only' ? { state: 'disabled' as const } : {})}
                onClick={() => setConnecting(true)}
                data-connect-open=""
              >
                اتّصل
              </Button>
            }
          />
          {connection.kind === 'local-only' ? (
            <SettingRow
              label="الوضع المحلّي فقط"
              hint="يُدار من إعدادات الخصوصية"
              control={
                <Button variant="secondary" size="s" onClick={onOpenPrivacy} data-open-privacy="">
                  افتح الخصوصية
                </Button>
              }
            />
          ) : null}
        </Group>
      )}

      {connection.kind === 'disconnected' ? (
        <Group title="قريبًا" id="integrations-soon">
          <SettingRow
            label="رابط مشاركة سحابي"
            hint="يحتاج خادمًا، وليس في هذا الإصدار"
            control={
              <Chip tone="neutral" dot>
                قريبًا
              </Chip>
            }
          />
        </Group>
      ) : null}

      {connecting ? (
        <ConnectDialog onClose={() => setConnecting(false)} onConnected={refresh} />
      ) : null}
    </div>
  )
}

/** المستودع الافتراضي: يُحفظ عند مغادرة الحقل أو Enter، وصيغةٌ خاطئة تُقال ولا تُحفظ. */
function RepoRow({ prefs, onSaved }: { prefs: GitHubPrefs; onSaved: () => void }): JSX.Element {
  const [draft, setDraft] = useState(prefs.repo ?? '')
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setDraft(prefs.repo ?? ''), [prefs.repo])

  /** القيمة من الحقل نفسه لا من الحالة: النقر على حقلٍ آخر قد يسبق إعادة الرسم بآخر حرفٍ كُتب. */
  const commit = (e: Event): void => {
    const field = e.target instanceof HTMLInputElement ? e.target : null
    const text = (field?.value ?? draft).trim()
    if (text === '') {
      setInvalid(false)
      void savePrefs({ repo: null }).then(onSaved)
      return
    }
    const parsed = parseRepoRef(text)
    setInvalid(parsed === null)
    if (parsed) void savePrefs({ repo: `${parsed.owner}/${parsed.repo}` }).then(onSaved)
  }

  return (
    <SettingRow
      id="github-repo"
      label="المستودع الافتراضي"
      hint={invalid ? REPO_FORMAT_HINT : 'تُفتح فيه البلاغات الجديدة ما لم تختر غيره'}
      divider
      control={
        <span
          class={cx(styles.repo)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') commit(e)
          }}
          // `blur` لا يصعد، فيُلتقط في طور الالتقاط على الغلاف.
          onBlurCapture={commit}
        >
          <Input
            id="github-repo-input"
            value={draft}
            placeholder="owner/repo"
            class={styles.ltr}
            state={invalid ? 'error' : 'default'}
            aria-label="المستودع الافتراضي"
            onInput={(v) => {
              setDraft(v)
              setInvalid(false)
            }}
          />
        </span>
      }
    />
  )
}
