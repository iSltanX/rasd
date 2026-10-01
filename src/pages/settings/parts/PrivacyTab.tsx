/**
 * قسم الخصوصية (`privacy / controls`، `68:416`) وصفحتاه الفرعيتان: المواقع المستثناة
 * (`285:444`) وصلاحيات المتصفّح (`285:1073`).
 *
 * **النصوص تقول ما يصدق اليوم، ولو خالفت الإطار في حرف:**
 * - «الوضع المحلّي فقط» — لا يرسل رصد شيئًا خارج هذا الجهاز (`Docs/Design.md` §7 القرار 8).
 *   وجملة الإطار عن التكاملات تُحذف: لا تكامل مبنيّ بعد (`STAGES/11`)، ولا مسار رفع
 *   قائم أصلًا (`Docs/Engineering.md §6` الصفّ 126).
 * - «احذف البيانات الوصفية» يزيل ملفّ الألوان المضمَّن من WebP (`webp-strip.ts`)؛ وPNG
 *   تخرج بلا مقطع وصفي أصلًا. نصّ الإطار («رابط الصفحة وعنوانها ووقت الالتقاط») يصف
 *   بيانات لا يكتبها التصدير في الملفّ.
 * - «قفل المكتبة» حارس وصول لا تشفير (`STAGES/08`، ADR 0043) — صفّه ونوافذه في `lock/LockRow.tsx`. و«احذف كل
 *   البيانات» انتقل إلى قسم البيانات.
 *
 * والتصفّح الخاص قائمة منسدلة كما في الإطار، وتلميحها يصف الخيار المحدَّد بنصوص صفحة
 * `privacy / incognito` نفسها — فالصفحة الفرعية لا تلزم.
 */
import { formatHuman, plural } from '@/shared/bidi'
import { Button } from '@/ui/components/Button/Button'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { Toggle } from '@/ui/components/Toggle/Toggle'

import { ExcludedSites } from './ExcludedSites'
import { Group } from './Group'
import { LockRow } from './lock/LockRow'
import { PermissionsPanel } from './PermissionsPanel'

import type { Persist } from '../persist'
import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

export type PrivacyView = 'controls' | 'excluded-sites' | 'permissions'

const INCOGNITO_OPTIONS = [
  { value: 'off', label: 'معطَّل' },
  { value: 'no-save', label: 'يعمل بلا حفظ' },
  { value: 'allow', label: 'يعمل ويحفظ' },
] as const

const INCOGNITO_HINT: Record<Settings['privacy']['incognito'], string> = {
  off: 'رصد لا يُحقَن في النوافذ الخاصّة إطلاقًا.',
  'no-save': 'رصد يعمل في النوافذ الخاصّة ولا يكتب شيئًا على القرص: لا لقطة ولا سجلّ.',
  allow: 'رصد يعمل ويحفظ في النوافذ الخاصّة كما في العادية.',
}

/**
 * المدد الأربع. **و`plural` لا تصلح لـ30 و90**: قاعدتها تُرجع صيغة المفرد المرفوع لما
 * فوق العشرة، فتُنتج «٣٠ يوم» والصواب التمييز المنصوب «٣٠ يومًا».
 */
const RETENTION_OPTIONS = [
  { value: '0', label: 'بلا حذف' },
  { value: '7', label: plural(7, 'يوم', 'يومان', 'أيام') },
  { value: '30', label: `${formatHuman(30)} يومًا` },
  { value: '90', label: `${formatHuman(90)} يومًا` },
]

export interface PrivacyTabProps {
  settings: Settings
  view: PrivacyView
  onView: (view: PrivacyView) => void
  onSave: (patch: Partial<Settings['privacy']>) => Promise<Result<Settings>>
  onAddSite: (raw: string) => Promise<Result<Settings> | 'invalid'>
  onRemoveSite: (value: string) => Promise<Result<Settings>>
  onImportSites: (
    entries: readonly unknown[],
  ) => Promise<{ result: Result<Settings>; added: number; rejected: number }>
  persist: Persist
  /**
   * إشعار نجاح بنصّه — `privacy / excluded-sites · saved` (`319:52144`): «أُضيف الموقع». كانت
   * الإضافة والحذف صامتين وكل إعداد غيرهما يُعلَن حفظه.
   */
  onAnnounce?: (title: string, detail: string) => void
}

export function PrivacyTab({
  settings,
  view,
  onView,
  onSave,
  onAddSite,
  onRemoveSite,
  onImportSites,
  persist,
  onAnnounce,
}: PrivacyTabProps) {
  const { privacy } = settings
  const save = (patch: Partial<Settings['privacy']>) => persist(() => onSave(patch))

  if (view === 'excluded-sites') {
    return (
      <ExcludedSites
        sites={privacy.excludedSites}
        onAdd={async (raw) => {
          const outcome = await onAddSite(raw)
          if (outcome === 'invalid') return 'invalid'
          if (outcome.ok) onAnnounce?.('أُضيف الموقع', 'رصد لا يعمل فيه بعد الآن.')
          return outcome.ok ? 'ok' : 'failed'
        }}
        onRemove={async (value) => {
          const removed = (await onRemoveSite(value)).ok
          if (removed) onAnnounce?.('حُذف الموقع', 'رصد يعمل فيه من جديد حين تطلبه.')
          return removed
        }}
        onImport={async (entries) => {
          const { result, added, rejected } = await onImportSites(entries)
          return result.ok ? { added, rejected } : 'failed'
        }}
      />
    )
  }

  if (view === 'permissions') return <PermissionsPanel />

  const sites = privacy.excludedSites.length

  return (
    <>
      <Group title="البيانات" id="privacy-data">
        <SettingRow
          id="privacy-local"
          label="الوضع المحلّي فقط"
          hint="لا يرسل رصد شيئًا خارج هذا الجهاز."
          divider
          control={
            <Toggle
              on={privacy.localOnly}
              onChange={(on) => save({ localOnly: on })}
              aria-label="الوضع المحلّي فقط"
            />
          }
        />
        <SettingRow
          id="privacy-retention"
          label="مدّة الاحتفاظ باللقطات"
          hint="تُحذف اللقطات الأقدم تلقائيًّا حذفًا نهائيًّا. المميّزة لا تُحذف"
          divider
          control={
            <Select
              value={String(privacy.autoDeleteAfterDays)}
              options={RETENTION_OPTIONS}
              aria-label="مدّة الاحتفاظ باللقطات"
              aria-describedby="privacy-retention-hint"
              onChange={(v) =>
                save({
                  autoDeleteAfterDays: Number(v) as Settings['privacy']['autoDeleteAfterDays'],
                })
              }
            />
          }
        />
        <SettingRow
          id="privacy-metadata"
          label="احذف البيانات الوصفية عند التصدير"
          hint="يُزال ملفّ الألوان المضمَّن من صور WebP. صور PNG تخرج بلا بيانات وصفية أصلًا"
          control={
            <Toggle
              on={privacy.stripMetadataOnExport}
              onChange={(on) => save({ stripMetadataOnExport: on })}
              aria-label="احذف البيانات الوصفية عند التصدير"
            />
          }
        />
      </Group>

      <Group title="المواقع" id="privacy-sites">
        <SettingRow
          id="privacy-excluded"
          label="المواقع المستثناة"
          hint={
            sites === 0
              ? 'لا مواقع مستثناة. رصد يعمل حيث تفتح أداته بنفسك'
              : `${plural(sites, 'موقع مستثنى', 'موقعان مستثنيان', 'مواقع مستثناة')}. رصد لا يعمل فيها إطلاقًا`
          }
          divider
          control={
            <Button variant="secondary" size="s" onClick={() => onView('excluded-sites')}>
              أدِر القائمة
            </Button>
          }
        />
        <SettingRow
          id="privacy-incognito"
          label="سلوك رصد في التصفّح الخاص"
          hint={INCOGNITO_HINT[privacy.incognito]}
          control={
            <Select
              value={privacy.incognito}
              options={INCOGNITO_OPTIONS}
              aria-label="سلوك رصد في التصفّح الخاص"
              aria-describedby="privacy-incognito-hint"
              onChange={(v) => save({ incognito: v as Settings['privacy']['incognito'] })}
            />
          }
        />
      </Group>

      <Group title="الصلاحيات" id="privacy-permissions">
        <SettingRow
          id="privacy-browser-permissions"
          label="صلاحيات المتصفّح"
          hint="ما مُنح لرصد، ولماذا، وكيف تسحبه"
          control={
            <Button variant="secondary" size="s" onClick={() => onView('permissions')}>
              اعرض الصلاحيات
            </Button>
          }
        />
      </Group>

      <Group title="الحماية" id="privacy-protection">
        <LockRow onAnnounce={onAnnounce} />
      </Group>
    </>
  )
}
