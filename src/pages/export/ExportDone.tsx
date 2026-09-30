import { useEffect, useRef } from 'preact/hooks'

import {
  ORIENTATION_LABEL,
  PAGE_FORMS,
  PAGE_SIZES,
  type PageOrientation,
  type PageSizeId,
} from '@/modules/export/pdf-layout'
import { formatDimensions, formatHuman } from '@/shared/bidi'
import { countText, formatStorage } from '@/shared/bidi/numerals'
import { Button } from '@/ui/components'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import styles from './export.module.css'

import type { BakeReport } from '@/modules/editor/bake'
import type { ExportSignal } from '@/modules/export/signals'
import type { JSX } from 'preact'

/** ما تعرضه النتيجة عن ملفّ PDF — من الملفّ المُنتَج لا من التقدير. */
export interface DocumentDone {
  readonly pages: number
  readonly size: PageSizeId
  readonly orientation: PageOrientation
  /** بايتات الملفّ نفسه لا الصورة المخبوزة داخله. */
  readonly bytes: number
  readonly metadataStripped: boolean
}

export interface ExportDoneProps {
  readonly report: BakeReport
  /** نتيجة PDF — وغيابها يعني صورة (`report.format`). */
  readonly document?: DocumentDone
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
 * «محذوفة» ثابتًا، وPNG يخرج بلا أي مقطع نصّي دائمًا (لا حذف — لا شيء
 * كُتب أصلًا)، وWebP يحمل `ICCP` بـ456 بايتًا **إلا أن يُطلَب حذفه صراحةً**
 * (`privacy.stripMetadataOnExport`، مُنفَّذ في الوحدة **19.2** —
 * `webp-strip.ts`). فالنصّ هنا يُشتقّ من `report.format` **و**
 * `report.metadataStripped` معًا — الحالة الفعلية المقيسة لا وعد الإطار
 * الثابت ولا افتراضًا متفائلًا.
 *
 * **والحالة الباقية بلا دعوةٍ للفعل عمدًا.** لا شاشة إعدادات حيّة تعرض
 * `stripMetadataOnExport` بعد (`src/pages/settings/` لا تزال placeholder —
 * المرحلة 20)، فنصٌّ يقول «فعِّلها من الإعدادات» كان يعد بمسارٍ لا يوجد.
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
  const doc = props.document
  const format = doc ? 'PDF' : props.report.format.toUpperCase()
  const bytes = doc ? doc.bytes : props.report.bytes

  return (
    <div
      class={styles.scrim}
      data-export-result=""
      data-export-blob={props.blobUrl}
      data-export-bytes={bytes}
      data-export-kind={doc ? 'pdf' : props.report.format}
      data-export-pages={doc ? doc.pages : undefined}
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
            <Icon name="close" size="sm" />
          </button>
          <div class={styles.headText}>
            <h2 class={cx(styles.title, 't-arabic-heading-s')}>اكتمل التصدير</h2>
            {/* غربية: قياسٌ لا عدٌّ بشري — §3.5. */}
            <TechnicalValue kind="dimension" variant="mono-xs">
              {doc
                ? `PDF · ${PAGE_SIZES[doc.size].label} · ${formatStorage(doc.bytes)}`
                : `${format} · ${formatDimensions(props.report.width, props.report.height)} · ${formatStorage(bytes)}`}
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
                {format}
              </TechnicalValue>
            </div>
            {doc ? (
              <div class={styles.row}>
                <span class={styles.rowLabel}>الصفحات</span>
                <span class={styles.rowValue} data-export-pages-shown={doc.pages}>
                  {`${countText(doc.pages, PAGE_FORMS)} · ${PAGE_SIZES[doc.size].label} ${ORIENTATION_LABEL[doc.orientation]}`}
                </span>
              </div>
            ) : (
              <div class={styles.row}>
                <span class={styles.rowLabel}>الدقة</span>
                <span class={styles.rowValue} data-export-scale-shown>
                  {props.scale === 2 ? '2× ريتينا' : '1×'}
                </span>
              </div>
            )}
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
               * الحقيقة لا نصّ الإطار — انظر ترويسة الملفّ. ثلاث حالات لا
               * حالتان: PNG بلا شيء دائمًا، وWebP بحسب ما وقع فعلًا
               * (`metadataStripped`) لا بحسب ما طُلب.
               */}
              <span
                class={styles.rowValue}
                data-export-metadata={doc ? 'pdf' : props.report.format}
                data-export-metadata-stripped={
                  doc ? doc.metadataStripped : props.report.metadataStripped
                }
              >
                {doc
                  ? doc.metadataStripped
                    ? 'محذوفة كاملًا — لا عنوان ولا رابط ولا مشروع في الملفّ'
                    : 'العنوان والرابط والمشروع في خصائص الملفّ'
                  : props.report.format === 'png'
                    ? 'لم تُكتَب — الملفّ بلا مقاطع نصّية'
                    : props.report.metadataStripped
                      ? 'أُزيل ملفّ الألوان المضمَّن — الملفّ بلا مقاطع ثانوية'
                      : 'ملفّ ألوان مضمَّن — نحو 456 بايتًا.'}
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
          {doc ? null : (
            <Button variant="secondary" size="l" icon="copy" onClick={props.onCopy}>
              انسخ إلى الحافظة
            </Button>
          )}
          {props.downloadId === null ? null : (
            <Button variant="primary" size="l" icon="folder" onClick={props.onReveal}>
              افتح المجلّد
            </Button>
          )}
        </footer>
      </div>
    </div>
  )
}
