import { useState } from 'preact/hooks'

import { formatPercent } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'

import type { CompareDisplayMode } from '@/modules/compare/overlay'
import type { JSX } from 'preact'

/**
 * لوحة المقارنة — `compare / split-reference` (`69:2`). **تعرض ولا
 * تحسب**، كبقيّة لوحات الطبقة (`ColourPanel`/`InspectPanel`): تستقبل
 * قيمًا جاهزة وتُبلِّغ عن الأفعال بمعاودات.
 *
 * **قسم «فرق البكسلات» مُستبعَد عمدًا من هذا الملفّ رغم ظهوره في نفس
 * إطار Figma.** يحمل نِسبًا وعدّادات («فرق البكسلات ٤٫٨٪»، «٣ عناصر
 * تحرّكت»…) تخصّ خوارزمية `pixelmatch` في **المرحلة 17** لا 16 — نفس نمط
 * الفصل بين مكوّن Figma واحد ومرحلتين مسجَّل سابقًا لـ`colors / sampling`
 * (`Rasd_Plan.md §6` صفّ 60، المرحلتان 13/14). زرّ «التقط الفرق» في نفس
 * الإطار يخصّ المرحلة 17 أيضًا فأُسقط معه.
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
 * `Rasd_Plan.md §8.3` يذكر «تدوير عند الحاجة» و«محاذاة إلى حواف الصفحة أو
 * إلى عنصر مختار»، لكن `69:2`/`69:104` (مصدر هذه اللوحة) **لا يُظهر أيّ
 * عنصر تحكّم لهما** — لا أيقونة تدوير، لا حقل درجات، لا زرّ محاذاة أو
 * التقاط عنصر. رياضيات التدوير (`rotateAt` في `modules/compare/overlay.ts`)
 * مبنيّة ومختبَرة ذهابًا وإيابًا منذ بداية المرحلة (اختبار المرحلة المفروض
 * صراحةً)، لكن **بلا مدخل حيّ يستدعيها** — نفس حال وضع المزج أعلاه بالضبط.
 * المحاذاة إلى حافّة/عنصر بلا مقابل هندسي حتى في الرياضيات؛ لم تُبنَ لأنها
 * غير مصدَّرة من أي تصميم. كلتاهما تنتظران مصدر تصميم أدقّ لا استنباطًا هنا.
 *
 * **«طابق العرض» — الميزة نفسها فجوة ثالثة من الصنف نفسه، اكتُشفت في تدقيق
 * إغلاق المرحلة لا أثناء البناء**: `Rasd_Plan.md §8` يصفه «أكثر عملية
 * متكرِّرة في هذا الوضع»، والرياضيات (`matchWidthScale`) مبنيّة ومختبَرة
 * تمامًا كرياضيات التدوير — لكن `69:104` بأقسامه الستّة كاملة (رأس، وضع،
 * منزلقان، فرق [مُستبعَد]، مقاس، إجراءات [تبديل + التقط فرق]) **لا يحمل
 * زرًّا ثالثًا في «الإجراءات» ولا أي عنصر آخر لهذه الوظيفة** — نفس غياب
 * التصميم المصدري بالضبط، فنفس الحكم: فجوة معلَنة لا زرّ مُخترَع.
 * `Rasd_Plan.md §6` صفّ 89.
 */

export interface ComparePanelProps {
  readonly displayMode: CompareDisplayMode
  /** 0–100. */
  readonly opacity: number
  /** 0–100 — ذو أثر مرئي في وضع `split` وحده، لكنه يُعرض دائمًا كحال Figma نفسه. */
  readonly splitPosition: number
  /** جاهز من المستدعي — «سطح مكتب 1440» مثلًا؛ هذه اللوحة لا تصنّف مقاسات. */
  readonly viewportLabel: string
  readonly onSetDisplayMode: (mode: CompareDisplayMode) => void
  readonly onOpacityChange: (percent: number) => void
  readonly onSplitPositionChange: (percent: number) => void
  readonly onSwap?: () => void
  readonly onOpenViewportPicker?: () => void
  readonly onClose?: () => void
}

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
  onSetDisplayMode,
  onOpacityChange,
  onSplitPositionChange,
  onSwap,
  onOpenViewportPicker,
  onClose,
}: ComparePanelProps): JSX.Element {
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

      <footer class="rasd-ov-cmp-actions">
        <button type="button" class="rasd-ov-cmp-btn" onClick={onSwap}>
          <Icon name="swap" size="sm" />
          <span>تبديل</span>
        </button>
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
