import { useState } from 'preact/hooks'

import { classifyDiffStatus, DIFF_STATUS_LABELS } from '@/modules/compare/diff-status'
import { VIEWPORT_LABELS, VIEWPORT_ORDER } from '@/modules/compare/viewport'
import { formatDimensions, formatPercent } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import type { Viewport } from '@/shared/storage/schema'
import type { JSX } from 'preact'

/**
 * معرض المقاسات — `compare / viewports` (`127:315`). **تعرض ولا تحسب**،
 * كبقيّة لوحات الطبقة.
 *
 * **النسبة والرقاقة موصولتان الآن — سدادُ دَيْنٍ سجّلته المرحلة 16 على 17
 * في هذا التعليق نفسه.** كانتا مُستبعَدتين لغياب محرّك `pixelmatch`، وقد
 * بُني في `background/compare-diff-service.ts`. البطاقة تستقبل `diffRatio`
 * جاهزًا، والتصنيف الدلالي (`فروق كبيرة` `فروق طفيفة` `مطابق` `لم يُقارَن`)
 * في `classifyDiffStatus` — **وحدة منطق خالصة قابلة للاختبار لا شرطٌ داخل
 * المكوّن**، وحدُّها قرارٌ هندسيّ موثَّق هناك على سابقة `classifyViewport`.
 *
 * **البطاقة الأولى في الإطار («مخصّص» `1920×1080`) مصمَّمة بحالة «لم
 * يُقارَن» + `—`** — فبطاقةٌ بلا قياس تبقى عليها، ولا تُخترَع لها نسبة.
 * وذلك حال ثلاث بطاقات من أربع عمليًّا: **المقاس الحيّ وحده هو ما يمكن
 * قياسه اليوم**، لأن قياس البقية يحتاج تغيير حجم النافذة وهو ما أُجِّل
 * صراحةً مع زرّ «أعد فحص كل المقاسات» في الفقرة التالية.
 *
 * **مستطيل التظليل فوق المصغَّرة — فجوة معلَنة لا مبنيّة**: الإطار يرسمه
 * فوق موضع الاختلاف، لكن `LiveDiff` (`shared/messaging/contract.ts`) يحمل
 * عدد المناطق لا صناديقها — `groupDiffRegions` تحسب الصناديق في الخلفية ثم
 * تُختزَل إلى `regionCount` قبل عبور الرسالة (تعليل الاختزال في رأس
 * `compare-diff-service.ts`: «نسبةٌ وعددُ مناطق بدل خريطة حرارية»). فلا
 * بيانات لموضعه، ورسمُه بموضعٍ مُخمَّن كذبٌ مرئيّ. يحتاج توسيع العقد نفسه.
 *
 * **زرّ «أعد فحص كل المقاسات» في رأس الإطار (`127:317`) غير معروض هنا
 * إطلاقًا** — يحتاج محرّك تغيير حجم نافذة تلقائيًّا والتقاط متسلسل عبر
 * المقاسات الأربعة، وهو عمل غير مبنيّ بعد. نفس سابقة `CompareIdle` بضبط
 * `onXxx?` اختياريًّا لا زرًّا معطَّلًا (المرحلة 7): لا `onRescanAll` هنا
 * أصلًا، فلا شيء يُخفى خلف تعطيل ظاهري.
 *
 * **زرّ الإغلاق قرار تصميم لا نصّ إطار** — البيانات الوصفية لـ`127:316`
 * لا تُدرِج زرّ إغلاق أو رجوع صراحةً، لكن كل لوحة أخرى في هذه المجموعة
 * (`ComparePanel`/`InspectPanel`/`ColourPanel`) تملك واحدًا، وبلا مسار
 * إغلاق ظاهر تُحبَس الطبقة في المعرض. أُضيف بنفس موضع رأس `ComparePanel`
 * (بداية الرأس، اتجاه RTL) قياسًا لا نسخًا حرفيًّا للإطار.
 */

export interface ViewportGalleryCard {
  readonly viewport: Viewport
  /** `null` — لا مرجع محفوظ لهذا المقاس بعد. */
  readonly image: {
    readonly url: string
    readonly naturalWidth: number
    readonly naturalHeight: number
  } | null
  /**
   * كسر الفرق (0–1) لآخر قياس على هذا المقاس، أو `null` — «لم يُقارَن».
   *
   * **مطلوب لا اختياري**: حقلٌ اختياري يجعل «لم يُقَس» سهوًا صامتًا في
   * موضع البناء، بينما `null` صريحة تُقرأ قرارًا. وكل مستدعٍ يعرف أيّ
   * بطاقة قِيست فعلًا — المقاس الحيّ وحده اليوم (انظر تعليق الرأس).
   */
  readonly diffRatio: number | null
}

export interface ViewportGalleryProps {
  readonly cards: readonly ViewportGalleryCard[]
  readonly onClose?: () => void
  /** ملفّ صورة أُفلت فعليًا على بطاقة مقاس بعينه — الفلترة مسؤولية المستدعي، كحال `CompareIdle`. */
  readonly onDropImage?: (viewport: Viewport, file: File) => void
}

function ViewportCard({
  card,
  onDropImage,
}: {
  card: ViewportGalleryCard
  onDropImage?: (viewport: Viewport, file: File) => void
}): JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const { viewport, image, diffRatio } = card
  const status = classifyDiffStatus(diffRatio)

  const onDrop = (e: JSX.TargetedDragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type.startsWith('image/')) onDropImage?.(viewport, file)
  }

  return (
    <article
      class="rasd-ov-vpg-card"
      data-rasd-ov="viewport-card"
      aria-label={VIEWPORT_LABELS[viewport]}
    >
      {image ? (
        <div class="rasd-ov-vpg-thumb">
          <img src={image.url} alt="" />
        </div>
      ) : (
        <div
          class="rasd-ov-vpg-thumb rasd-ov-vpg-thumb-empty"
          data-drag-over={dragOver}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <Icon name="image" size="md" />
          <span>أفلت صورة لتعيينها مرجعًا</span>
        </div>
      )}

      <div class="rasd-ov-vpg-meta">
        <div class="rasd-ov-vpg-row">
          <span class="rasd-ov-vpg-dim">
            {image ? (
              <TechnicalValue kind="dimension" variant="inherit">
                {formatDimensions(image.naturalWidth, image.naturalHeight)}
              </TechnicalValue>
            ) : (
              '—'
            )}
          </span>
          <span class="rasd-ov-vpg-label">{VIEWPORT_LABELS[viewport]}</span>
        </div>
        <div class="rasd-ov-vpg-row">
          {/* قياس تقني ⇒ أرقام غربية (`§3.5`)، خلافًا لعدّ العناصر في `ComparePanel`. */}
          <span class="rasd-ov-vpg-pct">
            {status === 'unmeasured' || diffRatio === null ? '—' : formatPercent(diffRatio)}
          </span>
          <span class="rasd-ov-vpg-chip" data-status={status}>
            {DIFF_STATUS_LABELS[status]}
          </span>
        </div>
      </div>
    </article>
  )
}

export function ViewportGallery({
  cards,
  onClose,
  onDropImage,
}: ViewportGalleryProps): JSX.Element {
  return (
    <section class="rasd-ov-vpg" data-rasd-ov="viewport-gallery" aria-label="مقارنة المقاسات">
      <header class="rasd-ov-vpg-head">
        <button type="button" class="rasd-ov-vpg-icon" onClick={onClose} aria-label="إغلاق">
          <Icon name="close" size="sm" />
        </button>
        <span class="rasd-ov-vpg-title">
          <span>مقارنة المقاسات</span>
          <Icon name="split-view" size="sm" />
        </span>
      </header>

      <div class="rasd-ov-vpg-grid">
        {VIEWPORT_ORDER.map((viewport) => {
          const card = cards.find((c) => c.viewport === viewport) ?? {
            viewport,
            image: null,
            diffRatio: null,
          }
          return (
            <ViewportCard key={viewport} card={card} {...(onDropImage ? { onDropImage } : {})} />
          )
        })}
      </div>
    </section>
  )
}
