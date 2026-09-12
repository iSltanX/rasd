import { useEffect, useRef, useState } from 'preact/hooks'

import { planExport, type BakeReport } from '@/modules/editor/bake'
import { CLIPBOARD_FORMAT } from '@/modules/export/format'

import { copyBaked, startExport } from '../export'
import { ExportProgress } from '../parts/ExportProgress'

import type { BlurClient } from '../worker-client'
import type { RenderStyle } from '@/modules/editor/renderer'
import type { Scene } from '@/modules/editor/scene'
import type { TextLayoutCache } from '@/modules/editor/text-layout'
import type { JSX } from 'preact'

export interface ExportingProps {
  readonly scene: Scene
  readonly sourceBlob: Blob
  readonly scale: 1 | 2
  readonly style: RenderStyle
  readonly layout: TextLayoutCache
  readonly client: BlurClient
  readonly onDone: (report: BakeReport, blob: Blob) => void
  readonly onClose: () => void
}

/**
 * حالة `exporting`.
 *
 * **تبدأ التصدير عند التركيب، وتُسلّم الوعد للحافظة في اللحظة نفسها.**
 * انتظار الخبز ثمّ النسخ يفشل: بوّابة الحافظة تُقيَّم لحظة نداء `write`،
 * وقد ضاع تركيز المستند حينها. والقياس في ترويسة `export.ts`.
 */
export function Exporting(props: ExportingProps): JSX.Element {
  const [fraction, setFraction] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    let live = true
    const run = startExport({
      scene: props.scene,
      sourceBlob: props.sourceBlob,
      scale: props.scale,
      /*
       * **PNG لا الصيغة المختارة.** وجهة هذا المسار الحافظة وحدها، والحافظة
       * ترفض WebP بالقياس (‏`NotAllowedError: Type image/webp not supported
       * on write`). فالثابت يُقرأ من مصدره لا يُكتب هنا.
       */
      format: CLIPBOARD_FORMAT,
      style: props.style,
      layout: props.layout,
      client: props.client,
      onProgress: (f) => {
        if (live) setFraction(f)
      },
    })
    cancelRef.current = () => run.cancel()

    /*
     * **النسخ يُطلَق الآن، بالوعد.** لا `await run.done` قبله: نداء
     * `clipboard.write` يجب أن يقع بينما المستند مركَّز، وكروم يحجز خانة
     * الحافظة ويملؤها حين يحلّ الوعد.
     */
    void copyBaked(run.bytes).then((copied) => {
      if (!live || copied.ok) return
      setError(copied.error.message)
    })

    void run.done.then((result) => {
      if (!live) return
      if (result.ok) {
        props.onDone(result.value.report, result.value.blob)
        return
      }
      // الإلغاء ليس خطأً يُعرض — هو ما طلبه المستخدم.
      if (result.error.code === 'cancelled') props.onClose()
      else setError(result.error.message)
    })

    return () => {
      live = false
      run.cancel()
    }
  }, [props.scene, props.sourceBlob, props.scale])

  const plan = planExport(props.scene, props.scale)

  return (
    <ExportProgress
      fraction={fraction}
      width={plan.width}
      height={plan.height}
      scale={props.scale}
      error={error}
      onCancel={() => {
        cancelRef.current()
        props.onClose()
      }}
    />
  )
}
