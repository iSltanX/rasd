/**
 * الخبز — **بوّابة الخروج الوحيدة**.
 *
 * كل بايت يغادر المحرر يمرّ من هنا، ولا مسار آخر. والوسم `ExportBytes` لا
 * يبنيه إلّا هذا الملفّ، وقاعدة لنت تحظر `toBlob`/`convertToBlob`/`toDataURL`
 * خارج **أربعة** ملفّات معروفة — فالحدّ مفروضٌ بالنوع وباللنت وبالاختبار، لا
 * بالمراجعة. (كان هذا السطر يقول «ثلاثة» بينما `ENCODE_ALLOWED` يعدّ أربعة
 * منذ المرحلة 18؛ صُحِّح في الوحدة 19.1 — والعدد الحاكم هو المصفوفة لا هذا
 * التعليق.)
 *
 * **والصيغة معاملٌ لا بوّابة ثانية.** الوحدة 19.1 أضافت WebP بتمريره إلى
 * النداء الواحد أدناه، لا بموضع ترميزٍ جديد: `ENCODE_ALLOWED` لم يكبر، ولا
 * محدِّد لنت طُرح. التعليل في
 * [ADR 0021](../../../Docs/ADR/0021-second-format-one-gate.md).
 *
 * **والدرس منقول من eFail:** خاصيّةٌ أمنية تُعرَّف عند طبقة العرض تلتفّ
 * حولها كل مسارات الخروج الأخرى. فعدم القابلية للعكس هنا خاصيّةُ **البايتات
 * الخارجة** لا خاصيّةُ المنتَج.
 *
 * ## عقد الفضاء الذي يقوم عليه الملفّ كلّه
 *
 *     بكسل السطح = (بكسل الصورة − أصل الاقتصاص المسوّى) × المقياس
 *
 * ويُطبَّق **مرّةً واحدة**: مصفوفةُ السياق تحمله للعقد المتّجهة،
 * و`opForNode` تحمله لعمليات البكسل. وطرحُه مرّتين أو ضربُه في جهة دون أخرى
 * هو الصنف الأخطر من الأعطال هنا، لأن `getImageData`/`putImageData`
 * **تتجاهلان المصفوفة بحكم المواصفة**: فمصفوفةٌ خاطئة تُفسد نصف المرور
 * المتّجه وحده، وتحويلٌ خاطئ يُفسد نصف البكسل وحده — ولا يُزعج أحدهما
 * الآخر، فتخرج صورة أغطيتها في مكانها وتعليقاتها مزاحة، أو العكس.
 *
 * ## الترتيب
 *
 * مرورٌ **واحد** على `scene.nodes` بترتيبها: العقدة المتّجهة تُرسم، وعقدة
 * الحجب تُفرِغ منطقتها إلى بكسلات وتدمّرها، ثمّ يستمرّ المرور. ولو دُمِّرت
 * الحجوب كلّها أوّلًا ثمّ رُسمت التعليقات، لخرجت كل عقدة فهرسها أدنى **فوق**
 * الحجب في الملفّ — بطاقة ملاحظة ظنّها المستخدم مغطّاة تظهر مكشوفة، وهو
 * تسريبٌ لا يراه أي فحص تباين لأنه من طبقة رُسمت بعد الفحص.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`. والسطح والشرائح ومحرّك
 * البكسل كلّها تُحقن.
 */

import { formatFromMime, mimeFor, type ExportFormat } from '@/modules/export/format'
import { deviceRect, type DeviceRect } from '@/shared/geometry'
import { err, ok, type Result } from '@/shared/result'

import { planExportSurface, sliceHeightFor, type ExportBound } from './budget'
import { drawNode, type DrawContext } from './draw/shapes'
import { normaliseBox } from './hit-test'
import { clampToBuffer, distinctColours, regionVariance, type PixelRect } from './pixel-ops'
import { opForNode, sampleRect } from './redact'
import { isHideable, isIrreversible, type ObscureMode, type NodeId, type Scene } from './scene'
import { emptyScene } from './scene-schema'
import { createTextLayoutCache } from './text-layout'
import { stripWebpIccp } from './webp-strip'

import type { ObscureOp } from './blur-protocol'
import type { Ctx2D, RenderStyle } from './renderer'
import type { TextLayoutCache } from './text-layout'

/**
 * بايتات مصدَّرة — وسمٌ لا يبنيه إلّا هذا الملفّ.
 *
 * كل مسار خروج (حفظ · حافظة · مشاركة) يقبل هذا النوع وحده، فلا يمكن تمرير
 * بلوب المتصفّح الأصلي إلى مسار تصدير بالخطأ: النوع يرفضه عند الترجمة.
 */
export type ExportBytes = Blob & { readonly __baked: unique symbol }

export interface ObscureProof {
  readonly id: NodeId
  readonly mode: ObscureMode
  /** المستطيل **المكتوب فعلًا** بفضاء السطح — بعد القصّ، لا المطلوب. */
  readonly rect: PixelRect
  readonly variance: number
  readonly distinctColours: number
  /**
   * **يُقاس على البايتات المكتوبة، لا يُشتقّ من النمط.**
   *
   * `isIrreversible(mode)` إعادةُ صياغةٍ للمدخل: تقول «طُلبت تغطية» لا
   * «دُمِّرت المنطقة». ولو اكتُفي بها لخرج تقريرٌ يقول `guaranteed: true`
   * عن منطقة لم يُكتَب فيها بايت — لأن مستطيلها وقع خارج السطح، أو لأن
   * القصّ أعاد عدمًا. فالشرط ثلاثي: النمط تغطية، **وقد كُتب فعلًا**،
   * **وما كُتب مسطّح تمامًا**.
   */
  readonly guaranteed: boolean
}

export interface BakeReport {
  readonly width: number
  readonly height: number
  readonly bytes: number
  readonly obscured: readonly ObscureProof[]
  /**
   * الصيغة **المُنتَجة فعلًا**، لا المطلوبة.
   *
   * والفرق ليس تدقيقًا لفظيًّا: قِيس أن مُرمِّج المتصفّح **لا يرمي** على نوع
   * غير مدعوم بل يتدهور صامتًا إلى PNG ويُعلن `image/png` في `blob.type`
   * (‏`image/heic` و`image/avif` والسلسلة الفارغة، الثلاثة). فحقلٌ يحمل
   * المطلوب كان سيقول «WebP» عن ملفّ PNG، والواجهة تبني عليه اسم الملفّ.
   * الحقل يُملأ من البلوب، والاختلاف يُرَدّ عطلًا قبل أن يصل إلى هنا.
   */
  readonly format: ExportFormat
  /** نوعٌ حرفي: لا فرع «مرِّر بايتات المتصفّح كما هي» في هذه الدالّة. */
  readonly reencoded: true
  /** اللوحة مثبَّتة — الملفّ لا يتغيّر بسمة مؤلّفه. */
  readonly paletteMode: 'dark'
  /**
   * حُذف مقطع `ICCP` فعلًا؟ لا تعني «طُلب الحذف» بل «وُجد ما يُحذف وحُذف».
   *
   * **دائمًا `false` لـPNG** — لا مقطع فيها أصلًا (`§6` صفّ 103أ). ولـWebP:
   * `false` حين `stripMetadata` لم تُطلَب، أو طُلبت على حاويةٍ لسببٍ ما بلا
   * `ICCP`. الحقل يقرأ نتيجة `stripWebpIccp` لا الطلب — فشاشة `export / done`
   * تعرض الحالة الفعلية لا وعدًا (ملفّ المرحلة 19 السابق (تاريخ Git) §4`).
   */
  readonly metadataStripped: boolean
  /** حدودٌ **تُعلَن** لا تُبتلَع: ما لم يُرسَم، وما لم يُدمَّر. */
  readonly warnings: readonly string[]
}

/**
 * ما يكفي لترميز سطح إلى بايتات.
 *
 * **يُمرَّر الهدف ولا تُمرَّر البايتات.** لو أعادت الصفحة بلوبًا جاهزًا
 * لَوقع نداء `convertToBlob` هناك — وبوّابة اللنت تمنعه خارج هذا الملفّ،
 * لسببٍ وجيه: كل موضع ترميز مسارُ خروج، وعدّها بالاسم هو ما يجعل الوعد
 * قابلًا للفرض. فالصفحة تُسلّم القماش، والنداء يقع هنا.
 */
export interface EncodeTarget {
  convertToBlob(options: { readonly type: string; readonly quality?: number }): Promise<Blob>
}

/** سطحُ خبز مخصَّص — أقلّ ما يلزم، فلا يُربَط الملفّ بنوع قماش بعينه. */
export interface BakeTarget {
  readonly ctx: Ctx2D
  getImageData(x: number, y: number, w: number, h: number): ImageData
  putImageData(d: ImageData, x: number, y: number): void
  /**
   * الحارس **بعد** التخصيص.
   *
   * تجاوز حدود القماش لا يرمي: السياق صالح، و`canvas.width` يبلّغ المطلوب،
   * والرسم يُقبَل — ثمّ يُقرأ أصفارًا. فحارسان لا واحد.
   */
  alive(): boolean
  /** القماش نفسه — يُرمَّز هنا لا عند مُنشئه. */
  readonly encodeTarget: EncodeTarget
  dispose(): void
}

export interface BakeSurface {
  create(width: number, height: number): BakeTarget | null
}

/**
 * شريحة من المصدر — **بنيوية لا `ImageBitmap`**.
 *
 * `createImageBitmap` غير قابل للاستدعاء على `ImageData` في بيئة الاختبار
 * (مقيس)، فربط العقد به يجعل نصف الخبز غير قابل للاختبار.
 */
export interface BakeSlice {
  readonly image: CanvasImageSource
  readonly width: number
  readonly height: number
  close(): void
}

/**
 * منفّذ عمليات البكسل — على الخيط الثانوي أو الرئيسي، والنتيجة واحدة.
 *
 * يستقبل مخزنًا ويُعيد مخزنًا؛ ولا يعرف شيئًا عن المشهد ولا عن الخيوط.
 */
export type PixelRunner = (
  buffer: ArrayBuffer,
  width: number,
  height: number,
  ops: readonly ObscureOp[],
) => Promise<ArrayBuffer>

export interface BakeRequest {
  readonly scene: Scene
  /**
   * مصنع شرائح لا بتماب واحدة.
   *
   * على الحالة القصوى 2560×28,672 تكون البتماب الكاملة 280 ميغابايت وقماش
   * الخبز 280 ⇒ 560، أي 140% من سقف المرحلة. والشرائح تُغلَق واحدةً واحدة،
   * فالذروة = قماش الخبز + شريحة ≤ 32 ميغابايت ⇒ نحو 312.
   */
  readonly sliceSource: (rect: DeviceRect) => Promise<BakeSlice>
  readonly scale: 1 | 2
  /**
   * صيغة الخروج — **معاملٌ يعبر البوّابة لا بوّابةٌ ثانية**.
   *
   * موضع النداء يبقى واحدًا (السطر أدناه)، فلا `ENCODE_ALLOWED` يكبر ولا
   * محدِّد لنت يُطرَح. التعليل في [ADR 0021](../../../Docs/ADR/0021-second-format-one-gate.md).
   */
  readonly format: ExportFormat
  /**
   * جودة الترميج، أو `null` لغياب الوسيط أصلًا.
   *
   * **والغياب ليس مكافئًا لـ`1`**: قِيس أن حذف الوسيط وتمرير `1` يعطيان
   * `VP8L` بلا فقد في Chrome، لكن التمييز محفوظ صراحةً لأنه ليس مضمونًا في
   * كل مُرمِّج. وPNG تتجاهل الوسيط بالكامل.
   */
  readonly quality?: number | null
  /**
   * `privacy.stripMetadataOnExport` — يُحقَن من المستدعي، لا يُقرأ هنا من
   * التخزين: `modules/` لا `chrome.*` (انظر ترويسة الملفّ).
   *
   * يُنفَّذ على WebP وحدها اليوم: مقطع `ICCP` هو البند الموروث من 19.1
   * (`webp-strip.ts`). وPNG لا تحتاجه — تخرج بصفر مقطع دائمًا بحكم
   * المُرمِّج، بلا علاقة بهذا المفتاح.
   */
  readonly stripMetadata?: boolean
  readonly surface: BakeSurface
  readonly style: RenderStyle
  /**
   * **يجب أن تكون اللوحة داكنة، والنوع يفرضه.**
   *
   * `resolveColor(token, mode)` يُعطي قيمتين مختلفتين. ومشهدٌ حُرِّر داكنًا
   * وأُعيد فتحه فاتحًا كان سيُصدَّر بألوان أخرى — **والمتلقّي لا يملك سمة
   * المؤلّف**. فالتثبيت يجعل الملفّ مستقرًّا، والحقل يجعل التقرير صادقًا:
   * لا يُعلن «داكن» إلّا لأن المستدعي التزم به عند الترجمة.
   */
  readonly paletteMode: 'dark'
  readonly layout: TextLayoutCache
  readonly runPixels: PixelRunner
  readonly onProgress?: (fraction: number) => void
  readonly signal?: { readonly aborted: boolean }
  /** يُفرّغ الحلقة بين الخطوات — يُحقن كي يكون الاختبار حتميًّا. */
  readonly yieldToLoop?: () => Promise<void>
}

export interface ExportDecision {
  readonly ok: boolean
  readonly width: number
  readonly height: number
  readonly bytes: number
  readonly bound: ExportBound
  /** نصّ عربي **جاهز للعرض** — الرفض بلا سبب معروض ليس رفضًا بل صمت. */
  readonly reason: string
}

/** نافذة التصدير بفضاء الصورة: الاقتصاص إن وُجد، وإلّا الصورة كاملة. */
export function exportWindow(scene: Scene): DeviceRect {
  return scene.meta.crop
    ? normaliseBox(scene.meta.crop)
    : deviceRect(0, 0, scene.source.width, scene.source.height)
}

const REASONS: Readonly<Record<ExportBound, string>> = {
  none: '',
  side: 'ضلع الصورة يتجاوز حدّ المتصفّح. اقتصص في هذا الاتجاه قبل التصدير.',
  area: 'مساحة الصورة تتجاوز حدّ المتصفّح. جرّب دقّة ‎1×‎ أو اقتصص جزءًا منها.',
  budget: 'الصورة أكبر من أن تُخبَز في الذاكرة. جرّب دقّة ‎1×‎ أو اقتصص جزءًا منها.',
}

/**
 * هل يمكن التصدير بهذه الدقّة؟ ولماذا لا؟
 *
 * **يستقبل الاقتصاص**: هو نافذة تصدير، وتجاهله يرفض تصديرات مشروعة —
 * لقطةٌ ضخمة اقتُصّ منها ألفٌ في ألف تُرفض بحجّة أن الأصل كبير.
 */
export function planExport(scene: Scene, scale: 1 | 2): ExportDecision {
  const box = exportWindow(scene)
  const plan = planExportSurface(box.width, box.height, scale)
  return {
    ok: plan.bound === 'none',
    width: plan.width,
    height: plan.height,
    bytes: plan.bytes,
    bound: plan.bound,
    reason: REASONS[plan.bound],
  }
}

const noYield = (): Promise<void> => Promise.resolve()

/**
 * يخبز المشهد إلى بايتات PNG.
 *
 * الترتيب ثابت ومُختبَر — والانحراف عنه في أيّ خطوة له عَرَضٌ مسمّى في
 * الاختبارات:
 *
 *   ١. الخطّة، ثمّ تخصيص سطح واحد، ثمّ `alive()`.
 *   ٢. رسم المصدر شريحةً شريحة، وإغلاق كل شريحة **فور** رسمها. وكلّها قبل
 *      أوّل عقدة: شريحةٌ تُرسَم بعد تدميرٍ تُعيد البكسلات السليمة فوقه.
 *   ٣. مرور واحد بالترتيب: متّجهة تُرسم، وحجب يُدمِّر.
 *   ٤. الترميز، **ثمّ** التحرير — لا العكس.
 *   ٥. حذف `ICCP` من WebP — **بعد** التحقّق من الصيغة المُنتَجة لا قبله،
 *      وبطلب `stripMetadata` صريح لا افتراضًا (`webp-strip.ts`).
 */
export async function bake(
  req: BakeRequest,
): Promise<Result<{ blob: ExportBytes; report: BakeReport }>> {
  const { scene, scale, signal } = req
  const yieldNow = req.yieldToLoop ?? noYield
  const aborted = (): boolean => signal?.aborted === true

  const decision = planExport(scene, scale)
  if (!decision.ok) {
    return err({ code: 'invalid-data', message: decision.reason, detail: decision.bound })
  }

  const box = exportWindow(scene)
  const target = req.surface.create(decision.width, decision.height)
  if (!target) {
    return err({ code: 'handler-failed', message: 'تعذّر تجهيز سطح التصدير.' })
  }

  try {
    if (!target.alive()) {
      return err({
        code: 'invalid-data',
        message: 'تعذّر تخصيص سطح بهذا المقاس. جرّب دقّة ‎1×‎ أو اقتصص جزءًا منها.',
        detail: `${decision.width}×${decision.height}`,
      })
    }

    const { ctx } = target
    const warnings: string[] = []
    const obscured: ObscureProof[] = []

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, decision.width, decision.height)
    // التنعيم مضبوط صراحةً: تركُه لِما خلّفه سياقٌ آخر يجعل تصدير 2× يخرج
    // مرّةً ناعمًا ومرّةً مكعّبًا بلا سبب يراه أحد.
    ctx.imageSmoothingEnabled = true

    // ── ١. المصدر، شريحةً شريحة ───────────────────────────────────
    /*
     * ارتفاع الشريحة يُحسب على عرض **المصدر** لا الوجهة: البتماب تُقرأ من
     * البلوب الأصلي بمقياس 1، فمقياس التصدير لا يدخل ذاكرتها أصلًا.
     */
    const sliceHeight = sliceHeightFor(box.width)
    let drawn = 0
    for (let y = 0; y < box.height; y += sliceHeight) {
      if (aborted()) return err({ code: 'cancelled', message: 'أُلغي التصدير.' })
      const h = Math.min(sliceHeight, box.height - y)
      const slice = await req.sliceSource(deviceRect(box.x, box.y + y, box.width, h))
      try {
        ctx.drawImage(slice.image, 0, y * scale, box.width * scale, h * scale)
      } finally {
        // الإغلاق فورًا: الذروة = السطح + شريحة واحدة، لا السطح + كلّها.
        slice.close()
      }
      drawn += h
      req.onProgress?.((drawn / box.height) * 0.5)
      await yieldNow()
    }

    // ── ٢. المرور الواحد بترتيب الرسم ─────────────────────────────
    /*
     * المصفوفة تحمل عقد الفضاء **مرّةً واحدة** للعقد المتّجهة. والسمك وحجم
     * الخطّ بكسلاتُ صورة أصلًا، فتحملهما المصفوفة بلا ضرب يدوي — والضرب
     * اليدوي فوقها يعطي 4× عند تصدير 2×.
     */
    const draw: DrawContext = {
      ctx,
      style: req.style,
      camera: { zoom: scale, tx: 0, ty: 0 },
      dpr: scene.source.dpr,
      interacting: false,
      layout: req.layout,
    }

    for (let i = 0; i < scene.nodes.length; i++) {
      if (aborted()) return err({ code: 'cancelled', message: 'أُلغي التصدير.' })
      const node = scene.nodes[i]!

      // المخفيّ لا يُصدَّر. والحجب لا حقل إخفاء له بحكم النوع، فلا يُتخطّى.
      if (isHideable(node) && node.hidden) continue

      if (node.kind !== 'redact') {
        ctx.save()
        ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale)
        drawNode(draw, node)
        ctx.restore()
        continue
      }

      /*
       * الحجب: تُفرَغ منطقته إلى بكسلات وتُدمَّر ثمّ تُعاد.
       *
       * ولا يمرّ من `drawNode`: رسّام الحجب يرسم إطارًا متقطّعًا بسمك
       * `1.5/zoom` بلون سمة **المؤلّف** — زخرفة واجهة لا مكان لها في ملفّ.
       */
      const op = opForNode(node, { crop: box, scale }, req.style.palette)
      const sample = sampleRect(op, decision.width, decision.height)
      if (!sample) {
        warnings.push(OUTSIDE_WARNING)
        continue
      }

      const image = target.getImageData(sample.x, sample.y, sample.w, sample.h)
      // العملية تُعاد تأسيسها على أصل المخزن المقروء — لا على أصل السطح.
      const local: ObscureOp = {
        ...op,
        rect: { x: op.rect.x - sample.x, y: op.rect.y - sample.y, w: op.rect.w, h: op.rect.h },
      }
      const buffer = await req.runPixels(image.data.buffer, sample.w, sample.h, [local])
      if (aborted()) return err({ code: 'cancelled', message: 'أُلغي التصدير.' })

      const baked = { data: new Uint8ClampedArray(buffer), width: sample.w, height: sample.h }
      target.putImageData(new ImageData(baked.data, sample.w, sample.h), sample.x, sample.y)

      const written = clampToBuffer(local.rect, sample.w, sample.h)
      if (!written) {
        // لم يُكتَب شيء: لا يُسجَّل برهانٌ عن منطقة لم تُمَسّ.
        warnings.push(OUTSIDE_WARNING)
        continue
      }

      const variance = regionVariance(baked, written)
      obscured.push({
        id: node.id,
        mode: node.mode,
        // المستطيل المكتوب فعلًا بفضاء السطح — لا المطلوب.
        rect: { x: written.x + sample.x, y: written.y + sample.y, w: written.w, h: written.h },
        variance,
        distinctColours: distinctColours(baked, written, 4096),
        guaranteed: isIrreversible(node.mode) && variance === 0,
      })

      req.onProgress?.(0.5 + ((i + 1) / scene.nodes.length) * 0.4)
      await yieldNow()
    }

    if (aborted()) return err({ code: 'cancelled', message: 'أُلغي التصدير.' })

    // ── ٣. الترميز — دائمًا، بلا فرع «مرِّر البايتات» ───────────────
    /*
     * **موضع النداء واحد، والنوع معامل.** هذا هو السطر الذي يحرسه ADR 0015،
     * وتعميمه بالصيغة لا يُضعفه: البكسلات ما زالت لا تخرج إلا من هنا.
     *
     * والجودة تُمرَّر **حين تُطلَب وحدها** لا بقيمة افتراضية: تمرير `quality`
     * غير معرَّفة يختلف عن حذف المفتاح في بعض التنفيذات، وحذفه هو ما يُنتج
     * `VP8L` بلا فقد مقيسًا.
     */
    const wanted = mimeFor(req.format)
    const quality = req.quality
    const blob = await target.encodeTarget.convertToBlob(
      quality === null || quality === undefined ? { type: wanted } : { type: wanted, quality },
    )

    /*
     * **ما أُنتج يُقارَن بما طُلب — لأن الفشل هنا صامت.**
     *
     * قِيس أن نوعًا غير مدعوم لا يرمي: `image/heic` و`image/avif` والسلسلة
     * الفارغة أعطت ثلاثتها PNG وأعلنت `image/png`. فبلا هذه المقارنة يخرج
     * ملفٌّ PNG باسم `.webp` ويُسجَّل في التقرير «WebP» — عطلٌ لا يكشفه أي
     * فحصٍ يسأل «هل نجح التصدير».
     */
    const produced = formatFromMime(blob.type)
    if (produced !== req.format) {
      return err({
        code: 'handler-failed',
        message: 'المتصفّح لا يدعم هذه الصيغة — جرّب صيغة أخرى.',
        detail: `طُلب ${wanted} وأُنتج ${blob.type || '(بلا نوع)'}`,
      })
    }

    /*
     * ── ٤. حذف البيانات الوصفية — WebP وحدها، وبطلب صريح ─────────────
     *
     * **بعد المقارنة أعلاه لا قبلها**: التحقّق من الصيغة المُنتَجة يحكم
     * `blob` الأصلي، فتمريره عبر التنظيف أوّلًا كان يخاطر بإخفاء تدهورٍ
     * صامت خلف بايتات مُعاد بناؤها. والتنظيف **لا يرمي على فشل** (انظر
     * `webp-strip.ts`) — تعثّره لا يُسقط تصديرًا نجح.
     */
    let finalBlob = blob
    let metadataStripped = false
    if (produced === 'webp' && req.stripMetadata === true) {
      const stripped = stripWebpIccp(new Uint8Array(await blob.arrayBuffer()))
      if (stripped.removed) {
        finalBlob = new Blob([stripped.bytes], { type: blob.type })
        metadataStripped = true
      }
    }

    req.onProgress?.(1)

    return ok({
      blob: finalBlob as ExportBytes,
      report: {
        width: decision.width,
        height: decision.height,
        bytes: finalBlob.size,
        obscured,
        format: produced,
        reencoded: true,
        paletteMode: req.paletteMode,
        metadataStripped,
        warnings,
      },
    })
  } catch (thrown) {
    return err({
      code: 'handler-failed',
      message: 'تعذّر إنهاء التصدير.',
      detail: thrown instanceof Error ? thrown.message : String(thrown),
    })
  } finally {
    /*
     * **بعد الترميز لا قبله.** `dispose` تضع المقاس صفرًا، وترميزُ قماش
     * ‎0×0‎ ينجح ويُعطي ملفًّا صغيرًا صالحًا — أي تصديرًا فارغًا يبدو ناجحًا.
     * و`finally` يقع بعد `await encode` لأن `return` ينتظر تعبيره أوّلًا.
     */
    target.dispose()
  }
}

const OUTSIDE_WARNING = 'منطقة حجب خارج نافذة التصدير — لم تُطبَّق.'

/**
 * مصدرٌ نقطيٌّ بلا مشهد — صفحة نصّ مرسومة لملفّ PDF، أو صورة فرق المقارنة.
 *
 * **بكسلاتٌ تغادر الإضافة فتمرّ من هنا** لا من `convertToBlob` ثانٍ في الصفحة: الحدّ في ADR 0015 §2 يعدّ
 * مواضع الترميز لا أنواع المصادر، ومصدرٌ بلا حجب ما زال مسار خروج. فيُخبز بمشهدٍ بلا عُقد، وموضع النداء
 * يبقى السطر نفسه في `bake()`.
 */
export interface RasterBakeRequest {
  readonly width: number
  readonly height: number
  readonly sliceSource: (rect: DeviceRect) => Promise<BakeSlice>
  readonly format: ExportFormat
  readonly surface: BakeSurface
  readonly onProgress?: (fraction: number) => void
  readonly signal?: { readonly aborted: boolean }
  readonly yieldToLoop?: () => Promise<void>
}

/*
 * أدوات الرسم لمشهدٍ بلا عُقد: **لا تُقرأ أبدًا** — حلقة العُقد في `bake()` لا تدور مرّةً واحدة. تُمرَّر لأن
 * النوع يطلبها، ومحرّك البكسل يرمي إن نودي على خلاف ذلك، فلا يمرّ خطأٌ في هذا الافتراض صامتًا.
 */
const NO_STYLE: RenderStyle = {
  palette: {} as RenderStyle['palette'],
  selectionHex: '',
  handleHex: '',
  redactOutlineHex: '',
  textFamily: '',
  monoFamily: '',
}
const NO_LAYOUT = createTextLayoutCache(() => 0)
const NO_PIXELS: PixelRunner = () => Promise.reject(new Error('مصدرٌ نقطي بلا عمليات بكسل'))

/** يُخبز مصدرًا نقطيًّا بمقياس 1 وبلا جودة (بلا فقد) — انظر `RasterBakeRequest`. */
export function bakeRaster(
  req: RasterBakeRequest,
): Promise<Result<{ blob: ExportBytes; report: BakeReport }>> {
  return bake({
    scene: emptyScene({ captureId: 'raster', width: req.width, height: req.height, dpr: 1 }),
    sliceSource: req.sliceSource,
    scale: 1,
    format: req.format,
    quality: null,
    stripMetadata: false,
    surface: req.surface,
    style: NO_STYLE,
    paletteMode: 'dark',
    layout: NO_LAYOUT,
    runPixels: NO_PIXELS,
    ...(req.onProgress ? { onProgress: req.onProgress } : {}),
    ...(req.signal ? { signal: req.signal } : {}),
    ...(req.yieldToLoop ? { yieldToLoop: req.yieldToLoop } : {}),
  })
}
