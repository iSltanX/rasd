/**
 * تبويب المظهر — الوضع الداكن/الفاتح/النظام والكثافة.
 *
 * كل تغيير يُكتب فورًا — لا زرّ حفظ، بنفس نمط بقية مفاتيح الإعدادات
 * التبديلية القائمة في المشروع.
 */
import { useState } from 'preact/hooks'

import { Banner } from '@/ui/components/Banner/Banner'
import {
  SegmentedControl,
  type SegmentedOption,
} from '@/ui/components/SegmentedControl/SegmentedControl'

import styles from './AppearanceTab.module.css'

import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const THEME_OPTIONS: readonly SegmentedOption[] = [
  { value: 'dark', label: 'داكن' },
  { value: 'light', label: 'فاتح' },
  { value: 'system', label: 'النظام' },
]

const DENSITY_OPTIONS: readonly SegmentedOption[] = [
  { value: 'comfortable', label: 'مريحة' },
  { value: 'compact', label: 'مضغوطة' },
]

export interface AppearanceTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['appearance']>) => Promise<Result<Settings>>
}

export function AppearanceTab({ settings, onSave }: AppearanceTabProps) {
  const [failed, setFailed] = useState(false)

  const themeIndex = Math.max(
    0,
    THEME_OPTIONS.findIndex((o) => o.value === settings.appearance.theme),
  )
  const densityIndex = Math.max(
    0,
    DENSITY_OPTIONS.findIndex((o) => o.value === settings.appearance.density),
  )

  const save = (patch: Partial<Settings['appearance']>) => {
    void onSave(patch).then((result) => setFailed(!result.ok))
  }

  return (
    <section class={styles.tab}>
      {failed ? (
        <Banner tone="danger">تعذّر حفظ الإعداد — أُعيد المعروض إلى آخر قيمة محفوظة.</Banner>
      ) : null}

      <div class={styles.row}>
        <span class={styles.rowLabel}>الوضع</span>
        <SegmentedControl
          options={THEME_OPTIONS}
          selected={themeIndex}
          onChange={(i) =>
            save({ theme: THEME_OPTIONS[i]?.value as Settings['appearance']['theme'] })
          }
          aria-label="وضع السمة: داكن أو فاتح أو النظام"
        />
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>الكثافة</span>
        <SegmentedControl
          options={DENSITY_OPTIONS}
          selected={densityIndex}
          onChange={(i) =>
            save({ density: DENSITY_OPTIONS[i]?.value as Settings['appearance']['density'] })
          }
          aria-label="كثافة العرض: مريحة أو مضغوطة"
        />
      </div>
    </section>
  )
}
