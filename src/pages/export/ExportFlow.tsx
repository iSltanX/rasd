import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import { planExport, type BakeReport } from '@/modules/editor/bake'
import { estimateSize, type QualityLevel } from '@/modules/export/estimate'
import { exportFilename, pdfFilename } from '@/modules/export/filename'
import { CLIPBOARD_FORMAT, isDocumentFormat, type OutputFormat } from '@/modules/export/format'
import {
  estimateImagePages,
  orientationFor,
  type PdfLayoutOptions,
} from '@/modules/export/pdf-layout'
import { collectSignals, type ExportSignal } from '@/modules/export/signals'
import { watchSettings } from '@/shared/settings'
import { projects } from '@/shared/storage/repository'

import { copyBaked, startExport } from '../editor/export'
import { browserLabel } from '../editor/page-meta'
import { ExportProgress } from '../editor/parts/ExportProgress'

import { deliver, revealDownload, type Delivered } from './deliver'
import { ExportDone, type DocumentDone } from './ExportDone'
import { ExportModal } from './ExportModal'
import { captureDetails, captureMetadata, visibleNoteCount } from './pdf-content'
import { startPdfExport } from './pdf-export'
import { resolveRoute, usePermissionProbe } from './route'

import type { NoteIssues } from '../editor/note-issues'
import type { BlurClient } from '../editor/worker-client'
import type { RenderStyle } from '@/modules/editor/renderer'
import type { Scene } from '@/modules/editor/scene'
import type { TextLayoutCache } from '@/modules/editor/text-layout'
import type { CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface ExportFlowProps {
  readonly scene: Scene
  readonly sourceBlob: Blob
  readonly style: RenderStyle
  readonly layout: TextLayoutCache
  readonly client: BlurClient
  /** سجلّ اللقطة — عنوانها للترويسة ولاسم الملفّ، وبقيّته لبيانات الصفحة في PDF. */
  readonly capture: CaptureRecord
  /** مشكلات الملاحظات بمعرّف الملاحظة — لقائمة الملاحظات في PDF. */
  readonly noteIssues: NoteIssues
  readonly onClose: () => void
}

interface DoneState {
  readonly report: BakeReport
  readonly scale: 1 | 2
  readonly filename: string
  readonly delivered: Delivered | null
  readonly note: string | null
  readonly signals: readonly ExportSignal[]
  readonly url: string
  readonly document?: DocumentDone
}

/**
 * تقدير صفحة التفاصيل في الملخّص: صفحةٌ نصّية بيضاء في أغلبها تخرج PNG بعشرات الكيلوبايتات. تقديرٌ يُعلَن
 * بـ«~» كبقيّة الملخّص، والرقم اليقيني في شاشة النتيجة.
 */
const DETAILS_PAGE_BYTES = 60_000

/**
 * تدفّق التصدير كاملًا: الخيارات ← الخبز ← النتيجة.
 *
 * **ثلاث حقائق تشكّل هذا الملفّ، وكلٌّ منها كسرَ تصميمًا أبسط:**
 *
 * ١. **حالة الصلاحية تُقرأ عند التركيب لا عند النقرة** (`route.ts`). `hasPermission` غير متزامنة، و`await`
 *    واحدة قبل `chrome.permissions.request` تكسر سلسلة إيماءة المستخدم فيرمي النداء.
 *
 * ٢. **النسخ إلى الحافظة يبدأ خبزةً خاصّة به.** الحافظة ترفض WebP بالقياس،
 *    فلو مُرِّرت خبزةُ التنزيل المختارة لفشل النسخ كلّما اختير WebP. تبدأ
 *    خبزةُ PNG مستقلّة، ويُسلَّم **وعدها** إلى `copyBaked` في النبضة نفسها.
 *
 * ٣. **الرفض لا يُفشل التصدير.** يُسجَّل للجلسة، ويُسلَك مسار المرساة فورًا،
 *    ويُعلَن ما فُقد في شاشة النتيجة. ولا يُعاد السؤال.
 *
 * **وPDF مسارٌ ثالث لا فرعٌ في الخبز** (`pdf-export.ts`): الصورة تُخبز PNG معتمة من البوّابة نفسها، ثمّ تُلفّ.
 * واسم المشروع يُقرأ بعد حسم الطريق لا قبله — قراءةٌ غير متزامنة قبل طلب الصلاحية تكسر الإيماءة كما في ١.
 */
export function ExportFlow(props: ExportFlowProps): JSX.Element {
  const [format, setFormat] = useState<OutputFormat>('png')
  const [scale, setScale] = useState<1 | 2>(2)
  const [quality, setQuality] = useState<QualityLevel>('max')
  const plan = planExport(props.scene, scale)
  const source = planExport(props.scene, 1)
  const [pdf, setPdf] = useState<PdfLayoutOptions>(() => ({
    size: 'a4',
    orientation: orientationFor(source.width, source.height),
    split: 'multi',
  }))
  const noteCount = visibleNoteCount(props.scene)
  const [includeNotes, setIncludeNotes] = useState(noteCount > 0)
  const [includePageMeta, setIncludePageMeta] = useState(false)
  const [running, setRunning] = useState(false)
  const [fraction, setFraction] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  const [done, setDone] = useState<DoneState | null>(null)

  /** الحالة المستطلَعة — تُقرأ متزامنًا داخل معالج النقرة. */
  const permission = usePermissionProbe()
  const cancelRef = useRef<() => void>(() => undefined)
  const urlRef = useRef<string | null>(null)
  /**
   * `privacy.stripMetadataOnExport` — مرجعٌ يقرؤه الخبز، وحالةٌ تعرضها النافذة (تعطّل «بيانات الصفحة»).
   * تُقرأ عبر `watchSettings` لا قراءةً واحدة: تبويبٌ آخر يغيّر الإعداد ثمّ هذه النافذة تُصدِّر بالقيمة الحيّة.
   */
  const stripMetadata = useRef(false)
  const [strip, setStrip] = useState(false)

  useEffect(
    () =>
      watchSettings((settings) => {
        stripMetadata.current = settings.privacy.stripMetadataOnExport
        setStrip(settings.privacy.stripMetadataOnExport)
      }),
    [],
  )

  // عنوان الكائن يعيش حتى تُغلَق النافذة — الرابط يُعرض ويُنقَر بعد الخبز.
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const withDetails = (includeNotes && noteCount > 0) || (includePageMeta && !strip)
  const pdfSummary = {
    pages: estimateImagePages(source.width, source.height, pdf) + (withDetails ? 1 : 0),
    bytes:
      estimateSize(source.width, source.height, 'png', 'max').bytes +
      (withDetails ? DETAILS_PAGE_BYTES : 0),
  }

  const runBake = useCallback(
    (chosen: 'png' | 'webp', chosenQuality: QualityLevel) => {
      setError(null)
      setFraction(0)
      setRunning(true)
      // محاولة جديدة تمحو ما قبلها: لا يبقى «أُلغي التصدير» فوق تصديرٍ ينجح بعده.
      setCancelled(false)
      const run = startExport({
        scene: props.scene,
        sourceBlob: props.sourceBlob,
        scale,
        format: chosen,
        quality: chosenQuality,
        stripMetadata: stripMetadata.current,
        style: props.style,
        layout: props.layout,
        client: props.client,
        onProgress: setFraction,
      })
      cancelRef.current = () => run.cancel()
      return run
    },
    [props.scene, props.sourceBlob, props.style, props.layout, props.client, scale],
  )

  const keepUrl = (blob: Blob): string => {
    const url = URL.createObjectURL(blob)
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
    return url
  }

  /** صورة: الخبز بالصيغة المختارة ثمّ التسليم. */
  const finishImage = async (
    chosen: 'png' | 'webp',
    route: 'managed' | 'anchor',
    note: string | null,
  ): Promise<void> => {
    const run = runBake(chosen, quality)
    const result = await run.done
    setRunning(false)
    if (!result.ok) {
      if (result.error.code !== 'cancelled') setError(result.error.message)
      return
    }

    const filename = exportFilename(props.capture.title, scale, result.value.report.format)
    const url = keepUrl(result.value.blob)
    const delivered = await deliver({ route, url, filename })
    setDone({
      report: result.value.report,
      scale,
      filename,
      delivered,
      note: delivered.route === 'anchor' ? note : null,
      signals: collectSignals({
        scene: props.scene,
        layout: props.layout,
        report: result.value.report,
      }),
      url,
    })
  }

  /** PDF: اسم المشروع، ثمّ الخبز والقسمة والتفاصيل والحاوية (`pdf-export.ts`)، ثمّ التسليم. */
  const finishPdf = async (route: 'managed' | 'anchor', note: string | null): Promise<void> => {
    setError(null)
    setFraction(0)
    setRunning(true)
    setCancelled(false)

    const strip = stripMetadata.current
    const project = props.capture.projectId ? await projects.get(props.capture.projectId) : null
    const projectName = project?.ok ? project.value.name : null
    const details = captureDetails({
      capture: props.capture,
      projectName,
      browser: browserLabel(navigator),
      pageMeta: includePageMeta && !strip,
      notes: includeNotes,
      scene: props.scene,
      noteIssues: props.noteIssues,
    })
    const run = startPdfExport({
      scene: props.scene,
      sourceBlob: props.sourceBlob,
      style: props.style,
      layout: props.layout,
      client: props.client,
      pages: pdf,
      details,
      metadata: captureMetadata(props.capture, projectName, strip, new Date()),
      onProgress: setFraction,
    })
    cancelRef.current = () => run.cancel()
    const result = await run.done
    setRunning(false)
    if (!result.ok) {
      if (result.error.code !== 'cancelled') setError(result.error.message)
      return
    }

    const filename = pdfFilename(props.capture.title)
    const url = keepUrl(result.value.blob)
    const delivered = await deliver({ route, url, filename })
    setDone({
      report: result.value.report,
      scale: 1,
      filename,
      delivered,
      note: delivered.route === 'anchor' ? note : null,
      signals: collectSignals({
        scene: props.scene,
        layout: props.layout,
        report: result.value.report,
      }),
      url,
      document: {
        pages: result.value.pageCount,
        size: pdf.size,
        orientation: pdf.orientation,
        bytes: result.value.blob.size,
        metadataStripped: strip,
      },
    })
  }

  /**
   * **يُستدعى متزامنًا من النقرة.** لا `await` قبل `resolveRoute` — طلب الصلاحية أوّل ما يقع فيه.
   */
  const onDownload = (): void => {
    const chosen = format
    void resolveRoute(permission).then(({ route, note }) =>
      isDocumentFormat(chosen) ? finishPdf(route, note) : finishImage(chosen, route, note),
    )
  }

  /**
   * **يُستدعى متزامنًا من النقرة، ويُسلّم الوعد لا البلوب.**
   *
   * وصيغته PNG دائمًا — لا `format` المختارة. انظر الحقيقة ٢ في الترويسة.
   */
  const onCopy = (): void => {
    const run = runBake(CLIPBOARD_FORMAT, 'max')
    void copyBaked(run.bytes).then((copied) => {
      if (!copied.ok) setError(copied.error.message)
    })
    void run.done.then((result) => {
      setRunning(false)
      if (!result.ok) {
        if (result.error.code !== 'cancelled') setError(result.error.message)
        return
      }
      setDone({
        report: result.value.report,
        scale,
        filename: exportFilename(props.capture.title, scale, result.value.report.format),
        delivered: null,
        note: null,
        signals: collectSignals({
          scene: props.scene,
          layout: props.layout,
          report: result.value.report,
        }),
        url: keepUrl(result.value.blob),
      })
    })
  }

  if (running) {
    const progressPlan = isDocumentFormat(format) ? source : plan
    return (
      <ExportProgress
        fraction={fraction}
        width={progressPlan.width}
        height={progressPlan.height}
        scale={isDocumentFormat(format) ? 1 : scale}
        error={error}
        onCancel={() => {
          cancelRef.current()
          setRunning(false)
          setCancelled(true)
        }}
      />
    )
  }

  if (done) {
    return (
      <ExportDone
        report={done.report}
        {...(done.document ? { document: done.document } : {})}
        scale={done.scale}
        filename={done.filename}
        shown={done.delivered?.shown ?? done.filename}
        downloadId={done.delivered?.downloadId ?? null}
        note={done.note}
        signals={done.signals}
        blobUrl={done.url}
        onReveal={() => {
          if (done.delivered?.downloadId !== null && done.delivered !== null) {
            revealDownload(done.delivered.downloadId)
          }
        }}
        onCopy={onCopy}
        onClose={props.onClose}
      />
    )
  }

  const shown = isDocumentFormat(format) ? source : plan
  return (
    <ExportModal
      title={props.capture.title}
      scale={scale}
      format={format}
      quality={quality}
      pdf={pdf}
      pdfSummary={pdfSummary}
      includeNotes={includeNotes}
      includePageMeta={includePageMeta}
      noteCount={noteCount}
      stripMetadata={strip}
      width={shown.width}
      height={shown.height}
      blocked={shown.ok ? null : shown.reason}
      busy={running}
      error={error}
      cancelled={cancelled}
      onScale={setScale}
      onFormat={setFormat}
      onQuality={setQuality}
      onPdf={setPdf}
      onIncludeNotes={setIncludeNotes}
      onIncludePageMeta={setIncludePageMeta}
      onDownload={onDownload}
      onCopy={onCopy}
      onClose={props.onClose}
    />
  )
}
