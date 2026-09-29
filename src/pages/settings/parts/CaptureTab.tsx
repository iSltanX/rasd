/**
 * تبويب التصوير — `§12.1`: الصيغة الافتراضية، الجودة، مكان الحفظ، فتح
 * المحرّر بعد الالتقاط، النسخ التلقائي، والتأجيل.
 *
 * `saveLocation` ضابطٌ محفوظٌ ومقروء هنا فقط — استهلاكه في خطّ أنابيب
 * الالتقاط الفعلي (`background/capture-service.ts`) خارج نطاق هذه الوحدة،
 * ويحتاج صلاحية `downloads` الاختيارية نفسها التي بنتها المرحلة 19
 * (`Docs/Engineering.md §6` صفّ 115).
 */
import { useState } from 'preact/hooks'

import { formatPercent, plural } from '@/shared/bidi'
import { Banner } from '@/ui/components/Banner/Banner'
import {
  SegmentedControl,
  type SegmentedOption,
} from '@/ui/components/SegmentedControl/SegmentedControl'
import { Slider } from '@/ui/components/Slider/Slider'
import { Toggle } from '@/ui/components/Toggle/Toggle'

import styles from './SettingsTab.module.css'

import type { Result } from '@/shared/result'
import type { Settings } from '@/shared/settings'

const FORMAT_OPTIONS: readonly SegmentedOption[] = [
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
]

const DELAY_OPTIONS: readonly SegmentedOption[] = [
  { value: '0', label: 'بلا تأجيل' },
  { value: '3', label: plural(3, 'ثانية', 'ثانيتين', 'ثوانٍ') },
  { value: '5', label: plural(5, 'ثانية', 'ثانيتين', 'ثوانٍ') },
  { value: '10', label: plural(10, 'ثانية', 'ثانيتين', 'ثوانٍ') },
]

/** `0.1–1` ↔ `0–100`: نطاق `Slider` المشترك ثابتٌ بالتصميم (`§0.3`). */
const qualityToSlider = (q: number) => Math.round(((q - 0.1) / 0.9) * 100)
const sliderToQuality = (v: number) => Math.round((0.1 + (v / 100) * 0.9) * 100) / 100

export interface CaptureTabProps {
  settings: Settings
  onSave: (patch: Partial<Settings['capture']>) => Promise<Result<Settings>>
}

export function CaptureTab({ settings, onSave }: CaptureTabProps) {
  const [failed, setFailed] = useState(false)
  const { capture } = settings

  const save = (patch: Partial<Settings['capture']>) => {
    void onSave(patch).then((result) => setFailed(!result.ok))
  }

  const formatIndex = Math.max(
    0,
    FORMAT_OPTIONS.findIndex((o) => o.value === capture.format),
  )
  const delayIndex = Math.max(
    0,
    DELAY_OPTIONS.findIndex((o) => o.value === String(capture.delaySeconds)),
  )

  return (
    <section class={styles.tab}>
      {failed ? (
        <Banner tone="danger">تعذّر حفظ الإعداد — أُعيد المعروض إلى آخر قيمة محفوظة.</Banner>
      ) : null}

      <div class={styles.row}>
        <span class={styles.rowLabel}>الصيغة الافتراضية</span>
        <SegmentedControl
          options={FORMAT_OPTIONS}
          selected={formatIndex}
          onChange={(i) =>
            save({ format: FORMAT_OPTIONS[i]?.value as Settings['capture']['format'] })
          }
          aria-label="صيغة الالتقاط الافتراضية"
        />
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>الجودة</span>
        <div class={styles.rowControl}>
          <Slider
            value={qualityToSlider(capture.quality)}
            onChange={(v) => save({ quality: sliderToQuality(v) })}
            aria-label="جودة الالتقاط"
          />
          <span>{formatPercent(capture.quality)}</span>
        </div>
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>
          نسخة أيضًا في مجلّد التنزيلات
          <span class={styles.rowHint}>
            بلا هذا الخيار تبقى اللقطة في المكتبة وحدها حتى تُصدَّر يدويًّا.
          </span>
        </span>
        <Toggle
          on={capture.saveLocation === 'library-and-downloads'}
          onChange={(on) => save({ saveLocation: on ? 'library-and-downloads' : 'library' })}
          aria-label="نسخ اللقطة تلقائيًا إلى مجلّد التنزيلات"
        />
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>فتح المحرّر بعد الالتقاط</span>
        <Toggle
          on={capture.openEditorAfter}
          onChange={(on) => save({ openEditorAfter: on })}
          aria-label="فتح المحرّر تلقائيًا بعد كل التقاط"
        />
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>النسخ التلقائي إلى الحافظة</span>
        <Toggle
          on={capture.copyToClipboard}
          onChange={(on) => save({ copyToClipboard: on })}
          aria-label="نسخ اللقطة تلقائيًا إلى الحافظة"
        />
      </div>

      <div class={styles.row}>
        <span class={styles.rowLabel}>تأجيل الالتقاط الفوري</span>
        <SegmentedControl
          options={DELAY_OPTIONS}
          selected={delayIndex}
          onChange={(i) => {
            const value = DELAY_OPTIONS[i]?.value
            if (value) save({ delaySeconds: Number(value) as Settings['capture']['delaySeconds'] })
          }}
          aria-label="مدّة تأجيل الالتقاط الفوري"
        />
      </div>
    </section>
  )
}
