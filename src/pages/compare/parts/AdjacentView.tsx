/**
 * وضع «متجاور» — العرض المتجاور بمقبض فاصل قابل بالسحب، لا صورتان ثابتتان
 * جنبًا إلى جنب.
 *
 * **قرار محسوم من مراجعة الإطار المرجعي (Figma `127:196`):** مفتاح العرض في
 * الإطار يعرض ثلاث طرق فقط («وميض» · «فرق البكسل» · «متجاور») — بلا خيار
 * منفصل باسم «مقبض فاصل»، خلافًا لنصّ `Rasd_Plan.md §17` الذي يعدّ أربع
 * طرق. القرار: اجعل «متجاور» **هو نفسه** العرض بمقبض فاصل — فيتحقّق نصّ
 * الخطّة (أربع قدرات: متجاور، مقبض، وميض، فرق) داخل ثلاث تبويبات مطابقة
 * للمرجع البصري، بدل صورتين ساكنتين لا حدّ متحرّك بينهما.
 *
 * **`clipPath` فيزيائي مقصود**: يقصّ من حافة الصورة اليسرى الفعلية، لا من
 * بداية القراءة المنطقية — فضاء بكسل الصورة لا اتجاه RTL. نفس تعليل
 * `object-position` في `Stage.module.css`.
 */

import { PageSplitHandle } from './PageSplitHandle'
import styles from './Stage.module.css'

import type { JSX } from 'preact'

export interface AdjacentViewProps {
  readonly urlA: string
  readonly urlB: string
  readonly titleA: string
  readonly titleB: string
  readonly splitPosition: number
  readonly onSplitPositionChange: (percent: number) => void
  readonly measureExtent: () => number
}

export function AdjacentView({
  urlA,
  urlB,
  titleA,
  titleB,
  splitPosition,
  onSplitPositionChange,
  measureExtent,
}: AdjacentViewProps): JSX.Element {
  const clamped = Math.min(100, Math.max(0, splitPosition))

  return (
    <>
      <img src={urlA} alt={titleA} class={styles.fillImage} draggable={false} />
      <img
        src={urlB}
        alt={titleB}
        class={styles.fillImage}
        draggable={false}
        style={{ clipPath: `inset(0 0 0 ${clamped}%)` }}
      />
      <PageSplitHandle
        position={splitPosition}
        onPositionChange={onSplitPositionChange}
        measureExtent={measureExtent}
      />
    </>
  )
}
