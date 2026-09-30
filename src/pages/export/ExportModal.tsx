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
  isDocumentFormat,
  OUTPUT_FORMATS,
  OUTPUT_HINT,
  type OutputFormat,
} from '@/modules/export/format'
import {
  ORIENTATION_LABEL,
  PAGE_FORMS,
  PAGE_SIZE_IDS,
  PAGE_SIZES,
  SPLIT_LABEL,
  type PageOrientation,
  type PageSizeId,
  type PageSplit,
  type PdfLayoutOptions,
} from '@/modules/export/pdf-layout'
import { formatDimensions } from '@/shared/bidi'
import { countText, formatStorage } from '@/shared/bidi/numerals'
import { Banner, Button, Toggle } from '@/ui/components'
import { OptionCard } from '@/ui/components/OptionCard/OptionCard'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import styles from './export.module.css'

import type { JSX } from 'preact'

/**
 * **مفتاحا الوثيقة** — قائمة الملاحظات وبيانات الصفحة صفحةٌ في PDF، والصورة لا تحمل صفحة. فيُعرضان مع PNG
 * وWebP معطَّلين بسببٍ مرئيّ يدلّ على PDF (إطار `73:2` يرسمهما في النافذة لكل صيغة)، ويعملان مع PDF.
 * و«خلفية شفافة» حُذفت من الإطار، و«دمج التعليقات» سطر ملخّص: الدمج دائمٌ بحكم ADR 0015 لا خيار.
 */
export const IMAGE_ONLY_REASON = {
  notes: 'في PDF وحدها — صفحة أخيرة فيها الملاحظات مرقّمة. اختر PDF لتضمينها.',
  pageMeta: 'في PDF وحدها — رابط الصفحة وعنوانها ووقت الالتقاط. اختر PDF لتضمينها.',
} as const

/** سبب تعطيل «بيانات الصفحة» مع الحذف — الإعداد الذي يمنعها باسمه. */
export const STRIPPED_REASON =
  'محذوفة — «احذف البيانات الوصفية عند التصدير» مفعَّل في إعدادات الخصوصية.'

export const NO_NOTES_REASON = 'لا ملاحظات ظاهرة في هذه اللقطة.'

/**
 * ما يُكتب في خصائص ملفّ PDF — **يُقال قبل التصدير لا بعده.** مفتاح «بيانات الصفحة» يحكم الصفحة المطبوعة،
 * وقاموس `Info` يحكمه إعداد الخصوصية؛ فمن أطفأ المفتاح يرى هنا أن الرابط ما زال في الخصائص وسببه
 * (المراجعة المستقلّة).
 */
export function fileProperties(strip: boolean): string {
  return strip
    ? 'بلا بيانات وصفية — محذوفة في الخصوصية'
    : 'العنوان والرابط والمشروع — يحذفها «احذف البيانات الوصفية» في الخصوصية'
}

const SPLIT_HINT: Readonly<Record<PageSplit, string>> = {
  multi: 'اللقطة الطويلة تُقسم على صفحات بلا قطع سطر',
  single: 'تُصغَّر اللقطة لتسع صفحةً واحدة',
}

/** أيقونة كل صيغة على بطاقتها. */
const FORMAT_ICON = { png: 'image', webp: 'image', pdf: 'file-code' } as const

/** ما يلزم ملخّص PDF — عدد الصفحات والحجم تقديرًا، من `pdf-layout.ts` بلا المولِّد. */
export interface PdfSummary {
  readonly pages: number
  readonly bytes: number
}

export interface ExportModalProps {
  /** عنوان اللقطة — يظهر في الترويسة ويشتقّ منه اسم الملفّ. */
  readonly title: string
  readonly scale: 1 | 2
  readonly format: OutputFormat
  readonly quality: QualityLevel
  readonly pdf: PdfLayoutOptions
  readonly pdfSummary: PdfSummary
  /** مفتاحا الوثيقة. */
  readonly includeNotes: boolean
  readonly includePageMeta: boolean
  /** الملاحظات الظاهرة — صفرٌ يعطّل مفتاح القائمة بسببه. */
  readonly noteCount: number
  /** `privacy.stripMetadataOnExport` — يعطّل «بيانات الصفحة» بسببه. */
  readonly stripMetadata: boolean
  /** أبعاد سطح التصدير بعد ضرب المقياس — من `planExport`. */
  readonly width: number
  readonly height: number
  /** سبب رفض التصدير بهذه الدقّة، أو `null` — من `planExport().reason`. */
  readonly blocked: string | null
  readonly busy: boolean
  readonly error: string | null
  /** أُلغي تصديرٌ جارٍ للتوّ — `export / cancelled` (`290:1997`). */
  readonly cancelled?: boolean
  readonly onScale: (scale: 1 | 2) => void
  readonly onFormat: (format: OutputFormat) => void
  readonly onQuality: (quality: QualityLevel) => void
  readonly onPdf: (options: PdfLayoutOptions) => void
  readonly onIncludeNotes: (on: boolean) => void
  readonly onIncludePageMeta: (on: boolean) => void
  readonly onDownload: (event: MouseEvent) => void
  readonly onCopy: (event: MouseEvent) => void
  readonly onClose: () => void
}

/**
 * `export / modal` — إطار Figma `73:2`: نافذة 560 بترويسة وجسم ومجموعتين («الصيغة» ببطاقات
 * `Option Card`، و«الخيارات» بصفوف `Setting Row`) وملخّص، وشريط أفعال سفلي.
 *
 * **نافذةٌ لا صفحة.** الإطار صفحةُ مكتبة كاملة فوقها `scrim` و`modal` — فالمسار مجلَّد
 * مكوّنات، ولا صفحة تُسجَّل في `PAGE_PATHS`.
 *
 * **وسمات `data-export-*` عقد `verify:export`** — على الضوابط الأصلية نفسها (الراديو
 * والقائمة) لأنها ما يُنقر ويُقرأ.
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

  const document = isDocumentFormat(props.format)
  const estimate = document
    ? { bytes: props.pdfSummary.bytes }
    : estimateSize(props.width, props.height, props.format, props.quality)
  const clipboardOk = document || clipboardAccepts(props.format)
  const pdfSize = PAGE_SIZES[props.pdf.size].label
  const disabled = props.busy || props.blocked !== null
  const baseWidth = props.width / props.scale
  const baseHeight = props.height / props.scale

  return (
    <div
      class={styles.scrim}
      data-export-modal=""
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      <div class={styles.modal}>
        <header class={styles.head}>
          {/* الإغلاق أوّلًا في ترتيب لوحة المفاتيح وآخرًا بصريًّا — ترويسة الورقة المشتركة. */}
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
            <h2 id="export-title" class={cx(styles.title, 't-arabic-heading-s')}>
              تصدير
            </h2>
            <p class={cx(styles.subtitle, 't-arabic-ui-xs')}>لقطة واحدة · {props.title}</p>
          </div>
        </header>

        <div class={styles.body}>
          {/*
           * الفشل والإلغاء في رأس النافذة بتنبيه كما في `export / error` (`290:1261`) و`cancelled`
           * — كان الفشل سطرًا أحمر صغيرًا في ذيلها، والإلغاء يعيد النافذة صامتة كأن شيئًا لم يقع.
           * `data-export-error` باقٍ: `verify:export` و`verify:editor` يقرآن نصّه وغيابه.
           */}
          {props.error ? (
            <div data-export-error>
              <Banner tone="danger">تعذّر حفظ الملف — {props.error}</Banner>
            </div>
          ) : props.cancelled ? (
            <div data-export-cancelled>
              <Banner tone="warning">
                أُلغي التصدير — لم يُحفظ ملف، واللقطة في المكتبة كما هي.
              </Banner>
            </div>
          ) : null}
          <section class={styles.group} aria-labelledby="export-format-label">
            <h3 id="export-format-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
              الصيغة
            </h3>
            <div class={styles.formats} role="radiogroup" aria-labelledby="export-format-label">
              {OUTPUT_FORMATS.map((format) => (
                <OptionCard
                  key={format}
                  name="export-format"
                  value={format}
                  icon={FORMAT_ICON[format]}
                  title={format.toUpperCase()}
                  hint={OUTPUT_HINT[format]}
                  selected={props.format === format}
                  onSelect={() => props.onFormat(format)}
                  data-export-format={format}
                />
              ))}
            </div>
          </section>

          <section class={styles.group} aria-labelledby="export-options-label">
            <h3 id="export-options-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
              {document ? 'خيارات PDF' : 'الخيارات'}
            </h3>
            <div class={styles.card}>
              {document ? (
                <>
                  <SettingRow
                    id="export-page-size"
                    label="حجم الصفحة"
                    divider
                    control={
                      <Select
                        aria-label="حجم الصفحة"
                        value={props.pdf.size}
                        data-export-page-size=""
                        options={PAGE_SIZE_IDS.map((id) => ({
                          value: id,
                          label: PAGE_SIZES[id].label,
                        }))}
                        onChange={(v) => props.onPdf({ ...props.pdf, size: v as PageSizeId })}
                      />
                    }
                  />
                  <SettingRow
                    id="export-orientation"
                    label="الاتجاه"
                    divider
                    control={
                      <Select
                        aria-label="الاتجاه"
                        value={props.pdf.orientation}
                        data-export-orientation=""
                        options={(['portrait', 'landscape'] as const).map((id) => ({
                          value: id,
                          label: ORIENTATION_LABEL[id],
                        }))}
                        onChange={(v) =>
                          props.onPdf({ ...props.pdf, orientation: v as PageOrientation })
                        }
                      />
                    }
                  />
                  <SettingRow
                    id="export-split"
                    label="التقسيم"
                    hint={SPLIT_HINT[props.pdf.split]}
                    divider
                    control={
                      <Select
                        aria-label="التقسيم"
                        value={props.pdf.split}
                        data-export-split=""
                        options={(['multi', 'single'] as const).map((id) => ({
                          value: id,
                          label: SPLIT_LABEL[id],
                        }))}
                        onChange={(v) => props.onPdf({ ...props.pdf, split: v as PageSplit })}
                      />
                    }
                  />
                </>
              ) : (
                <>
                  <SettingRow
                    id="export-scale"
                    label="الدقّة"
                    divider
                    control={
                      <Select
                        aria-label="الدقة"
                        value={String(props.scale)}
                        data-export-scale-select=""
                        // عزلٌ باتجاه اليسار (LRI…PDI): خيار القائمة الأصلية لا يقبل `<bdi>`،
                        // وبلا عزل يقلب سياق RTL المقاسين حول «×».
                        options={([1, 2] as const).map((k) => ({
                          value: String(k),
                          label: `\u2066${formatDimensions(baseWidth * k, baseHeight * k)} · ${k}×\u2069`,
                        }))}
                        onChange={(v) => props.onScale(Number(v) === 2 ? 2 : 1)}
                      />
                    }
                  />
                  <SettingRow
                    id="export-quality"
                    label="الجودة"
                    hint={
                      qualityApplies(props.format)
                        ? 'أقلّ جودةً أصغر حجمًا.'
                        : 'بلا فقد دائمًا، فلا أثر للجودة فيه — PNG.'
                    }
                    divider
                    control={
                      <Select
                        aria-label="الجودة"
                        value={props.quality}
                        disabled={!qualityApplies(props.format)}
                        data-export-quality=""
                        options={QUALITY_LEVELS.map((level) => ({
                          value: level,
                          label: QUALITY_LABEL[level],
                        }))}
                        onChange={(v) => props.onQuality(v as QualityLevel)}
                      />
                    }
                  />
                </>
              )}
              <DocumentToggle
                id="notes"
                label="ضمّن قائمة الملاحظات"
                on={props.includeNotes}
                onChange={props.onIncludeNotes}
                divider
                disabled={
                  !document
                    ? IMAGE_ONLY_REASON.notes
                    : props.noteCount === 0
                      ? NO_NOTES_REASON
                      : null
                }
                hint="صفحة أخيرة فيها الملاحظات مرقّمة، وحالة كل مشكلة مربوطة وقيمتاها"
              />
              <DocumentToggle
                id="page-meta"
                label="ضمّن بيانات الصفحة"
                on={props.includePageMeta}
                onChange={props.onIncludePageMeta}
                disabled={
                  !document
                    ? IMAGE_ONLY_REASON.pageMeta
                    : props.stripMetadata
                      ? STRIPPED_REASON
                      : null
                }
                hint="رابط الصفحة وعنوانها ووقت الالتقاط"
              />
            </div>
          </section>

          <div class={styles.summary}>
            <div class={styles.kv} data-export-estimate>
              <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الحجم التقديري</span>
              {/* غربية: قياسٌ لا عدٌّ بشري — §3.5. */}
              {document ? (
                <span
                  class={cx(styles.rowValue, 't-arabic-ui-xs')}
                  data-export-pages={props.pdfSummary.pages}
                >
                  <TechnicalValue
                    kind="format"
                    variant="mono-xs"
                  >{`PDF · ${pdfSize}`}</TechnicalValue>
                  {' · '}
                  {countText(props.pdfSummary.pages, PAGE_FORMS)}
                  {' · '}
                  <TechnicalValue
                    kind="dimension"
                    variant="mono-xs"
                  >{`~${formatStorage(estimate.bytes)}`}</TechnicalValue>
                </span>
              ) : (
                <TechnicalValue kind="dimension" variant="mono-xs">
                  {`${props.format.toUpperCase()} · ${formatDimensions(props.width, props.height)} · ~${formatStorage(estimate.bytes)}`}
                </TechnicalValue>
              )}
            </div>
            <div class={styles.kv}>
              <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>التعليقات</span>
              <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>مدموجة في الصورة</span>
            </div>
            {document ? (
              <div
                class={styles.kv}
                data-export-properties={props.stripMetadata ? 'stripped' : 'written'}
              >
                <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>خصائص الملف</span>
                <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>
                  {fileProperties(props.stripMetadata)}
                </span>
              </div>
            ) : null}
          </div>

          {props.blocked ? (
            <p class={styles.error} data-export-blocked>
              {props.blocked}
            </p>
          ) : null}
          {clipboardOk ? null : (
            <p class={styles.note} data-export-clipboard-note>
              {CLIPBOARD_NOTE}
            </p>
          )}
        </div>

        {/* الأفعال في طرف السطر، والأساسيّ آخرها كما في الإطار. */}
        <footer class={styles.actions}>
          {/* PDF وثيقةٌ تُنزَّل: الحافظة لا تقبلها، والإطار `290:480` يرسم «تنزيل» وحده. */}
          {document ? null : (
            <Button
              variant="secondary"
              size="l"
              icon="copy"
              onClick={props.onCopy}
              {...(disabled ? { state: 'disabled' } : {})}
            >
              انسخ إلى الحافظة
            </Button>
          )}
          <Button
            variant="primary"
            size="l"
            icon="download"
            onClick={props.onDownload}
            {...(disabled ? { state: 'disabled' } : {})}
          >
            تنزيل
          </Button>
        </footer>
      </div>
    </div>
  )
}

interface DocumentToggleProps {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly on: boolean
  readonly onChange: (on: boolean) => void
  /** سبب التعطيل مرئيًّا مكان التلميح، أو `null` حين يعمل. */
  readonly disabled: string | null
  readonly divider?: boolean
}

/**
 * مفتاح وثيقة: يعمل، أو يُعرض معطَّلًا وسببه **نصٌّ مرئيّ** مكان تلميحه لا تلميحٌ لا يراه إلا من يمرّ فوقه.
 * والمعطَّل يُعرض مطفأً مهما كانت قيمته: ما لا يُضمَّن لا يبدو مضمَّنًا.
 */
function DocumentToggle(props: DocumentToggleProps): JSX.Element {
  const off = props.disabled !== null
  return (
    <div data-export-toggle={props.id} data-export-toggle-disabled={off ? '' : undefined}>
      <SettingRow
        id={`export-${props.id}`}
        label={props.label}
        hint={props.disabled ?? props.hint}
        divider={props.divider ?? false}
        control={
          <Toggle
            on={off ? false : props.on}
            aria-label={props.label}
            {...(off ? { state: 'disabled' as const } : { onChange: props.onChange })}
          />
        }
      />
    </div>
  )
}
