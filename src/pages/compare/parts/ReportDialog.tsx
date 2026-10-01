/**
 * «تصدير التقرير» — `compare / report` (`291:12538`) ثمّ `compare / report-done` (`291:12691`).
 *
 * **ثلاث مجموعات كالإطار:** «النتيجة» تقول ما سيُكتب قبل أن يُكتب، و«يتضمّن التقرير» أربعة خيارات، و«الملف»
 * صيغته وحجم صفحته. واختلافان مقصودان مكتوبان في `Docs/Design.md`: «الصيغة» سطرٌ ثابت PDF لا قائمة (التقرير
 * وثيقة، وصورة الفرق وحدها لها «التقط الفرق»)، و«رابط الصفحة» يُعطَّل بسببه مع حذف البيانات الوصفية.
 *
 * **والتنزيل بطريق نافذة التصدير نفسه** (`export/route.ts`): الصلاحية تُطلب أوّل ما يقع في النقرة، والرفض لا
 * يُفشل الحفظ بل يُعلَن ما فُقد.
 */

import { useEffect, useRef, useState } from 'preact/hooks'

import { estimateSize } from '@/modules/export/estimate'
import { reportFilename } from '@/modules/export/filename'
import { PAGE_FORMS, PAGE_SIZE_IDS, PAGE_SIZES, type PageSizeId } from '@/modules/export/pdf-layout'
import { formatDimensions } from '@/shared/bidi'
import { countText, formatPercent, formatStorage } from '@/shared/bidi/numerals'
import { getSettingsResult } from '@/shared/settings'
import { projects } from '@/shared/storage/repository'
import { Banner, Button } from '@/ui/components'
import { Checkbox } from '@/ui/components/Checkbox/Checkbox'
import { ProgressBar } from '@/ui/components/ProgressBar/ProgressBar'
import { Select } from '@/ui/components/Select/Select'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'
import { useFocusTrap } from '@/ui/use-focus-trap'

import { deliver, revealDownload, type Delivered } from '../../export/deliver'
import sheet from '../../export/export.module.css'
import { fileProperties } from '../../export/ExportModal'
import { resolveRoute, usePermissionProbe } from '../../export/route'
import { redactedSources } from '../redaction'
import {
  DEFAULT_INCLUDE,
  REGION_FORMS,
  reportBlocks,
  reportMarks,
  reportMetadata,
  type ReportInclude,
  type ReportOutcome,
} from '../report'
import { startReportExport } from '../report-export'

import styles from './ReportDialog.module.css'

import type { SessionZone } from '../session-zones'
import type { RasterImage } from '@/modules/compare/diff'
import type { CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface ReportDialogProps {
  readonly a: CaptureRecord
  readonly b: CaptureRecord
  /** بايتات الحالية — أساس صورة الفرق. */
  readonly baseBlob: Blob
  readonly outcome: ReportOutcome & { readonly diff: RasterImage }
  readonly zones: readonly SessionZone[]
  readonly threshold: number
  /** `privacy.stripMetadataOnExport` حيًّا من الصفحة. */
  readonly strip: boolean
  readonly onClose: () => void
}

type Phase =
  | { readonly kind: 'options'; readonly error: string | null }
  | { readonly kind: 'running'; readonly fraction: number }
  | {
      readonly kind: 'done'
      readonly delivered: Delivered
      readonly note: string | null
      readonly url: string
      readonly pages: number
      readonly bytes: number
    }

/** سبب تعطيل «رابط الصفحة» — نصّ الإطار نفسه، واسم الإعداد الذي يمنعه. */
export const LINK_STRIPPED =
  'محذوف مع البيانات الوصفية — «احذف البيانات الوصفية عند التصدير» مفعَّل.'

const OPTIONS: readonly {
  readonly key: keyof ReportInclude
  readonly label: string
  readonly hint: string
}[] = [
  {
    key: 'diffImage',
    label: 'صورة الفرق',
    hint: 'البكسلات المختلفة مظلّلة فوق اللقطة الحالية، والمستثناة مخطّطة بأرقامها',
  },
  { key: 'regions', label: 'قائمة المناطق', hint: 'موضع كل منطقة ومساحتها' },
  { key: 'captures', label: 'بيانات اللقطتين', hint: 'المقاس ووقت الالتقاط' },
  { key: 'pageLink', label: 'رابط الصفحة', hint: 'رابطا اللقطتين كما التُقطتا' },
]

export function ReportDialog(props: ReportDialogProps): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  useFocusTrap(dialog)
  const [include_, setInclude] = useState<ReportInclude>(DEFAULT_INCLUDE)
  const [size, setSize] = useState<PageSizeId>('a4')
  const [phase, setPhase] = useState<Phase>({ kind: 'options', error: null })
  const permission = usePermissionProbe()
  const cancelRef = useRef<() => void>(() => undefined)
  const urlRef = useRef<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [phase.kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || phase.kind === 'running') return
      e.preventDefault()
      props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose, phase.kind])

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const effective: ReportInclude = { ...include_, pageLink: include_.pageLink && !props.strip }

  const run = async (route: 'managed' | 'anchor', note: string | null): Promise<void> => {
    setPhase({ kind: 'running', fraction: 0 })
    // الإلغاء يصل قبل الخبز أيضًا: قراءة الإعدادات والمشروع والمشهدين انتظارٌ يستطيع المستخدم إلغاءه.
    const token = { aborted: false }
    cancelRef.current = () => {
      token.aborted = true
    }
    const stop = () => setPhase({ kind: 'options', error: null })

    // الحذف يُقرأ لحظة التصدير ويُغلق على الفشل — `props.strip` للعرض وحده (نمط `HandoffDialog`).
    const settings = await getSettingsResult()
    const strip = settings.ok ? settings.value.privacy.stripMetadataOnExport : true
    const project = props.b.projectId ? await projects.get(props.b.projectId) : null
    const include: ReportInclude = { ...include_, pageLink: include_.pageLink && !strip }
    const sources = include.diffImage
      ? await redactedSources({
          aId: props.a.id,
          bId: props.b.id,
          baseBlob: props.baseBlob,
          diff: props.outcome.diff,
        })
      : null
    if (token.aborted) return stop()
    if (sources && !sources.ok) {
      setPhase({ kind: 'options', error: sources.error.message })
      return
    }

    const input = {
      a: props.a,
      b: props.b,
      outcome: props.outcome,
      zones: props.zones,
      threshold: props.threshold,
      include,
      strip,
    }
    const exportRun = startReportExport({
      blocks: reportBlocks(input),
      composite: sources?.ok
        ? {
            base: sources.value.base,
            width: props.b.width,
            height: props.b.height,
            diff: sources.value.diff,
            marks: reportMarks(props.outcome, props.zones),
          }
        : null,
      size,
      metadata: reportMetadata(input, project?.ok ? project.value.name : null, new Date()),
      onProgress: (fraction) => setPhase({ kind: 'running', fraction }),
    })
    cancelRef.current = () => {
      token.aborted = true
      exportRun.cancel()
    }
    const result = await exportRun.done
    if (token.aborted) return stop()
    if (!result.ok) {
      setPhase({
        kind: 'options',
        error: result.error.code === 'cancelled' ? null : result.error.message,
      })
      return
    }
    const url = URL.createObjectURL(result.value.blob)
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = url
    const delivered = await deliver({ route, url, filename: reportFilename(props.b.title) })
    setPhase({
      kind: 'done',
      delivered,
      note: delivered.route === 'anchor' ? note : null,
      url,
      pages: result.value.pageCount,
      bytes: result.value.blob.size,
    })
  }

  /** **متزامنٌ من النقرة** — الطريق أوّلًا، ولا `await` قبله (`route.ts`). */
  const onExport = (): void => {
    void resolveRoute(permission).then(({ route, note }) => run(route, note))
  }

  const nothing = !Object.values(effective).some(Boolean)
  const subtitle = `المرجع: ${props.a.title || 'اللقطة أ'} · الحالية: ${props.b.title || 'اللقطة ب'}`

  return (
    <div
      class={sheet.scrim}
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
      data-report-dialog=""
      {...(phase.kind === 'done'
        ? {
            'data-report-result': '',
            'data-report-blob': phase.url,
            'data-report-pages': String(phase.pages),
            'data-report-bytes': String(phase.bytes),
          }
        : {})}
    >
      <div class={sheet.modal}>
        <header class={sheet.head}>
          <button
            type="button"
            ref={closeRef}
            class={sheet.close}
            aria-label="إغلاق"
            data-report-close=""
            disabled={phase.kind === 'running'}
            onClick={props.onClose}
          >
            <Icon name="close" size="sm" />
          </button>
          <div class={sheet.headText}>
            <h2 id="report-title" class={cx(sheet.title, 't-arabic-heading-s')}>
              تقرير المقارنة
            </h2>
            <p class={cx(sheet.subtitle, 't-arabic-ui-xs')}>{subtitle}</p>
          </div>
        </header>

        {phase.kind === 'done' ? (
          <>
            <div class={cx(sheet.body, styles.done)}>
              <span class={styles.doneIcon}>
                <Icon name="check" size="lg" />
              </span>
              <p class={cx(styles.doneTitle, 't-arabic-heading-xs')}>حُفظ التقرير</p>
              <p class={cx(styles.doneText, 't-arabic-ui-s')}>
                {`الملف في مجلّد التنزيلات · ${countText(phase.pages, PAGE_FORMS)}`}
              </p>
              <p class={sheet.path} data-report-path="">
                <TechnicalValue kind="path" variant="mono-xs">
                  {phase.delivered.shown}
                </TechnicalValue>
              </p>
              {phase.note ? (
                <p class={sheet.note} data-report-degraded="">
                  {phase.note}
                </p>
              ) : null}
            </div>
            <footer class={sheet.actions}>
              <Button variant="secondary" size="l" onClick={props.onClose}>
                أغلق
              </Button>
              {phase.delivered.downloadId === null ? null : (
                <Button
                  variant="primary"
                  size="l"
                  icon="folder"
                  onClick={() => {
                    if (phase.delivered.downloadId !== null) {
                      revealDownload(phase.delivered.downloadId)
                    }
                  }}
                >
                  افتح المجلّد
                </Button>
              )}
            </footer>
          </>
        ) : phase.kind === 'running' ? (
          <>
            <div class={sheet.body}>
              <ProgressBar value={phase.fraction * 100} label="تقدّم بناء التقرير" />
              <p class={sheet.note}>
                الصفحات والصورة تمرّ من مخرج الترميز الواحد. لا يُرسل شيءٌ خارج هذا الجهاز.
              </p>
            </div>
            <footer class={sheet.actions}>
              <Button variant="secondary" size="l" onClick={() => cancelRef.current()}>
                إلغاء
              </Button>
              <Button variant="primary" size="l" state="loading">
                جارٍ البناء
              </Button>
            </footer>
          </>
        ) : (
          <>
            <div class={sheet.body}>
              {phase.error ? (
                <div data-report-error="">
                  <Banner tone="danger">تعذّر بناء التقرير — {phase.error}</Banner>
                </div>
              ) : null}
              <section class={sheet.group} aria-labelledby="report-result-label">
                <h3 id="report-result-label" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                  النتيجة
                </h3>
                <div class={sheet.summary}>
                  <div class={sheet.kv}>
                    <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>نسبة الفرق</span>
                    <TechnicalValue kind="dimension" variant="mono-xs">
                      {formatPercent(props.outcome.diffRatio)}
                    </TechnicalValue>
                  </div>
                  <div class={sheet.kv}>
                    <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>المناطق المختلفة</span>
                    <span class={cx(sheet.rowValue, 't-arabic-ui-xs-strong')}>
                      {props.outcome.regions.length === 0
                        ? 'لا شيء'
                        : countText(props.outcome.regions.length, REGION_FORMS)}
                    </span>
                  </div>
                  {props.zones.length > 0 ? (
                    <div class={sheet.kv}>
                      <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>المستثناة</span>
                      <span class={cx(sheet.rowValue, 't-arabic-ui-xs-strong')}>
                        {`${countText(props.zones.length, REGION_FORMS)} — خارج النسبة ومخطّطة`}
                      </span>
                    </div>
                  ) : null}
                  <div class={sheet.kv}>
                    <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>المقاس</span>
                    <TechnicalValue kind="dimension" variant="mono-xs">
                      {formatDimensions(props.outcome.overlap.width, props.outcome.overlap.height)}
                    </TechnicalValue>
                  </div>
                </div>
              </section>

              <section class={sheet.group} aria-labelledby="report-include-label">
                <h3 id="report-include-label" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                  يتضمّن التقرير
                </h3>
                <div class={sheet.card}>
                  {OPTIONS.map((option) => {
                    const blocked = option.key === 'pageLink' && props.strip
                    return (
                      <div
                        key={option.key}
                        class={styles.option}
                        data-report-include={option.key}
                        {...(blocked ? { 'data-report-include-disabled': '' } : {})}
                      >
                        <Checkbox
                          checked={effective[option.key] ? 'on' : 'off'}
                          aria-label={option.label}
                          {...(blocked
                            ? { state: 'disabled' as const }
                            : {
                                onChange: (on: boolean) =>
                                  setInclude((prev) => ({ ...prev, [option.key]: on })),
                              })}
                        />
                        <div class={styles.optionText}>
                          <span class={cx(sheet.rowValue, 't-arabic-ui-s')}>{option.label}</span>
                          <span class={cx(styles.optionHint, 't-arabic-ui-xs')}>
                            {blocked
                              ? LINK_STRIPPED
                              : option.key === 'captures' && props.strip
                                ? 'المقاس وحده — وقت الالتقاط محذوف مع البيانات الوصفية'
                                : option.hint}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section class={sheet.group} aria-labelledby="report-file-label">
                <h3 id="report-file-label" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                  الملف
                </h3>
                <div class={sheet.card}>
                  <div class={sheet.row}>
                    <span class={sheet.rowLabel}>الصيغة</span>
                    <TechnicalValue kind="format" variant="mono-xs">
                      PDF
                    </TechnicalValue>
                  </div>
                  <div class={sheet.row}>
                    <span class={sheet.rowLabel}>حجم الصفحة</span>
                    <Select
                      aria-label="حجم الصفحة"
                      value={size}
                      data-report-page-size=""
                      options={PAGE_SIZE_IDS.map((id) => ({
                        value: id,
                        label: PAGE_SIZES[id].label,
                      }))}
                      onChange={(v) => setSize(v as PageSizeId)}
                    />
                  </div>
                  <div
                    class={sheet.row}
                    data-report-properties={props.strip ? 'stripped' : 'written'}
                  >
                    <span class={sheet.rowLabel}>خصائص الملف</span>
                    <span class={cx(sheet.rowValue, 't-arabic-ui-xs')}>
                      {fileProperties(props.strip)}
                    </span>
                  </div>
                </div>
              </section>

              {nothing ? (
                <p class={sheet.note} data-report-empty="">
                  اختر ما يتضمّنه التقرير — النتيجة وحدها تُكتب دائمًا في صفحته الأولى.
                </p>
              ) : null}
              <p class={cx(sheet.note, styles.size)}>
                {`حجم تقريبي: ${formatStorage(estimateBytes(props.b, effective))}`}
              </p>
            </div>
            <footer class={sheet.actions}>
              <Button variant="secondary" size="l" onClick={props.onClose}>
                ألغِ
              </Button>
              <Button
                variant="primary"
                size="l"
                icon="download"
                onClick={onExport}
                data-report-export=""
              >
                صدّر التقرير
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}

/** تقديرٌ يُعلَن تقريبًا: صفحة الملخّص، وصورة الفرق PNG بمعاملها المقيس في `estimate.ts`. */
function estimateBytes(b: CaptureRecord, include: ReportInclude): number {
  const summary = 60_000
  return summary + (include.diffImage ? estimateSize(b.width, b.height, 'png', 'max').bytes : 0)
}
