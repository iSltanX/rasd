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
import { formatDimensions } from '@/shared/bidi'
import { formatStorage } from '@/shared/bidi/numerals'
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
 * خياران في الإطار لا محرّك لهما بعد — يُعرضان معطَّلين وسببهما **نصٌّ مرئيّ** تحتهما لا
 * تلميحٌ لا يراه إلا من يمرّ فوقه. قائمة الملاحظات وبيانات الصفحة تصلان مع PDF وتقرير
 * المقارنة. و«خلفية شفافة» حُذفت من الإطار، و«دمج التعليقات» صار سطر ملخّص: الدمج دائمٌ
 * بحكم ADR 0015 لا خيار.
 */
const PENDING_TOGGLES: readonly {
  readonly id: string
  readonly label: string
  readonly on: boolean
  readonly hint: string
}[] = [
  {
    id: 'page-meta',
    label: 'ضمّن بيانات الصفحة',
    on: false,
    hint: 'رابط الصفحة وعنوانها ووقت الالتقاط — قريبًا مع تصدير PDF.',
  },
  {
    id: 'notes-list',
    label: 'ضمّن قائمة الملاحظات',
    on: false,
    hint: 'قريبًا مع تصدير PDF وتقرير المقارنة.',
  },
]

/** أيقونة كل صيغة على بطاقتها. */
const FORMAT_ICON = { png: 'image', webp: 'image', pdf: 'file-code' } as const

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
  /** أُلغي تصديرٌ جارٍ للتوّ — `export / cancelled` (`290:1997`). */
  readonly cancelled?: boolean
  readonly onScale: (scale: 1 | 2) => void
  readonly onFormat: (format: ExportFormat) => void
  readonly onQuality: (quality: QualityLevel) => void
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

  const estimate = estimateSize(props.width, props.height, props.format, props.quality)
  const clipboardOk = clipboardAccepts(props.format)
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
              {EXPORT_FORMATS.map((format) => (
                <OptionCard
                  key={format}
                  name="export-format"
                  value={format}
                  icon={FORMAT_ICON[format]}
                  title={format.toUpperCase()}
                  hint={FORMAT_HINT[format]}
                  selected={props.format === format}
                  onSelect={() => props.onFormat(format)}
                  data-export-format={format}
                />
              ))}
              {(Object.keys(DEFERRED_FORMATS) as DeferredFormat[]).map((id) => (
                <OptionCard
                  key={id}
                  name="export-format"
                  value={id}
                  icon={FORMAT_ICON[id]}
                  title={DEFERRED_FORMATS[id].label}
                  hint={DEFERRED_FORMATS[id].hint}
                  disabled
                  reason={DEFERRED_FORMATS[id].reason}
                  data-export-format={id}
                  data-deferred=""
                />
              ))}
            </div>
          </section>

          <section class={styles.group} aria-labelledby="export-options-label">
            <h3 id="export-options-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
              الخيارات
            </h3>
            <div class={styles.card}>
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
              {PENDING_TOGGLES.map((item, i) => (
                <div key={item.id} data-pending="">
                  <SettingRow
                    id={`export-${item.id}`}
                    label={item.label}
                    hint={item.hint}
                    divider={i < PENDING_TOGGLES.length - 1}
                    control={<Toggle on={item.on} state="disabled" aria-label={item.label} />}
                  />
                </div>
              ))}
            </div>
          </section>

          <div class={styles.summary}>
            <div class={styles.kv} data-export-estimate>
              <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الحجم التقديري</span>
              {/* غربية: قياسٌ لا عدٌّ بشري — §3.5. */}
              <TechnicalValue kind="dimension" variant="mono-xs">
                {`${props.format.toUpperCase()} · ${formatDimensions(props.width, props.height)} · ~${formatStorage(estimate.bytes)}`}
              </TechnicalValue>
            </div>
            <div class={styles.kv}>
              <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>التعليقات</span>
              <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>مدموجة في الصورة</span>
            </div>
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
          <Button
            variant="secondary"
            size="l"
            icon="copy"
            onClick={props.onCopy}
            {...(disabled ? { state: 'disabled' } : {})}
          >
            انسخ إلى الحافظة
          </Button>
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
