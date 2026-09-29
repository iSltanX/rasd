import { cx } from '@/ui/cx'
import {
  horizontalLockup,
  MARK_GRID,
  MARK_SYMBOL,
  markCutFor,
  WORDMARK,
  type MarkPaths,
} from '@/ui/mark-geometry'

import type { JSX } from 'preact'

/**
 * شعار رصد v3 — حلقة مفتوحة على القطر الصاعد، ونقطة معيّنة في مركزها. مصدره مكوّنا
 * Figma `03 — Logo / Rasd Symbol · v3` و`Rasd Lockup · v3` بالدرجة `Adaptive`،
 * والهندسة في `mark-geometry.ts` يشاركها مولِّد أيقونات الإضافة ومولِّد أصول الهوية،
 * فلا ينحرف الشعار في الواجهة عن الشعار في شريط الأدوات.
 *
 * **القصّ يتبع المقاس لا المستدعي:** الصغير (فتحة أوسع ونقطة أكبر) لـ16 و20 بكسل،
 * والعادي من 24 فصاعدًا — وإلّا ذابت الفتحة في تنعيم الحوافّ فقُرئت الحلقة مغلقة.
 *
 * **الدرجتان:** `adaptive` — الحلقة `text/brand` والنقطة والكتابة `text/primary`،
 * فيتبع الوضعين بلا تبديل يدوي. و`mono` — لون واحد يرثه من `color` المستدعي، لما فوق
 * لون العلامة أو الطباعة بلون واحد. الألوان من `.rasd-mark-*` في `base.css`، لا هنا.
 *
 * المقاس من `.rasd-mark-{size}` في `base.css` — الارتفاع من سلّم `icon/*` والعرض
 * `auto` من `viewBox`. بغير ذلك يرسم المتصفّح `viewBox` بلا `width`/`height` بمقاس
 * الاستبدال الافتراضي (300px) فيطغى على الترويسة (`Docs/Engineering.md §6` الصفّ 74).
 */

/** مفاتيح سلّم `icon/*`: ‏16 · 20 · 24 · 32 · 40 بكسل. */
export type RasdMarkSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

export type RasdMarkTone = 'adaptive' | 'mono'

const SIZE_PX: Record<RasdMarkSize, number> = { sm: 16, md: 20, lg: 24, xl: 32, '2xl': 40 }

export interface RasdMarkProps {
  size?: RasdMarkSize
  tone?: RasdMarkTone
  class?: string | undefined
  /** اسم يُقرأ لقارئ الشاشة. بلا عنوان يُخفى الشعار عنه — زخرفة بجوار اسم مكتوب. */
  title?: string
}

function Paths({ paths }: { paths: MarkPaths }): JSX.Element {
  return (
    <>
      <path class="rasd-mark-ring" d={paths.ring} />
      <path class="rasd-mark-nuqta" d={paths.nuqta} />
    </>
  )
}

function a11y(title: string | undefined): {
  role: 'img' | undefined
  'aria-hidden': 'true' | undefined
} {
  return { role: title ? 'img' : undefined, 'aria-hidden': title ? undefined : 'true' }
}

export function RasdMark({
  size = 'md',
  tone = 'adaptive',
  class: className,
  title,
}: RasdMarkProps): JSX.Element {
  const cut = markCutFor(SIZE_PX[size])
  return (
    <svg
      class={cx('rasd-mark', `rasd-mark-${size}`, className)}
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      data-tone={tone}
      data-cut={cut}
      xmlns="http://www.w3.org/2000/svg"
      {...a11y(title)}
    >
      {title ? <title>{title}</title> : null}
      <Paths paths={MARK_SYMBOL[cut]} />
    </svg>
  )
}

/** القفل الأفقي محسوبًا مرّة: الرمز يمين الكلمة، والارتفاع قطر الرمز. */
const LOCKUP = horizontalLockup()

/** مفاتيح سلّم `icon/*` التي يصحّ عندها القفل — لا قفل دون 20 بكسل (دليل الهوية). */
export type RasdLockupSize = 'md' | 'lg' | 'xl' | '2xl'

export interface RasdLockupProps {
  size?: RasdLockupSize
  tone?: RasdMarkTone
  class?: string | undefined
  title?: string
}

/**
 * القفل الأفقي: «رصد» وعن يمينها الرمز، بالقصّ العادي دائمًا كما في مكوّن Figma.
 * الكتابة مسارات لا نصّ — تطابق القفل في المتجر وأصول الهوية ولا تعتمد على تحميل الخطّ.
 */
export function RasdLockup({
  size = 'xl',
  tone = 'adaptive',
  class: className,
  title,
}: RasdLockupProps): JSX.Element {
  const { word } = LOCKUP
  return (
    <svg
      class={cx('rasd-mark', 'rasd-lockup', `rasd-mark-${size}`, className)}
      viewBox={`0 0 ${LOCKUP.width} ${LOCKUP.height}`}
      data-tone={tone}
      xmlns="http://www.w3.org/2000/svg"
      {...a11y(title)}
    >
      {title ? <title>{title}</title> : null}
      <path
        class="rasd-mark-word"
        transform={`translate(${word.x} ${word.y}) scale(${word.scale})`}
        d={WORDMARK.paths.join(' ')}
      />
      <Paths paths={LOCKUP.mark} />
    </svg>
  )
}
