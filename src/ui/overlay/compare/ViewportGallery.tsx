import { useState } from 'preact/hooks'

import { VIEWPORT_LABELS, VIEWPORT_ORDER } from '@/modules/compare/viewport'
import { formatDimensions } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'

import type { Viewport } from '@/shared/storage/schema'
import type { JSX } from 'preact'

/**
 * معرض المقاسات — `compare / viewports` (`127:315`). **تعرض ولا تحسب**،
 * كبقيّة لوحات الطبقة.
 *
 * **قسم الفرق مُستبعَد عمدًا رغم ظهوره في نفس إطار Figma** — كل بطاقة في
 * الإطار تحمل نسبة اختلاف (`٧٫٩٪`…) ورقاقة حالة دلالية (`فروق كبيرة`
 * `فروق طفيفة` `مطابق`) ومستطيل تظليل فوق المصغَّرة، وثلاثتها تحتاج محرّك
 * `pixelmatch` في **المرحلة 17** لا 16 — نفس نمط الفصل المسجَّل في
 * `ComparePanel.tsx` لقسم «فرق البكسلات» (وقبله `Rasd_Plan.md §6` صفّ 60،
 * المرحلتان 13/14 لـ`colors / sampling`). **البطاقة الأولى في الإطار نفسه
 * («مخصّص» `1920×1080`) مصمَّمة بحالة «لم يُقارَن» + `—`** — أي أن التصميم
 * ذاته يفترض حالة معلَّقة مشروعة، فعرض الرقاقة والنسبة بهاتين القيمتين على
 * البطاقات الأربع كلّها هنا ليس نقصًا يُخفى بل استخدام حالة مصمَّمة فعلًا.
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
  const { viewport, image } = card

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
            {image ? formatDimensions(image.naturalWidth, image.naturalHeight) : '—'}
          </span>
          <span class="rasd-ov-vpg-label">{VIEWPORT_LABELS[viewport]}</span>
        </div>
        <div class="rasd-ov-vpg-row">
          <span class="rasd-ov-vpg-pct">—</span>
          <span class="rasd-ov-vpg-chip">لم يُقارَن</span>
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
          const card = cards.find((c) => c.viewport === viewport) ?? { viewport, image: null }
          return (
            <ViewportCard key={viewport} card={card} {...(onDropImage ? { onDropImage } : {})} />
          )
        })}
      </div>
    </section>
  )
}
