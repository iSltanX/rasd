/**
 * تجميع بكسلات الفرق في مناطق مستطيلة مرقَّمة — رياضيات خالصة، بلا `pixelmatch`
 * وبلا معرفة بمصدر القناع. تستهلك `mask` الخارج من `diff.ts` مباشرةً.
 *
 * **الانتفاخ (dilate) قبل التجميع قرارٌ متعمَّد لا حياد.** فرقٌ حقيقي واحد
 * يتوزّع غالبًا على بكسلات متجاورة لا متلاصقة تمامًا (حواف مضادّة للتعرّج
 * مرفوضة، أو نصّ بمسافات بين حروفه) — وبلا انتفاخ يتفتّت إلى عشرات المناطق
 * أحادية البكسل، وهو أعطل للتنقّل البشري من صورة فرق خام لا يحلّها الترقيم.
 * نصف قطر 4px افتراضيًّا يدمج ما هو «نفس التغيير» بصريًّا بلا دمج تغييرين
 * منفصلين حقًّا فوق مسافة معقولة.
 *
 * **الانتفاخ بتمريرتين منفصولتين (أفقية ثم عمودية) لا نافذة ثنائية الأبعاد.**
 * نافذة انزلاقية بمجموع متراكم لكل تمريرة تعطي O(البكسلات) بصرف النظر عن نصف
 * القطر — والبديل الساذج (فحص كل جوار مربّع حول كل بكسل) O(البكسلات × نق²)،
 * وعلى 4000×3000 بنق=4 فرقٌ حقيقي بين ثوانٍ وعشرات الثواني.
 *
 * **الاتصال بثماني جهات لا أربع** بعد الانتفاخ — يدمج المناطق المتجاورة
 * قطريًّا، وهو ما يريده مستخدم يقرأ «كم تغيّر هنا» لا طوبولوجيا صارمة.
 *
 * **مساحة كل منطقة مُبلَّغة من القناع الأصلي غير المنتفخ.** الانتفاخ يُقرِّب
 * حدود المستطيل للقراءة، لكن عدّ «كم بكسلًا اختلف فعلًا» يكذب لو حُسب على
 * نسخة منتفخة — تضخيم مصطنع لنسبة كل منطقة على حدة.
 */

import { deviceRect, type DeviceRect } from '@/shared/geometry'

export interface DiffRegion {
  /** ترقيم بشري تصاعدي من 1 — يُعرَض بأرقام هندية في الواجهة (معيار §3.5). */
  readonly id: number
  /** بإحداثيات `overlap` من `diff.ts`، لا الصورة الأصلية كاملة. */
  readonly rect: DeviceRect
  /** بكسلات الفرق الحقيقية (غير المنتفخة) داخل هذا المستطيل. */
  readonly pixels: number
}

export interface RegionOptions {
  /** نصف قطر الدمج بالبكسل. صفر يعطّل الانتفاخ (اتصال ثماني خام فقط). */
  readonly dilate: number
  /** أقلّ عدد بكسلات فرق حقيقية ليُحتسب منطقة — يُسقط الضجيج أحادي البكسل. */
  readonly minPixels: number
}

export const DEFAULT_REGION_OPTIONS: RegionOptions = {
  dilate: 4,
  minPixels: 4,
}

/** تمريرة صندوقية أحادية البُعد بنافذة انزلاقية — O(الطول)، أيًّا كان نصف القطر. */
function boxPass(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): Uint8Array {
  const out = new Uint8Array(src.length)
  const outerLen = horizontal ? height : width
  const innerLen = horizontal ? width : height
  const at = (outer: number, inner: number): number =>
    horizontal ? outer * width + inner : inner * width + outer

  for (let o = 0; o < outerLen; o++) {
    let count = 0
    for (let i = -radius; i < innerLen; i++) {
      const add = i + radius
      if (add < innerLen && (src[at(o, add)] ?? 0)) count++
      const remove = i - radius - 1
      if (remove >= 0 && (src[at(o, remove)] ?? 0)) count--
      if (i >= 0) out[at(o, i)] = count > 0 ? 1 : 0
    }
  }
  return out
}

function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask
  const horizontally = boxPass(mask, width, height, radius, true)
  return boxPass(horizontally, width, height, radius, false)
}

interface MutableBounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * يجمّع قناعًا بكسليًّا مسطّحًا (`1` = فرق) في مستطيلات مرقَّمة.
 *
 * ترتيب الترقيم **راستر**: من الأعلى إلى الأسفل ثم من اليسار إلى اليمين —
 * فضاء بكسل الصورة لا اتجاه الصفحة، فلا علاقة له باتجاه RTL للواجهة المحيطة.
 */
export function groupDiffRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  options: Partial<RegionOptions> = {},
): DiffRegion[] {
  const opts: RegionOptions = { ...DEFAULT_REGION_OPTIONS, ...options }
  if (width <= 0 || height <= 0 || mask.length !== width * height) return []

  const grown = dilate(mask, width, height, opts.dilate)
  const labels = new Int32Array(width * height).fill(-1)
  let labelCount = 0

  // مكدّس نموّ ديناميكي — لا تخصيص بحجم أسوأ حالة (البكسلات كلّها)، فحجمه
  // يتبع فعليًّا مساحة الفرق لا مساحة الصورة.
  const stack: number[] = []

  // تمريرة الاتصال: تُسمِّي فوق **القناع المنتفخ** — الانتفاخ أداة قرار
  // الدمج وحدها، لا مصدر حدود المستطيل (انظر التمريرة التالية).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (!grown[start] || labels[start] !== -1) continue

      const label = labelCount++
      labels[start] = label
      stack.push(start)

      while (stack.length > 0) {
        const idx = stack.pop() as number
        const cx = idx % width
        const cy = (idx - cx) / width

        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy
          if (ny < 0 || ny >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = cx + dx
            if (nx < 0 || nx >= width) continue
            const nIdx = ny * width + nx
            if (!grown[nIdx] || labels[nIdx] !== -1) continue
            labels[nIdx] = label
            stack.push(nIdx)
          }
        }
      }
    }
  }

  /*
   * **الحدود والمساحة كلاهما من القناع الأصلي غير المنتفخ — لا المنتفخ.**
   * الانتفاخ أداة قرار «هل هذان عنقودان متجاوران يُدمَجان؟» فقط؛ استخدامه
   * لحساب حدود المستطيل أيضًا كان يُخرج صندوقًا أكبر من الفرق الحقيقي
   * بمقدار نصف قطر الانتفاخ على كل جهة — تضخيمًا صامتًا لا تقريبًا للقراءة.
   * فكل بكسل حقيقي مُصنَّف بلا استثناء (`grown` يحوي `mask` نقطيًّا دومًا،
   * إذ الانتفاخ لا يُسقط بكسلًا مصدره)، فهذه التمريرة تلتقط كل تسمية بدقّة.
   */
  const bounds: MutableBounds[] = Array.from({ length: labelCount }, () => ({
    x0: Infinity,
    y0: Infinity,
    x1: -Infinity,
    y1: -Infinity,
  }))
  const pixelCounts = new Array<number>(labelCount).fill(0)

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const label = labels[i] ?? -1
    if (label === -1) continue
    const x = i % width
    const y = (i - x) / width
    const b = bounds[label]
    if (!b) continue
    if (x < b.x0) b.x0 = x
    if (x > b.x1) b.x1 = x
    if (y < b.y0) b.y0 = y
    if (y > b.y1) b.y1 = y
    pixelCounts[label] = (pixelCounts[label] ?? 0) + 1
  }

  return bounds
    .map((b, i) => ({ bounds: b, pixels: pixelCounts[i] ?? 0 }))
    .filter((r) => r.pixels >= opts.minPixels)
    .sort((r1, r2) => r1.bounds.y0 - r2.bounds.y0 || r1.bounds.x0 - r2.bounds.x0)
    .map((r, i) => ({
      id: i + 1,
      rect: deviceRect(
        r.bounds.x0,
        r.bounds.y0,
        r.bounds.x1 - r.bounds.x0 + 1,
        r.bounds.y1 - r.bounds.y0 + 1,
      ),
      pixels: r.pixels,
    }))
}
