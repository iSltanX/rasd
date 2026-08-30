import { useEffect, useRef } from 'preact/hooks'

import { TechnicalValue } from '@/ui/TechnicalValue'

import { at, type Point } from './geometry'

import type { JSX } from 'preact'

/** بكسل واحد من الرقعة — نفس شكل `content/sampler.ts` بلا استيراد منه. */
export interface LoupePixel {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export interface LoupeProps {
  /** مركز العدسة بإحداثيات النافذة — موضع المؤشِّر. */
  point: Point
  /**
   * الرقعة `cells × cells` بترتيب الصفوف، أو `null` قبل وصول اللقطة.
   *
   * `null` يعرض قرصًا فارغًا لا لونًا مُخترعًا — وهو نفسه إطار الخمول
   * `98:470` في الملفّ.
   */
  patch: readonly LoupePixel[] | null
  /** جانب الشبكة — فرديّ كي يكون للمركز خلية واحدة. */
  cells: number
  /** القيمة السداسية المعروضة تحت العدسة؛ `null` يخفي الشارة. */
  hex: string | null
}

/** قطر القرص — `65:48` في الملفّ. */
const DIAMETER = 72

/** قطر حلقة المركز الفارغة — `65:49`. */
const CENTRE = 14

/** المسافة بين أسفل القرص وأعلى الشارة — 458 − 448 في الملفّ. */
const BADGE_GAP = 10

/**
 * `Colors / Loupe` — عدسة مكبِّرة تتبع المؤشِّر.
 *
 * **الشكل من الملفّ والمحتوى من الخطّة، وبينهما فرق مسجَّل.** إطار Figma
 * `65:2` يرسم القرص **لونًا مصمتًا**، والخطّة تفرض «شبكة بكسلات مكبَّرة مع
 * البكسل المركزي محدَّدًا» (`§6.6`). والقرص المصمت لا يؤدّي وظيفة العدسة
 * أصلًا: من يقف على حدّ بين لونين لا يعرف أي البكسلين سيأخذ. فبُنيت
 * بالهندسة نفسها حرفًا بحرف — 72px، حلقة بيضاء 3px، حلقة مركز 14px، شارة
 * سداسية 10px تحتها — وبمحتوى الخطّة: بكسلات حقيقية مكبَّرة. مسجَّل في
 * `Rasd_Plan.md §6`، ويُصحَّح الملفّ في المرحلة 26أ.
 *
 * **والأصناف `rasd-ov-clp-*` لا `rasd-ov-loupe`**: ذاك الاسم مأخوذ منذ
 * المرحلة 6 لقرص `Crosshair` المصمت (56px بحلقة سوداء، لأداة الالتقاط).
 * والاثنان يتعايشان: خطّا التصويب من `Crosshair` نفسه يخدمان هذا الوضع
 * بلا تكرار — لونهما `--rasd-tool-capture-fg` وهو `#00e3c9`، وهو نفسه ما
 * يرسمه الملفّ في `65:46` و`65:47`.
 *
 * **قماش لا 441 عنصرًا.** الشبكة 21×21 تعني 441 عقدة تُعاد مع كل حركة
 * مؤشِّر. والقماش يرسمها بعمليّة واحدة: `putImageData` على قماش 21×21 ثم
 * `drawImage` مكبَّرًا بـ`imageSmoothingEnabled = false` — فتبقى البكسلات
 * مربّعات حادّة لا لطخات مموّهة، وهي جوهر الفائدة هنا.
 */
export function Loupe({ point, patch, cells, hex }: LoupeProps): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, DIAMETER, DIAMETER)
    if (!patch || patch.length !== cells * cells) return

    // قماش وسيط بحجم الشبكة نفسها، ثم تكبيره — الطريق الوحيد الذي يبقي
    // حدود البكسلات حادّة بلا رسم كل خلية على حدة.
    const src = new ImageData(cells, cells)
    for (let i = 0; i < patch.length; i++) {
      const p = patch[i]!
      src.data[i * 4] = p.r
      src.data[i * 4 + 1] = p.g
      src.data[i * 4 + 2] = p.b
      src.data[i * 4 + 3] = p.a
    }

    const off = new OffscreenCanvas(cells, cells)
    const offCtx = off.getContext('2d')
    if (!offCtx) return
    offCtx.putImageData(src, 0, 0)

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, cells, cells, 0, 0, DIAMETER, DIAMETER)
  }, [patch, cells])

  return (
    <div class="rasd-ov-place rasd-ov-clp" style={at(point)} data-rasd-ov="loupe">
      <div class="rasd-ov-clp-disc">
        <canvas ref={canvas} width={DIAMETER} height={DIAMETER} class="rasd-ov-clp-grid" />
        {/*
          حلقة المركز تُرسَم فوق القماش لا داخله: لو رُسمت في البكسلات
          لغطّت البكسل الذي تشير إليه — وهو الوحيد الذي يهمّ.
        */}
        <span class="rasd-ov-clp-centre" />
      </div>
      {hex ? (
        <span class="rasd-ov-clp-hex">
          <TechnicalValue>{hex.toUpperCase()}</TechnicalValue>
        </span>
      ) : null}
    </div>
  )
}

/** أبعاد العدسة — تُقرأ من `overlay-app` لوضع الأدلّة والشارة. */
export const LOUPE_GEOMETRY = { diameter: DIAMETER, centre: CENTRE, badgeGap: BADGE_GAP } as const
