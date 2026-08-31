import { cx } from '@/ui/cx'
import { MARK_CUT_24, MARK_CUT_32, MARK_STROKE, type MarkCut } from '@/ui/mark-geometry'

import type { JSX } from 'preact'

/**
 * علامة رصد — قوسا كود يحيطان بفتحة. تقرأ ثلاث قراءات في شكل واحد: وسمًا
 * (`<…>` أي DOM وكود)، وإطار التقاط، وعدسة. مصدرها مكوّن Figma
 * `03 — Logo / Rasd Symbol · v2` بنبرة `Adaptive`.
 *
 * **حدود لا تعبئة.** الشعار مبنيّ من خطّ واحد بسماكة `W`، فتعبيره الطبيعي
 * `stroke` لا مسار مصمت: ثلاثة عناصر بدل مسار outline ضخم، ويحتفظ بدقّته
 * عند أي تحجيم. الهندسة في `mark-geometry.ts` — يشاركها مولِّد أيقونات
 * الإضافة، فلا ينحرف الشعار في الواجهة عن الشعار في شريط الأدوات.
 *
 * **القصّان ليسا تحجيمًا لشكل واحد**: الزاوية واحدة، لكن الأصغر أغلظ خطًّا
 * وأوسع فراغًا وأكبر فتحةً — وإلّا انطمست الفتحة عند 16px.
 * `compact` = قصّ 24 (خطّه 13.3% من الارتفاع)، و`regular` = قصّ 32 (‏12.1%).
 *
 * `currentColor` إلزامي: النبرة التكيّفية تعني أن اللون يأتي من CSS
 * المستدعي (`color: var(--rasd-text-brand)`) لا من قيمة مجمَّدة هنا.
 *
 * المقاس من `.rasd-mark-*` في `base.css` — الارتفاع من سلّم `icon/*`
 * والعرض `auto`. بغير ذلك يرسم المتصفّح `viewBox` بلا `width`/`height`
 * بمقاس الاستبدال الافتراضي (300px) فيطغى على الترويسة.
 */

export type RasdMarkSize = 'compact' | 'regular'

const CUTS: Record<RasdMarkSize, MarkCut> = {
  compact: MARK_CUT_24,
  regular: MARK_CUT_32,
}

export interface RasdMarkProps {
  size?: RasdMarkSize
  class?: string | undefined
  title?: string
}

export function RasdMark({
  size = 'compact',
  class: className,
  title,
}: RasdMarkProps): JSX.Element {
  const cut = CUTS[size]
  const { x, y, w, h, rx } = cut.aperture

  return (
    <svg
      class={cx('rasd-mark', `rasd-mark-${size}`, className)}
      viewBox={cut.viewBox}
      fill="none"
      stroke="currentColor"
      stroke-width={MARK_STROKE}
      stroke-linecap="round"
      stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
    >
      {title ? <title>{title}</title> : null}
      <path d={cut.brackets[0]} />
      <path d={cut.brackets[1]} />
      <rect x={x} y={y} width={w} height={h} rx={rx} />
    </svg>
  )
}
