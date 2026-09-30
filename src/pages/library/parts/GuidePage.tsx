/**
 * صفحة الدليل — `library / guide` (`128:697`) و`guide / editor` (`304:1506`) في عرضٍ واحد تحت القشرة.
 *
 * **عرضٌ يُحرَّر في مكانه:** الإطاران يرسمان الدليل نفسه — الأوّل برقاقات الصيغ، والثاني بمقبض السحب والحذف
 * و«صدّر الدليل». فالصفحة تجمعهما: رقاقات الصيغ اختصارٌ يفتح نافذة التصدير على صيغته، والعناوين والملاحظات
 * حقولٌ تُحفظ حين يغادرها التركيز، والترتيب بالسحب أو بزرّين لكل خطوة — السحب وحده يُقصي لوحة المفاتيح.
 * و«شارك» المرسومة في `guide / editor` لا تُعرض: محرّكها في `STAGES/10`.
 *
 * **الحالة المعروضة هي ما يُحفظ:** كل حفظٍ يكتب العنوان والخطوات بترتيبها (`saveGuide`)، والتصدير يحفظ أوّلًا
 * ما لم يُحفظ فلا يُصدَّر نصٌّ غير المكتوب.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import { STEP_FORMS } from '@/modules/export/guide'
import { countText, formatHuman } from '@/shared/bidi/numerals'
import { GUIDE_FORMATS, GUIDE_LIMITS, type GuideFormat } from '@/shared/guide-schema'
import { Button } from '@/ui/components/Button/Button'
import { ErrorMessage } from '@/ui/components/ErrorMessage/ErrorMessage'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import { FORMAT_CARD, GuideExportDialog } from '../../export/GuideExportDialog'
import { resolveThumbnailUrl } from '../context'
import { loadGuide, moveStep, saveGuide, type GuideStepView } from '../guides'
import { browserThumbnailEncoder } from '../thumbnail-encoder'

import styles from './GuidePage.module.css'

import type { GuideRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface GuidePageProps {
  readonly id: string
  /** العودة إلى قائمة الأدلّة. */
  readonly onBack: () => void
  /** بعد كل كتابة — يعيد الشريط الجانبي عدّه. */
  readonly onChanged?: () => void
  /** يُحقن للاختبار. */
  readonly now?: () => number
}

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready' }

/** رقاقات الصيغ بترتيب `library / guide`: صفحة الويب أوّلًا من اليمين. */
const CHIP_ORDER: readonly GuideFormat[] = ['html', 'pdf', 'zip', 'markdown']

export function GuidePage({ id, onBack, onChanged, now = Date.now }: GuidePageProps): JSX.Element {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [guide, setGuide] = useState<GuideRecord | null>(null)
  const [title, setTitle] = useState('')
  const [steps, setSteps] = useState<readonly GuideStepView[]>([])
  const [thumbs, setThumbs] = useState<ReadonlyMap<string, string | null>>(new Map())
  const [exporting, setExporting] = useState<GuideFormat | 'default' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  /** عدّل المستخدم ولم يُحفظ بعد. */
  const dirty = useRef(false)

  const reload = useCallback(async () => {
    setLoad({ kind: 'loading' })
    const view = await loadGuide(id)
    if (!view.ok) {
      setLoad(
        view.error.code === 'not-found'
          ? { kind: 'missing' }
          : { kind: 'error', message: view.error.message },
      )
      return
    }
    setGuide(view.value.guide)
    setTitle(view.value.guide.title)
    setSteps(view.value.steps)
    dirty.current = false
    setLoad({ kind: 'ready' })
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  // المصغَّرات من مسار المكتبة نفسه: تُولَّد مرّةً وتُخزَّن، وعناوينها تُحرَّر مع الصفحة.
  const urls = useRef<string[]>([])
  const asked = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const step of steps) {
      if (!step.capture || asked.current.has(step.captureId)) continue
      asked.current.add(step.captureId)
      void resolveThumbnailUrl(step.captureId, browserThumbnailEncoder).then((url) => {
        if (url) urls.current.push(url)
        setThumbs((prev) => new Map(prev).set(step.captureId, url))
      })
    }
  }, [steps])
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url)
    },
    [],
  )

  const persist = useCallback(
    async (nextTitle: string, nextSteps: readonly GuideStepView[]): Promise<boolean> => {
      if (!guide) return false
      const saved = await saveGuide(guide, nextTitle, nextSteps, now())
      if (!saved.ok) {
        setSaveError(saved.error.message)
        return false
      }
      setSaveError(null)
      setGuide(saved.value)
      dirty.current = false
      onChanged?.()
      return true
    },
    [guide, now, onChanged],
  )

  const commit = (): void => {
    if (dirty.current) void persist(title, steps)
  }

  const editStep = (index: number, patch: Partial<Pick<GuideStepView, 'title' | 'note'>>): void => {
    dirty.current = true
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const reorder = (from: number, to: number): void => {
    const next = moveStep(steps, from, to)
    setSteps(next)
    void persist(title, next)
  }

  const remove = (index: number): void => {
    const next = steps.filter((_, i) => i !== index)
    setSteps(next)
    void persist(title, next)
  }

  const openExport = (format: GuideFormat | 'default'): void => {
    // ما لم يُحفظ يُحفظ أوّلًا — التصدير يقرأ الحالة المعروضة، والمكتبة تقرأ المحفوظة.
    if (dirty.current) void persist(title, steps)
    setExporting(format)
  }

  if (load.kind === 'loading') {
    return (
      <div class={styles.page} role="status" aria-busy="true" aria-label="جارٍ تحميل الدليل">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} kind="panel" />
        ))}
      </div>
    )
  }

  if (load.kind === 'missing' || load.kind === 'error' || !guide) {
    return (
      <div class={cx(styles.page, styles.center)} data-guide-missing="">
        <ErrorMessage
          layout="page"
          title={load.kind === 'error' ? 'تعذّرت قراءة الدليل' : 'الدليل غير موجود'}
          body={
            load.kind === 'error'
              ? 'لم يستجب التخزين على هذا الجهاز. الدليل لم يُحذف — أعد المحاولة.'
              : 'ربما حُذف من المكتبة. أدلّتك الأخرى في «أدلة الخطوات».'
          }
          {...(load.kind === 'error' ? { onRetry: () => void reload() } : {})}
        />
        <Button variant="secondary" size="m" icon="chevron-right" onClick={onBack}>
          أدلة الخطوات
        </Button>
      </div>
    )
  }

  const captureTitles = new Map(steps.map((s) => [s.captureId, s.capture?.title ?? '']))
  const sourceBytes = steps.map((s) => s.bytes ?? 0)
  const shots = steps.map((s) => ({ width: s.capture?.width ?? 0, height: s.capture?.height ?? 0 }))

  return (
    <div class={styles.page} data-guide-page={guide.id}>
      <div class={styles.head}>
        <div class={styles.heading}>
          <button
            type="button"
            class={styles.back}
            onClick={onBack}
            aria-label="عُد إلى أدلة الخطوات"
          >
            <Icon name="chevron-right" size="sm" />
          </button>
          <input
            class={cx(styles.titleInput, 't-arabic-heading-m')}
            value={title}
            maxLength={GUIDE_LIMITS.title}
            aria-label="عنوان الدليل"
            data-guide-title=""
            onInput={(e) => {
              dirty.current = true
              setTitle(e.currentTarget.value)
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
          <span class={cx(styles.count, 't-arabic-ui-xs')} data-guide-count={steps.length}>
            {countText(steps.length, STEP_FORMS)}
          </span>
        </div>
        <div class={styles.actions}>
          <div class={styles.chips} role="group" aria-label="صدّر بصيغة">
            {CHIP_ORDER.filter((f) => GUIDE_FORMATS.includes(f)).map((format) => (
              <button
                key={format}
                type="button"
                class={cx(styles.chip, 't-arabic-ui-xs-strong')}
                onClick={() => openExport(format)}
                data-guide-chip={format}
                aria-label={`صدّر ${FORMAT_CARD[format].title}`}
                disabled={steps.length === 0}
              >
                {FORMAT_CARD[format].title}
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            size="m"
            icon="download"
            onClick={() => openExport('default')}
            data-guide-export-open=""
            {...(steps.length === 0 ? { state: 'disabled' as const } : {})}
          >
            صدّر الدليل
          </Button>
        </div>
      </div>

      {saveError ? (
        <p class={cx(styles.saveError, 't-arabic-ui-xs')} role="alert" data-guide-save-error="">
          {`تعذّر حفظ الدليل — ${saveError}`}
        </p>
      ) : null}

      {steps.length === 0 ? (
        <div class={styles.center} data-guide-empty="">
          <p class={cx(styles.emptyTitle, 't-arabic-heading-xs')}>لا خطوات في هذا الدليل</p>
          <p class={cx(styles.emptyHint, 't-arabic-ui-s')}>
            حدّد لقطات في «كل اللقطات» ثمّ «أنشئ دليلًا» لتبدأ دليلًا بخطواتها.
          </p>
        </div>
      ) : (
        <ol class={styles.steps} aria-label="خطوات الدليل">
          {steps.map((step, index) => {
            const n = formatHuman(index + 1)
            const thumb = thumbs.get(step.captureId)
            return (
              <li
                key={step.captureId}
                class={cx(styles.step, dragFrom === index && styles.dragging)}
                data-guide-step={step.captureId}
                onDragOver={(e) => {
                  if (dragFrom !== null) e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragFrom !== null) reorder(dragFrom, index)
                  setDragFrom(null)
                }}
              >
                <span
                  class={styles.handle}
                  draggable
                  aria-hidden="true"
                  title="اسحب لتغيير الترتيب"
                  onDragStart={(e) => {
                    setDragFrom(index)
                    e.dataTransfer?.setData('text/plain', step.captureId)
                  }}
                  onDragEnd={() => setDragFrom(null)}
                >
                  <Icon name="drag" size="sm" />
                </span>
                <span class={cx(styles.badge, 't-arabic-ui-xs-strong')} aria-hidden="true">
                  {n}
                </span>
                <div class={styles.text}>
                  <input
                    class={cx(styles.stepTitle, 't-arabic-ui-m-strong')}
                    value={step.title}
                    placeholder={step.capture?.title || `الخطوة ${n}`}
                    maxLength={GUIDE_LIMITS.stepTitle}
                    aria-label={`عنوان الخطوة ${n}`}
                    data-guide-step-title=""
                    onInput={(e) => editStep(index, { title: e.currentTarget.value })}
                    onBlur={commit}
                  />
                  <textarea
                    class={cx(styles.note, 't-arabic-ui-s')}
                    value={step.note}
                    rows={2}
                    placeholder="أضِف ملاحظة لهذه الخطوة…"
                    maxLength={GUIDE_LIMITS.note}
                    aria-label={`ملاحظة الخطوة ${n}`}
                    data-guide-step-note=""
                    onInput={(e) => editStep(index, { note: e.currentTarget.value })}
                    onBlur={commit}
                  />
                  {step.capture ? null : (
                    <p class={cx(styles.lost, 't-arabic-ui-xs')} data-guide-step-lost="">
                      لقطة هذه الخطوة لم تعد في المكتبة — احذف الخطوة ليُصدَّر الدليل.
                    </p>
                  )}
                </div>
                <span class={styles.thumb}>
                  {thumb ? (
                    <img src={thumb} alt="" class={styles.thumbImg} />
                  ) : (
                    <Icon name="image" size="lg" class={styles.thumbFallback} />
                  )}
                </span>
                <span class={styles.tools}>
                  <IconButton
                    icon="chevron-up"
                    size="s"
                    aria-label={`انقل الخطوة ${n} إلى أعلى`}
                    {...(index === 0
                      ? { state: 'disabled' as const }
                      : { onClick: () => reorder(index, index - 1) })}
                  />
                  <IconButton
                    icon="chevron-down"
                    size="s"
                    aria-label={`انقل الخطوة ${n} إلى أسفل`}
                    {...(index === steps.length - 1
                      ? { state: 'disabled' as const }
                      : { onClick: () => reorder(index, index + 1) })}
                  />
                  <IconButton
                    icon="trash"
                    size="s"
                    aria-label={`أزل الخطوة ${n} من الدليل`}
                    onClick={() => remove(index)}
                  />
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {exporting ? (
        <GuideExportDialog
          title={title.trim() || guide.title}
          steps={steps}
          captureTitles={captureTitles}
          sourceBytes={sourceBytes}
          shots={shots}
          {...(exporting === 'default' ? {} : { format: exporting })}
          onClose={() => setExporting(null)}
        />
      ) : null}
    </div>
  )
}
