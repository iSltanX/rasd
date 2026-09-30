import { useState } from 'preact/hooks'

import { formatDimensions, formatHuman, formatPercent, plural } from '@/shared/bidi'
import { EXCLUSION_LIMITS } from '@/shared/exclusion-schema'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import type { CompareDisplayMode } from '@/modules/compare/overlay'
import type { LiveDiff } from '@/shared/messaging/contract'
import type { JSX } from 'preact'

/**
 * لوحة المقارنة — `compare / split-reference` (`69:2`). **تعرض ولا
 * تحسب**، كبقيّة لوحات الطبقة (`ColourPanel`/`InspectPanel`): تستقبل
 * قيمًا جاهزة وتُبلِّغ عن الأفعال بمعاودات.
 *
 * **قسم «فرق البكسلات» موصولٌ الآن — سدادُ دَيْنٍ سجّلته المرحلة 16 على
 * 17 في هذا التعليق نفسه.** كان مُستبعَدًا لأن نِسبه وعدّاداته («فرق
 * البكسلات ٤٫٨٪»، «٣ عناصر تحرّكت») تحتاج خوارزمية `pixelmatch`، وهي
 * الآن مبنيّة في `background/compare-diff-service.ts` وتصل عبر رسالة
 * `compare/diff`. فلم يبقَ إلّا العرض — وهذا الملفّ **يعرض ولا يحسب** كما
 * كان: يستقبل `LiveDiff` جاهزًا ويُبلِّغ عن الطلب بـ`onCaptureDiff`. زرّ
 * «التقط الفرق» في «الإجراءات» عاد معه من الإطار نفسه.
 *
 * **صنفا الأرقام مفصولان هنا بدقّة (`Docs/Engineering.md §3.5`)**: نسبة الفرق
 * **قياس** فبأرقام غربية (`formatPercent`)، وعدد العناصر المتحرّكة **عدٌّ
 * بشري** فبأرقام هندية (`formatHuman`) — نفس قسمة `pages/compare/region-format.ts`
 * بين «أيّ نسبة» و«كم عنصرًا».
 *
 * **وقبل أوّل قياس تُعرَض `—` لا صفرٌ**: الصفر ادّعاء تطابقٍ لم يقع، وهو
 * الفرق الذي يفصله `classifyDiffStatus` (`modules/compare/diff-status.ts`)
 * بين «مطابق» و«لم يُقارَن». و`sizeMismatch` يُعلَن نصًّا لا يُبتلَع: نسبةٌ
 * محسوبة على مساحة التقاطع وحدها تُقرأ خطأً ما لم يُقَل ذلك.
 *
 * **اختيار وضع المزج (`CompareBlendMode`) غير معروض هنا بعد**: إطار
 * Figma لا يُظهر عنصر تحكّم منفصلًا له صراحةً بين أدوات اللوحة الملتقَطة —
 * يبقى `blendMode` الافتراضي (`difference`) وحده حتى يتّضح موضع هذا
 * التحكّم بمصدر تصميم أدقّ. فجوة معلَنة لا مسكوتة.
 *
 * **«تبديل» بلا سلوك مؤكَّد بعد**: الزرّ موجود في `69:161` بأيقونة `swap`،
 * لكن أيّ الجانبين يُبدِّل بالضبط (المرجع/الحيّ في التقسيم، أم شيء آخر)
 * غير محسوم من الهندسة وحدها. `onSwap` اختياري ويبقى بلا أثر افتراضيًا
 * حتى يُحسَم — لا يُخترَع سلوك لتفادي زرّ بلا وظيفة ظاهرة.
 *
 * **تدوير المرجع، ومحاذاته إلى حواف الصفحة أو عنصر مختار — فجوتان
 * معلَنتان لا مغفولتان، تحقّقتا مباشرةً من الإطار لا افتراضًا**:
 * `Docs/Rasd_Ar.md §8.3` يذكر «تدوير عند الحاجة» و«محاذاة إلى حواف الصفحة أو
 * إلى عنصر مختار»، لكن `69:2`/`69:104` (مصدر هذه اللوحة) **لا يُظهر أيّ
 * عنصر تحكّم لهما** — لا أيقونة تدوير، لا حقل درجات، لا زرّ محاذاة أو
 * التقاط عنصر. رياضيات التدوير (`rotateAt` في `modules/compare/overlay.ts`)
 * مبنيّة ومختبَرة ذهابًا وإيابًا منذ بداية المرحلة (اختبار المرحلة المفروض
 * صراحةً)، لكن **بلا مدخل حيّ يستدعيها** — نفس حال وضع المزج أعلاه بالضبط.
 * المحاذاة إلى حافّة/عنصر بلا مقابل هندسي حتى في الرياضيات؛ لم تُبنَ لأنها
 * غير مصدَّرة من أي تصميم. كلتاهما تنتظران مصدر تصميم أدقّ لا استنباطًا هنا.
 *
 * **«طابق العرض» — الميزة نفسها فجوة ثالثة من الصنف نفسه، اكتُشفت في تدقيق
 * إغلاق المرحلة لا أثناء البناء**: `Docs/Rasd_Ar.md §8` يصفه «أكثر عملية
 * متكرِّرة في هذا الوضع»، والرياضيات (`matchWidthScale`) مبنيّة ومختبَرة
 * تمامًا كرياضيات التدوير — لكن `69:104` بأقسامه الستّة كاملة (رأس، وضع،
 * منزلقان، فرق، مقاس، إجراءات [تبديل + التقط فرق]) **لا يحمل
 * زرًّا ثالثًا في «الإجراءات» ولا أي عنصر آخر لهذه الوظيفة** — نفس غياب
 * التصميم المصدري بالضبط، فنفس الحكم: فجوة معلَنة لا زرّ مُخترَع.
 * `Docs/Engineering.md §6` صفّ 89.
 */

/**
 * منطقةٌ مستثناة كما تعرضها اللوحة (ADR 0034) — مبنيّةٌ في السلك: الاسم (اسم المستخدم، أو المحدِّد، أو المقاس)
 * وهل سقطت إلى مستطيلها المحفوظ.
 */
export interface CompareZoneItem {
  readonly id: string
  readonly kind: 'rect' | 'element'
  readonly name: string
  readonly fallback: boolean
}

export interface ComparePanelProps {
  readonly displayMode: CompareDisplayMode
  /** 0–100. */
  readonly opacity: number
  /** 0–100 — ذو أثر مرئي في وضع `split` وحده، لكنه يُعرض دائمًا كحال Figma نفسه. */
  readonly splitPosition: number
  /** جاهز من المستدعي — «سطح مكتب 1440» مثلًا؛ هذه اللوحة لا تصنّف مقاسات. */
  readonly viewportLabel: string
  /**
   * آخر قياس فرق حيّ، أو `null` — لم يُقَس بعد، أو أُبطل لأن المرجع أو
   * المقاس تغيّر. **الإبطال مسؤولية المستدعي لا هذه اللوحة**: نسبةٌ قديمة
   * معروضة فوق مرجعٍ جديد كذبةٌ صامتة، ومن يملك المرجع هو من يعرف تغيّره.
   */
  readonly diff?: LiveDiff | null
  /** قياسٌ جارٍ — يُعطِّل الزرّ ويُبدّل نصّه، ولا يمسح النتيجة السابقة. */
  readonly diffBusy?: boolean
  /** رسالة فشل القياس — تُعرَض ولا تُبتلَع؛ زرٌّ يفشل صامتًا يُقرأ «لا شيء تغيّر». */
  readonly diffError?: string | null
  readonly onSetDisplayMode: (mode: CompareDisplayMode) => void
  readonly onOpacityChange: (percent: number) => void
  readonly onSplitPositionChange: (percent: number) => void
  readonly onSwap?: () => void
  /** يطلب قياس فرقٍ جديد. غيابها يُخفي القسم والزرّ معًا — سابقة المرحلة 7. */
  readonly onCaptureDiff?: () => void
  readonly onOpenViewportPicker?: () => void
  readonly onClose?: () => void
  /**
   * «مناطق مستثناة» — `compare / exclusions` (`391:1989`) وأخواتها. غياب `onDrawZone` يُخفي القسم كلّه:
   * لا زرّ بلا محرّك.
   */
  readonly zones?: readonly CompareZoneItem[]
  readonly zoneTool?: 'draw' | 'pick' | null
  /** مناطق عنصر من مقاسات أخرى للصفحة نفسها، موجودةٌ في الصفحة الآن. */
  readonly suggestedZones?: number
  readonly onDrawZone?: () => void
  readonly onPickZone?: () => void
  readonly onRemoveZone?: (id: string) => void
  readonly onAddSuggested?: () => void
}

/** نصيب المستثنى من مساحة التقاطع — المقام قبل الطرح، لا بعده. */
const excludedShare = (d: LiveDiff): number =>
  d.excludedPixels / Math.max(1, d.comparedPixels + d.excludedPixels)

const MODE_TABS: readonly { mode: CompareDisplayMode; label: string }[] = [
  { mode: 'split', label: 'تقسيم' },
  { mode: 'blend', label: 'تراكب' },
  { mode: 'opacity', label: 'شفافية' },
  { mode: 'blink', label: 'وميض' },
]

function onRangeInput(
  handler: (percent: number) => void,
): (e: JSX.TargetedEvent<HTMLInputElement>) => void {
  return (e) => handler(Number(e.currentTarget.value))
}

export function ComparePanel({
  displayMode,
  opacity,
  splitPosition,
  viewportLabel,
  diff = null,
  diffBusy = false,
  diffError = null,
  onSetDisplayMode,
  onOpacityChange,
  onSplitPositionChange,
  onSwap,
  onCaptureDiff,
  onOpenViewportPicker,
  onClose,
  zones = [],
  zoneTool = null,
  suggestedZones = 0,
  onDrawZone,
  onPickZone,
  onRemoveZone,
  onAddSuggested,
}: ComparePanelProps): JSX.Element {
  /*
   * القسم يُعرَض حين يكون فيه ما يُعرَض أو ما يُفعَل، لا دائمًا — سابقة
   * المرحلة 7 المطبَّقة في `CompareIdle` أدناه: ما لا محرّك له يُحذَف.
   * والنتيجة والخطأ شرطان إلى جانب المعاودة كي لا يختفي قياسٌ وقع فعلًا
   * (أو فشلٌ وقع فعلًا) لمجرّد أن المستدعي لم يمرّر المعاودة.
   */
  const showDiff = onCaptureDiff !== undefined || diff !== null || diffError !== null

  return (
    <section class="rasd-ov-cmp" data-rasd-ov="compare-panel" aria-label="مقارنة">
      <header class="rasd-ov-cmp-head">
        <button type="button" class="rasd-ov-cmp-icon" onClick={onClose} aria-label="إغلاق">
          <Icon name="close" size="sm" />
        </button>
        <span class="rasd-ov-cmp-title">
          <span>مقارنة</span>
          <Icon name="split-view" size="sm" />
        </span>
      </header>

      <div class="rasd-ov-cmp-mode" role="tablist" aria-label="وضع العرض">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={tab.mode === displayMode}
            class="rasd-ov-cmp-tab"
            onClick={() => onSetDisplayMode(tab.mode)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div class="rasd-ov-cmp-sliders">
        <label class="rasd-ov-cmp-slider">
          <span class="rasd-ov-cmp-slider-row">
            <span class="rasd-ov-cmp-slider-value">{formatPercent(opacity / 100)}</span>
            <span class="rasd-ov-cmp-slider-label">شفافية المرجع</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onInput={onRangeInput(onOpacityChange)}
            aria-label="شفافية المرجع"
          />
        </label>

        <label class="rasd-ov-cmp-slider" data-inactive={displayMode !== 'split'}>
          <span class="rasd-ov-cmp-slider-row">
            <span class="rasd-ov-cmp-slider-value">{formatPercent(splitPosition / 100)}</span>
            <span class="rasd-ov-cmp-slider-label">موضع الفاصل</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={splitPosition}
            onInput={onRangeInput(onSplitPositionChange)}
            aria-label="موضع الفاصل"
            disabled={displayMode !== 'split'}
          />
        </label>
      </div>

      {showDiff ? (
        <div class="rasd-ov-cmp-diff" data-rasd-ov="compare-diff">
          <div class="rasd-ov-cmp-diff-row">
            <span class="rasd-ov-cmp-diff-value">{diff ? formatPercent(diff.diffRatio) : '—'}</span>
            {/* النسبة على جزءٍ تُسمّى بجزئها — كما يُعلَن اختلاف المقاسين أدناه (ADR 0034). */}
            <span class="rasd-ov-cmp-diff-label">
              {diff?.excludedZones ? 'فرق البكسلات · على المناطق المهمّة' : 'فرق البكسلات'}
            </span>
          </div>
          {diff?.excludedZones ? (
            <div class="rasd-ov-cmp-diff-row" data-rasd-ov="compare-excluded">
              <span class="rasd-ov-cmp-diff-count">
                {plural(diff.excludedZones, 'منطقة', 'منطقتان', 'مناطق')} ·{' '}
                {formatPercent(excludedShare(diff))} من الصفحة
              </span>
              <span class="rasd-ov-cmp-diff-label">مستثنى</span>
            </div>
          ) : null}
          <div class="rasd-ov-cmp-diff-row">
            <span class="rasd-ov-cmp-diff-count">{diff ? formatHuman(diff.regionCount) : '—'}</span>
            <span class="rasd-ov-cmp-diff-label">عناصر تحرّكت</span>
          </div>
          {diff?.sizeMismatch ? (
            <p class="rasd-ov-cmp-diff-note">
              مقاس المرجع يخالف مقاس الصفحة — النسبة على مساحة التقاطع وحدها:{' '}
              <span class="rasd-ov-cmp-vp-dim">
                <TechnicalValue kind="dimension" variant="inherit">
                  {formatDimensions(diff.overlapWidth, diff.overlapHeight)}
                </TechnicalValue>
              </span>
            </p>
          ) : null}
          {diffError ? <p class="rasd-ov-cmp-diff-error">{diffError}</p> : null}
        </div>
      ) : null}

      <div class="rasd-ov-cmp-viewport">
        <button
          type="button"
          class="rasd-ov-cmp-vp-btn"
          onClick={onOpenViewportPicker}
          aria-label={`المقاس الحالي: ${viewportLabel}`}
        >
          <Icon name="chevron-down" size="xs" />
          <span class="rasd-ov-cmp-vp-dim">{viewportLabel}</span>
        </button>
        <span class="rasd-ov-cmp-vp-note">المرجع لـ</span>
      </div>

      {onDrawZone ? (
        <div class="rasd-ov-cmp-zones" data-rasd-ov="compare-zones">
          <p class="rasd-ov-cmp-zones-h">مناطق مستثناة</p>
          {zones.length === 0 ? (
            <p class="rasd-ov-cmp-zones-note">لا مناطق مستثناة — كل البكسلات تدخل الفرق.</p>
          ) : (
            <ul class="rasd-ov-cmp-zones-list">
              {zones.map((zone, i) => (
                <li
                  key={zone.id}
                  class="rasd-ov-cmp-zone"
                  data-rasd-ov="compare-zone"
                  data-fallback={zone.fallback}
                >
                  <span class="rasd-ov-cmp-zone-n">{formatHuman(i + 1)}</span>
                  <bdi class="rasd-ov-cmp-zone-name">{zone.name}</bdi>
                  <span class="rasd-ov-cmp-zone-kind">
                    {zone.fallback ? 'مستطيل احتياطي' : zone.kind === 'rect' ? 'مستطيل' : 'عنصر'}
                  </span>
                  <button
                    type="button"
                    class="rasd-ov-cmp-icon"
                    aria-label={`احذف المنطقة ${formatHuman(i + 1)}`}
                    onClick={() => onRemoveZone?.(zone.id)}
                  >
                    <Icon name="trash" size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* `compare / exclusion-fallback` (`391:3022`): العنصر الغائب يُسمّى ولا يُبتلَع. */}
          {zones
            .filter((zone) => zone.fallback)
            .map((zone) => (
              <p key={zone.id} class="rasd-ov-cmp-zone-warn" role="status">
                <Icon name="alert" size="sm" />
                <span>
                  لم يُعثر على <bdi dir="ltr">{zone.name}</bdi> في الصفحة، فاستُعمل مستطيله المحفوظ.
                  تحقّق منه أو احذفه.
                </span>
              </p>
            ))}
          {/* الحدّ يُعلَن قبل الفعل لا بعد رفض الحفظ — نفس الحدّ الذي تتحقّق به الخلفية. */}
          {zones.length >= EXCLUSION_LIMITS.zones ? (
            <p class="rasd-ov-cmp-zones-note">
              بلغت القائمة حدّها — {formatHuman(EXCLUSION_LIMITS.zones)} منطقة. احذف منطقةً لتضيف
              غيرها.
            </p>
          ) : null}
          {suggestedZones > 0 && onAddSuggested && zones.length < EXCLUSION_LIMITS.zones ? (
            <p class="rasd-ov-cmp-zones-note">
              {plural(suggestedZones, 'منطقة عنصر', 'منطقتا عنصر', 'مناطق عنصر')} من مقاسات أخرى
              لهذه الصفحة.{' '}
              <button type="button" class="rasd-ov-cmp-link" onClick={onAddSuggested}>
                أضفها
              </button>
            </p>
          ) : null}
          <div class="rasd-ov-cmp-zones-actions">
            <button
              type="button"
              class="rasd-ov-cmp-btn"
              aria-pressed={zoneTool === 'draw'}
              disabled={zones.length >= EXCLUSION_LIMITS.zones}
              onClick={onDrawZone}
            >
              <Icon name="capture-area" size="sm" />
              <span>ارسم مستطيلًا</span>
            </button>
            {onPickZone ? (
              <button
                type="button"
                class="rasd-ov-cmp-btn"
                aria-pressed={zoneTool === 'pick'}
                disabled={zones.length >= EXCLUSION_LIMITS.zones}
                onClick={onPickZone}
              >
                <Icon name="capture-element" size="sm" />
                <span>اختر عنصرًا</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <footer class="rasd-ov-cmp-actions">
        <button type="button" class="rasd-ov-cmp-btn" onClick={onSwap}>
          <Icon name="swap" size="sm" />
          <span>تبديل</span>
        </button>
        {/*
         * **التعطيل هنا لا يخرق سابقة المرحلة 7.** تلك السابقة تمنع عرض
         * زرٍّ بلا محرّك؛ وهذا زرٌّ محرّكه قائم ويعمل الآن — التعطيل إبلاغُ
         * حالة لا إخفاءُ فجوة، ونصّه يتبدّل ليقول ذلك. والزرّ يغيب أصلًا
         * حين تغيب `onCaptureDiff` (انظر `showDiff` أعلاه).
         */}
        {onCaptureDiff ? (
          <button
            type="button"
            class="rasd-ov-cmp-btn"
            onClick={onCaptureDiff}
            disabled={diffBusy}
            aria-busy={diffBusy}
          >
            <Icon name="diff" size="sm" />
            <span>{diffBusy ? 'جارٍ القياس…' : 'التقط الفرق'}</span>
          </button>
        ) : null}
      </footer>
    </section>
  )
}

/**
 * `compare / no-reference` (`96:560`) — قبل تعيين أوّل مرجع لهذه الصفحة.
 *
 * **الإفلات مُوصَّل هنا فعليًّا لا نصًّا فقط**: منطقة الإفلات محلّية
 * ومكتفية بذاتها (نفس منطق حقول الإدخال في صفحات الإضافة) — لا حاجة
 * لتمرير حدث DOM خامًا إلى مستوى أعلى. **اللصق من الحافظة نصٌّ وحده بلا
 * مستمع بعد**: يحتاج مستمع `paste` عامًا على المستند (لا التبويب وحده
 * قابل للتركيز داخل صفحة مضيف)، وموضعه أنسب في السلك مع `overlay-app.tsx`
 * حين يُبنى — فجوة معلَنة لا مسكوتة.
 */
export interface CompareIdleProps {
  readonly onChooseFromLibrary?: () => void
  readonly onUseLastCapture?: () => void
  /** ملفّ صورة واحد أُفلت فعليًا — الفلترة (PNG فقط، حجم أقصى) مسؤولية المستدعي. */
  readonly onDropImage?: (file: File) => void
}

export function CompareIdle({
  onChooseFromLibrary,
  onUseLastCapture,
  onDropImage,
}: CompareIdleProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false)

  const onDrop = (e: JSX.TargetedDragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type.startsWith('image/')) onDropImage?.(file)
  }

  return (
    <section class="rasd-ov-cmp rasd-ov-cmp-idle" data-rasd-ov="compare-idle" aria-label="مقارنة">
      <span class="rasd-ov-cmp-badge">
        <Icon name="split-view" size="md" />
      </span>

      <div class="rasd-ov-cmp-intro">
        <h2 class="rasd-ov-cmp-h">لا يوجد مرجع لهذه الصفحة</h2>
        <p class="rasd-ov-cmp-desc">ثبّت لقطة كمرجع، أو أفلت صورة هنا لمقارنتها بالصفحة الحيّة.</p>
      </div>

      <div
        class="rasd-ov-cmp-dropzone"
        data-drag-over={dragOver}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <Icon name="image" size="md" />
        <span>أفلت ملف PNG، أو ألصق من الحافظة</span>
      </div>

      {/*
       * **زرّان لا يُعرضان إلا بمعاودة فعلية خلفهما.**
       *
       * كانا يُعرَضان دائمًا فينقر المستخدم بلا أثر — وهو ما تمنعه سابقة
       * المرحلة 7 المطبَّقة في `ElementLayer`: «تُحذَف حتى يوجد محرّكها، ولا
       * تُعرَض معطَّلة». والاستثناء هنا كان سهوًا لا قرارًا.
       */}
      <div class="rasd-ov-cmp-idle-actions">
        {onChooseFromLibrary ? (
          <button type="button" class="rasd-ov-cmp-btn" onClick={onChooseFromLibrary}>
            <span>اختر من المكتبة</span>
            <Icon name="folder" size="sm" />
          </button>
        ) : null}
        {onUseLastCapture ? (
          <button type="button" class="rasd-ov-cmp-btn" onClick={onUseLastCapture}>
            <span>استخدم آخر لقطة</span>
            <Icon name="history" size="sm" />
          </button>
        ) : null}
      </div>
    </section>
  )
}
