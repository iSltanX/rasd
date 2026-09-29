/**
 * وضع «وميض» — تبديل تلقائي بين اللقطتين بفاصل زمني، مع إيقاف/تشغيل ونقر
 * يدوي مباشر (نصّ المرحلة 17 في الخطّة السابقة (تاريخ Git عند `63a0966`): «العرض المتجاور، المقبض الفاصل، الوميض،
 * وفرق البكسلات»). المؤقِّت والحالة في `ComparePage.tsx` — هذا المكوّن عرضٌ
 * فقط، نفس فصل الحالة/العرض المتّبع في المشروع (`Header`/`Sidebar`).
 */

import { imageBox, percentBoxStyle } from '@/pages/compare/layout'
import { formatHuman } from '@/shared/bidi/numerals'
import { IconButton } from '@/ui/components/IconButton/IconButton'

import styles from './BlinkView.module.css'
import stageStyles from './Stage.module.css'

import type { PixelSize } from '@/pages/compare/layout'
import type { JSX } from 'preact'

export interface BlinkViewProps {
  readonly urlA: string
  readonly urlB: string
  readonly titleA: string
  readonly titleB: string
  readonly sizeA: PixelSize
  readonly sizeB: PixelSize
  readonly stage: PixelSize
  readonly showingA: boolean
  readonly isPlaying: boolean
  readonly onTogglePlay: () => void
  readonly onStep: () => void
}

export function BlinkView({
  urlA,
  urlB,
  titleA,
  titleB,
  sizeA,
  sizeB,
  stage,
  showingA,
  isPlaying,
  onTogglePlay,
  onStep,
}: BlinkViewProps): JSX.Element {
  const currentUrl = showingA ? urlA : urlB
  const currentTitle = showingA ? titleA : titleB
  // كلٌّ بمقاسه في فضاء المسرح — وهذا هو بيت القصيد هنا: صورتان بمقياسين
  // مختلفتين تتبادلان في موضع واحد تنقضان غرض الوميض من أصله لا من تفصيله.
  const currentBox = percentBoxStyle(imageBox(showingA ? sizeA : sizeB, stage))

  return (
    <>
      <img
        src={currentUrl}
        alt={currentTitle}
        class={stageStyles.fillImage}
        draggable={false}
        style={currentBox}
        onClick={onStep}
      />
      <div class={styles.bar}>
        {/* لا أيقونتَي play/pause في مجموعة الـ78 (`icon-data.ts`) — «swap» أقرب
            تسمية معنويّة متاحة (تبديل بين حالتين)، والفرق بين التشغيل والإيقاف
            يظهر عبر `state="selected"` (يضبط aria-pressed داخليًّا) والتسمية
            النصّية لا شكل الأيقونة. */}
        <IconButton
          icon="swap"
          aria-label={isPlaying ? 'إيقاف الوميض التلقائي' : 'تشغيل الوميض التلقائي'}
          state={isPlaying ? 'selected' : 'default'}
          variant="solid"
          onClick={onTogglePlay}
        />
        <span class={styles.label}>
          {formatHuman(showingA ? 1 : 2)} · {currentTitle}
        </span>
      </div>
    </>
  )
}
