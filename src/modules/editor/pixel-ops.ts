/**
 * عمليات البكسل — التغطية والبكسلة والضباب على مخزن خام.
 *
 * **محرِّك واحد للمعاينة وللخبز.** لو استُعملت `ctx.filter` في المعاينة
 * و`pixel-ops` في الخبز لضبط المستخدم الشدّة على ما يراه ثم صدَّر شيئًا آخر —
 * وهو أسوأ من عطلٍ ظاهر، لأنه يبدو صحيحًا حتى يُفتَح الملفّ عند غيره.
 * ولذلك `ctx.filter` محظورة في المُصيِّر ومثبَّتٌ حظرها باختبار.
 *
 * **والمخزن يُوصَف بنيويًّا لا بـ`ImageData`.** الدرس نفسه الذي فرض `Ctx2D`:
 * النوع البنيوي يقبل `ImageData` الحقيقية ويقبل كائنًا يبنيه اختبار، فتُختبَر
 * الحسابات بلا قماش. وهنا يزيد سبب ثانٍ: هذه الوحدة تعمل في الـworker أيضًا،
 * وربطها بنوع مستند يجعل حدود الطبقات دعوى لا حقيقة.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import type { ObscureMode } from './scene'

/** مستطيل بفضاء المخزن — بكسلات صحيحة، لا فضاء هندسي مسمّى. */
export interface PixelRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface RGBA {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

/** ما تحتاجه هذه الوحدة من `ImageData` — وهي تُحقّقه بنيويًّا. */
export interface PixelBuffer {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

/** ثابت SVG: `3·√(2π)/4`. */
const SVG_BOX_K = (3 * Math.sqrt(2 * Math.PI)) / 4

/**
 * يقصّ مستطيلًا على حدود المخزن. `null` حين لا يتبقّى شيء.
 *
 * التقريب **للخارج** في المصدر وللداخل عند الحدّ: نصف بكسل مقصوص من طرف
 * منطقة حجب يترك صفًّا من المحتوى الحسّاس سليمًا. والزيادة لا تكلّف شيئًا.
 */
export function clampToBuffer(r: PixelRect, width: number, height: number): PixelRect | null {
  const x0 = Math.max(0, Math.floor(r.x))
  const y0 = Math.max(0, Math.floor(r.y))
  const x1 = Math.min(width, Math.ceil(r.x + r.w))
  const y1 = Math.min(height, Math.ceil(r.y + r.h))
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * التدمير الكامل — العملية الوحيدة التي تُسمّى «حجبًا».
 *
 * **الألفا تُفرَض 255 هنا** مهما كان `stroke.opacity` ومهما جاء في `c.a`.
 * تغطيةٌ بتسعين بالمئة — كما يرسمها ملفّ التصميم في ثلاثة من أربعة حجوب —
 * تُفكّ حسابيًّا بفكّ مزج ألفا معروف على خلفية معروفة، فتُنتج تقرير حجب
 * يقول «مضمون» عن منطقة قابلة للاسترجاع. انظر ADR 0015.
 */
export function coverRegion(img: PixelBuffer, r: PixelRect, c: RGBA): void {
  const box = clampToBuffer(r, img.width, img.height)
  if (!box) return
  const { data, width } = img
  // أسماء القنوات مختصرة عمدًا: بوّابة التوكنز تقرأ `red`/`green`/`blue`
  // أسماءَ ألوان CSS، وهي هنا بايتات لا تنسيقًا.
  const cr = c.r & 255
  const cg = c.g & 255
  const cb = c.b & 255

  for (let y = box.y; y < box.y + box.h; y++) {
    let i = (y * width + box.x) * 4
    for (let x = 0; x < box.w; x++) {
      data[i] = cr
      data[i + 1] = cg
      data[i + 2] = cb
      data[i + 3] = 255
      i += 4
    }
  }
}

/**
 * تدمير جزئي — متوسّط كل خليّة يُكتب على كل بكسل فيها.
 *
 * **الخلايا تُحاذى إلى أصل المنطقة لا إلى أصل الصورة.** المحاذاة إلى الصورة
 * تجعل تحريك الحجب بكسلًا واحدًا يغيّر كل الخلايا، فترتعش المعاينة أثناء
 * السحب بلا سبب يراه المستخدم.
 */
export function pixelateRegion(img: PixelBuffer, r: PixelRect, cellPx: number): void {
  const box = clampToBuffer(r, img.width, img.height)
  if (!box) return
  const cell = Math.max(1, Math.floor(cellPx))
  if (cell === 1) return

  const { data, width } = img

  for (let cy = box.y; cy < box.y + box.h; cy += cell) {
    const yEnd = Math.min(cy + cell, box.y + box.h)
    for (let cx = box.x; cx < box.x + box.w; cx += cell) {
      const xEnd = Math.min(cx + cell, box.x + box.w)

      /*
       * المتوسّط **مضروبٌ مسبقًا بألفا**: جمعُ ألوان بكسلات شفّافة كما هي
       * يُدخل لون بكسل ألفاه صفر في الحساب بوزن كامل، فينزف لونٌ لا يراه
       * أحد إلى ما حوله.
       */
      let sr = 0
      let sg = 0
      let sb = 0
      let sa = 0
      let n = 0
      for (let y = cy; y < yEnd; y++) {
        let i = (y * width + cx) * 4
        for (let x = cx; x < xEnd; x++) {
          const a = data[i + 3]!
          sr += (data[i]! * a) / 255
          sg += (data[i + 1]! * a) / 255
          sb += (data[i + 2]! * a) / 255
          sa += a
          n++
          i += 4
        }
      }
      if (n === 0) continue

      const aAvg = sa / n
      const unmul = aAvg > 0 ? 255 / aAvg : 0
      const rAvg = Math.round((sr / n) * unmul)
      const gAvg = Math.round((sg / n) * unmul)
      const bAvg = Math.round((sb / n) * unmul)
      const aOut = Math.round(aAvg)

      for (let y = cy; y < yEnd; y++) {
        let i = (y * width + cx) * 4
        for (let x = cx; x < xEnd; x++) {
          data[i] = rAvg
          data[i + 1] = gAvg
          data[i + 2] = bAvg
          data[i + 3] = aOut
          i += 4
        }
      }
    }
  }
}

/**
 * مرور صندوق واحد — بحجمه **وبمدى فهارسه**.
 *
 * `lo`/`hi` جزء من العقد لا تفصيلة تنفيذ: ثلاثيّةُ أحجامٍ وحدها لا تميّز
 * الفرع الزوجي، واختبارٌ يقارن الأحجام يمرّ على تمويه منحرف **بكسلًا كاملًا**
 * (مقيس: مركز كتلة النبضة ينتقل من 20 إلى 21 حين تُزاح النافذتان في الجهة
 * نفسها بدل جهتين متعاكستين).
 */
export interface BoxPass {
  readonly size: number
  readonly shift: -1 | 0 | 1
  /** أدنى إزاحة فهرس تُقرأ لبكسل الخرج، شاملة. */
  readonly lo: number
  /** أقصى إزاحة فهرس تُقرأ لبكسل الخرج، شاملة. */
  readonly hi: number
}

/**
 * **SVG 1.1 §15.17 حرفيًّا.**
 *
 *   d = floor(σ · 3·√(2π)/4 + 0.5)
 *   d فردي ⇒ ثلاثة صناديق بحجم d مركزها بكسل الخرج
 *   d زوجي ⇒ صندوقان بحجم d — الأوّل مركزه الحدّ **الأيسر** للبكسل والثاني
 *            الحدّ **الأيمن** — ثمّ صندوق بحجم d+1 مركزه البكسل
 *
 * و«مركزه الحدّ الأيسر» تعني بالفهارس: الحدّ بين البكسل i وما قبله يقع عند
 * ‎i−0.5‎، فنافذةٌ عرضها d حوله تغطّي ‎[i−d/2, i+d/2−1]‎. والأيمن مرآتها.
 *
 * **و`d ≤ 1` يعني نافذة بكسل واحد، أي لا شيء.** مقيس: أي σ دون 0.798 يعطي
 * `d ≤ 1`، فشريط شدّة يبدأ من الصفر يعطي المستخدم مدًى كاملًا لا يفعل شيئًا.
 */
export function boxPassesForSigma(sigma: number): readonly [BoxPass, BoxPass, BoxPass] {
  const d = Math.floor(Math.max(0, sigma) * SVG_BOX_K + 0.5)

  if (d <= 1) {
    const nop: BoxPass = { size: 1, shift: 0, lo: 0, hi: 0 }
    return [nop, nop, nop]
  }

  if (d % 2 === 1) {
    const r = (d - 1) / 2
    const p: BoxPass = { size: d, shift: 0, lo: -r, hi: r }
    return [p, p, p]
  }

  const r = d / 2
  return [
    { size: d, shift: -1, lo: -r, hi: r - 1 },
    { size: d, shift: 1, lo: -r + 1, hi: r },
    { size: d + 1, shift: 0, lo: -r, hi: r },
  ]
}

/**
 * نصف قطر النواة المركّبة — مجموع أنصاف أقطار المرورات الثلاثة.
 *
 * **وهو أكبر من `ceil(2σ)`**: عند σ=18 يبلغ 50 بكسلًا مقابل 36، أي أربعة
 * عشر بكسلًا من المساهمة الحقيقية تُستبدَل ببكسلات حافّة مكرّرة إن اكتُفي
 * بالتقدير الشائع. والأثر هالةٌ عند حدّ المنطقة، **وتباعدُ المعاينة عن
 * الخبز** إن استعمل كلٌّ منهما هامشًا مختلفًا.
 */
export function blurRadius(sigma: number): number {
  const [a, b, c] = boxPassesForSigma(sigma)
  return Math.max(-(a.lo + b.lo + c.lo), a.hi + b.hi + c.hi)
}

/**
 * هامش أخذ العيّنة حول المنطقة — ما يجب أن يحمله المخزن الممرَّر.
 *
 * التغطية لا تقرأ شيئًا، والبكسلة لا تنتشر خارج خليّتها، والضباب وحده يمتدّ.
 */
export function bleedMargin(mode: ObscureMode, strength: number): number {
  if (mode === 'blur') return blurRadius(strength)
  return 0
}

/** بايتات المخزن الوسيط لتمويه منطقة — للمستدعي كي يخطّط قبل التخصيص. */
export function blurWorkBytes(r: PixelRect, sigma: number): number {
  const m = blurRadius(sigma)
  return (r.w + 2 * m) * (r.h + 2 * m) * 4 * Float32Array.BYTES_PER_ELEMENT
}

/** مرور صندوق على خطّ رباعي القنوات، بحوافّ ممدَّدة. */
function boxLine(src: Float32Array, dst: Float32Array, n: number, lo: number, hi: number): void {
  const size = hi - lo + 1
  const inv = 1 / size

  for (let ch = 0; ch < 4; ch++) {
    // الحافّة **ممدَّدة** لا صفرية: الصفر يعني أسود شفّاف، فيُظلم طرف كل
    // منطقة تلامس حدّ الصورة بدل أن يمتدّ لونها.
    const at = (j: number): number => src[(j < 0 ? 0 : j >= n ? n - 1 : j) * 4 + ch]!

    let sum = 0
    for (let j = lo; j <= hi; j++) sum += at(j)

    for (let i = 0; i < n; i++) {
      dst[i * 4 + ch] = sum * inv
      sum -= at(i + lo)
      sum += at(i + hi + 1)
    }
  }
}

/**
 * ضباب صندوقي ثلاثي على منطقة داخل المخزن.
 *
 * **المنطقة وجهة الكتابة، والقراءة تتجاوزها** إلى `blurRadius(σ)` حولها من
 * المخزن نفسه. فالمستدعي يمرّر مخزنًا يحمل الهامش، ولا يُقصّ إلّا عند حدود
 * الصورة الحقيقية — وهناك الامتداد صحيح.
 *
 * والفصل قابل للفصل (separable): مرورٌ أفقي ثمّ رأسي، فالكلفة `O(1)` لكل
 * بكسل مستقلّةً عن نصف القطر بفضل المجموع المتحرّك.
 */
export function blurRegion(img: PixelBuffer, r: PixelRect, sigma: number): void {
  const dst = clampToBuffer(r, img.width, img.height)
  if (!dst) return

  const passes = boxPassesForSigma(sigma)
  if (passes[0].size === 1 && passes[2].size === 1) return

  const m = blurRadius(sigma)
  const work = clampToBuffer(
    { x: dst.x - m, y: dst.y - m, w: dst.w + 2 * m, h: dst.h + 2 * m },
    img.width,
    img.height,
  )
  if (!work) return

  const { data, width } = img
  const ww = work.w
  const wh = work.h

  /*
   * الوسيط **مضروب مسبقًا بألفا**. بدونه ينزف لون البكسلات الشفّافة إلى
   * جيرانها: بكسلٌ ألفاه صفر يحمل لونًا عشوائيًّا يدخل المتوسّط بوزن كامل،
   * فتظهر حاشية ملوّنة حول كل حافّة شبه شفّافة.
   */
  const hbuf = new Float32Array(ww * wh * 4)
  const lineA = new Float32Array(Math.max(ww, wh) * 4)
  const lineB = new Float32Array(Math.max(ww, wh) * 4)

  // ── المرور الأفقي: صفًّا صفًّا ─────────────────────────────────
  for (let y = 0; y < wh; y++) {
    let si = ((work.y + y) * width + work.x) * 4
    for (let x = 0; x < ww; x++) {
      const a = data[si + 3]!
      const k = a / 255
      const li = x * 4
      lineA[li] = data[si]! * k
      lineA[li + 1] = data[si + 1]! * k
      lineA[li + 2] = data[si + 2]! * k
      lineA[li + 3] = a
      si += 4
    }

    boxLine(lineA, lineB, ww, passes[0].lo, passes[0].hi)
    boxLine(lineB, lineA, ww, passes[1].lo, passes[1].hi)
    boxLine(lineA, lineB, ww, passes[2].lo, passes[2].hi)

    hbuf.set(lineB.subarray(0, ww * 4), y * ww * 4)
  }

  // ── المرور الرأسي: عمودًا عمودًا، ويُكتَب داخل الوجهة وحدها ─────
  const colOffsetX = dst.x - work.x
  const colOffsetY = dst.y - work.y

  for (let x = 0; x < dst.w; x++) {
    const wx = colOffsetX + x
    for (let y = 0; y < wh; y++) {
      const src = (y * ww + wx) * 4
      const li = y * 4
      lineA[li] = hbuf[src]!
      lineA[li + 1] = hbuf[src + 1]!
      lineA[li + 2] = hbuf[src + 2]!
      lineA[li + 3] = hbuf[src + 3]!
    }

    boxLine(lineA, lineB, wh, passes[0].lo, passes[0].hi)
    boxLine(lineB, lineA, wh, passes[1].lo, passes[1].hi)
    boxLine(lineA, lineB, wh, passes[2].lo, passes[2].hi)

    for (let y = 0; y < dst.h; y++) {
      const li = (colOffsetY + y) * 4
      const a = lineB[li + 3]!
      const unmul = a > 0 ? 255 / a : 0
      const di = ((dst.y + y) * width + dst.x + x) * 4
      data[di] = Math.round(lineB[li]! * unmul)
      data[di + 1] = Math.round(lineB[li + 1]! * unmul)
      data[di + 2] = Math.round(lineB[li + 2]! * unmul)
      data[di + 3] = Math.round(a)
    }
  }
}

// ── أدوات الإثبات ────────────────────────────────────────────────

/**
 * تباين اللمعة داخل منطقة — يُستهلَك في تقرير الخبز وفي الاختبار.
 *
 * **بمرورين لا بصيغة `E[X²] − E[X]²`.** الصيغة المختصرة تطرح رقمين متقاربين
 * كبيرين، فتُعيد على منطقة **مسطّحة تمامًا** قيمةً من رتبة ‎5.5e−12‎ لا صفرًا
 * (مقيس على تغطية 5×5 بلون واحد). وأي فحص «التباين صفر» يسقط عندها — ثمّ
 * يُرخى الفحص إلى `< ε` فيمرّ ما لا ينبغي أن يمرّ.
 */
export function regionVariance(img: PixelBuffer, r: PixelRect): number {
  const box = clampToBuffer(r, img.width, img.height)
  if (!box) return 0
  const { data, width } = img

  /*
   * لمعة **بمعاملات صحيحة** ‎(77·R + 150·G + 29·B)‎ ومجموعها 256.
   *
   * الكسور العشرية ‎0.299/0.587/0.114‎ تجعل مجموع خمسٍ وعشرين قيمة متطابقة
   * لا يقسم على خمس وعشرين فيعطيها بالضبط، فيبقى فرقٌ من رتبة ‎1.8e−27‎
   * ويصير التباين على منطقة مسطّحة **غير صفر**. والحساب الصحيح دقيق: مجموع
   * `n` نسخة من عدد صحيح يقسم على `n` فيعطي العدد نفسه تمامًا.
   */
  const luma = (i: number): number => 77 * data[i]! + 150 * data[i + 1]! + 29 * data[i + 2]!

  let sum = 0
  let n = 0
  for (let y = box.y; y < box.y + box.h; y++) {
    let i = (y * width + box.x) * 4
    for (let x = 0; x < box.w; x++) {
      sum += luma(i)
      n++
      i += 4
    }
  }
  if (n === 0) return 0
  const mean = sum / n

  let acc = 0
  for (let y = box.y; y < box.y + box.h; y++) {
    let i = (y * width + box.x) * 4
    for (let x = 0; x < box.w; x++) {
      const d = luma(i) - mean
      acc += d * d
      i += 4
    }
  }
  // العودة إلى وحدات اللمعة 0..255: القسمة على 256² تُلغي مقياس المعاملات.
  return acc / n / 65_536
}

/**
 * عدد الألوان المتميّزة داخل منطقة، بسقف.
 *
 * السقف ليس تحسينًا: منطقة 4000×3000 قد تحمل ملايين الألوان، وبناء مجموعة
 * لها يحجز أضعاف الصورة نفسها في لحظة يُفترض فيها أننا نقلّل الذاكرة.
 */
export function distinctColours(img: PixelBuffer, r: PixelRect, cap: number): number {
  const box = clampToBuffer(r, img.width, img.height)
  if (!box) return 0
  const { data, width } = img
  const seen = new Set<number>()

  for (let y = box.y; y < box.y + box.h; y++) {
    let i = (y * width + box.x) * 4
    for (let x = 0; x < box.w; x++) {
      seen.add(((data[i]! << 24) | (data[i + 1]! << 16) | (data[i + 2]! << 8) | data[i + 3]!) >>> 0)
      if (seen.size >= cap) return cap
      i += 4
    }
  }
  return seen.size
}

/** تطابق بايتيّ تامّ — أساس الاختبار الأمني التفاضلي. */
export function bytesEqual(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  if (a.data.length !== b.data.length) return false
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false
  return true
}
