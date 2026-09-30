/**
 * تقرير المقارنة ملفًّا، وصورة الفرق لقطةً — المساران من البوّابة الواحدة.
 *
 * **التقرير:** صفحة الملخّص أوّلًا (النتيجة، والمستثناة، والمناطق، واللقطتان) ثمّ صورة الفرق مقسومةً على
 * صفحات بعرض الورقة. والصورة تُخبز مرّة (`bakeRaster`) على سطحٍ معتم فتدخل PDF كما خرجت (`png-image.ts`).
 *
 * **«التقط الفرق»:** الصورة نفسها بشرائحها نفسها، تُخبز PNG وتُحفظ لقطةً في المكتبة بجوار الحالية — في
 * مشروعها، وبرابطها وأصلها، فتظهر حيث يبحث عنها صاحبها. وتحفظها الصفحة مباشرةً كما تقرأ لقطتيها
 * (`load.ts`): أصل الصفحة أصل الإضافة، والكتابة بمعاملة `putCaptureWithBlob` الذرّية نفسها.
 */

import { bakeRaster } from '@/modules/editor/bake'
import {
  fullPageWindow,
  orientationFor,
  pageBox,
  planImagePages,
  textPagePixels,
  type PageSizeId,
} from '@/modules/export/pdf-layout'
import { errText, ok, type Result } from '@/shared/result'
import { putCaptureWithBlob } from '@/shared/storage/repository'

import { createBakeSurface } from '../editor/export'
import { bakeDocPages } from '../export/doc-render'
import { bakedBreakFinder } from '../export/pdf-export'

import { compositeSliceSource, type DiffComposite } from './diff-slices'

import type { ExportBytes } from '@/modules/editor/bake'
import type { PdfMetadata, PdfPage } from '@/modules/export/pdf'
import type { DocBlock } from '@/modules/export/pdf-document'
import type { CaptureRecord } from '@/shared/storage/schema'

export interface ReportExportOptions {
  readonly blocks: readonly DocBlock[]
  /** `null` حين لا تُضمَّن صورة الفرق. */
  readonly composite: DiffComposite | null
  readonly size: PageSizeId
  readonly metadata: PdfMetadata | null
  readonly onProgress?: (fraction: number) => void
}

export interface ReportExportResult {
  readonly blob: Blob
  readonly pageCount: number
}

export interface ReportRun {
  readonly done: Promise<Result<ReportExportResult>>
  cancel(): void
}

/** صورة الفرق PNG من البوّابة — معتمةً لـPDF، وبالسطح الافتراضي لـ«التقط الفرق». */
function bakeComposite(
  composite: DiffComposite,
  opaque: boolean,
  signal: { readonly aborted: boolean },
  onProgress?: (fraction: number) => void,
) {
  return bakeRaster({
    width: composite.width,
    height: composite.height,
    format: 'png',
    surface: createBakeSurface({ opaque }),
    sliceSource: compositeSliceSource(composite),
    signal,
    ...(onProgress ? { onProgress } : {}),
  })
}

export function startReportExport(options: ReportExportOptions): ReportRun {
  const signal = { aborted: false }
  const progress = options.onProgress ?? (() => undefined)
  const cancelled = () => errText('cancelled', 'أُلغي التصدير.')

  const done = (async (): Promise<Result<ReportExportResult>> => {
    const summaryBox = pageBox(options.size, 'portrait')
    const docs = await bakeDocPages(options.blocks, summaryBox, signal)
    if (!docs.ok) return docs
    progress(0.3)
    if (signal.aborted) return cancelled()

    const pixels = textPagePixels(summaryBox)
    const images: ExportBytes[] = [...docs.value]
    const pages: PdfPage[] = docs.value.map((_, image) => ({
      image,
      box: summaryBox,
      window: fullPageWindow(summaryBox, pixels.width, pixels.height),
    }))

    if (options.composite) {
      const composite = options.composite
      const baked = await bakeComposite(composite, true, signal, (f) => progress(0.3 + f * 0.5))
      if (!baked.ok) return baked
      if (signal.aborted) return cancelled()
      const box = pageBox(options.size, orientationFor(composite.width, composite.height))
      const windows = await planImagePages(
        composite.width,
        composite.height,
        box,
        'multi',
        bakedBreakFinder(baked.value.blob, composite.width),
      )
      images.push(baked.value.blob)
      for (const window of windows) pages.push({ image: images.length - 1, box, window })
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
      pageCount: pages.length,
    })
  })()

  return {
    done,
    cancel: () => {
      signal.aborted = true
    },
  }
}

/** عنوان لقطة الفرق في المكتبة — تُعرف به بين لقطتيها. */
export function diffCaptureTitle(a: CaptureRecord, b: CaptureRecord): string {
  return `الفرق — ${b.title || 'اللقطة ب'} مقابل ${a.title || 'اللقطة أ'}`
}

/** سجلّ لقطة الفرق: من الحالية أصلها ورابطها ومشروعها وكثافتها، ومن الصورة أبعادها. */
export function diffCaptureRecord(
  a: CaptureRecord,
  b: CaptureRecord,
  size: { readonly width: number; readonly height: number },
  id: string,
  now: number,
): CaptureRecord {
  return {
    id,
    createdAt: now,
    origin: b.origin,
    url: b.url,
    title: diffCaptureTitle(a, b),
    kind: b.kind,
    status: 'ready',
    projectId: b.projectId,
    tags: [],
    width: size.width,
    height: size.height,
    devicePixelRatio: b.devicePixelRatio,
    favorite: false,
    archived: false,
    trashedAt: null,
  }
}

/** «التقط الفرق»: الخبز ثمّ الحفظ في المكتبة. يُعيد معرّف اللقطة الجديدة. */
export async function saveDiffCapture(
  a: CaptureRecord,
  b: CaptureRecord,
  composite: DiffComposite,
): Promise<Result<string>> {
  const baked = await bakeComposite(composite, false, { aborted: false })
  if (!baked.ok) return baked
  const record = diffCaptureRecord(a, b, composite, crypto.randomUUID(), Date.now())
  return putCaptureWithBlob(record, baked.value.blob)
}
