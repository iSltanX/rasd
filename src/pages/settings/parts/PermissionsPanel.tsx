/**
 * جرد الصلاحيات — `§11.5`: كل صلاحية، وسببها، وما يتوقّف عند رفضها، ومنح/سحب.
 *
 * **بلا إطار في Figma كذلك.** الملفّ كلّه لا يحوي إطارًا باسم `permissions`؛
 * أقرب ما فيه صفٌّ واحد في `privacy / controls` برقاقة «نموذج الأذونات ·
 * أقلّ صلاحية». والجرد الكامل قرار خطة لا مطلب مواصفي — `Rasd_Ar.md §11.5`
 * سطرٌ واحد يطلب «توضيح سبب كل صلاحية» ولا يذكر «ما يتوقّف» ولا زرّ منح/سحب.
 * يُرسَم في Figma عند الوحدة 26.1 (‏`Docs/Engineering.md §6` صفّ 125).
 *
 * **والسبعُ الدائمة بلا زرّ سحب، لا اختصارًا بل لأن المنصّة لا تقبله:**
 * `chrome.permissions.remove` تعمل على `optional_permissions` وحدها، وتوقيع
 * `revokePermission` يمنع تمرير اسمٍ دائم أصلًا. فزرُّ سحبٍ هنا كان سيكون
 * وعدًا كاذبًا — وتُعرض بدله الحقيقة وطريقُ الإزالة الفعلي.
 *
 * **والحالة تُقرأ من المتصفّح لا من ذاكرةٍ محلّية**، ويُشترَك في تغيّرها:
 * مستخدمٌ يسحب إذنًا من `chrome://extensions` وهذه الشاشة مفتوحة كان سيرى
 * لوحةً تكذب — وهي شاشةٌ غرضها المعلن الصدق.
 */
import { useEffect, useState } from 'preact/hooks'

import { plural } from '@/shared/bidi'
import {
  grantedOrigins,
  hasPermission,
  HOST_PERMISSION_DENIAL,
  HOST_PERMISSION_RATIONALE,
  OPTIONAL_PERMISSION_DENIAL,
  OPTIONAL_PERMISSION_RATIONALE,
  OPTIONAL_PERMISSIONS,
  REQUIRED_PERMISSION_NOTE,
  REQUIRED_PERMISSION_RATIONALE,
  REQUIRED_PERMISSIONS,
  requestHostPermission,
  requestPermission,
  revokeHostPermission,
  revokePermission,
  watchPermissions,
  type OptionalPermission,
} from '@/shared/permissions'
import { Button } from '@/ui/components/Button/Button'
import { Chip } from '@/ui/components/Chip/Chip'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'

import { Group } from './Group'
import panelStyles from './PermissionsPanel.module.css'

import type { JSX } from 'preact'

/** الأصل الذي يُطلب — `<all_urls>` هو الوحيد في `OPTIONAL_HOST_PERMISSIONS`. */
const ALL_URLS = '<all_urls>'

type Granted = Record<string, boolean>

export function PermissionsPanel(): JSX.Element {
  const [granted, setGranted] = useState<Granted>({})
  const [origins, setOrigins] = useState<readonly string[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(
    () =>
      watchPermissions(() => {
        void Promise.all(
          OPTIONAL_PERMISSIONS.map(async (name) => [name, await hasPermission([name])] as const),
        ).then((pairs) => setGranted(Object.fromEntries(pairs)))
        void grantedOrigins().then(setOrigins)
      }),
    [],
  )

  /*
   * **الممنوح فعلًا لا «أمنوحٌ كلُّ شيء؟»** — رصدته مراجعة Gate B: الصفّ كان
   * يقيس `<all_urls>` وحدها، فمستخدمٌ منح `https://bank.com/*` من النافذة
   * (المسار الوحيد الذي يطلب صلاحية مضيف في المنتج) يُعرض له «غير ممنوحة»
   * وله إذنٌ قائم. والزرّ كان يمنح `<all_urls>` تحت نصٍّ يقول «لموقع واحد».
   */
  const hasAll = origins.includes(ALL_URLS)
  const named = origins.filter((origin) => origin !== ALL_URLS)

  const toggleOptional = async (name: OptionalPermission) => {
    setBusy(name)
    try {
      // النتيجة المُعادة لا تُقرأ حالةً: `watchPermissions` يعيد القراءة من
      // المتصفّح بعد `onAdded`/`onRemoved`، وهو المصدر الوحيد الذي لا ينحرف.
      if (granted[name]) await revokePermission([name])
      else await requestPermission([name])
    } finally {
      setBusy(null)
    }
  }

  /** يسحب كل ما مُنح، أو يمنح `<all_urls>` — والتسمية تقول أيّهما. */
  const toggleHost = async () => {
    setBusy(ALL_URLS)
    try {
      if (origins.length > 0) await revokeHostPermission(origins)
      else await requestHostPermission([ALL_URLS])
    } finally {
      // بلا `finally` يبقى الزرّ في «جارٍ» للأبد إن رمى النداء — وقد يرمي
      // `chrome.permissions.request` خارج إيماءة مستخدم. رصدته مراجعة Gate B.
      setBusy(null)
    }
  }

  return (
    <>
      <Group title="صلاحيات أساسية" id="permissions-required">
        {REQUIRED_PERMISSIONS.map((name, i) => (
          <SettingRow
            key={name}
            label={<bdi dir="ltr">{name}</bdi>}
            hint={REQUIRED_PERMISSION_RATIONALE[name]}
            divider={i < REQUIRED_PERMISSIONS.length - 1}
            control={<Chip tone="success">ممنوحة</Chip>}
          />
        ))}
      </Group>
      <p class={panelStyles.note}>{REQUIRED_PERMISSION_NOTE}</p>

      <Group title="صلاحيات اختيارية" id="permissions-optional">
        {OPTIONAL_PERMISSIONS.map((name) => (
          <SettingRow
            key={name}
            label={<bdi dir="ltr">{name}</bdi>}
            hint={
              <>
                {OPTIONAL_PERMISSION_RATIONALE[name]} {granted[name] ? 'ممنوحة.' : 'غير ممنوحة.'}{' '}
                عند الرفض: {OPTIONAL_PERMISSION_DENIAL[name]}
              </>
            }
            divider
            control={
              /*
               * التسمية تحمل اسم الصلاحية — أربعة أزرار نصُّها «امنح» حرفيًّا تُقرأ لقارئ
               * الشاشة أربع مرّات متطابقة، فلا يُعرف أيُّها لأي صلاحية.
               */
              <Button
                variant="secondary"
                size="s"
                state={busy === name ? 'loading' : 'default'}
                aria-label={`${granted[name] ? 'اسحب' : 'امنح'} صلاحية ${name}`}
                onClick={() => void toggleOptional(name)}
              >
                {granted[name] ? 'اسحب' : 'امنح'}
              </Button>
            }
          />
        ))}
        <SettingRow
          label="الوصول إلى المواقع"
          hint={
            <>
              {HOST_PERMISSION_RATIONALE}{' '}
              {hasAll
                ? 'ممنوحة لكل المواقع.'
                : named.length > 0
                  ? `ممنوحة ${plural(named.length, 'لموقع', 'لموقعين', 'لمواقع')}: `
                  : 'غير ممنوحة.'}
              {!hasAll
                ? named.map((origin, i) => (
                    <span key={origin}>
                      {i > 0 ? ' · ' : ''}
                      <bdi dir="ltr">{origin}</bdi>
                    </span>
                  ))
                : null}{' '}
              عند الرفض: {HOST_PERMISSION_DENIAL}
            </>
          }
          control={
            <Button
              variant="secondary"
              size="s"
              state={busy === ALL_URLS ? 'loading' : 'default'}
              aria-label={
                origins.length > 0
                  ? 'اسحب صلاحية الوصول من كل المواقع الممنوحة'
                  : 'امنح صلاحية الوصول إلى كل المواقع'
              }
              onClick={() => void toggleHost()}
            >
              {origins.length > 0 ? 'اسحب الكلّ' : 'امنح للكلّ'}
            </Button>
          }
        />
      </Group>
    </>
  )
}
