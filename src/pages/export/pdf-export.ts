/**
 * تصدير PDF من المحرّر — الخبز، ثمّ القسمة، ثمّ صفحة التفاصيل، ثمّ الحاوية.
 *
 * **ثلاث حقائق ترتّب الخطوات:**
 *
 * ١. **الصورة تُخبز مرّة على سطح معتم** (`createBakeSurface({ opaque: true })`) بمقياس 1 — بكسل اللقطة كما
 *    التُقطت. فتخرج PNG بنوع لون RGB يدخل PDF كما هو، والحجب والتعليقات فيها لأنها من البوّابة نفسها.
 * ٢. **القسمة تقرأ الصورة المخبوزة لا الأصل**: فيها التعليقات، والقطع في فراغٍ بين سطرين لا يعني شيئًا إن
 *    مرّ بملاحظةٍ رُسمت فوقه. وتُقرأ نوافذ القطع وحدها (ثُمن صفحة لكلٍّ) لا الصورة كلّها.
 * ٣. **المولِّد يُحمَّل كسولًا** — `import()` بعد الخبز، فلا تدفع النافذة ثمن `pdf-lib` حتى يُختار PDF.
 */

import { type BakeReport } from '@/modules/editor/bake'
import {
  isQuietRow,
  pageBox,
  planImagePages,
  pickBreak,
  fullPageWindow,
  textPagePixels,
  type BreakFinder,
  type PageBox,
  type PdfLayoutOptions,
} from '@/modules/export/pdf-layout'
import { errText, ok, type Result } from '@/shared/result'

import { createBakeSurface, startExport } from '../editor/export'

import { bakeDocPages } from './doc-render'

import type { BlurClient } from '../editor/worker-client'
import type { RenderStyle } from '@/modules/editor/renderer'
import type { Scene } from '@/modules/editor/scene'
import type { TextLayoutCache } from '@/modules/editor/text-layout'
import type { PdfMetadata, PdfPage } from '@/modules/export/pdf'
import type { DocBlock } from '@/modules/export/pdf-document'

export interface PdfExportOptions {
  readonly scene: Scene
  readonly sourceBlob: Blob
  readonly style: RenderStyle
  readonly layout: TextLayoutCache
  readonly client: BlurClient
  readonly pages: PdfLayoutOptions
  /** صفحة التفاصيل — فارغةٌ تعني لا صفحة. */
  readonly details: readonly DocBlock[]
  /** `null` حذفٌ كامل للبيانات الوصفية. */
  readonly metadata: PdfMetadata | null
  readonly onProgress?: (fraction: number) => void
}

export interface PdfExportResult {
  readonly blob: Blob
  readonly report: BakeReport
  readonly pageCount: number
  readonly box: PageBox
}

export interface PdfRun {
  readonly done: Promise<Result<PdfExportResult>>
  cancel(): void
}

/**
 * قاطعٌ يقرأ بكسلات النافذة من الصورة المخبوزة — `createImageBitmap` بمستطيلها وحده.
 *
 * وفشل القراءة (صورة لا تُفكّ، ذاكرة) يعني الحدّ المثالي لا فشل التصدير: القطع في الفراغ تحسينٌ لا شرط.
 */
export function bakedBreakFinder(blob: Blob, width: number): BreakFinder {
  return async (earliest, ideal) => {
    const rows = ideal - earliest
    if (rows <= 0) return ideal
    try {
      const bitmap = await createImageBitmap(blob, 0, earliest, width, rows)
      const canvas = new OffscreenCanvas(width, rows)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        bitmap.close()
        return ideal
      }
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      const data = ctx.getImageData(0, 0, width, rows).data
      canvas.width = 0
      canvas.height = 0
      return pickBreak((row) => isQuietRow(data, width, row - earliest), earliest, ideal)
    } catch {
      return ideal
    }
  }
}

/** يبدأ التصدير ويُعيد مقبضه فورًا — نفس شكل `startExport`: إلغاءٌ يصل كل خطوة. */
export function startPdfExport(options: PdfExportOptions): PdfRun {
  const signal = { aborted: false }
  const progress = options.onProgress ?? (() => undefined)
  const bake = startExport({
    scene: options.scene,
    sourceBlob: options.sourceBlob,
    scale: 1,
    format: 'png',
    quality: 'max',
    stripMetadata: false,
    style: options.style,
    layout: options.layout,
    client: options.client,
    surface: createBakeSurface({ opaque: true }),
    onProgress: (f) => progress(f * 0.75),
  })
  const cancelled = () => errText('cancelled', 'أُلغي التصدير.')

  const done = (async (): Promise<Result<PdfExportResult>> => {
    const baked = await bake.done
    if (!baked.ok) return baked
    if (signal.aborted) return cancelled()

    const { blob, report } = baked.value
    const box = pageBox(options.pages.size, options.pages.orientation)
    const windows = await planImagePages(
      report.width,
      report.height,
      box,
      options.pages.split,
      bakedBreakFinder(blob, report.width),
    )
    progress(0.8)
    if (signal.aborted) return cancelled()

    const images = [blob]
    const pages: PdfPage[] = windows.map((window) => ({ image: 0, box, window }))

    if (options.details.length > 0) {
      const docs = await bakeDocPages(options.details, box, signal)
      if (!docs.ok) return docs
      const pixels = textPagePixels(box)
      for (const doc of docs.value) {
        images.push(doc)
        pages.push({
          image: images.length - 1,
          box,
          window: fullPageWindow(box, pixels.width, pixels.height),
        })
      }
    }
    progress(0.9)
    if (signal.aborted) return cancelled()

    const { buildPdf } = await import('@/modules/export/pdf')
    const built = await buildPdf({ images, pages, metadata: options.metadata })
    if (!built.ok) return built
    // إلغاءٌ أثناء البناء — أطول خطوة حين تُحوَّل RGBA — لا يُسلَّم بعده ملفٌّ قيل عنه «أُلغي».
    if (signal.aborted) return cancelled()
    progress(1)

    return ok({
      blob: new Blob([built.value], { type: 'application/pdf' }),
      report,
      pageCount: pages.length,
      box,
    })
  })()

  return {
    done,
    cancel: () => {
      signal.aborted = true
      bake.cancel()
    },
  }
}
