/**
 * قسم الألوان (`settings / colors`، `129:313`): «استخراج اللوحة» و«الدرجات».
 *
 * **ومجموعة «النسخ» ليست في الإطار:** صيغة النسخ الافتراضية إعداد قائم في المنتج تقرؤه
 * أداة الألوان، وحذفها من الواجهة يُسقط ميزة تعمل. الاختلاف مكتوب في `Docs/Design.md`.
 */
import { formatHuman, plural } from '@/shared/bidi'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { Toggle } from '@/ui/components/Toggle/Toggle'

import { Group } from './Group'

import type { Persist } from '../persist'
import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const FORMAT_OPTIONS = [
  { value: 'hex', label: 'HEX' },
  { value: 'rgb', label: 'RGB' },
  { value: 'hsl', label: 'HSL' },
  { value: 'oklch', label: 'OKLCH' },
  { value: 'css', label: 'CSS' },
] as const

const SCALE_OPTIONS = [
  { value: '50-950', label: 'سلّم 50–950' },
  { value: 'tints-shades', label: 'تفتيح وتغميق' },
] as const

const PALETTE_SIZES = [4, 6, 8, 10, 12, 16, 20, 24]

const colourCount = (n: number) => plural(n, 'لون', 'لونان', 'ألوان')

export interface ColorsTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['colors']>) => Promise<Result<Settings>>
  persist: Persist
}

export function ColorsTab({ settings, onSave, persist }: ColorsTabProps) {
  const { colors } = settings
  const save = (patch: Partial<Settings['colors']>) => persist(() => onSave(patch))
  const sizes = PALETTE_SIZES.includes(colors.paletteSize)
    ? PALETTE_SIZES
    : [...PALETTE_SIZES, colors.paletteSize].sort((a, b) => a - b)

  return (
    <>
      <Group title="استخراج اللوحة" id="settings-palette">
        <SettingRow
          id="colors-size"
          label="عدد ألوان اللوحة"
          hint="أكثر ما يُستخرج من صفحة واحدة"
          divider
          control={
            <Select
              value={String(colors.paletteSize)}
              options={sizes.map((n) => ({ value: String(n), label: colourCount(n) }))}
              aria-label="عدد ألوان اللوحة"
              aria-describedby="colors-size-hint"
              onChange={(v) => save({ paletteSize: Number(v) })}
            />
          }
        />
        <SettingRow
          id="colors-neutrals"
          label="أخفِ الألوان الحيادية"
          hint="يستبعد الرماديات والأبيض والأسود من اللوحة"
          control={
            <Toggle
              on={colors.hideNeutrals}
              onChange={(on) => save({ hideNeutrals: on })}
              aria-label="أخفِ الألوان الحيادية"
            />
          }
        />
      </Group>

      <Group title="الدرجات" id="settings-scale">
        <SettingRow
          id="colors-scale"
          label="نظام درجات اللون"
          hint="طريقة توليد السلّم من لون واحد"
          control={
            <Select
              value={colors.scaleSystem}
              options={SCALE_OPTIONS}
              aria-label="نظام درجات اللون"
              aria-describedby="colors-scale-hint"
              onChange={(v) => save({ scaleSystem: v as Settings['colors']['scaleSystem'] })}
            />
          }
        />
      </Group>

      <Group title="النسخ" id="settings-copy-format">
        <SettingRow
          id="colors-format"
          label="صيغة النسخ الافتراضية"
          hint={`تُنسخ بها القيمة بنقرة واحدة من أداة الألوان — ${formatHuman(5)} صيغ`}
          control={
            <Select
              value={colors.defaultFormat}
              options={FORMAT_OPTIONS}
              aria-label="صيغة النسخ الافتراضية"
              aria-describedby="colors-format-hint"
              onChange={(v) => save({ defaultFormat: v as Settings['colors']['defaultFormat'] })}
            />
          }
        />
      </Group>
    </>
  )
}
