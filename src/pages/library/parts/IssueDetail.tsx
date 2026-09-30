/**
 * `library / issue-detail` — تفصيل مشكلة: رأسٌ بحالتها وإجراءاتها، ثمّ بطاقات القيمة والعنصر والصفحة واللقطة
 * والتاريخ والخطوات والملاحظة.
 *
 * **لا «أعد الفحص» هنا:** المكتبة لا تفحص صفحةً غير مفتوحة — الفحص في الصفحة نفسها، وفي الرأس «افتح الصفحة»
 * لمن يريد الوصول إليها. وتغيير الحالة يدويًّا من قائمة الرأس بعد تحقّق المستخدم، ويُسجَّل في «التاريخ».
 *
 * **كل كتابة من المستودع** (`issues.ts`)، فسياسة التصفّح الخاص والحصّة تسريان، وفشلها يُقال فوق البطاقات
 * ولا يُبتلع — والحالة المعروضة هي المكتوبة فعلًا لا ما طُلب.
 */

import { useEffect, useState } from 'preact/hooks'

import {
  displayExpected,
  displayTolerance,
  displayValue,
  lastCheckedLabel,
  propertyLabel,
  REASON_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from '@/modules/issues/labels'
import { currentValue } from '@/modules/issues/status'
import {
  formatDimensions,
  formatHuman,
  formatMeasure,
  formatRelativeTime,
} from '@/shared/bidi/numerals'
import { ISSUE_STATUSES, type IssueHistoryEntry, type IssueRecord } from '@/shared/issue-schema'
import { send } from '@/shared/messaging'
import { Button } from '@/ui/components/Button/Button'
import { Chip } from '@/ui/components/Chip/Chip'
import { ErrorMessage } from '@/ui/components/ErrorMessage/ErrorMessage'
import { Select } from '@/ui/components/Select/Select'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import { HandoffLauncher } from '../../handoff/HandoffLauncher'
import {
  formatDay,
  formatDayAndTime,
  isOpenableUrl,
  loadIssue,
  noteAvailable,
  NO_PROJECT,
  pageLabel,
  setProject,
  setStatus,
} from '../issues'

import { DetailCard, Fact, Facts } from './IssueCard'
import { KindChip, StatusChip } from './IssueChips'
import styles from './IssueDetail.module.css'
import { IssueEvidence } from './IssueEvidence'
import { IssueSteps } from './IssueSteps'

import type { Result } from '@/shared/result'
import type { ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

type Load =
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly code: string; readonly message: string }
  | { readonly state: 'ready'; readonly issue: IssueRecord }

export interface IssueDetailProps {
  id: string
  projects: readonly ProjectRecord[]
  onBack: () => void
  /** الزمن المرجعيّ للأزمنة النسبية — يُحقَن للاختبار. */
  now?: number | undefined
}

/**
 * ما يقوله الخطأ حين لا تُفتح المشكلة، بحسب سببه: غائبةٌ فلا جدوى من الإعادة، وتالفةٌ أو من نسخة أحدث
 * فرسالة المخطّط نفسها تقول لماذا، وغير ذلك فشل تخزين تُعاد قراءته.
 */
function unreadable(load: { code: string; message: string }): {
  title: string
  body: string
  retry: boolean
} {
  if (load.code === 'not-found') {
    return {
      title: 'هذه المشكلة غير موجودة',
      body: 'ربما حُذفت، أو أن الرابط لمشكلة سُجّلت على جهاز آخر.',
      retry: false,
    }
  }
  if (load.code === 'invalid-data') {
    return {
      title: 'تعذّرت قراءة هذه المشكلة',
      body: `${load.message} مشكلاتك الأخرى لم تتأثّر.`,
      retry: false,
    }
  }
  return {
    title: 'تعذّرت قراءة المشكلة',
    body: 'لم يستجب التخزين على هذا الجهاز. مشكلاتك لم تُحذف — أعد المحاولة.',
    retry: true,
  }
}

export function IssueDetail({
  id,
  projects,
  onBack,
  now = Date.now(),
}: IssueDetailProps): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [handoff, setHandoff] = useState(false)

  useEffect(() => {
    let live = true
    setLoad({ state: 'loading' })
    setFailure(null)
    void loadIssue(id).then((result) => {
      if (!live) return
      setLoad(
        result.ok
          ? { state: 'ready', issue: result.value }
          : { state: 'error', code: result.error.code, message: result.error.message },
      )
    })
    return () => {
      live = false
    }
  }, [id, attempt])

  if (load.state === 'loading') {
    return (
      <div class={styles.page}>
        <div class={styles.content}>
          <div role="status" aria-busy="true" aria-label="جارٍ تحميل المشكلة">
            <Skeleton kind="panel" />
          </div>
        </div>
      </div>
    )
  }

  if (load.state === 'error') {
    const text = unreadable(load)
    return (
      <div class={styles.page}>
        <div class={cx(styles.content, styles.fail)}>
          <ErrorMessage
            layout="page"
            title={text.title}
            body={text.body}
            onRetry={text.retry ? () => setAttempt((n) => n + 1) : undefined}
          />
          <Button variant="secondary" size="m" onClick={onBack}>
            ارجع إلى المشكلات
          </Button>
        </div>
      </div>
    )
  }

  const { issue } = load
  const projectName = projects.find((p) => p.id === issue.projectId)?.name ?? 'بلا مشروع'

  /** يكتب ويعرض ما كُتب فعلًا؛ الفشل يُقال ولا تُغيَّر الحالة المعروضة. */
  const write = async (change: () => Promise<Result<IssueRecord>>) => {
    setBusy(true)
    setFailure(null)
    const result = await change()
    setBusy(false)
    if (result.ok) setLoad({ state: 'ready', issue: result.value })
    else setFailure(result.error.message)
  }

  const openable = isOpenableUrl(issue.page.url)
  const blocked = 'هذا الرابط ليس صفحة ويب (http أو https) فلا يُفتح من المكتبة.'

  return (
    <div class={styles.page}>
      <div class={styles.content}>
        <nav aria-label="مسار التنقّل" class={styles.crumbs}>
          <button type="button" class={cx(styles.crumb, 't-arabic-ui-s')} onClick={onBack}>
            المشكلات
          </button>
          <Icon name="chevron-right" size="xs" class={styles.sep} />
          <span class={cx(styles.here, 't-arabic-ui-s')} aria-current="page">
            {issue.title}
          </span>
        </nav>

        <div class={styles.head}>
          <div class={styles.heading}>
            <h1 class={cx(styles.title, 't-arabic-heading-m')}>{issue.title}</h1>
            <StatusChip status={issue.status} />
          </div>
          <div class={styles.actions}>
            <label class={styles.control}>
              <span class={cx(styles.controlLabel, 't-arabic-ui-xs-strong')}>الحالة</span>
              <Select
                aria-label="الحالة"
                value={issue.status}
                disabled={busy}
                options={ISSUE_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))}
                onChange={(value) => {
                  const next = ISSUE_STATUSES.find((s) => s === value)
                  if (next && next !== issue.status) void write(() => setStatus(issue.id, next))
                }}
              />
            </label>
            <label class={styles.control}>
              <span class={cx(styles.controlLabel, 't-arabic-ui-xs-strong')}>المشروع</span>
              <Select
                aria-label="المشروع"
                value={issue.projectId ?? NO_PROJECT}
                disabled={busy}
                options={[
                  { value: NO_PROJECT, label: 'بلا مشروع' },
                  ...projects.map((p) => ({ value: p.id, label: p.name })),
                ]}
                onChange={(value) => {
                  const next = value === NO_PROJECT ? null : value
                  if (next !== issue.projectId) void write(() => setProject(issue.id, next))
                }}
              />
            </label>
            {openable ? (
              <Button
                variant="secondary"
                size="m"
                icon="external"
                onClick={() => void chrome.tabs.create({ url: issue.page.url })}
              >
                افتح الصفحة
              </Button>
            ) : (
              <span title={blocked}>
                <Button
                  variant="secondary"
                  size="m"
                  icon="external"
                  state="disabled"
                  aria-label={`افتح الصفحة — ${blocked}`}
                >
                  افتح الصفحة
                </Button>
              </span>
            )}
            <Button
              variant="secondary"
              size="m"
              icon="file-code"
              onClick={() => setHandoff(true)}
              data-issue-handoff=""
            >
              حزمة التسليم
            </Button>
          </div>
        </div>
        {handoff ? (
          <HandoffLauncher
            issues={[issue]}
            source="مشكلة من المكتبة"
            onClose={() => setHandoff(false)}
          />
        ) : null}

        <p class={cx(styles.meta, 't-arabic-ui-s')}>
          {`سُجّلت ${formatDay(issue.createdAt)} · ${projectName} · ${lastCheckedLabel([issue], now)}`}
        </p>

        {failure ? <ErrorMessage title="تعذّر حفظ التغيير" body={failure} /> : null}

        <div class={styles.grid}>
          <ValueCard issue={issue} />
          <ElementCard issue={issue} />
          <PageCard issue={issue} />
          <IssueEvidence issue={issue} />
          <HistoryCard issue={issue} now={now} />
          <IssueSteps
            issue={issue}
            onSaved={(saved) => setLoad({ state: 'ready', issue: saved })}
          />
          <NoteCard issue={issue} />
        </div>
      </div>
    </div>
  )
}

function ValueCard({ issue }: { issue: IssueRecord }): JSX.Element {
  const { check } = issue
  const tone = STATUS_TONE[issue.status]
  return (
    <DetailCard title="القيمة">
      <Facts>
        <Fact label="نوع الفحص">
          <KindChip kind={check.kind} />
        </Fact>
        <Fact label="الخاصية">
          <bdi dir="auto" class={cx(styles.mono, 't-mono-xs')}>
            {propertyLabel(check)}
          </bdi>
        </Fact>
        <Fact label="الآن">
          <bdi
            dir="ltr"
            class={cx(
              styles.mono,
              't-mono-xs',
              issue.status !== 'resolved' && styles[`now-${tone}`],
            )}
          >
            {displayValue(check.kind, currentValue(issue))}
          </bdi>
        </Fact>
        <Fact label="المتوقّعة">
          <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
            {displayExpected(check)}
          </bdi>
        </Fact>
        <Fact label="السماح">
          <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
            {displayTolerance(check)}
          </bdi>
        </Fact>
      </Facts>
    </DetailCard>
  )
}

function ElementCard({ issue }: { issue: IssueRecord }): JSX.Element {
  const { element, pair } = issue
  return (
    <DetailCard title="العنصر">
      <Facts>
        <Fact label="المحدّد">
          <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
            {element.selector}
          </bdi>
        </Fact>
        <Fact label="ثباته">
          <Chip tone={element.unique ? 'success' : 'warning'}>
            {element.unique ? 'فريد' : 'غير فريد'}
          </Chip>
          <Chip tone={element.positional ? 'warning' : 'success'}>
            {element.positional ? 'موضعي' : 'غير موضعي'}
          </Chip>
        </Fact>
        <Fact label="الوسم وسماته الثابتة">
          <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
            {[element.fingerprint.tag, ...element.fingerprint.attrs].join(' · ')}
          </bdi>
        </Fact>
        <Fact label="النصّ">
          {/* البصمة وطول النصّ فقط: النصّ الخام لا يُحفظ (ADR 0031 §1). */}
          {`بصمته وطوله ${formatHuman(element.fingerprint.textLength)} حرفًا — لا يُحفظ النصّ نفسه`}
        </Fact>
        {pair ? (
          <Fact label="العنصر الثاني">
            <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
              {pair.selector}
            </bdi>
          </Fact>
        ) : null}
      </Facts>
    </DetailCard>
  )
}

function PageCard({ issue }: { issue: IssueRecord }): JSX.Element {
  const { page } = issue
  return (
    <DetailCard title="الصفحة">
      <Facts>
        <Fact label="الرابط">
          <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
            {pageLabel(page)}
          </bdi>
        </Fact>
        <Fact label="العنوان">{page.title || '—'}</Fact>
        <Fact label="المقاس">
          <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
            {`${formatDimensions(page.viewport.width, page.viewport.height)} · DPR ${formatMeasure(page.viewport.dpr)}`}
          </bdi>
        </Fact>
      </Facts>
    </DetailCard>
  )
}

const HISTORY_LABEL: Readonly<Record<IssueHistoryEntry['kind'], string>> = {
  created: 'سُجّلت',
  check: 'أعيد الفحص',
  manual: 'غُيّرت يدويًّا',
}

function HistoryCard({ issue, now }: { issue: IssueRecord; now: number }): JSX.Element {
  // الأحدث أوّلًا — ويُرتَّب هنا لا يُفترض ترتيب التخزين.
  const entries = [...issue.history].sort((a, b) => b.at - a.at)
  return (
    <DetailCard title="التاريخ">
      <ol class={styles.history}>
        {entries.map((entry, i) => (
          <li
            key={`${entry.kind}-${entry.at}-${i}`}
            class={styles.event}
            data-history-kind={entry.kind}
          >
            <div class={styles.eventHead}>
              <span class={cx(styles.eventTitle, 't-arabic-ui-s-strong')}>
                {HISTORY_LABEL[entry.kind]}
              </span>
              <StatusChip status={entry.status} />
            </div>
            <span class={cx(styles.when, 't-arabic-ui-xs')}>
              <time dateTime={new Date(entry.at).toISOString()}>
                {formatRelativeTime(entry.at, now)}
              </time>
              {` · ${formatDayAndTime(entry.at)}`}
            </span>
            {entry.kind !== 'manual' && entry.observed !== null ? (
              <span class={cx(styles.observed, 't-arabic-ui-xs')}>
                {'القيمة: '}
                <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
                  {displayValue(issue.check.kind, entry.observed)}
                </bdi>
              </span>
            ) : null}
            {entry.kind === 'check' && entry.reason ? (
              <span class={cx(styles.observed, 't-arabic-ui-xs')}>
                {REASON_LABEL[entry.reason]}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </DetailCard>
  )
}

function NoteCard({ issue }: { issue: IssueRecord }): JSX.Element {
  const { note } = issue
  // لقطة الملاحظة قد تُحذف من المكتبة فيسقط مشهدها معها — فلا رابط يفتح محرّرًا على لا شيء.
  const [linked, setLinked] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLinked(false)
    if (note) {
      void noteAvailable(note).then((available) => {
        if (live) setLinked(available)
      })
    }
    return () => {
      live = false
    }
  }, [note?.captureId, note?.noteId])

  const openInEditor = async () => {
    if (!note) return
    setFailure(null)
    const result = await send('page/open', { page: 'editor', params: { capture: note.captureId } })
    if (!result.ok) setFailure(result.error.message)
  }

  return (
    <DetailCard title="الملاحظة" wide>
      {issue.body ? (
        <p class={cx(styles.body, 't-arabic-ui-s')}>{issue.body}</p>
      ) : (
        <p class={cx(styles.none, 't-arabic-ui-s')}>لا نصّ للملاحظة.</p>
      )}
      {note && linked ? (
        <div class={styles.noteAction}>
          <Button variant="ghost" size="s" icon="external" onClick={() => void openInEditor()}>
            افتح في المحرّر
          </Button>
        </div>
      ) : null}
      {failure ? <ErrorMessage title="تعذّر فتح المحرّر" body={failure} /> : null}
    </DetailCard>
  )
}
