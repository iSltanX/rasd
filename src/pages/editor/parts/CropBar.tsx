import { ASPECT_PRESETS, describeRatio, type AspectPresetId } from '@/modules/capture/selection'
import { formatDimensions } from '@/shared/bidi'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { cx } from '@/ui/cx'
import { KeyCap, TechnicalValue } from '@/ui/TechnicalValue'

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
      {/* عنوان اللوحة كما في `editor / crop` (`303:22926`)، واسم الأداة «الاقتصاص» في السكّة. */}
      <h2 class={cx(styles.title, 't-arabic-ui-m-strong')}>القص</h2>

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

      {/* بطاقة القراءة كما في `editor / crop` (`303:22926`): المقاس ثمّ النسبة. */}
      <dl class={styles.readout} data-crop-readout>
        <div class={styles.readRow}>
          <dt class="t-arabic-ui-xs">المقاس</dt>
          <dd class="t-mono-xs">
            {crop ? (
              <TechnicalValue kind="dimension" variant="inherit">
                {formatDimensions(Math.round(crop.width), Math.round(crop.height))}
              </TechnicalValue>
            ) : (
              <span class="t-arabic-ui-xs">الصورة كاملة</span>
            )}
          </dd>
        </div>
        {crop ? (
          <div class={styles.readRow}>
            <dt class="t-arabic-ui-xs">النسبة</dt>
            <dd class="t-mono-xs">
              <bdi dir="ltr">{describeRatio(crop)}</bdi>
            </dd>
          </div>
        ) : null}
      </dl>

      {/* تنبيه كما في الإطار، ونصّه ما يفعله المحرّك: عند التصدير لا الحفظ، والأصل باقٍ. */}
      <Banner tone="warning">
        القص يُطبَّق على الصورة عند التصدير، والأصل محفوظ — تتراجع عنه متى شئت.
      </Banner>

      <div class={styles.actions}>
        <Button
          variant="primary"
          size="m"
          data-crop-apply=""
          state={crop === null ? 'disabled' : 'default'}
          onClick={props.onApply}
        >
          طبّق الاقتصاص
        </Button>
        <Button
          variant="secondary"
          size="m"
          data-crop-reset=""
          state={crop === null ? 'disabled' : 'default'}
          onClick={props.onReset}
        >
          أعد الكلّ
        </Button>
        {/* المفتاح شارةً لا محرفًا: «⎋» يسقط إلى خطّ بديل (لقطة `editor / crop`). */}
        <Button
          variant="ghost"
          size="m"
          data-crop-cancel=""
          trailing={<KeyCap>Esc</KeyCap>}
          onClick={props.onCancel}
        >
          إنهاء
        </Button>
      </div>
    </section>
  )
}
