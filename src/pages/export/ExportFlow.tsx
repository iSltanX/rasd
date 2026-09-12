import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import { planExport, type BakeReport } from '@/modules/editor/bake'
import { afterAsk, planDownload, type PermissionState } from '@/modules/export/download'
import { type QualityLevel } from '@/modules/export/estimate'
import { exportFilename } from '@/modules/export/filename'
import { CLIPBOARD_FORMAT, type ExportFormat } from '@/modules/export/format'
import { collectSignals, type ExportSignal } from '@/modules/export/signals'
import { hasPermission, requestPermission } from '@/shared/permissions'

import { copyBaked, startExport } from '../editor/export'
import { ExportProgress } from '../editor/parts/ExportProgress'

import { deliver, revealDownload, type Delivered } from './deliver'
import { ExportDone } from './ExportDone'
import { ExportModal } from './ExportModal'
import { downloadsRefused, rememberRefusal } from './permission-memory'

import type { BlurClient } from '../editor/worker-client'
import type { RenderStyle } from '@/modules/editor/renderer'
import type { Scene } from '@/modules/editor/scene'
import type { TextLayoutCache } from '@/modules/editor/text-layout'
import type { JSX } from 'preact'

export interface ExportFlowProps {
  readonly scene: Scene
  readonly sourceBlob: Blob
  readonly style: RenderStyle
  readonly layout: TextLayoutCache
  readonly client: BlurClient
  /** عنوان اللقطة — للترويسة ولاسم الملفّ. */
  readonly title: string
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
}

/**
 * تدفّق التصدير كاملًا: الخيارات ← الخبز ← النتيجة.
 *
 * **ثلاث حقائق تشكّل هذا الملفّ، وكلٌّ منها كسرَ تصميمًا أبسط:**
 *
 * ١. **حالة الصلاحية تُقرأ عند التركيب لا عند النقرة.** `hasPermission`
 *    غير متزامنة، و`await` واحدة قبل `chrome.permissions.request` تكسر سلسلة
 *    إيماءة المستخدم فيرمي النداء. فالحالة تُستطلَع مسبقًا وتُقرأ من مرجع
 *    متزامن لحظة النقر — نفس شكل `Popup.tsx` الذي يعمل.
 *
 * ٢. **النسخ إلى الحافظة يبدأ خبزةً خاصّة به.** الحافظة ترفض WebP بالقياس،
 *    فلو مُرِّرت خبزةُ التنزيل المختارة لفشل النسخ كلّما اختير WebP. تبدأ
 *    خبزةُ PNG مستقلّة، ويُسلَّم **وعدها** إلى `copyBaked` في النبضة نفسها.
 *
 * ٣. **الرفض لا يُفشل التصدير.** يُسجَّل للجلسة، ويُسلَك مسار المرساة فورًا،
 *    ويُعلَن ما فُقد في شاشة النتيجة. ولا يُعاد السؤال.
 */
export function ExportFlow(props: ExportFlowProps): JSX.Element {
  const [format, setFormat] = useState<ExportFormat>('png')
  const [scale, setScale] = useState<1 | 2>(2)
  const [quality, setQuality] = useState<QualityLevel>('max')
  const [running, setRunning] = useState(false)
  const [fraction, setFraction] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<DoneState | null>(null)

  /** الحالة المستطلَعة — تُقرأ متزامنًا داخل معالج النقرة. */
  const permission = useRef<PermissionState>('unknown')
  const cancelRef = useRef<() => void>(() => undefined)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      if (await hasPermission(['downloads'])) {
        if (live) permission.current = 'granted'
        return
      }
      if (await downloadsRefused()) {
        if (live) permission.current = 'denied'
      }
    })()
    return () => {
      live = false
    }
  }, [])

  // عنوان الكائن يعيش حتى تُغلَق النافذة — الرابط يُعرض ويُنقَر بعد الخبز.
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const plan = planExport(props.scene, scale)

  const runBake = useCallback(
    (chosen: ExportFormat, chosenQuality: QualityLevel) => {
      setError(null)
      setFraction(0)
      setRunning(true)
      const run = startExport({
        scene: props.scene,
        sourceBlob: props.sourceBlob,
        scale,
        format: chosen,
        quality: chosenQuality,
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

  /**
   * **يُستدعى متزامنًا من النقرة.** لا `await` قبل `requestPermission`.
   */
  const onDownload = useCallback(() => {
    const decision = planDownload(permission.current)

    const finish = async (route: 'managed' | 'anchor', note: string | null): Promise<void> => {
      const run = runBake(format, quality)
      const result = await run.done
      setRunning(false)
      if (!result.ok) {
        if (result.error.code !== 'cancelled') setError(result.error.message)
        return
      }

      const filename = exportFilename(props.title, scale, result.value.report.format)
      const url = URL.createObjectURL(result.value.blob)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url

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

    if (!decision.ask) {
      void finish(decision.route, decision.note)
      return
    }

    // الطلب أوّل ما يقع في السلسلة — قبل أي انتظار.
    void requestPermission(['downloads']).then(async (outcome) => {
      const next = afterAsk(outcome)
      if (next.remember) {
        permission.current = next.remember
        if (next.remember === 'denied') await rememberRefusal()
      }
      await finish(next.decision.route, next.decision.note)
    })
  }, [format, quality, scale, props.title, props.scene, props.layout, runBake])

  /**
   * **يُستدعى متزامنًا من النقرة، ويُسلّم الوعد لا البلوب.**
   *
   * وصيغته PNG دائمًا — لا `format` المختارة. انظر الحقيقة ٢ في الترويسة.
   */
  const onCopy = useCallback(() => {
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
      const url = URL.createObjectURL(result.value.blob)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      setDone({
        report: result.value.report,
        scale,
        filename: exportFilename(props.title, scale, result.value.report.format),
        delivered: null,
        note: null,
        signals: collectSignals({
          scene: props.scene,
          layout: props.layout,
          report: result.value.report,
        }),
        url,
      })
    })
  }, [runBake, scale, props.title, props.scene, props.layout])

  if (running) {
    return (
      <ExportProgress
        fraction={fraction}
        width={plan.width}
        height={plan.height}
        scale={scale}
        error={error}
        onCancel={() => {
          cancelRef.current()
          setRunning(false)
        }}
      />
    )
  }

  if (done) {
    return (
      <ExportDone
        report={done.report}
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

  return (
    <ExportModal
      title={props.title}
      scale={scale}
      format={format}
      quality={quality}
      width={plan.width}
      height={plan.height}
      blocked={plan.ok ? null : plan.reason}
      busy={running}
      error={error}
      onScale={setScale}
      onFormat={setFormat}
      onQuality={setQuality}
      onDownload={onDownload}
      onCopy={onCopy}
      onClose={props.onClose}
    />
  )
}
