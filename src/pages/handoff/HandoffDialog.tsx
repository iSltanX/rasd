/**
 * نافذة «حزمة التسليم» — `handoff / *` (الصفحة 22، `Docs/Design.md`): البناء، ثمّ المعاينة، ثمّ التنزيل.
 *
 * **المعاينة هي ما يُنسخ ويُنزَّل حرفًا:** النصّ المعروض هو `markdown` أو `json` الحزمة نفسها، لا صياغةٌ
 * أخرى له. والصور تُخبَز مرّةً عند الفتح عبر مخرج الترميز الواحد، فحجم الحزمة يُعرض قبل التنزيل، وتبديل
 * الخيارات بعدها تجميعٌ لحظيّ بلا خبز.
 *
 * **تقرأ ولا تكتب:** لا تغيّر مشكلةً ولا لقطة (`STAGES/33`، خارج النطاق). و«أزلها وتابع» تُخرج المشكلة من هذه
 * الحزمة وحدها.
 *
 * **ولا شبكة:** الحافظة والتنزيل محلّيان، والعنوان `blob:` لا يغادر الجهاز.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { afterAsk, planDownload, type PermissionState } from '@/modules/export/download'
import {
  buildHandoff,
  DEFAULT_OPTIONS,
  imagesOf,
  type EvidenceFrame,
  type HandoffMeta,
  type HandoffOptions,
} from '@/modules/handoff/model'
import { assembleHandoff, packageName } from '@/modules/handoff/package'
import { HANDOFF_SCHEMA } from '@/modules/handoff/schema'
import { ISSUE_FORMS } from '@/modules/issues/labels'
import { countText, formatStorage } from '@/shared/bidi/numerals'
import { hasPermission, requestPermission } from '@/shared/permissions'
import { getSettingsResult } from '@/shared/settings'
import { Banner, Button } from '@/ui/components'
import { Checkbox } from '@/ui/components/Checkbox/Checkbox'
import { OptionCard } from '@/ui/components/OptionCard/OptionCard'
import { ProgressBar } from '@/ui/components/ProgressBar/ProgressBar'
import { Toast } from '@/ui/components/Toast/Toast'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import { deliver, revealDownload, type Delivered } from '../export/deliver'
import sheet from '../export/export.module.css'
import { downloadsRefused, rememberRefusal } from '../export/permission-memory'

import {
  bakeEvidence,
  createBakeTools,
  imagesByName,
  type BakeTools,
  type EvidenceFailure,
  type EvidenceSource,
} from './evidence'
import styles from './handoff.module.css'
import {
  contentsLabel,
  doneLabel,
  failureText,
  issuesLabel,
  progressLabel,
  readyParts,
} from './text'

import type { IssueRecord } from '@/shared/issue-schema'
import type { JSX } from 'preact'

export interface HandoffDialogProps {
  readonly issues: readonly IssueRecord[]
  /** المصدر كما يقرؤه إنسان: «تحديد في المكتبة» · «مشروع «منصّة»» · «لقطة في المحرّر». */
  readonly source: string
  /** مشهد المحرّر المفتوح — يسبق المحفوظ لأن آخر تعديلٍ قد لا يكون حُفظ بعد. */
  readonly live?: ReadonlyMap<string, EvidenceSource>
  /** أدوات المحرّر إن فُتحت منه؛ وإلا تُبنى بالدوالّ نفسها. */
  readonly tools?: Omit<BakeTools, 'stripMetadata'>
  readonly onClose: () => void
  /** زمن البناء — يُحقن للاختبار. */
  readonly now?: number
}

type Format = 'markdown' | 'json'

type Phase =
  | { readonly kind: 'building'; readonly done: number; readonly total: number }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready' }
  | {
      readonly kind: 'done'
      readonly delivered: Delivered
      readonly note: string | null
      readonly size: number
      readonly images: number
    }

const INCLUDE: readonly {
  readonly key: keyof HandoffOptions
  readonly label: string
  readonly hint: string | null
}[] = [
  { key: 'images', label: 'مقتطع اللقطة حول كل عنصر', hint: 'بعد الحجب، وبلا بيانات وصفية' },
  { key: 'properties', label: 'الخصائص بثلاث صيغ: CSS · Tailwind · JSON', hint: null },
  { key: 'keepQuery', label: 'رابط الصفحة بمعاملاته', hint: 'يُحذف ما بعد «?» افتراضيًّا' },
]

/** نسخة رصد من البيان — وفي بيئةٍ بلا بيان (الاختبار) علامةٌ لا رقمٌ مخترَع. */
function rasdVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return 'dev'
  }
}

export function HandoffDialog(props: HandoffDialogProps): JSX.Element {
  const [list, setList] = useState<readonly IssueRecord[]>(props.issues)
  const [options, setOptions] = useState<HandoffOptions>(DEFAULT_OPTIONS)
  const [format, setFormat] = useState<Format>('markdown')
  const [phase, setPhase] = useState<Phase>({ kind: 'building', done: 0, total: 0 })
  const [baked, setBaked] = useState<ReadonlyMap<string, Uint8Array>>(new Map())
  const [frames, setFrames] = useState<ReadonlyMap<string, EvidenceFrame>>(new Map())
  const [failures, setFailures] = useState<readonly EvidenceFailure[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<Format | null>(null)

  const [meta] = useState<HandoffMeta>(() => ({
    source: props.source,
    generatedAt: props.now ?? Date.now(),
    version: rasdVersion(),
  }))
  /** الحالة المستطلَعة — تُقرأ متزامنًا داخل معالج النقرة (نمط `ExportFlow`). */
  const permission = useRef<PermissionState>('unknown')
  const urlRef = useRef<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const abort = useRef(new AbortController())

  const model = useMemo(
    () => buildHandoff(list, options, meta, frames),
    [list, options, meta, frames],
  )
  const built = useMemo(
    () => (phase.kind === 'ready' ? assembleHandoff(model, imagesByName(model, baked)) : null),
    [phase.kind, model, baked],
  )

  const close = (): void => {
    abort.current.abort()
    props.onClose()
  }

  // الخبز مرّة عند الفتح: كل صورة تحتاجها المشكلات، ولو أُطفئ «مقتطع اللقطة» بعدها.
  useEffect(() => {
    const controller = abort.current
    let dispose: (() => void) | null = null
    const build = async (): Promise<void> => {
      const settings = await getSettingsResult()
      // قراءةٌ فاشلة تُحذف بها البيانات الوصفية: الحذف لا يضرّ PNG، والإبقاء قد يضرّ.
      const stripMetadata = settings.ok ? settings.value.privacy.stripMetadataOnExport : true
      let tools: BakeTools
      if (props.tools) {
        tools = { ...props.tools, stripMetadata }
      } else {
        const made = await createBakeTools(stripMetadata)
        dispose = () => made.dispose()
        tools = made
      }
      if (controller.signal.aborted) return dispose?.()
      const wanted = imagesOf(
        buildHandoff(props.issues, { ...DEFAULT_OPTIONS, images: true }, meta),
      )
      const result = await bakeEvidence(wanted, tools, {
        signal: controller.signal,
        onProgress: (done, total) => setPhase({ kind: 'building', done, total }),
        ...(props.live ? { live: props.live } : {}),
      })
      dispose?.()
      dispose = null
      if (controller.signal.aborted) return
      if (!result.ok) {
        setError(result.error.message)
        setPhase({ kind: 'ready' })
        return
      }
      setBaked(result.value.images)
      setFrames(result.value.frames)
      setFailures(result.value.failed)
      setPhase({ kind: result.value.failed.length > 0 ? 'failed' : 'ready' })
    }
    // ما يرمي في البناء يُقال ولا يترك النافذة على «جارٍ البناء» إلى الأبد.
    build().catch((thrown: unknown) => {
      dispose?.()
      dispose = null
      if (controller.signal.aborted) return
      setError(`تعذّر بناء الحزمة — ${thrown instanceof Error ? thrown.message : String(thrown)}`)
      setPhase({ kind: 'ready' })
    })
    return () => {
      controller.abort()
      dispose?.()
    }
  }, [])

  useEffect(() => {
    let live = true
    void (async () => {
      if (await hasPermission(['downloads'])) {
        if (live) permission.current = 'granted'
        return
      }
      if ((await downloadsRefused()) && live) permission.current = 'denied'
    })()
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const imageCount = built?.ok ? built.value.files.length - 2 : 0
  const filename = packageName(meta.generatedAt)

  /** **يُستدعى متزامنًا من النقرة.** لا `await` قبل `requestPermission` (نمط `ExportFlow`). */
  const onDownload = (): void => {
    if (!built?.ok) return
    const { bytes } = built.value
    const images = imageCount
    const finish = async (route: 'managed' | 'anchor', note: string | null): Promise<void> => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      const delivered = await deliver({ route, url, filename })
      setPhase({
        kind: 'done',
        delivered,
        note: delivered.route === 'anchor' ? note : null,
        size: bytes.length,
        images,
      })
    }
    const decision = planDownload(permission.current)
    if (!decision.ask) {
      void finish(decision.route, decision.note)
      return
    }
    void requestPermission(['downloads']).then(async (outcome) => {
      const next = afterAsk(outcome)
      if (next.remember) {
        permission.current = next.remember
        if (next.remember === 'denied') await rememberRefusal()
      }
      await finish(next.decision.route, next.decision.note)
    })
  }

  /** النصّ جاهزٌ قبل النقرة، فالكتابة في نبضتها ولا خبز ينتظر. */
  const onCopy = (): void => {
    if (!built?.ok) return
    const text = format === 'markdown' ? built.value.markdown : built.value.json
    const clipboard = navigator.clipboard as Clipboard | undefined
    if (!clipboard?.writeText) {
      setError('الحافظة غير متاحة في هذا المتصفّح.')
      return
    }
    setCopied(null)
    void clipboard.writeText(text).then(
      () => setCopied(format),
      () => setError('تعذّر النسخ — انقر داخل النافذة ثمّ أعد المحاولة.'),
    )
  }

  const failedCaptures = new Set(failures.map((f) => f.captureId))
  const remaining = list.filter((issue) => !failedCaptures.has(issue.evidence.captureId))
  const removeFailed = (): void => {
    setList(remaining)
    setFailures([])
    setPhase({ kind: 'ready' })
  }

  const subtitle = `${countText(list.length, ISSUE_FORMS)} · ${props.source} — للمطوّر أو لمساعد برمجة`

  return (
    <div
      class={sheet.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
      data-handoff-dialog=""
      data-phase={phase.kind}
    >
      <div class={cx(sheet.modal, styles.modal)}>
        <header class={sheet.head}>
          <button
            type="button"
            ref={closeRef}
            class={sheet.close}
            aria-label="إغلاق"
            data-handoff-close=""
            onClick={close}
          >
            <Icon name="close" size="sm" />
          </button>
          <div class={sheet.headText}>
            <h2 id="handoff-title" class={cx(sheet.title, 't-arabic-heading-s')}>
              حزمة التسليم
            </h2>
            <p class={cx(sheet.subtitle, 't-arabic-ui-xs')}>{subtitle}</p>
          </div>
        </header>

        {phase.kind === 'building' ? (
          <Building done={phase.done} total={phase.total} onCancel={close} />
        ) : phase.kind === 'failed' ? (
          <>
            <div class={sheet.body} data-handoff-failed="">
              <Banner tone="danger">
                <strong class="t-arabic-ui-s-strong">تعذّر بناء الحزمة</strong>
                {/* كل مشكلةٍ دليلها اللقطة الفاشلة باسمها — «أزلها» تُخرجها كلّها، فتُسمّى كلّها. */}
                {failures.flatMap((f) =>
                  list
                    .filter((i) => i.evidence.captureId === f.captureId)
                    .map((issue) => (
                      <span key={issue.id} class={styles.failure} data-handoff-failure={issue.id}>
                        {failureText(issue, f)}
                      </span>
                    )),
                )}
              </Banner>
              {remaining.length > 0 ? (
                <section class={sheet.group} aria-labelledby="handoff-remaining">
                  <h3 id="handoff-remaining" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                    ما زال جاهزًا
                  </h3>
                  <div class={sheet.summary}>
                    {remaining.map((issue) => (
                      <div key={issue.id} class={sheet.kv}>
                        <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>{issue.title}</span>
                        <span class={cx(sheet.rowValue, 't-arabic-ui-xs-strong')}>
                          {readyParts(model, issue.id)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              {remaining.length > 0 ? (
                <Button variant="primary" size="l" onClick={removeFailed} data-handoff-remove="">
                  أزلها وتابع
                </Button>
              ) : null}
              <Button variant="secondary" size="l" onClick={close}>
                إلغاء
              </Button>
            </footer>
          </>
        ) : phase.kind === 'done' ? (
          <>
            <div class={cx(sheet.body, styles.done)} data-handoff-done="">
              <span class={styles.doneIcon}>
                <Icon name="check" size="lg" />
              </span>
              <p class={cx(styles.doneTitle, 't-arabic-heading-xs')}>نُزّلت الحزمة</p>
              <p class={cx(styles.doneText, 't-arabic-ui-s')}>{doneLabel(phase.images)}</p>
              <TechnicalValue kind="path" variant="mono-s" class={styles.doneFile}>
                {phase.delivered.shown}
              </TechnicalValue>
              {phase.note ? <p class={sheet.note}>{phase.note}</p> : null}
              <div class={cx(sheet.summary, styles.doneSummary)}>
                <div class={sheet.kv}>
                  <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>المشكلات</span>
                  <span class={cx(sheet.rowValue, 't-arabic-ui-xs-strong')}>
                    {issuesLabel(list.length)}
                  </span>
                </div>
                <div class={sheet.kv}>
                  <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>الحجم</span>
                  <TechnicalValue kind="dimension" variant="mono-xs">
                    {formatStorage(phase.size)}
                  </TechnicalValue>
                </div>
              </div>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              <Button variant="primary" size="l" onClick={close} data-handoff-finish="">
                تم
              </Button>
              {phase.delivered.downloadId !== null ? (
                <Button
                  variant="secondary"
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
              ) : null}
            </footer>
          </>
        ) : (
          <>
            <div class={sheet.body} data-handoff-ready="">
              {error ? <Banner tone="danger">{error}</Banner> : null}
              {built && !built.ok ? <Banner tone="danger">{built.error.message}</Banner> : null}
              <section class={sheet.group} aria-labelledby="handoff-format-label">
                <h3 id="handoff-format-label" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                  الصيغة
                </h3>
                <div
                  class={styles.formats}
                  role="radiogroup"
                  aria-labelledby="handoff-format-label"
                >
                  <OptionCard
                    name="handoff-format"
                    value="markdown"
                    icon="file-code"
                    title="Markdown"
                    hint="يُقرأ ويُلصق كما هو"
                    selected={format === 'markdown'}
                    onSelect={() => setFormat('markdown')}
                    data-handoff-format="markdown"
                  />
                  <OptionCard
                    name="handoff-format"
                    value="json"
                    icon="code"
                    title="JSON"
                    hint={`${HANDOFF_SCHEMA} · لأداة آلية`}
                    selected={format === 'json'}
                    onSelect={() => setFormat('json')}
                    data-handoff-format="json"
                  />
                </div>
              </section>

              <section class={sheet.group} aria-labelledby="handoff-include-label">
                <h3 id="handoff-include-label" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                  يشمل
                </h3>
                <div class={sheet.card}>
                  {INCLUDE.map((item) => (
                    <div key={item.key} class={styles.include} data-handoff-include={item.key}>
                      <Checkbox
                        checked={options[item.key] ? 'on' : 'off'}
                        label={item.label}
                        onChange={(on) => setOptions((prev) => ({ ...prev, [item.key]: on }))}
                      />
                      {item.hint ? (
                        <p class={cx(styles.includeHint, 't-arabic-ui-xs')}>{item.hint}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>

              <pre
                class={cx(styles.preview, 't-mono-xs')}
                dir={format === 'json' ? 'ltr' : 'rtl'}
                tabIndex={0}
                aria-label={`معاينة ${format === 'json' ? 'JSON' : 'Markdown'} كما يُنسخ ويُنزَّل`}
                data-handoff-preview={format}
              >
                {built?.ok ? (format === 'json' ? built.value.json : built.value.markdown) : ''}
              </pre>

              <section class={sheet.group} aria-labelledby="handoff-package-label">
                <h3 id="handoff-package-label" class={cx(sheet.groupLabel, 't-arabic-label-xs')}>
                  الحزمة
                </h3>
                <div class={sheet.summary}>
                  <div class={sheet.kv}>
                    <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>الملفّ</span>
                    <TechnicalValue kind="path" variant="mono-xs">
                      {filename}
                    </TechnicalValue>
                  </div>
                  <div class={sheet.kv}>
                    <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>فيه</span>
                    <span class={cx(sheet.rowValue, 't-arabic-ui-xs-strong')}>
                      {contentsLabel(imageCount)}
                    </span>
                  </div>
                  <div class={sheet.kv} data-handoff-size="">
                    <span class={cx(sheet.rowLabel, 't-arabic-ui-xs')}>الحجم</span>
                    <TechnicalValue kind="dimension" variant="mono-xs">
                      {built?.ok ? formatStorage(built.value.bytes.length) : '—'}
                    </TechnicalValue>
                  </div>
                </div>
              </section>
            </div>
            <footer class={cx(sheet.actions, styles.actions)}>
              <Button
                variant="primary"
                size="l"
                icon="download"
                onClick={onDownload}
                data-handoff-download=""
                {...(built?.ok ? {} : { state: 'disabled' as const })}
              >
                نزّل الحزمة
              </Button>
              <Button
                variant="secondary"
                size="l"
                icon="copy"
                onClick={onCopy}
                data-handoff-copy={format}
                {...(built?.ok ? {} : { state: 'disabled' as const })}
              >
                {format === 'json' ? 'انسخ JSON' : 'انسخ Markdown'}
              </Button>
            </footer>
          </>
        )}
      </div>

      {copied ? (
        <div class={styles.toastSlot}>
          <Toast
            tone="success"
            detail="الصقه كما هو — الصور في الحزمة المنزّلة وحدها."
            onDismiss={() => setCopied(null)}
          >
            {`نُسخ ${copied === 'json' ? 'JSON' : 'Markdown'} إلى الحافظة`}
          </Toast>
        </div>
      ) : null}
    </div>
  )
}

function Building({
  done,
  total,
  onCancel,
}: {
  done: number
  total: number
  onCancel: () => void
}): JSX.Element {
  const label = progressLabel(done, total)
  return (
    <>
      <div class={sheet.body} data-handoff-building="">
        {total > 0 ? (
          <div class={styles.progressHead}>
            <span class={cx(styles.progressStep, 't-arabic-ui-s')}>{label.step}</span>
            <span class={cx(styles.progressCount, 't-arabic-ui-xs')}>{label.count}</span>
          </div>
        ) : null}
        <ProgressBar value={total > 0 ? (done / total) * 100 : 0} label="تقدّم بناء الحزمة" />
        <p class={sheet.note}>
          الصور تمرّ من مخرج الترميز الواحد بعد الحجب، ولا تُضمَّن بياناتها الوصفية. لا يُرسل شيءٌ
          خارج هذا الجهاز.
        </p>
      </div>
      <footer class={cx(sheet.actions, styles.actions)}>
        <Button variant="primary" size="l" state="loading">
          جارٍ البناء
        </Button>
        <Button variant="secondary" size="l" onClick={onCancel} data-handoff-cancel="">
          إلغاء
        </Button>
      </footer>
    </>
  )
}
