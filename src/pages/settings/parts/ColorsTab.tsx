/**
 * تبويب الألوان — `§12.3`: صيغة النسخ الافتراضية، عدد ألوان اللوحة، إخفاء
 * الحياديات، نظام الدرجات.
 *
 * `defaultFormat` مجموعة أزرار مستقلّة (`Radio`) لا `SegmentedControl`: خمس
 * صيغ تتجاوز حدّ Figma الموثَّق للأخير («3 variant» — `SegmentedControl.tsx`)،
 * وحدّ `Tabs` المماثل حُسم بتسجيل الانحراف لا بتجاوزه (`Rasd_Plan.md §6`
 * صفّ 111)؛ هنا يُتفادى الحدّ أصلًا باختيار مكوّن بلا محور تبايُن واحد.
 */
import { useState } from 'preact/hooks'

import { plural } from '@/shared/bidi'
import { Banner } from '@/ui/components/Banner/Banner'
import { Radio } from '@/ui/components/Radio/Radio'
import {
  SegmentedControl,
  type SegmentedOption,
} from '@/ui/components/SegmentedControl/SegmentedControl'
import { Toggle } from '@/ui/components/Toggle/Toggle'

import styles from './SettingsTab.module.css'

import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const FORMAT_OPTIONS: readonly { value: Settings['colors']['defaultFormat']; label: string }[] = [
  { value: 'hex', label: 'HEX' },
  { value: 'rgb', label: 'RGB' },
  { value: 'hsl', label: 'HSL' },
  { value: 'oklch', label: 'OKLCH' },
  { value: 'css', label: 'CSS' },
]

const SCALE_OPTIONS: readonly SegmentedOption[] = [
  { value: '50-950', label: 'سلّم 50–950' },
  { value: 'tints-shades', label: 'تفتيح وتغميق' },
]

export interface ColorsTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['colors']>) => Promise<Result<Settings>>
}

export function ColorsTab({ settings, onSave }: ColorsTabProps) {
  const [failed, setFailed] = useState(false)
  const { colors } = settings

  const save = (patch: Partial<Settings['colors']>) => {
    void onSave(patch).then((result) => setFailed(!result.ok))
  }

  const scaleIndex = Math.max(
    0,
    SCALE_OPTIONS.findIndex((o) => o.value === colors.scaleSystem),
  )

  return (
    <section class={styles.tab}>
      {failed ? (
        <Banner tone="danger">تعذّر حفظ الإعداد — أُعيد المعروض إلى آخر قيمة محفوظة.</Banner>
      ) : null}

      <div class={styles.section}>
        <span class={styles.sectionTitle} id="colors-format-label">
          صيغة النسخ الافتراضية
        </span>
        <div role="radiogroup" aria-labelledby="colors-format-label">
          {FORMAT_OPTIONS.map((opt) => (
            <Radio
              key={opt.value}
              name="colors-default-format"
              label={opt.label}
              selected={colors.defaultFormat === opt.value ? 'on' : 'off'}
              onChange={(on) => on && save({ defaultFormat: opt.value })}
            />
          ))}
        </div>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>عدد ألوان اللوحة</span>
        <div class={styles.rowControl}>
          <input
            type="range"
            min={3}
            max={24}
            step={1}
            value={colors.paletteSize}
            aria-label="عدد ألوان لوحة الاستخراج"
            onInput={(e) => save({ paletteSize: Number(e.currentTarget.value) })}
          />
          <span>{plural(colors.paletteSize, 'لون', 'لونين', 'ألوان')}</span>
        </div>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>إخفاء الحياديات</span>
        <Toggle
          on={colors.hideNeutrals}
          onChange={(on) => save({ hideNeutrals: on })}
          aria-label="إخفاء الألوان الحيادية من اللوحة"
        />
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>نظام الدرجات</span>
        <SegmentedControl
          options={SCALE_OPTIONS}
          selected={scaleIndex}
          onChange={(i) =>
            save({ scaleSystem: SCALE_OPTIONS[i]?.value as Settings['colors']['scaleSystem'] })
          }
          aria-label="نظام درجات اللون"
        />
      </div>
    </section>
  )
}
