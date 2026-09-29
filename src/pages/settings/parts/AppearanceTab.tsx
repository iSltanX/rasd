/**
 * قسم المظهر (`settings / appearance`، `129:579`): «السمة» و«اللغة والاتجاه».
 *
 * الكثافة تسري على كل صفحات رصد: `applyTheme` يكتب `data-density` على الجذر، وقاعدة
 * `[data-density='compact']` في `base.css` تشدّ فجوات صفحات الإضافة كلّها (الصفّ 110).
 * واللغة سطر معلومة لا ضابط: رصد عربي فقط (ADR 0022).
 */
import { Chip } from '@/ui/components/Chip/Chip'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'

import { Group } from './Group'

import type { Persist } from '../persist'
import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const THEME_OPTIONS = [
  { value: 'system', label: 'النظام' },
  { value: 'dark', label: 'داكن' },
  { value: 'light', label: 'فاتح' },
] as const

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'مريحة' },
  { value: 'compact', label: 'مضغوطة' },
] as const

export interface AppearanceTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['appearance']>) => Promise<Result<Settings>>
  persist: Persist
}

export function AppearanceTab({ settings, onSave, persist }: AppearanceTabProps) {
  const save = (patch: Partial<Settings['appearance']>) => persist(() => onSave(patch))

  return (
    <>
      <Group title="السمة" id="settings-theme">
        <SettingRow
          id="appearance-theme"
          label="وضع السمة"
          hint="«النظام» يتبع إعداد جهازك"
          divider
          control={
            <Select
              value={settings.appearance.theme}
              options={THEME_OPTIONS}
              aria-label="وضع السمة"
              aria-describedby="appearance-theme-hint"
              onChange={(v) => save({ theme: v as Settings['appearance']['theme'] })}
            />
          }
        />
        <SettingRow
          id="appearance-density"
          label="كثافة العرض"
          hint="تسري على كل صفحات رصد"
          control={
            <Select
              value={settings.appearance.density}
              options={DENSITY_OPTIONS}
              aria-label="كثافة العرض"
              aria-describedby="appearance-density-hint"
              onChange={(v) => save({ density: v as Settings['appearance']['density'] })}
            />
          }
        />
      </Group>

      <Group title="اللغة والاتجاه" id="settings-language">
        <SettingRow
          id="appearance-language"
          label="لغة الواجهة"
          hint="رصد عربي، واتجاهه من اليمين إلى اليسار"
          control={<Chip tone="neutral">العربية</Chip>}
        />
      </Group>
    </>
  )
}
