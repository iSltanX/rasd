/**
 * تصدير الدليل — خبز صور الخطوات من المخرج الواحد، ثمّ بناء الصيغة المختارة ([ADR 0041](../../../Docs/ADR/0041-guide-record-and-exports.md)).
 *
 * **كل صورة من لقطتها بمشهدها** (`loadEvidence` من حزمة التسليم): الأصل لا المصغَّرة، والحجب والتعليقات فيها
 * لأنها من البوّابة نفسها (ADR 0015). ولقطةٌ فُقدت أو مشهدٌ لا يُقرأ يُسقط التصدير **برقم خطوته** — لا دليلٌ
 * تغيب منه خطوة بصمت، ولا صورةٌ تخرج بلا حجبها.
 *
 * **ولكل صيغةٍ ترميزها:** PDF بـPNG على سطحٍ معتم (يدخل الحاوية كما خرج)، والحزمة بـPNG بلا فقد، والصفحة
 * المستقلّة بـWebP عالية الجودة — ملفٌّ واحد يحمل صوره Base64 فيدفع حجمها مضاعفًا بالثلث. وMarkdown وحدها نصٌّ
 * بلا صور فلا خبز.
 *
 * والمولِّد يُحمَّل كسولًا — `import()` لـ`pdf.ts` بعد الخبز، كما في تصدير اللقطة.
 */

import {
  assembleGuideZip,
  buildGuideModel,
  guideCoverBlocks,
  guideFilename,
  layoutStepHeader,
  MIME,
  planStepWindows,
  renderGuideHtml,
  renderGuideMarkdown,
  type GuideHtmlImage,
  type GuideHtmlPalette,
  STEP_FORMS,
  type GuideModel,
} from '@/modules/export/guide'
import { fullPageWindow, pageBox, textPagePixels } from '@/modules/export/pdf-layout'
import { countText, formatHuman } from '@/shared/bidi/numerals'
import { errText, ok, type Result } from '@/shared/result'
import { resolveColor } from '@/tokens/tokens'

import { createBakeSurface, startExport } from '../editor/export'
import { loadEvidence, type BakeTools } from '../handoff/evidence'

import { bakeDocPages, bakeLaidOutPages, docMeasurer } from './doc-render'
import { bakedBreakFinder } from './pdf-export'

import type { ExportBytes } from '@/modules/editor/bake'
import type { PdfPage } from '@/modules/export/pdf'
import type { GuideExportOptions, GuideStep } from '@/shared/guide-schema'

export interface GuideExportInput {
  readonly title: string
  readonly steps: readonly GuideStep[]
  readonly captureTitles: ReadonlyMap<string, string>
  readonly options: GuideExportOptions
  readonly version: string
  readonly now: number
  readonly tools: BakeTools
  readonly signal: AbortSignal
  /** الخطوات المخبوزة من عددها — ما يعرضه `guide / export-loading`. */
  readonly onProgress?: (done: number, total: number) => void
}

export interface GuideExportResult {
  readonly blob: Blob
  readonly filename: string
  /** صفحات PDF — `null` لغيرها. */
  readonly pages: number | null
}

/** ألوان الصفحة المستقلّة من التوكنز بوضعيها — نفس لوحة الواجهة، مكتوبةً قيمًا في ملفٍّ يُفتح بلا الإضافة. */
export function guidePalette(): GuideHtmlPalette {
  const colors = (mode: 'light' | 'dark') => ({
    canvas: resolveColor('surface/canvas', mode),
    surface: resolveColor('surface/default', mode),
    text: resolveColor('text/primary', mode),
    muted: resolveColor('text/secondary', mode),
    border: resolveColor('border/subtle', mode),
    accent: resolveColor('surface/brand', mode),
    onAccent: resolveColor('text/on-brand', mode),
  })
  return { light: colors('light'), dark: colors('dark') }
}

interface BakedStep {
  readonly bytes: Uint8Array
  readonly blob: Blob
  readonly width: number
  readonly height: number
}

const cancelled = () => errText('cancelled', 'أُلغي التصدير.')

/** يخبز صورة كل خطوة بترتيبها — ويتوقّف عند أوّل فشلٍ برقم خطوته. */
async function bakeSteps(
  model: GuideModel,
  input: GuideExportInput,
  format: 'png' | 'webp',
  opaque: boolean,
): Promise<Result<Map<string, BakedStep>>> {
  const out = new Map<string, BakedStep>()
  const total = model.steps.length
  for (const [i, step] of model.steps.entries()) {
    if (input.signal.aborted) return cancelled()
    input.onProgress?.(i, total)
    if (out.has(step.captureId)) continue

    const source = await loadEvidence(step.captureId)
    if (!source.ok) {
      const what =
        source.error.code === 'not-found'
          ? `لم تُقرأ صورة الخطوة ${formatHuman(step.ordinal)} من المكتبة.`
          : `صورة الخطوة ${formatHuman(step.ordinal)}: ${source.error.message}`
      return errText(source.error.code, what, step.captureId)
    }
    // إلغاءٌ وقع أثناء قراءة اللقطة: لا يُبدأ خبزٌ لن يُسلَّم (المراجعة المستقلّة).
    if (input.signal.aborted) return cancelled()
    const run = startExport({
      scene: source.value.scene,
      sourceBlob: source.value.blob,
      scale: 1,
      format,
      quality: format === 'webp' ? 'high' : 'max',
      stripMetadata: input.tools.stripMetadata,
      style: input.tools.style,
      layout: input.tools.layout,
      client: input.tools.client,
      ...(opaque ? { surface: createBakeSurface({ opaque: true }) } : {}),
    })
    const stop = () => run.cancel()
    input.signal.addEventListener('abort', stop)
    const baked = await run.done
    input.signal.removeEventListener('abort', stop)
    if (!baked.ok) {
      if (baked.error.code === 'cancelled' || input.signal.aborted) return cancelled()
      return errText(
        baked.error.code,
        `صورة الخطوة ${formatHuman(step.ordinal)}: ${baked.error.message}`,
        step.captureId,
      )
    }
    const { blob, report } = baked.value
    out.set(step.captureId, {
      blob,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width: report.width,
      height: report.height,
    })
  }
  input.onProgress?.(total, total)
  return ok(out)
}

/** PDF: الغلاف، ثمّ لكل خطوة رأسها ولقطتها على صفحة واحدة ما اتّسعت، وباقي اللقطة الطويلة صفحاتٌ بعدها. */
async function buildGuidePdf(
  model: GuideModel,
  input: GuideExportInput,
  baked: ReadonlyMap<string, BakedStep>,
): Promise<Result<{ blob: Blob; pages: number }>> {
  const box = pageBox(input.options.pageSize, 'portrait')
  const pixels = textPagePixels(box)
  const fullPage = fullPageWindow(box, pixels.width, pixels.height)
  const measure = await docMeasurer()

  const images: ExportBytes[] = []
  const pages: PdfPage[] = []
  const addImage = (image: ExportBytes): number => images.push(image) - 1

  const cover = await bakeDocPages(guideCoverBlocks(model), box, input.signal)
  if (!cover.ok) return cover
  for (const page of cover.value) pages.push({ image: addImage(page), box, window: fullPage })

  for (const step of model.steps) {
    if (input.signal.aborted) return cancelled()
    const shot = baked.get(step.captureId)
    if (!shot) return errText('not-found', `صورة الخطوة ${formatHuman(step.ordinal)} غائبة.`)
    const header = layoutStepHeader(model, step, box, measure)
    const heads = await bakeLaidOutPages(header.pages, box, input.signal)
    if (!heads.ok) return heads
    const shotIndex = addImage(shot.blob as ExportBytes)
    const windows = await planStepWindows(
      shot.width,
      shot.height,
      box,
      header.bottom,
      bakedBreakFinder(shot.blob, shot.width),
    )

    heads.value.forEach((head, i) => {
      const last = i === heads.value.length - 1
      const under = last ? windows.filter((w) => w.withHeader) : []
      pages.push({
        image: addImage(head),
        box,
        window: fullPage,
        overlays: under.map((w) => ({ image: shotIndex, window: w.window })),
      })
    })
    for (const w of windows.filter((w) => !w.withHeader)) {
      pages.push({ image: shotIndex, box, window: w.window })
    }
  }
  if (input.signal.aborted) return cancelled()

  const { buildPdf } = await import('@/modules/export/pdf')
  const metadata = input.tools.stripMetadata
    ? null
    : {
        title: model.title,
        subject: `دليل خطوات — ${countText(model.steps.length, STEP_FORMS)}`,
        keywords: [],
        createdAt: new Date(model.generatedAt),
      }
  const built = await buildPdf({ images, pages, metadata })
  if (!built.ok) return built
  if (input.signal.aborted) return cancelled()
  return ok({ blob: new Blob([built.value], { type: MIME.pdf }), pages: pages.length })
}

/** يبني الملفّ بالصيغة المختارة — بلا تنزيل: التسليم لنافذة التصدير بطريقها المقرَّر. */
export async function runGuideExport(input: GuideExportInput): Promise<Result<GuideExportResult>> {
  const { format } = input.options
  const model = buildGuideModel({
    title: input.title,
    steps: input.steps,
    captureTitles: input.captureTitles,
    options: input.options,
    generatedAt: input.now,
    version: input.version,
    imageExtension: format === 'html' ? 'webp' : 'png',
  })
  if (model.steps.length === 0) return errText('invalid-data', 'لا خطوات في الدليل لتُصدَّر.')
  const filename = guideFilename(model.title, format)

  if (format === 'markdown') {
    input.onProgress?.(model.steps.length, model.steps.length)
    const text = renderGuideMarkdown(model, { images: false })
    return ok({ blob: new Blob([text], { type: MIME.markdown }), filename, pages: null })
  }

  const baked = await bakeSteps(model, input, format === 'html' ? 'webp' : 'png', format === 'pdf')
  if (!baked.ok) return baked

  if (format === 'zip') {
    const zipped = assembleGuideZip(
      model,
      new Map([...baked.value].map(([id, step]) => [id, step.bytes])),
    )
    if (!zipped.ok) return zipped
    return ok({ blob: new Blob([zipped.value.bytes], { type: MIME.zip }), filename, pages: null })
  }

  if (format === 'html') {
    const images = new Map<string, GuideHtmlImage>(
      [...baked.value].map(([id, step]) => [
        id,
        { bytes: step.bytes, mime: 'image/webp', width: step.width, height: step.height },
      ]),
    )
    const page = renderGuideHtml(model, images, guidePalette())
    if (!page.ok) return page
    return ok({ blob: new Blob([page.value], { type: MIME.html }), filename, pages: null })
  }

  const pdf = await buildGuidePdf(model, input, baked.value)
  if (!pdf.ok) return pdf
  return ok({ blob: pdf.value.blob, filename, pages: pdf.value.pages })
}
