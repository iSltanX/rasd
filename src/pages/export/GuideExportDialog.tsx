/**
 * نافذة «تصدير الدليل» — `guide / export` (`304:1647`) وحالاتها: `template-save` (`304:1922`) و`export-loading`
 * (`304:2130`) و`export-done` (`304:2328`) و`export-error` (`304:2528`) و`export-cancelled` (`319:54483`).
 *
 * **نافذةٌ واحدة بأطوارها** لا نوافذ متراكبة: الإطارات الستّة ترسم الورقة نفسها بجسمٍ آخر، فالطور حالةٌ هنا
 * وهيكل الورقة من `export.module.css` كنافذتَي التصدير والتسليم.
 *
 * **القالب مجموعة إعداداتٍ مسمّاة** (الصيغة وحجم الصفحة والترقيم والملاحظات): اختياره يطبّقها، وتعديل أيٍّ منها
 * بعده يعيد القائمة إلى «بلا قالب» — فلا تُعرض قالبًا إعداداتٌ لم تعد له.
 *
 * **والتنزيل بطريق التصدير نفسه:** الصلاحية تُطلب في نبضة النقرة (نمط `ExportFlow`)، ثمّ يُبنى الملفّ، ثمّ يُسلَّم
 * بـ`deliver`. ولا شبكة: العنوان `blob:` لا يغادر الجهاز.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { afterAsk, planDownload, type PermissionState } from '@/modules/export/download'
import {
  estimateGuideBytes,
  estimateGuidePages,
  guideFilename,
  STEP_FORMS,
} from '@/modules/export/guide'
import { PAGE_FORMS, PAGE_SIZES } from '@/modules/export/pdf-layout'
import { countText, formatHuman, formatStorage } from '@/shared/bidi/numerals'
import {
  DEFAULT_GUIDE_OPTIONS,
  GUIDE_FORMATS,
  GUIDE_LIMITS,
  GUIDE_PAGE_SIZES,
  type GuideExportOptions,
  type GuideFormat,
  type GuideStep,
  type TemplateRecord,
} from '@/shared/guide-schema'
import { hasPermission, requestPermission } from '@/shared/permissions'
import { getSettingsResult } from '@/shared/settings'
import { Banner, Button, Toggle } from '@/ui/components'
import { Field } from '@/ui/components/Field/Field'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { OptionCard } from '@/ui/components/OptionCard/OptionCard'
import { ProgressBar } from '@/ui/components/ProgressBar/ProgressBar'
import { Select } from '@/ui/components/Select/Select'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'
import { Spinner } from '@/ui/components/Spinner/Spinner'
import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import { createBakeTools } from '../handoff/evidence'
import { deleteTemplate, loadTemplates, matchingTemplate, saveTemplate } from '../library/guides'

import { deliver, revealDownload, type Delivered } from './deliver'
import styles from './export.module.css'
import { runGuideExport } from './guide-export'
import local from './guide-export.module.css'
import { downloadsRefused, rememberRefusal } from './permission-memory'

import type { JSX } from 'preact'

/** بترتيب الإطار من اليمين، وأسماؤها ونصوصها منه. */
export const FORMAT_CARD: Readonly<
  Record<GuideFormat, { readonly title: string; readonly hint: string; readonly icon: IconName }>
> = {
  pdf: { title: 'PDF', hint: 'للطباعة والإرسال', icon: 'file-code' },
  zip: { title: 'ZIP', hint: 'الصور ومعها النصّ', icon: 'folder' },
  markdown: { title: 'Markdown', hint: 'نصٌّ للتوثيق بلا صور', icon: 'code' },
  html: { title: 'صفحة ويب', hint: 'ملفّ واحد بلا إنترنت', icon: 'offline' },
}

export const PAGE_SIZE_REASON = 'في PDF وحدها — الصيغ الأخرى بلا صفحات.'

export interface GuideExportDialogProps {
  readonly title: string
  readonly steps: readonly GuideStep[]
  /** عنوان كل لقطة — بديل عنوان الخطوة الفارغ. */
  readonly captureTitles: ReadonlyMap<string, string>
  /** بايتات أصل كل لقطة — للحجم التقديري قبل الخبز. */
  readonly sourceBytes: readonly number[]
  /** أبعاد كل لقطة — لعدد صفحات PDF قبل الخبز. */
  readonly shots: readonly { readonly width: number; readonly height: number }[]
  /** الصيغة التي فُتحت بها النافذة — من رقاقات الصفحة. */
  readonly format?: GuideFormat
  readonly onClose: () => void
  /** زمن التصدير — يُحقن للاختبار. */
  readonly now?: () => number
}

type Phase =
  | { readonly kind: 'options' }
  | { readonly kind: 'template' }
  | { readonly kind: 'running'; readonly done: number; readonly total: number }
  | {
      readonly kind: 'done'
      readonly delivered: Delivered
      readonly note: string | null
      readonly size: number
      readonly pages: number | null
    }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'cancelled' }

/** نسخة رصد من البيان — وفي بيئةٍ بلا بيان (الاختبار) علامةٌ لا رقمٌ مخترَع. */
function rasdVersion(): string {
  try {
    return chrome.runtime.getManifest().version
  } catch {
    return 'dev'
  }
}

/** «مفعَّلان» · «الترقيم وحده» · «الملاحظات وحدها» · «مطفآن» — صفّ ملخّص القالب. */
export function togglesLabel(options: GuideExportOptions): string {
  if (options.numbered && options.notes) return 'مفعَّلان'
  if (options.numbered) return 'الترقيم وحده'
  if (options.notes) return 'الملاحظات وحدها'
  return 'مطفآن'
}

export function GuideExportDialog(props: GuideExportDialogProps): JSX.Element {
  const [options, setOptions] = useState<GuideExportOptions>({
    ...DEFAULT_GUIDE_OPTIONS,
    ...(props.format ? { format: props.format } : {}),
  })
  const [phase, setPhase] = useState<Phase>({ kind: 'options' })
  const [templates, setTemplates] = useState<readonly TemplateRecord[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const permission = useRef<PermissionState>('unknown')
  const urlRef = useRef<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const run = useRef<AbortController | null>(null)
  const now = props.now ?? Date.now

  const close = (): void => {
    run.current?.abort()
    props.onClose()
  }

  const reloadTemplates = async (): Promise<void> => {
    const list = await loadTemplates()
    if (list.ok) setTemplates(list.value)
  }

  useEffect(() => {
    void reloadTemplates()
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
      run.current?.abort()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  /** القالب المعروض: المختار ما دامت إعداداته هي الحاضرة، وإلا ما يطابقها، وإلا لا شيء. */
  const selected = useMemo(() => {
    const picked = templates.find((t) => t.id === chosen)
    if (picked && matchingTemplate([picked], options)) return picked
    return matchingTemplate(templates, options)
  }, [templates, chosen, options])

  const count = props.steps.length
  const estimate = estimateGuideBytes(options.format, props.sourceBytes)
  const pages = estimateGuidePages(props.shots, options.pageSize)
  const filename = guideFilename(props.title, options.format)
  const subtitle = `${props.title} · ${countText(count, STEP_FORMS)}`

  const update = (next: Partial<GuideExportOptions>): void => {
    setOptions((prev) => ({ ...prev, ...next }))
    setNotice(null)
  }

  /** **يُستدعى متزامنًا من النقرة.** لا `await` قبل `requestPermission` (نمط `ExportFlow`). */
  const onExport = (): void => {
    if (count === 0) return
    const controller = new AbortController()
    run.current = controller
    setPhase({ kind: 'running', done: 0, total: count })

    const start = async (route: 'managed' | 'anchor', note: string | null): Promise<void> => {
      const settings = await getSettingsResult()
      // قراءةٌ فاشلة تُحذف بها البيانات الوصفية: الحذف لا يضرّ، والإبقاء قد يضرّ.
      const stripMetadata = settings.ok ? settings.value.privacy.stripMetadataOnExport : true
      const tools = await createBakeTools(stripMetadata)
      try {
        const result = await runGuideExport({
          title: props.title,
          steps: props.steps,
          captureTitles: props.captureTitles,
          options,
          version: rasdVersion(),
          now: now(),
          tools,
          signal: controller.signal,
          onProgress: (done, total) => {
            if (!controller.signal.aborted) setPhase({ kind: 'running', done, total })
          },
        })
        if (controller.signal.aborted || (!result.ok && result.error.code === 'cancelled')) {
          setPhase({ kind: 'cancelled' })
          return
        }
        if (!result.ok) {
          setPhase({ kind: 'error', message: result.error.message })
          return
        }
        const url = URL.createObjectURL(result.value.blob)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        const delivered = await deliver({ route, url, filename: result.value.filename })
        setPhase({
          kind: 'done',
          delivered,
          note: delivered.route === 'anchor' ? note : null,
          size: result.value.blob.size,
          pages: result.value.pages,
        })
      } finally {
        tools.dispose()
      }
    }
    const fail = (thrown: unknown): void => {
      if (controller.signal.aborted) return
      setPhase({
        kind: 'error',
        message: thrown instanceof Error ? thrown.message : String(thrown),
      })
    }

    const decision = planDownload(permission.current)
    if (!decision.ask) {
      start(decision.route, decision.note).catch(fail)
      return
    }
    void requestPermission(['downloads'])
      .then(async (outcome) => {
        const next = afterAsk(outcome)
        if (next.remember) {
          permission.current = next.remember
          if (next.remember === 'denied') await rememberRefusal()
        }
        await start(next.decision.route, next.decision.note)
      })
      .catch(fail)
  }

  const onCancelRun = (): void => {
    run.current?.abort()
    setPhase({ kind: 'cancelled' })
  }

  const onSaveTemplate = (): void => {
    setTemplateError(null)
    void saveTemplate(templateName, options, now()).then(async (saved) => {
      if (!saved.ok) {
        setTemplateError(saved.error.message)
        return
      }
      await reloadTemplates()
      setChosen(saved.value.id)
      setNotice(`حُفظ القالب «${saved.value.name}»`)
      setPhase({ kind: 'options' })
    })
  }

  const onDeleteTemplate = (template: TemplateRecord): void => {
    void deleteTemplate(template.id).then(async (removed) => {
      if (!removed.ok) {
        setNotice(`تعذّر حذف القالب — ${removed.error.message}`)
        return
      }
      setChosen(null)
      await reloadTemplates()
      setNotice(`حُذف القالب «${template.name}»`)
    })
  }

  const heading =
    phase.kind === 'template'
      ? { title: 'احفظ قالبًا', sub: 'تُستعاد به إعدادات التصدير لاحقًا' }
      : phase.kind === 'cancelled'
        ? { title: 'تصدير الدليل', sub: 'أُلغي التصدير' }
        : { title: 'تصدير الدليل', sub: subtitle }

  return (
    <div
      class={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-export-title"
      data-guide-export=""
      data-phase={phase.kind}
    >
      <div class={cx(styles.modal, phase.kind === 'template' && local.narrow)}>
        <header class={styles.head}>
          <button
            type="button"
            ref={closeRef}
            class={styles.close}
            aria-label="إغلاق"
            data-guide-export-close=""
            onClick={close}
          >
            <Icon name="close" size="sm" />
          </button>
          <div class={styles.headText}>
            <h2 id="guide-export-title" class={cx(styles.title, 't-arabic-heading-s')}>
              {heading.title}
            </h2>
            <p class={cx(styles.subtitle, 't-arabic-ui-xs')}>{heading.sub}</p>
          </div>
        </header>

        {phase.kind === 'running' ? (
          <>
            <div class={cx(styles.body, local.center)} data-guide-export-running="">
              <Spinner size="m" label="جارٍ التصدير" />
              <p class={cx(local.centerText, 't-arabic-ui-s')}>
                {options.format === 'markdown' ? 'تُكتب الخطوات' : 'تُجمع الخطوات'}
              </p>
              <div class={local.progress}>
                <div class={local.progressHead}>
                  <span class="t-arabic-ui-xs">الخطوات</span>
                  <span class={cx(local.progressCount, 't-arabic-ui-xs')}>
                    {`${formatHuman(phase.done)} من ${formatHuman(phase.total)}`}
                  </span>
                </div>
                <ProgressBar
                  value={phase.total > 0 ? (phase.done / phase.total) * 100 : 0}
                  label="تقدّم تصدير الدليل"
                />
              </div>
            </div>
            <footer class={styles.actions}>
              <Button
                variant="secondary"
                size="l"
                onClick={onCancelRun}
                data-guide-export-cancel=""
              >
                ألغِ
              </Button>
            </footer>
          </>
        ) : phase.kind === 'done' ? (
          <>
            <div class={cx(styles.body, local.center)} data-guide-export-done="">
              <span class={cx(local.stateIcon, local.success)}>
                <Icon name="check" size="lg" />
              </span>
              <p class={cx(local.stateTitle, 't-arabic-heading-xs')}>الدليل جاهز</p>
              <p class={cx(local.centerText, 't-arabic-ui-s')}>
                {phase.delivered.route === 'managed'
                  ? 'الملفّ حيث اخترت حفظه.'
                  : 'الملفّ في مجلّد التنزيلات.'}
              </p>
              <TechnicalValue kind="path" variant="mono-s" class={local.path}>
                {phase.delivered.shown}
              </TechnicalValue>
              {phase.note ? <p class={styles.note}>{phase.note}</p> : null}
              <div class={cx(styles.summary, local.stretch)}>
                <div class={styles.kv}>
                  <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الحجم</span>
                  <TechnicalValue kind="dimension" variant="mono-xs">
                    {formatStorage(phase.size)}
                  </TechnicalValue>
                </div>
                {phase.pages !== null ? (
                  <div class={styles.kv} data-guide-export-pages={phase.pages}>
                    <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الصفحات</span>
                    <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>
                      {countText(phase.pages, PAGE_FORMS)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <footer class={styles.actions}>
              <Button
                variant={phase.delivered.downloadId !== null ? 'secondary' : 'primary'}
                size="l"
                onClick={close}
                data-guide-export-finish=""
              >
                أغلق
              </Button>
              {phase.delivered.downloadId !== null ? (
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
                  اعرض في المجلّد
                </Button>
              ) : null}
            </footer>
          </>
        ) : phase.kind === 'error' ? (
          <>
            <div class={styles.body} data-guide-export-error="">
              <Banner tone="danger">
                <strong class="t-arabic-ui-s-strong">تعذّر تصدير الدليل</strong>
                <span class={local.block}>{`${phase.message} الدليل لم يتغيّر.`}</span>
                <span class={local.bannerActions}>
                  <Button
                    variant="secondary"
                    size="s"
                    icon="refresh"
                    onClick={onExport}
                    data-guide-export-retry=""
                  >
                    أعد المحاولة
                  </Button>
                </span>
              </Banner>
            </div>
            <footer class={styles.actions}>
              <Button variant="secondary" size="l" onClick={close}>
                أغلق
              </Button>
            </footer>
          </>
        ) : phase.kind === 'cancelled' ? (
          <>
            <div class={cx(styles.body, local.center)} data-guide-export-cancelled="">
              <span class={cx(local.stateIcon, local.warning)}>
                <Icon name="close" size="lg" />
              </span>
              <p class={cx(local.stateTitle, 't-arabic-heading-xs')}>أُلغي التصدير</p>
              <p class={cx(local.centerText, 't-arabic-ui-s')}>لم يُحفظ ملفّ. الدليل كما هو.</p>
            </div>
            <footer class={styles.actions}>
              <Button variant="secondary" size="l" onClick={close}>
                أغلق
              </Button>
              <Button
                variant="primary"
                size="l"
                onClick={() => setPhase({ kind: 'options' })}
                data-guide-export-again=""
              >
                صدّر من جديد
              </Button>
            </footer>
          </>
        ) : phase.kind === 'template' ? (
          <>
            <div class={styles.body} data-guide-template="">
              <Field
                id="guide-template-name"
                label="اسم القالب"
                value={templateName}
                onInput={(v) => {
                  setTemplateName(v)
                  setTemplateError(null)
                }}
                placeholder="تقرير الفريق"
                maxLength={GUIDE_LIMITS.templateName}
                {...(templateError
                  ? { state: 'error' as const, hint: templateError }
                  : { hint: 'اسمٌ قائم يُحدِّث قالبه ولا يكرّره.' })}
              />
              <section class={styles.group} aria-labelledby="guide-template-keeps">
                <h3 id="guide-template-keeps" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
                  يحفظ القالب
                </h3>
                <div class={styles.summary}>
                  <div class={styles.kv}>
                    <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الصيغة</span>
                    <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>
                      {FORMAT_CARD[options.format].title}
                    </span>
                  </div>
                  <div class={styles.kv}>
                    <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>حجم الصفحة</span>
                    <TechnicalValue kind="format" variant="mono-xs">
                      {PAGE_SIZES[options.pageSize].label}
                    </TechnicalValue>
                  </div>
                  <div class={styles.kv}>
                    <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الترقيم والملاحظات</span>
                    <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>
                      {togglesLabel(options)}
                    </span>
                  </div>
                </div>
              </section>
            </div>
            <footer class={styles.actions}>
              <Button
                variant="secondary"
                size="l"
                onClick={() => {
                  setTemplateError(null)
                  setPhase({ kind: 'options' })
                }}
              >
                ألغِ
              </Button>
              <Button
                variant="primary"
                size="l"
                onClick={onSaveTemplate}
                data-guide-template-save=""
                {...(templateName.trim() ? {} : { state: 'disabled' as const })}
              >
                احفظ
              </Button>
            </footer>
          </>
        ) : (
          <>
            <div class={styles.body} data-guide-export-options="">
              {notice ? (
                <div data-guide-export-notice="">
                  <Banner tone="success">{notice}</Banner>
                </div>
              ) : null}
              <section class={styles.group} aria-labelledby="guide-format-label">
                <h3 id="guide-format-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
                  الصيغة
                </h3>
                <div class={local.formats} role="radiogroup" aria-labelledby="guide-format-label">
                  {GUIDE_FORMATS.map((format) => (
                    <OptionCard
                      key={format}
                      name="guide-format"
                      value={format}
                      icon={FORMAT_CARD[format].icon}
                      title={FORMAT_CARD[format].title}
                      hint={FORMAT_CARD[format].hint}
                      selected={options.format === format}
                      onSelect={() => update({ format })}
                      data-guide-format={format}
                    />
                  ))}
                </div>
              </section>

              <section class={styles.group} aria-labelledby="guide-options-label">
                <h3 id="guide-options-label" class={cx(styles.groupLabel, 't-arabic-label-xs')}>
                  الخيارات
                </h3>
                <div class={styles.card}>
                  <SettingRow
                    id="guide-template"
                    label="القالب"
                    hint="مجموعة إعدادات محفوظة باسم"
                    divider
                    control={
                      <span class={local.templateControl}>
                        {selected ? (
                          <IconButton
                            icon="trash"
                            size="s"
                            aria-label={`احذف القالب «${selected.name}»`}
                            onClick={() => onDeleteTemplate(selected)}
                          />
                        ) : null}
                        <Select
                          aria-label="القالب"
                          value={selected?.id ?? ''}
                          data-guide-template-select=""
                          options={[
                            {
                              value: '',
                              label: templates.length > 0 ? 'بلا قالب' : 'لا قوالب بعد',
                            },
                            ...templates.map((t) => ({ value: t.id, label: t.name })),
                          ]}
                          onChange={(id) => {
                            const template = templates.find((t) => t.id === id)
                            setChosen(template?.id ?? null)
                            if (template) setOptions({ ...template.options })
                          }}
                        />
                      </span>
                    }
                  />
                  <SettingRow
                    id="guide-page-size"
                    label="حجم الصفحة"
                    {...(options.format === 'pdf' ? {} : { hint: PAGE_SIZE_REASON })}
                    divider
                    control={
                      <Select
                        aria-label="حجم الصفحة"
                        value={options.pageSize}
                        disabled={options.format !== 'pdf'}
                        data-guide-page-size=""
                        options={GUIDE_PAGE_SIZES.map((id) => ({
                          value: id,
                          label: PAGE_SIZES[id].label,
                        }))}
                        onChange={(v) => update({ pageSize: v as GuideExportOptions['pageSize'] })}
                      />
                    }
                  />
                  <div data-guide-toggle="numbered">
                    <SettingRow
                      id="guide-numbered"
                      label="رقّم الخطوات"
                      hint="بالأرقام الهندية، من اليمين إلى اليسار"
                      divider
                      control={
                        <Toggle
                          on={options.numbered}
                          aria-label="رقّم الخطوات"
                          onChange={(numbered) => update({ numbered })}
                        />
                      }
                    />
                  </div>
                  <div data-guide-toggle="notes">
                    <SettingRow
                      id="guide-notes"
                      label="ضمّن ملاحظات كل خطوة"
                      control={
                        <Toggle
                          on={options.notes}
                          aria-label="ضمّن ملاحظات كل خطوة"
                          onChange={(notes) => update({ notes })}
                        />
                      }
                    />
                  </div>
                </div>
              </section>

              <div class={styles.summary}>
                <div class={styles.kv} data-guide-export-estimate="">
                  <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الحجم التقديري</span>
                  <TechnicalValue kind="dimension" variant="mono-xs">
                    {options.format === 'pdf'
                      ? `PDF · ${PAGE_SIZES[options.pageSize].label} · ~${formatStorage(estimate)}`
                      : `${FORMAT_CARD[options.format].title === 'صفحة ويب' ? 'HTML' : FORMAT_CARD[options.format].title} · ~${formatStorage(estimate)}`}
                  </TechnicalValue>
                </div>
                {options.format === 'pdf' ? (
                  <div class={styles.kv} data-guide-export-pages={pages}>
                    <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الصفحات</span>
                    <span class={cx(styles.rowValue, 't-arabic-ui-xs-strong')}>
                      {countText(pages, PAGE_FORMS)}
                    </span>
                  </div>
                ) : null}
                <div class={styles.kv}>
                  <span class={cx(styles.rowLabel, 't-arabic-ui-xs')}>الملفّ</span>
                  <TechnicalValue kind="path" variant="mono-xs">
                    {filename}
                  </TechnicalValue>
                </div>
              </div>
              {count === 0 ? (
                <p class={styles.error} data-guide-export-empty="">
                  لا خطوات في الدليل لتُصدَّر.
                </p>
              ) : null}
            </div>
            <footer class={styles.actions}>
              <Button
                variant="secondary"
                size="l"
                icon="plus"
                onClick={() => {
                  setTemplateName(selected?.name ?? '')
                  setPhase({ kind: 'template' })
                }}
                data-guide-template-open=""
              >
                احفظ قالبًا
              </Button>
              <Button
                variant="primary"
                size="l"
                icon="download"
                onClick={onExport}
                data-guide-export-run=""
                {...(count === 0 ? { state: 'disabled' as const } : {})}
              >
                صدّر
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  )
}
