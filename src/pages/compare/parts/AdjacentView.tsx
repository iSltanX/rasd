/**
 * وضع «متجاور» — العرض المتجاور بمقبض فاصل قابل بالسحب، لا صورتان ثابتتان
 * جنبًا إلى جنب.
 *
 * **قرار محسوم من مراجعة الإطار المرجعي (Figma `127:196`):** مفتاح العرض في
 * الإطار يعرض ثلاث طرق فقط («وميض» · «فرق البكسل» · «متجاور») — بلا خيار
 * منفصل باسم «مقبض فاصل»، خلافًا لنصّ نصّ المرحلة 17 في الخطّة السابقة (تاريخ Git عند `63a0966`) الذي يعدّ أربع
 * طرق. القرار: اجعل «متجاور» **هو نفسه** العرض بمقبض فاصل — فيتحقّق نصّ
 * الخطّة (أربع قدرات: متجاور، مقبض، وميض، فرق) داخل ثلاث تبويبات مطابقة
 * للمرجع البصري، بدل صورتين ساكنتين لا حدّ متحرّك بينهما.
 *
 * **`clipPath` فيزيائي مقصود**: يقصّ من حافة الصورة اليسرى الفعلية، لا من
 * بداية القراءة المنطقية — فضاء بكسل الصورة لا اتجاه RTL.
 *
 * **وموضع القصّ يُحوَّل إلى فضاء الصورة قبل استعماله.** المقبض يتحرّك في فضاء
 * المسرح، بينما `inset(0 0 0 X%)` يقيس من عرض الصورة المقصوصة نفسها. فما دامت
 * الصورة أضيق من المسرح، القيمتان مختلفتان: مقبضٌ عند منتصف المسرح يقصّ عند
 * موضعٍ آخر من الصورة. لم يظهر هذا قبل اليوم لأن `object-fit: contain` كان
 * يفرش الصورة على الحاوية كاملةً — وهو نفسه العطل الذي أُصلح بـ`imageBox`،
 * فالانحرافان وجهان لخللٍ واحد في اختيار الفضاء.
 */

import { imageBox, percentBoxStyle, splitPercentInImage } from '@/pages/compare/layout'

import { PageSplitHandle } from './PageSplitHandle'
import styles from './Stage.module.css'

import type { PixelSize } from '@/pages/compare/layout'
import type { JSX } from 'preact'

export interface AdjacentViewProps {
  readonly urlA: string
  readonly urlB: string
  readonly titleA: string
  readonly titleB: string
  readonly sizeA: PixelSize
  readonly sizeB: PixelSize
  readonly stage: PixelSize
  readonly splitPosition: number
  readonly onSplitPositionChange: (percent: number) => void
  readonly measureExtent: () => number
}

export function AdjacentView({
  urlA,
  urlB,
  titleA,
  titleB,
  sizeA,
  sizeB,
  stage,
  splitPosition,
  onSplitPositionChange,
  measureExtent,
}: AdjacentViewProps): JSX.Element {
  const clamped = Math.min(100, Math.max(0, splitPosition))
  const clipInB = splitPercentInImage(clamped, sizeB, stage)

  return (
    <>
      <img
        src={urlA}
        alt={titleA}
        class={styles.fillImage}
        draggable={false}
        style={percentBoxStyle(imageBox(sizeA, stage))}
      />
      <img
        src={urlB}
        alt={titleB}
        class={styles.fillImage}
        draggable={false}
        style={{ ...percentBoxStyle(imageBox(sizeB, stage)), clipPath: `inset(0 0 0 ${clipInB}%)` }}
      />
      <PageSplitHandle
        position={splitPosition}
        onPositionChange={onSplitPositionChange}
        measureExtent={measureExtent}
      />
    </>
  )
}
