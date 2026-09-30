/**
 * اللوحة اليسرى — طريقة العرض، بطاقة النسبة، المناطق المتغيّرة، الدليل،
 * وحساسية المقارنة. تطابق ترتيب إطار Figma المرجعي `127:196` من الأعلى
 * للأسفل.
 *
 * **قائمة الإحصاء الخماسية في المرجع (مضاف/محذوف/تحرّك/تغيّر لونيّ/فرق
 * نصّي) غير مبنيّة هنا — فجوة معلَنة لا نقص صامت.** ذاك تصنيف دلاليّ
 * («هل تحرّك عنصر؟ هل تغيّر لونه فقط؟») لا يستخرجه `pixelmatch`/محرّك الفرق
 * الحالي إطلاقًا، وخارج نطاق نصّ المرحلة 17 في الخطّة السابقة (تاريخ Git عند `63a0966`) المكتوب فعلًا (يعد فقط
 * بمناطق متغيّرة مرقَّمة ونسبة اختلاف، لا تصنيفها). عوضًا عن أرقام مفبركة:
 * صفٌّ واحد صادق — عدد المناطق المتغيّرة الحقيقي (`regions.length`، هنديّ) —
 * نفس أسلوب الفجوات المُعلَنة في `ComparePanel.tsx` (المرحلة 16) ضدّ إطار
 * `69:104`.
 *
 * **بند الدليل الرابع («غير مُقارَن») مشروط بـ`hasExtraRegion`** — لا يظهر
 * إلا حين تختلف أبعاد اللقطتين فعلًا (نصّ المرحلة 17 في الخطّة السابقة (تاريخ Git عند `63a0966`): «تعليم المنطقة
 * الزائدة صراحةً»)، فلا يُربك دليلًا لمقارنة بمقاسين متساويين ببند لا ينطبق.
 */

import {
  diffMethodSummary,
  pixelCountSummary,
  type RegionItem,
} from '@/pages/compare/region-format'
import { formatDimensions } from '@/shared/bidi'
import { formatHuman, formatMeasure, formatPercent } from '@/shared/bidi/numerals'
import { Banner } from '@/ui/components/Banner/Banner'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import {
  SegmentedControl,
  type SegmentedOption,
} from '@/ui/components/SegmentedControl/SegmentedControl'
import { Slider } from '@/ui/components/Slider/Slider'
import { cx } from '@/ui/cx'

import styles from './Sidebar.module.css'
import { ZonesSection } from './ZonesSection'

import type { CompareMode } from './Stage'
import type { SessionZone } from '@/pages/compare/session-zones'
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
  readonly hasExtraRegion: boolean
  /** مقاسا اللقطتين — يُقال اختلافهما لا يُترك لعلامة في الدليل (`compare / size-mismatch`). */
  readonly sizeA: { readonly width: number; readonly height: number }
  readonly sizeB: { readonly width: number; readonly height: number }
  /** اكتمل حساب الفرق — قبله لا يُقال «متطابقتان» عن صفرٍ لم يُحسب. */
  readonly computed: boolean
  /** مناطق هذه الجلسة — مؤقّتة، لا تُحفَظ في أي مكان. */
  readonly zones: readonly SessionZone[]
  /** بكسلات التقاطع التي استثنتها المناطق من العدّ — قياسٌ غربي في سطر النسبة. */
  readonly excludedPixels: number
  /** وضع الرسم قائم — حالة زرّ «ارسم مستطيلًا». */
  readonly drawing: boolean
  readonly onToggleDrawing: () => void
  readonly onRemoveZone: (id: number) => void
}

/**
 * سطر الحكم فوق النسبة — `compare / identical` (`291:12984`) و`size-mismatch` (`291:13076`).
 * كانت المقارنة المتطابقة تعرض «٠٪» كأيّ مقارنة، والمقاسان المختلفان علامةً في الدليل وحدها.
 */
function Verdict(props: Pick<SidebarProps, 'sizeA' | 'sizeB' | 'computed' | 'diffPixelCount'>) {
  const { sizeA, sizeB } = props
  if (sizeA.width !== sizeB.width || sizeA.height !== sizeB.height) {
    return (
      <div data-compare-verdict="size-mismatch">
        <Banner tone="warning">
          اللقطتان بمقاسين مختلفين — ما خارج التقاطع لا يُقارَن. أ{' '}
          <bdi dir="ltr">{formatDimensions(sizeA.width, sizeA.height)}</bdi> · ب{' '}
          <bdi dir="ltr">{formatDimensions(sizeB.width, sizeB.height)}</bdi>
        </Banner>
      </div>
    )
  }
  if (props.computed && props.diffPixelCount === 0) {
    return (
      <div data-compare-verdict="identical">
        <Banner tone="success">اللقطتان متطابقتان — لا بكسل مختلف بينهما.</Banner>
      </div>
    )
  }
  return null
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
  hasExtraRegion,
  sizeA,
  sizeB,
  computed,
  zones,
  excludedPixels,
  drawing,
  onToggleDrawing,
  onRemoveZone,
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

      <Verdict sizeA={sizeA} sizeB={sizeB} computed={computed} diffPixelCount={diffPixelCount} />

      <section class={cx(styles.section, styles.ratioCard)}>
        <p class={styles.ratioLabel}>
          {zones.length > 0 ? 'نسبة الاختلاف · على المناطق المهمّة' : 'نسبة الاختلاف'}
        </p>
        <p class={styles.ratioValue}>{formatPercent(diffRatio)}</p>
        {/*
         * `من <N>` في `pixelCountSummary` يبقى كما هو: حرّاس Chrome يقرؤونه بـ`/من\s+(\d+)/`
         * ويفسد مطابقتَه أيُّ نصٍّ يُقحَم قبله. والمستثنى يُلحَق **بعده** قياسًا غربيًّا.
         */}
        <p class={styles.ratioDetail}>
          {pixelCountSummary(diffPixelCount, comparedPixels)}
          {zones.length > 0 ? ` · استُثني ${formatMeasure(excludedPixels)}` : ''}
        </p>
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

      <ZonesSection
        zones={zones}
        drawing={drawing}
        onToggleDrawing={onToggleDrawing}
        onRemoveZone={onRemoveZone}
      />

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
          {hasExtraRegion ? (
            <li class={styles.legendRow}>
              <span class={cx(styles.swatch, styles.swatchExtra)} />
              <span>غير مُقارَن</span>
            </li>
          ) : null}
        </ul>
      </section>

      {/*
       * **الشريط يقود الحساسية، والعتبة تُشتقّ منها مقلوبةً.**
       *
       * كان يعرض العتبة تحت اسم «حساسية المقارنة» — ودلالتهما متعاكستان:
       * رفع العتبة يجعل المحرّك يتغاضى عن فروق أكبر، أي **يخفض** الحساسية.
       * فكان دفع الشريط يمينًا يقرأ «حساسية 100٪» بينما النتيجة صفر فرق.
       * صار المعروض والمقود هو الحساسية نفسها، والعتبة `1 − الحساسية`.
       * والافتراضي (عتبة 0.1) يقرأ «90٪» — حساسيةٌ عالية، وهو وصفه الصادق.
       */}
      <section class={cx(styles.section, styles.sensitivity)}>
        <div class={styles.statRow}>
          <span>حساسية المقارنة</span>
          <span class={styles.statValue}>{formatPercent(1 - thresholdFraction)}</span>
        </div>
        <Slider
          value={Math.round((1 - thresholdFraction) * 100)}
          onChange={(v) => onThresholdChange(1 - v / 100)}
          aria-label="حساسية المقارنة"
        />
        <p class={styles.hint}>{diffMethodSummary(thresholdFraction)}</p>
      </section>
    </aside>
  )
}
