import { useEffect, useRef } from 'preact/hooks'

import { formatBytes, formatDimensions, formatHuman } from '@/shared/bidi'
import { Button } from '@/ui/components'
import { TechnicalValue } from '@/ui/TechnicalValue'

import styles from './export.module.css'

import type { BakeReport } from '@/modules/editor/bake'
import type { ExportSignal } from '@/modules/export/signals'
import type { JSX } from 'preact'

export interface ExportDoneProps {
  readonly report: BakeReport
  readonly scale: 1 | 2
  readonly filename: string
  /** المسار كما يعرضه المتصفّح، أو الاسم وحده على مسار المرساة. */
  readonly shown: string
  /** `null` على مسار المرساة — ولا يظهر زرّ «افتح المجلّد» بدونه. */
  readonly downloadId: number | null
  /** ما فُقد بالتدهور، أو `null`. */
  readonly note: string | null
  readonly signals: readonly ExportSignal[]
  /**
   * عنوان كائن البايتات المُنتَجة.
   *
   * **مقبض فحصٍ لا زينة**: `verify:export` يجلبه ويفكّ ترميزه فعليًّا —
   * توقيعٌ سحري وحده لا يُثبت أن الملفّ يُفتَح، وADR 0015 §8 يشترط فحص
   * البايتات لا شكلها.
   */
  readonly blobUrl: string
  readonly onReveal: () => void
  readonly onCopy: (event: MouseEvent) => void
  readonly onClose: () => void
}

/**
 * `export / done` — إطار Figma `129:1533`.
 *
 * **وصفّ «البيانات الوصفية» يقول الحقيقة لا نصّ الإطار.** الإطار يكتب
 * «محذوفة» ثابتًا. والحذف على مستوى البايتات نطاق الوحدة **19.2** بحرفه
 * (‏`stripMetadataOnExport`)، وقِيس فوق ذلك أن مُرمِّج WebP في كروم يكتب
 * مقطع `ICCP` بـ456 بايتًا في **كل** مخرَج عند كل جودة — بينما PNG يخرج
 * بلا أي مقطع نصّي. فعرضُ «محذوفة» اليوم كان كذبًا على الصيغتين معًا:
 * كذبًا بالادّعاء على PNG (لم يُحذف شيء، لم يُكتب شيء أصلًا)، وكذبًا
 * بالحقيقة على WebP.
 *
 * **وهنا تُعرَض الإشارات الثلاث** التي حسبتها المرحلة 15 ولم يقرأها أحد.
 * وقائمةٌ فارغة تُعلَن «لا ملاحظات» ولا تُخفى: غيابُ القسم يُقرأ «لم يُفحَص».
 */
export function ExportDone(props: ExportDoneProps): JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])

  const guaranteed = props.report.obscured.filter((o) => o.guaranteed).length

  return (
    <div
      class={styles.scrim}
      data-export-result=""
      data-export-blob={props.blobUrl}
      data-export-bytes={props.report.bytes}
      role="dialog"
      aria-modal="true"
      aria-label="اكتمل التصدير"
    >
      <div class={styles.modal}>
        <header class={styles.head}>
          <button
            type="button"
            ref={closeRef}
            class={styles.close}
            data-export-close
            aria-label="إغلاق"
            onClick={props.onClose}
          >
            ✕
          </button>
          <div class={styles.headText}>
            <h2 class={styles.title}>اكتمل التصدير</h2>
            {/* غربية: قياسٌ لا عدٌّ بشري — §3.5. */}
            <TechnicalValue kind="dimension" variant="mono-xs">
              {`${props.report.format.toUpperCase()} · ${formatDimensions(props.report.width, props.report.height)} · ${formatBytes(props.report.bytes)}`}
            </TechnicalValue>
          </div>
        </header>

        <div class={styles.body}>
          <p class={styles.path} data-export-path>
            <TechnicalValue kind="path" variant="mono-xs">
              {props.shown}
            </TechnicalValue>
          </p>

          <div class={styles.card}>
            <div class={styles.row}>
              <span class={styles.rowLabel}>الصيغة</span>
              <TechnicalValue kind="format" variant="mono-xs">
                {props.report.format.toUpperCase()}
              </TechnicalValue>
            </div>
            <div class={styles.row}>
              <span class={styles.rowLabel}>الدقة</span>
              <span class={styles.rowValue} data-export-scale-shown>
                {props.scale === 2 ? '2× ريتينا' : '1×'}
              </span>
            </div>
            <div class={styles.row}>
              <span class={styles.rowLabel}>التعليقات</span>
              <span class={styles.rowValue}>مدموجة</span>
            </div>
            <div class={styles.row}>
              <span class={styles.rowLabel}>الحجب</span>
              <span class={styles.rowValue} data-export-guaranteed={guaranteed}>
                {guaranteed > 0
                  ? `${formatHuman(guaranteed)} منطقة غير قابلة للعكس`
                  : 'لا مناطق محجوبة'}
              </span>
            </div>
            <div class={styles.row}>
              <span class={styles.rowLabel}>البيانات الوصفية</span>
              {/*
               * الحقيقة لا نصّ الإطار — انظر ترويسة الملفّ. والصيغتان
               * تختلفان، فالنصّ يُشتقّ من الصيغة المُنتَجة لا يُكتب ثابتًا.
               */}
              <span class={styles.rowValue} data-export-metadata={props.report.format}>
                {props.report.format === 'png'
                  ? 'لم تُكتَب — الملفّ بلا مقاطع نصّية'
                  : 'ملفّ ألوان مضمَّن — حذفه في 19.2'}
              </span>
            </div>
          </div>

          <section class={styles.signals} data-export-signals={props.signals.length}>
            <h3 class={styles.groupLabel}>ملاحظات التصدير</h3>
            {props.signals.length === 0 ? (
              <p class={styles.note}>لا ملاحظات — كل ما في المشهد خرج كما هو معروض.</p>
            ) : (
              <ul class={styles.signalList}>
                {props.signals.map((signal) => (
                  <li
                    key={signal.kind}
                    class={styles.signal}
                    data-signal={signal.kind}
                    data-tone={signal.tone}
                  >
                    {/* هندية: عدٌّ بشري لمرّات الوقوع — §3.5. */}
                    <span class={styles.signalCount}>{formatHuman(signal.count)}</span>
                    <span>{signal.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {props.note ? (
            <p class={styles.note} data-export-degraded>
              {props.note}
            </p>
          ) : null}
        </div>

        <footer class={styles.actions}>
          <Button variant="secondary" icon="copy" onClick={props.onCopy}>
            انسخ إلى الحافظة
          </Button>
          {props.downloadId === null ? null : (
            <Button variant="primary" icon="folder" onClick={props.onReveal}>
              افتح المجلّد
            </Button>
          )}
        </footer>
      </div>
    </div>
  )
}
