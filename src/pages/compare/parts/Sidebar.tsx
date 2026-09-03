/**
 * اللوحة اليسرى — طريقة العرض، بطاقة النسبة، المناطق المتغيّرة، الدليل،
 * وحساسية المقارنة. تطابق ترتيب إطار Figma المرجعي `127:196` من الأعلى
 * للأسفل.
 *
 * **قائمة الإحصاء الخماسية في المرجع (مضاف/محذوف/تحرّك/تغيّر لونيّ/فرق
 * نصّي) غير مبنيّة هنا — فجوة معلَنة لا نقص صامت.** ذاك تصنيف دلاليّ
 * («هل تحرّك عنصر؟ هل تغيّر لونه فقط؟») لا يستخرجه `pixelmatch`/محرّك الفرق
 * الحالي إطلاقًا، وخارج نطاق `Rasd_Plan.md §17` المكتوب فعلًا (يعد فقط
 * بمناطق متغيّرة مرقَّمة ونسبة اختلاف، لا تصنيفها). عوضًا عن أرقام مفبركة:
 * صفٌّ واحد صادق — عدد المناطق المتغيّرة الحقيقي (`regions.length`، هنديّ) —
 * نفس أسلوب الفجوات المُعلَنة في `ComparePanel.tsx` (المرحلة 16) ضدّ إطار
 * `69:104`.
 */

import {
  diffMethodSummary,
  pixelCountSummary,
  type RegionItem,
} from '@/pages/compare/region-format'
import { formatHuman, formatPercent } from '@/shared/bidi/numerals'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import {
  SegmentedControl,
  type SegmentedOption,
} from '@/ui/components/SegmentedControl/SegmentedControl'
import { Slider } from '@/ui/components/Slider/Slider'
import { cx } from '@/ui/cx'

import styles from './Sidebar.module.css'

import type { CompareMode } from './Stage'
import type { JSX } from 'preact'

const MODE_OPTIONS: readonly (SegmentedOption & { value: CompareMode })[] = [
  { value: 'adjacent', label: 'متجاور' },
  { value: 'diff', label: 'فرق البكسل' },
  { value: 'blink', label: 'وميض' },
]

export interface SidebarProps {
  readonly mode: CompareMode
  readonly onModeChange: (mode: CompareMode) => void
  readonly diffRatio: number
  readonly diffPixelCount: number
  readonly comparedPixels: number
  readonly regionItems: readonly RegionItem[]
  readonly selectedRegionIndex: number | null
  readonly onSelectRegion: (index: number) => void
  readonly onPrevRegion: () => void
  readonly onNextRegion: () => void
  readonly thresholdFraction: number
  readonly onThresholdChange: (fraction: number) => void
}

export function Sidebar({
  mode,
  onModeChange,
  diffRatio,
  diffPixelCount,
  comparedPixels,
  regionItems,
  selectedRegionIndex,
  onSelectRegion,
  onPrevRegion,
  onNextRegion,
  thresholdFraction,
  onThresholdChange,
}: SidebarProps): JSX.Element {
  const modeIndex = MODE_OPTIONS.findIndex((o) => o.value === mode)

  return (
    <aside class={styles.sidebar}>
      <section class={styles.section}>
        <h2 class={styles.heading}>طريقة العرض</h2>
        <SegmentedControl
          options={MODE_OPTIONS}
          selected={modeIndex < 0 ? 0 : modeIndex}
          onChange={(i) => {
            const next = MODE_OPTIONS[i]
            if (next) onModeChange(next.value)
          }}
          aria-label="طريقة عرض المقارنة"
        />
      </section>

      <section class={cx(styles.section, styles.ratioCard)}>
        <p class={styles.ratioLabel}>نسبة الاختلاف</p>
        <p class={styles.ratioValue}>{formatPercent(diffRatio)}</p>
        <p class={styles.ratioDetail}>{pixelCountSummary(diffPixelCount, comparedPixels)}</p>
      </section>

      <section class={styles.section}>
        <div class={styles.statRow}>
          <span>المناطق المتغيّرة</span>
          <span class={styles.statValue}>{formatHuman(regionItems.length)}</span>
        </div>

        {regionItems.length > 0 ? (
          <div class={styles.regionNav}>
            <IconButton
              icon="chevron-left"
              aria-label="المنطقة السابقة"
              size="s"
              onClick={onPrevRegion}
            />
            <ul class={styles.regionChips}>
              {regionItems.map((item, index) => (
                <li key={item.region.id}>
                  <button
                    type="button"
                    class={cx(styles.chip, index === selectedRegionIndex && styles.chipSelected)}
                    aria-pressed={index === selectedRegionIndex}
                    onClick={() => onSelectRegion(index)}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            <IconButton
              icon="chevron-right"
              aria-label="المنطقة التالية"
              size="s"
              onClick={onNextRegion}
            />
          </div>
        ) : null}
      </section>

      <section class={styles.section}>
        <h2 class={styles.heading}>الدليل</h2>
        <ul class={styles.legend}>
          <li class={styles.legendRow}>
            <span class={cx(styles.swatch, styles.swatchAdded)} />
            <span>مُضاف</span>
          </li>
          <li class={styles.legendRow}>
            <span class={cx(styles.swatch, styles.swatchRemoved)} />
            <span>محذوف</span>
          </li>
          <li class={styles.legendRow}>
            <span class={cx(styles.swatch, styles.swatchNeutral)} />
            <span>بلا تغيير</span>
          </li>
        </ul>
      </section>

      <section class={cx(styles.section, styles.sensitivity)}>
        <div class={styles.statRow}>
          <span>حساسية المقارنة</span>
          <span class={styles.statValue}>{formatPercent(thresholdFraction)}</span>
        </div>
        <Slider
          value={Math.round(thresholdFraction * 100)}
          onChange={(v) => onThresholdChange(v / 100)}
          aria-label="حساسية المقارنة"
        />
        <p class={styles.hint}>{diffMethodSummary(thresholdFraction)}</p>
      </section>
    </aside>
  )
}
