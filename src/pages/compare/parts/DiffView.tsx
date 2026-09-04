/**
 * وضع «فرق البكسل» — الخريطة الحرارية مركَّبة فوق صورة ب، ومستطيلات المناطق
 * فوقها مرقَّمة وقابلة للنقر.
 *
 * **مركَّبة فوق ب («بعد») لا أ — قرار ثابت لا عشوائي.** كلا الاتجاهين صالح
 * رياضيًّا (`diff.ts` يقارن التقاطع بلا تفضيل)، واختيار «بعد» يطابق تقارب
 * أدوات الفحص البصري الشائعة: المستخدم يقرأ «أين تغيّرت النسخة الحالية عن
 * السابقة» فوق النسخة الحالية نفسها.
 *
 * **الصورة الأساس مخفَّفة اللون (`filter: grayscale`) لإبراز الخريطة
 * الحرارية فوقها** — يطابق إطار Figma المرجعي `127:196`.
 *
 * **`diff` تُرسَم بقماش حقيقي لا `<img>`**: `DiffOutcome.diff` مصفوفة بكسل
 * خام (`RasterImage`)، و`putImageData` يرسمها مباشرة بلا ترميز/فكّ وسيط.
 *
 * **`extraInA`/`extraInB` تُعلَّمان صراحةً** (`Rasd_Plan.md §17`: «تعليم
 * المنطقة الزائدة صراحةً بدل رفض المقارنة») — تهشير محايد (`tool/compare`
 * لا `tool/diff/added`·`removed`: هذا «لم يُقارَن» لا «تغيّر»، تصنيف مختلف
 * تمامًا). شريط `extraInA` يملأ فراغًا حقيقيًّا في المسرح (ب لا تصل إليه
 * أصلًا، فلا شيء تحته)؛ وشريط `extraInB` يُهشَّر **فوق** محتوى ب المرئي —
 * كان سيبدو مقارَنًا بصمت وهو ليس كذلك بلا هذا التمييز.
 */

import { useEffect, useRef } from 'preact/hooks'

import {
  extraStripBoxes,
  percentBox,
  percentBoxStyle,
  type PixelSize,
} from '@/pages/compare/layout'
import { cx } from '@/ui/cx'

import styles from './DiffView.module.css'
import stageStyles from './Stage.module.css'

import type { ExtraStrip, RasterImage } from '@/modules/compare/diff'
import type { RegionItem } from '@/pages/compare/region-format'
import type { DeviceRect } from '@/shared/geometry'
import type { JSX } from 'preact'

export interface DiffViewProps {
  readonly baseUrl: string
  readonly baseTitle: string
  readonly stage: PixelSize
  readonly diff: RasterImage
  readonly overlap: DeviceRect
  readonly extraInA: ExtraStrip
  readonly extraInB: ExtraStrip
  readonly regionItems: readonly RegionItem[]
  readonly selectedIndex: number | null
  readonly onSelectRegion: (index: number) => void
}

export function DiffView({
  baseUrl,
  baseTitle,
  stage,
  diff,
  overlap,
  extraInA,
  extraInB,
  regionItems,
  selectedIndex,
  onSelectRegion,
}: DiffViewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (diff.width > 0 && diff.height > 0) {
      // نسخ عبر مُنشئ `ArrayLike<number>` لا عرض فوق `.buffer` القائم — `RasterImage.data`
      // مطبوع `Uint8ClampedArray<ArrayBufferLike>` (تعارض `ArrayBuffer`/`SharedArrayBuffer`
      // حين تجتمع مكتبتا `DOM` و`WebWorker`، `tsconfig.json`)، والنسخ يخصّص مخزنًا جديدًا
      // مطبوعًا `ArrayBuffer` بحتًا فيرضي `ImageData` — لا فرقٌ في وقت التشغيل.
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(diff.data), diff.width, diff.height),
        0,
        0,
      )
    }
  }, [diff])

  const overlapBox = percentBoxStyle(percentBox(overlap, stage))
  const extraBoxes = extraStripBoxes(extraInA, extraInB, stage)

  return (
    <>
      <img
        src={baseUrl}
        alt={baseTitle}
        class={cx(stageStyles.fillImage, styles.desaturated)}
        draggable={false}
      />
      <canvas
        ref={canvasRef}
        width={diff.width}
        height={diff.height}
        class={stageStyles.overlayBox}
        style={overlapBox}
      />
      {extraBoxes.map(({ key, box }) => (
        <div key={key} class={styles.extraStrip} style={percentBoxStyle(box)}>
          <span class={styles.extraStripLabel}>غير مُقارَن</span>
        </div>
      ))}
      {regionItems.map((item, index) => {
        const box = percentBoxStyle(percentBox(item.region.rect, stage))
        const selected = index === selectedIndex
        return (
          <button
            key={item.region.id}
            type="button"
            class={cx(styles.regionBox, selected && styles.regionBoxSelected)}
            style={box}
            aria-pressed={selected}
            aria-label={`منطقة ${item.label}`}
            onClick={() => onSelectRegion(index)}
          >
            <span class={styles.badge}>{item.label}</span>
          </button>
        )
      })}
    </>
  )
}
