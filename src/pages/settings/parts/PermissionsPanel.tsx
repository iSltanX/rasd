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

import styles from './SettingsTab.module.css'

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
      <div class={styles.section}>
        <span class={styles.sectionTitle}>صلاحيات دائمة — سبع، وصفر تحذير عند التثبيت</span>
        <span class={styles.rowHint}>{REQUIRED_PERMISSION_NOTE}</span>
      </div>

      {REQUIRED_PERMISSIONS.map((name) => (
        <div key={name} class={styles.row}>
          <span class={styles.rowLabel}>
            <bdi dir="ltr">{name}</bdi>
            <span class={styles.rowHint}>{REQUIRED_PERMISSION_RATIONALE[name]}</span>
          </span>
          <div class={styles.rowControl}>
            <Chip tone="neutral">دائمة</Chip>
          </div>
        </div>
      ))}

      <div class={styles.section}>
        <span class={styles.sectionTitle}>صلاحيات اختيارية — تُطلب عند الحاجة، وتُسحب متى شئت</span>
      </div>

      {OPTIONAL_PERMISSIONS.map((name) => (
        <div key={name} class={styles.row}>
          <span class={styles.rowLabel}>
            <bdi dir="ltr">{name}</bdi>
            <span class={styles.rowHint}>{OPTIONAL_PERMISSION_RATIONALE[name]}</span>
            <span class={styles.rowHint}>عند الرفض: {OPTIONAL_PERMISSION_DENIAL[name]}</span>
          </span>
          <div class={styles.rowControl}>
            <Chip tone={granted[name] ? 'success' : 'neutral'}>
              {granted[name] ? 'ممنوحة' : 'غير ممنوحة'}
            </Chip>
            {/*
             * التسمية تحمل اسم الصلاحية — رصدته قراءة شجرة الإتاحة الحقيقية
             * في هذه الوحدة: أربعة أزرار نصُّها «امنح» حرفيًّا تُقرأ لقارئ
             * الشاشة أربع مرّات متطابقة، فلا يُعرف أيُّها لأي صلاحية. نفس
             * علّة `Chip.onRemove` التي تجنّبناها في قائمة المواقع، وكانت
             * ستتكرّر هنا لولا القياس.
             */}
            <Button
              variant="secondary"
              size="s"
              state={busy === name ? 'loading' : 'default'}
              aria-label={`${granted[name] ? 'اسحب' : 'امنح'} صلاحية ${name}`}
              onClick={() => void toggleOptional(name)}
            >
              {granted[name] ? 'اسحب' : 'امنح'}
            </Button>
          </div>
        </div>
      ))}

      <div class={styles.section}>
        <span class={styles.sectionTitle}>صلاحية المواقع</span>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>
          الوصول إلى المواقع
          <span class={styles.rowHint}>{HOST_PERMISSION_RATIONALE}</span>
          <span class={styles.rowHint}>عند الرفض: {HOST_PERMISSION_DENIAL}</span>
          {named.length > 0 ? (
            <span class={styles.rowHint}>
              ممنوحة لهذه المواقع:{' '}
              {named.map((origin, i) => (
                <span key={origin}>
                  {i > 0 ? ' · ' : ''}
                  <bdi dir="ltr">{origin}</bdi>
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <div class={styles.rowControl}>
          <Chip tone={origins.length > 0 ? 'success' : 'neutral'}>
            {hasAll
              ? 'كل المواقع'
              : named.length > 0
                ? plural(named.length, 'موقع', 'موقعان', 'مواقع')
                : 'لا موقع'}
          </Chip>
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
        </div>
      </div>
    </>
  )
}
