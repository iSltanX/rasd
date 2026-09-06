/**
 * محرك الفرق البكسلي بين لقطتين — رياضيات خالصة، `pixelmatch` وحدها. المرحلة
 * 17 §6: «الخوارزمية جاهزة في pixelmatch؛ تجميع المناطق نمط قياسي» — وهذا
 * الملفّ لا يعيد اختراعها، بل يحلّ ما لا تحلّه هي بنفسها: محاذاة أبعادٍ
 * مختلفتين، واستخراج قناع بكسلي لـ`regions.ts`.
 *
 * **المقارنة الإدراكية جاهزة داخل `pixelmatch` نفسها** — فضاء YIQ (Kotsarenko
 * & Ramos 2010) و`includeAA: false` هما بالضبط «فضاء لوني إدراكي يقلّل
 * الإيجابيات الكاذبة من التنعيم» الذي ينصّ عليه `Rasd_Plan.md`؛ لا حساب
 * موازٍ هنا.
 *
 * **لا `Worker` في هذا الملفّ ولا `self`.** يُستدعى من الخيط الرئيسي (مسار
 * السقوط) ومن `workers/diff.worker.ts` بالدالّة نفسها — نفس سابقة
 * `modules/editor/redact.ts` مع `applyOps`: مسارٌ متزامن يُنتج البايتات
 * نفسها لا مثيلها.
 *
 * **فضاء البكسل هو `device` لا فضاء خامس.** اللقطات تُحفَظ بدقّة الجهاز بلا
 * إعادة تحجيم (`shared/geometry.ts`، تعليل «لا فضاء خامس للصورة» في المرحلة
 * 8) — والمقارنة تُجرى على صورتين محفوظتين بنفس المنطق: بكسل الفرق هو بكسل
 * الجهاز، فالمستطيلات هنا `DeviceRect` من الوحدة القائمة، لا نوع مواز.
 */

import pixelmatch from 'pixelmatch'

import { deviceRect, type DeviceRect } from '@/shared/geometry'

/** صورة خام بفضاء بكسل مسطّح RGBA — لا `ImageData` (انظر ترويسة البروتوكول لاحقًا). */
export interface RasterImage {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}

export interface DiffOptions {
  /** عتبة `pixelmatch` — حسّاسية أعلى كلما صغُرت. افتراضي `pixelmatch` نفسه. */
  readonly threshold: number
  /**
   * لون «إزالة» ولون «إضافة» — بألوان `tool/diff/removed`·`added` الدلالية،
   * تُحلّ في طبقة الواجهة (`getComputedStyle` أو قراءة التوكنز) لا هنا: هذا
   * الملفّ رياضيات خالصة، لا يقرأ CSS ولا DOM.
   */
  readonly removedColor: readonly [number, number, number]
  readonly addedColor: readonly [number, number, number]
}

/** الشكل الأسود/الأبيض الافتراضي — تستبدله الواجهة بألوان التوكنز الفعلية. */
export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  threshold: 0.1,
  removedColor: [255, 0, 0],
  addedColor: [255, 0, 0],
}

/**
 * شريطان محتملان من صورة أكبر من التقاطع — عرضًا وارتفاعًا، لا شكل L واحد.
 *
 * **`cols`/`rows` لا `right`/`bottom` عمدًا**: بوّابة الترميز (`eslint.config.js`)
 * تمنع خاصيةً حرفيّتها `right`/`bottom` أينما وقعت — حارس اتجاه فيزيائي
 * للواجهة العربية RTL. وهذان الحقلان بكسلات مخزن خام لا CSS، فالتصادم لفظي
 * محض؛ إعادة التسمية أوضح من إسكات القاعدة على استثناء لا يخصّها.
 */
export interface ExtraStrip {
  /** شريط عمودي يبدأ عند `overlapW` — يفيض حين تكون هذه الصورة الأعرض. */
  readonly cols: DeviceRect | null
  /** شريط أفقي يبدأ عند `overlapH` — يفيض حين تكون هذه الصورة الأطول. */
  readonly rows: DeviceRect | null
}

export interface DiffResult {
  /**
   * خريطة حرارية شفّافة الخلفية بحجم منطقة **التقاطع فقط** (`diffMask` في
   * `pixelmatch`) — جاهزة للتركيب فوق أيّ من الصورتين مباشرةً في الواجهة،
   * بلا طرح. البكسلات غير المختلفة شفّافة تمامًا؛ المختلفة بلون `removedColor`
   * أو `addedColor` بحسب اتجاه الفرق (فاتح-على-غامق مقابل العكس).
   */
  readonly diff: RasterImage
  /**
   * قناع بكسلي مسطّح بحجم `overlap` — `1` لكل بكسل ساهم في `diffPixelCount`.
   * مُشتقّ من قناة ألفا في `diff` مباشرةً (`diffMask` تعني ألفا > 0 ⟺ فرق
   * حقيقي، مقيسًا في اختبار «بكسل واحد» أدناه لا مفترَضًا من توثيق المكتبة).
   * يُغذّي `regions.ts` مباشرةً دون إعادة قراءة `diff`.
   */
  readonly mask: Uint8Array
  /** منطقة التقاطع الفعلية بإحداثيات كلتا الصورتين معًا (محاذاة من الأعلى-اليسار). */
  readonly overlap: DeviceRect
  readonly diffPixelCount: number
  readonly comparedPixels: number
  /** `diffPixelCount / comparedPixels` — على منطقة التقاطع وحدها، لا الاتحاد. */
  readonly diffRatio: number
  /** ما يفيض من كلّ صورة عن التقاطع — `null` إن لم تكن هي الأكبر في ذلك البُعد. */
  readonly extraInA: ExtraStrip
  readonly extraInB: ExtraStrip
}

/**
 * يقصّ زاوية علوية-يسرى بحجم `w×h` من صورة أكبر أو مساوية.
 *
 * **نسخ صفّيّ لا مسطّح** إلا حين يتساوى العرضان: صفوف RGBA لصورة أعرض ليست
 * متجاورة في المخزن المسطّح، فقصّ الارتفاع وحده (`subarray`) يكفي فقط حين
 * `img.width === w` — وإلا فالنسخ صفًّا بصفّ إلزاميّ لا اختياريّ.
 */
function extractTopLeft(img: RasterImage, w: number, h: number): Uint8ClampedArray {
  if (img.width === w) return img.data.subarray(0, w * h * 4)

  const out = new Uint8ClampedArray(w * h * 4)
  const rowBytes = w * 4
  for (let y = 0; y < h; y++) {
    const srcStart = y * img.width * 4
    out.set(img.data.subarray(srcStart, srcStart + rowBytes), y * rowBytes)
  }
  return out
}

/** الشريطان الفائضان من صورة واحدة عن مستطيل تقاطع `overlapW×overlapH`. */
function extraStripsFor(img: RasterImage, overlapW: number, overlapH: number): ExtraStrip {
  return {
    cols: img.width > overlapW ? deviceRect(overlapW, 0, img.width - overlapW, img.height) : null,
    rows: img.height > overlapH ? deviceRect(0, overlapH, img.width, img.height - overlapH) : null,
  }
  /*
   * **الزاوية المشتركة بين الشريطين — إن وُجدا معًا — تُغطّى بكليهما.** صورة
   * أعرض وأطول من الأخرى في آنٍ تُعطي شريطًا يمينيًّا بارتفاعها الكامل
   * وشريطًا سفليًّا بعرضها الكامل، فيتقاطعان في الزاوية. هذا قرارٌ متعمَّد لا
   * سهوٌ: تفكيك L إلى ثلاثة مستطيلات غير متقاطعة يُعقِّد العقد مقابل فائدة
   * عرض لا تحتاجها — طلاء مستطيلين متراكبين يعطي نفس الأثر البصري بلا تعقيد.
   */
}

/** يشتقّ القناع من قناة ألفا في مخرج `diffMask` — لا حساب مواز. */
function maskFromDiffOutput(out: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i++) {
    mask[i] = (out[i * 4 + 3] ?? 0) > 0 ? 1 : 0
  }
  return mask
}

/**
 * يقارن صورتين بكسليًّا. لا يرمي عند اختلاف الأبعاد — يحاذي من الأعلى-اليسار
 * ويقارن التقاطع، ويُعلن الفائض صراحةً بدل رفض المقارنة (`Rasd_Plan.md §17`).
 */
export function computeDiff(
  a: RasterImage,
  b: RasterImage,
  options: Partial<DiffOptions> = {},
): DiffResult {
  const opts: DiffOptions = { ...DEFAULT_DIFF_OPTIONS, ...options }
  const overlapW = Math.min(a.width, b.width)
  const overlapH = Math.min(a.height, b.height)

  if (overlapW <= 0 || overlapH <= 0) {
    /*
     * لا تقاطع أصلًا — حافة نظرية (صورة بعرض أو ارتفاع صفري)، بلا استثناء.
     *
     * **و`(0, 0)` هنا مقصودة لا سهو.** سألت مراجعةٌ خصمية: لِمَ لا يُمرَّر
     * `overlapW`/`overlapH` الفعليّان، فقد يكون أحدهما موجبًا؟ لأن التقاطع
     * حين ينعدم أحد بُعديه تنعدم **مساحته** كلّها، فلا بكسل واحد قورن.
     * وتمرير عرضٍ موجب كان سيزعم أن الأعمدة قبله مُقارَنة — كذبٌ يزيد على
     * الصمت. `(0, 0)` تُبلِّغ الصورتين كاملتين «غير مُقارَنتين»، وهو الصدق.
     */
    return {
      diff: { data: new Uint8ClampedArray(0), width: 0, height: 0 },
      mask: new Uint8Array(0),
      overlap: deviceRect(0, 0, 0, 0),
      diffPixelCount: 0,
      comparedPixels: 0,
      diffRatio: 0,
      extraInA: extraStripsFor(a, 0, 0),
      extraInB: extraStripsFor(b, 0, 0),
    }
  }

  const imgA = extractTopLeft(a, overlapW, overlapH)
  const imgB = extractTopLeft(b, overlapW, overlapH)
  const out = new Uint8ClampedArray(overlapW * overlapH * 4)

  const diffPixelCount = pixelmatch(imgA, imgB, out, overlapW, overlapH, {
    threshold: opts.threshold,
    includeAA: false,
    diffColor: [...opts.removedColor],
    diffColorAlt: [...opts.addedColor],
    diffMask: true,
  })

  const comparedPixels = overlapW * overlapH
  return {
    diff: { data: out, width: overlapW, height: overlapH },
    mask: maskFromDiffOutput(out, overlapW, overlapH),
    overlap: deviceRect(0, 0, overlapW, overlapH),
    diffPixelCount,
    comparedPixels,
    diffRatio: comparedPixels === 0 ? 0 : diffPixelCount / comparedPixels,
    extraInA: extraStripsFor(a, overlapW, overlapH),
    extraInB: extraStripsFor(b, overlapW, overlapH),
  }
}
