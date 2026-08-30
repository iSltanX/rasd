import { ASPECT_PRESETS, describeRatio, type AspectPresetId } from '@/modules/capture/selection'
import { formatDimensions } from '@/shared/bidi'

import styles from './CropBar.module.css'

import type { DeviceRect } from '@/shared/geometry'
import type { JSX } from 'preact'

export interface CropBarProps {
  /** الاقتصاص الجاري — `null` يعني الصورة كاملة. */
  readonly crop: DeviceRect | null
  readonly preset: AspectPresetId
  readonly onPreset: (id: AspectPresetId) => void
  readonly onApply: () => void
  readonly onReset: () => void
  readonly onCancel: () => void
}

/**
 * شريط الاقتصاص — نسبٌ جاهزة وقراءة وأفعال.
 *
 * **بلا سطر هندسة واحد.** النسب من `ASPECT_PRESETS`، والقراءة من
 * `describeRatio` و`formatDimensions` — كلّها موجودة منذ المرحلة الثامنة،
 * وعُمِّمت على الفضاءات في الدفعة الأولى لهذا الغرض بعينه. وما يبقى هنا
 * عرضٌ وأزرار.
 *
 * **والأرقام غربية**: مقاسٌ يُنسَخ إلى تذكرة، لا عدٌّ بشري.
 */
export function CropBar(props: CropBarProps): JSX.Element {
  const { crop } = props

  return (
    <section class={styles.bar} data-crop-bar="" aria-label="الاقتصاص">
      <h2 class={styles.title}>الاقتصاص</h2>

      <div class={styles.presets} role="group" aria-label="نسبة الاقتصاص">
        {ASPECT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            class={styles.preset}
            data-crop-preset={preset.id}
            aria-pressed={props.preset === preset.id}
            onClick={() => props.onPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <p class={styles.readout} data-crop-readout>
        {crop
          ? `${formatDimensions(Math.round(crop.width), Math.round(crop.height))} · ${describeRatio(crop)}`
          : 'الصورة كاملة'}
      </p>

      <div class={styles.actions}>
        <button type="button" data-crop-apply disabled={crop === null} onClick={props.onApply}>
          طبّق
        </button>
        <button type="button" data-crop-reset disabled={crop === null} onClick={props.onReset}>
          أعد الكلّ
        </button>
        <button type="button" data-crop-cancel onClick={props.onCancel}>
          إنهاء (⎋)
        </button>
      </div>
    </section>
  )
}
