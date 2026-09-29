import { useEffect, useRef } from 'preact/hooks'

import {
  estimateSize,
  QUALITY_LABEL,
  QUALITY_LEVELS,
  qualityApplies,
  type QualityLevel,
} from '@/modules/export/estimate'
import {
  CLIPBOARD_NOTE,
  clipboardAccepts,
  DEFERRED_FORMATS,
  EXPORT_FORMATS,
  FORMAT_HINT,
  type DeferredFormat,
  type ExportFormat,
} from '@/modules/export/format'
import { formatBytes, formatDimensions } from '@/shared/bidi'
import { Button, Toggle } from '@/ui/components'
import { TechnicalValue } from '@/ui/TechnicalValue'

import styles from './export.module.css'

import type { JSX } from 'preact'

/**
 * ضوابط في التصميم لا محرّك لها في هذه الوحدة.
 *
 * **تُعرض معطَّلة بسببها لا تُخفى** — قاعدة الوحدة 21.1 نفسها: «معلَّم
 * «قريبًا» لا مخفيّ ولا موعود كذبًا». وإخفاؤها كان يجعل الشاشة تبدو مكتملة
 * وهي ليست كذلك، فتُغلَق المرحلة على نقصٍ لا يراه أحد.
 */
const PENDING_TOGGLES: readonly {
  readonly id: string
  readonly label: string
  readonly on: boolean
  readonly reason: string
}[] = [
  {
    id: 'transparent',
    label: 'خلفية شفافة',
    on: false,
    reason: 'الصيغتان تدعمان الشفافية، ووصلُ الضابط بالخبز خارج نطاق 19.1.',
  },
  {
    id: 'page-meta',
    label: 'تضمين بيانات الصفحة',
    on: false,
    /*
     * **19.2 نفّذت `stripMetadataOnExport` — لا هذا الضابط.** ما نُفِّذ هو
     * حذف `ICCP` من WebP (البند المقيس الوحيد)، لا تضمينُ بيانات الصفحة
     * الذي يعده هذا الضابط. فالتضمين نفسه يبقى بلا مالك مسمًّى، كالشفافية
     * أعلاه — انظر `export / done` لحالة الحذف الفعلية.
     */
    reason: 'غير متاح في هذا الإصدار.',
  },
  {
    id: 'notes-list',
    label: 'تضمين قائمة الملاحظات',
    on: true,
    reason: 'قيد التطوير — يصل مع تقرير المقارنة في تحديث قادم.',
  },
  {
    id: 'flatten',
    label: 'دمج التعليقات في الصورة',
    on: true,
    reason: 'الدمج دائم بحكم ADR 0015 — والتصدير بطبقاتٍ منفصلة ليس في الخطّة.',
  },
]

export interface ExportModalProps {
  /** عنوان اللقطة — يظهر في الترويسة ويشتقّ منه اسم الملفّ. */
  readonly title: string
  readonly scale: 1 | 2
  readonly format: ExportFormat
  readonly quality: QualityLevel
  /** أبعاد سطح التصدير بعد ضرب المقياس — من `planExport`. */
  readonly width: number
  readonly height: number
  /** سبب رفض التصدير بهذه الدقّة، أو `null` — من `planExport().reason`. */
  readonly blocked: string | null
  readonly busy: boolean
  readonly error: string | null
  readonly onScale: (scale: 1 | 2) => void
  readonly onFormat: (format: ExportFormat) => void
  readonly onQuality: (quality: QualityLevel) => void
  readonly onDownload: (event: MouseEvent) => void
  readonly onCopy: (event: MouseEvent) => void
  readonly onClose: () => void
}

/**
 * `export / modal` — إطار Figma `73:286`.
 *
 * **نافذةٌ لا صفحة.** نصّ الخطّة يقول `src/pages/export/` في سطر الوحدات
 * و«‏`export / modal`» في سطر العمل، والمصدر التصميمي يحسم: الإطار `73:2`
 * صفحةُ مكتبة كاملة فوقها `scrim` بمقاس الشاشة و`modal` بـ‏560×676. فالمسار
 * بقي مجلَّد مكوّنات، وسقطت قراءة «الصفحة» — ولا صفحة تُسجَّل في
 * `PAGE_PATHS`.
 *
 * **وثلاثة من ضوابطها معطَّلة بسببٍ معروض** (وصيغتان كذلك). القياس والصدق
 * قبل اكتمال المظهر: ضابطٌ يعمل نصف عمله أسوأ من ضابطٍ يقول متى يعمل.
 */
export function ExportModal(props: ExportModalProps): JSX.Element {
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

  const estimate = estimateSize(props.width, props.height, props.format, props.quality)
  const clipboardOk = clipboardAccepts(props.format)
  const disabled = props.busy || props.blocked !== null

  return (
    <div
      class={styles.scrim}
      data-export-modal=""
      role="dialog"
      aria-modal="true"
      aria-label="تصدير"
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
            <h2 class={styles.title}>تصدير</h2>
            <p class={styles.subtitle}>لقطة واحدة · {props.title}</p>
          </div>
        </header>

        <div class={styles.body}>
          <section class={styles.group}>
            <h3 class={styles.groupLabel}>الصيغة</h3>
            <div class={styles.formats} role="radiogroup" aria-label="الصيغة">
              {EXPORT_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  role="radio"
                  aria-checked={props.format === format}
                  data-export-format={format}
                  data-selected={props.format === format ? '' : undefined}
                  class={styles.format}
                  onClick={() => props.onFormat(format)}
                >
                  <TechnicalValue kind="format" variant="mono-s">
                    {format.toUpperCase()}
                  </TechnicalValue>
                  <span class={styles.formatHint}>{FORMAT_HINT[format]}</span>
                </button>
              ))}

              {(Object.keys(DEFERRED_FORMATS) as DeferredFormat[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={false}
                  aria-disabled="true"
                  disabled
                  data-export-format={id}
                  data-deferred=""
                  class={styles.format}
                  title={DEFERRED_FORMATS[id].reason}
                >
                  <TechnicalValue kind="format" variant="mono-s">
                    {DEFERRED_FORMATS[id].label}
                  </TechnicalValue>
                  <span class={styles.formatHint}>{DEFERRED_FORMATS[id].hint}</span>
                </button>
              ))}
            </div>
          </section>

          <section class={styles.group}>
            <h3 class={styles.groupLabel}>الخيارات</h3>
            <div class={styles.card}>
              <div class={styles.row}>
                <span class={styles.rowLabel}>الدقة</span>
                <select
                  class={styles.select}
                  data-export-scale-select
                  aria-label="الدقة"
                  value={String(props.scale)}
                  onChange={(e) =>
                    props.onScale(Number((e.target as HTMLSelectElement).value) === 2 ? 2 : 1)
                  }
                >
                  <option value="1">1×</option>
                  <option value="2">2×</option>
                </select>
              </div>

              <div class={styles.row}>
                <span class={styles.rowLabel}>الجودة</span>
                <select
                  class={styles.select}
                  data-export-quality
                  aria-label="الجودة"
                  disabled={!qualityApplies(props.format)}
                  title={
                    qualityApplies(props.format)
                      ? undefined
                      : 'مُرمِّج PNG يتجاهل الجودة — الصيغة بلا فقد دائمًا.'
                  }
                  value={props.quality}
                  onChange={(e) =>
                    props.onQuality((e.target as HTMLSelectElement).value as QualityLevel)
                  }
                >
                  {QUALITY_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {QUALITY_LABEL[level]}
                    </option>
                  ))}
                </select>
              </div>

              {PENDING_TOGGLES.map((item) => (
                <div key={item.id} class={styles.row} data-pending="">
                  <span class={styles.rowLabel} title={item.reason}>
                    {item.label}
                  </span>
                  <Toggle on={item.on} state="disabled" aria-label={item.label} />
                </div>
              ))}
            </div>
          </section>

          <div class={styles.estimate} data-export-estimate>
            <span class={styles.rowLabel}>الحجم التقديري</span>
            {/* غربية: قياسٌ لا عدٌّ بشري — §3.5. */}
            <TechnicalValue kind="dimension" variant="mono-xs">
              {`${props.format.toUpperCase()} · ${formatDimensions(props.width, props.height)} · ~${formatBytes(estimate.bytes)}`}
            </TechnicalValue>
          </div>

          {props.blocked ? (
            <p class={styles.error} data-export-blocked>
              {props.blocked}
            </p>
          ) : null}
          {props.error ? (
            <p class={styles.error} data-export-error>
              {props.error}
            </p>
          ) : null}
          {clipboardOk ? null : (
            <p class={styles.note} data-export-clipboard-note>
              {CLIPBOARD_NOTE}
            </p>
          )}
        </div>

        <footer class={styles.actions}>
          <Button
            variant="primary"
            icon="download"
            onClick={props.onDownload}
            {...(disabled ? { state: 'disabled' } : {})}
          >
            تنزيل
          </Button>
          <Button
            variant="secondary"
            icon="copy"
            onClick={props.onCopy}
            {...(disabled ? { state: 'disabled' } : {})}
          >
            نسخ إلى الحافظة
          </Button>
        </footer>
      </div>
    </div>
  )
}
