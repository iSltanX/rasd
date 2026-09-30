/**
 * `library / issues` و`library / issues-empty` — مكتبة المشكلات: جدولٌ مرشَّح بحالتها ومشروعها وصفحتها.
 *
 * **لا مربّعات تحديد ولا «حزمة التسليم»** وإن رُسمت في الإطار: الحزمة محرّكها غير مبنيّ بعد، وزرٌّ بلا محرّك
 * ممنوع (`AGENTS.md` §4). فالصفّ يفتح تفصيله وحده.
 *
 * وليس هنا صفّ أنواع السجلّات (`اللقطات · المراجع · …`): المشكلات مدخلها الشريط الجانبي، وصفّ الأنواع
 * وأسماؤه عقد `verify:library` فلا يُمسّ.
 */

import { useEffect, useMemo, useState } from 'preact/hooks'

import {
  displayExpected,
  displayValue,
  STATUS_LABEL,
  STATUS_TONE,
  subjectLine,
} from '@/modules/issues/labels'
import { countByStatus, currentValue } from '@/modules/issues/status'
import { countText, formatHuman, formatRelativeTime, type CountForms } from '@/shared/bidi/numerals'
import { ISSUE_STATUSES, type IssueRecord } from '@/shared/issue-schema'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { ErrorMessage } from '@/ui/components/ErrorMessage/ErrorMessage'
import { Select } from '@/ui/components/Select/Select'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'
import { Tab, TabRow } from '@/ui/components/Tab/Tab'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import { hrefFor } from '../../shell/library-views'
import {
  ANY,
  DEFAULT_ISSUE_FILTERS,
  filterIssues,
  filterIssuesBase,
  loadIssues,
  NO_PROJECT,
  pageLabel,
  pageOptions,
  type IssueFilters,
  type LoadedIssues,
} from '../issues'

import { KindChip, StatusChip } from './IssueChips'
import styles from './IssuesView.module.css'
import toolbar from './Toolbar.module.css'

import type { Result } from '@/shared/result'
import type { ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

const ISSUE_FORMS: CountForms = {
  one: 'مشكلة واحدة',
  two: 'مشكلتان',
  many: 'مشكلات',
  accusative: 'مشكلة',
  singular: 'مشكلة',
}

const STATUS_TABS: readonly { readonly value: IssueFilters['status']; readonly label: string }[] = [
  { value: 'all', label: 'الكل' },
  ...ISSUE_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })),
]

const PANEL_ID = 'issues-panel'
const tabId = (status: IssueFilters['status']) => `issues-tab-${status}`

const NONE: readonly IssueRecord[] = []

type Load =
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly message: string }
  | { readonly state: 'ready'; readonly data: LoadedIssues }

export interface IssuesViewProps {
  filters: IssueFilters
  onFiltersChange: (next: IssueFilters) => void
  projects: readonly ProjectRecord[]
  onOpen: (id: string) => void
  /** الزمن المرجعيّ لـ«آخر فحص قبل…» — يُحقَن للاختبار. */
  now?: number | undefined
}

export function IssuesView({
  filters,
  onFiltersChange,
  projects,
  onOpen,
  now = Date.now(),
}: IssuesViewProps): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setLoad({ state: 'loading' })
    void loadIssues().then((result: Result<LoadedIssues>) => {
      if (!live) return
      setLoad(
        result.ok
          ? { state: 'ready', data: result.value }
          : { state: 'error', message: result.error.message },
      )
    })
    return () => {
      live = false
    }
  }, [attempt])

  const all = load.state === 'ready' ? load.data.issues : NONE
  // الرقاقات تُعدّ بعد البحث والمشروع والصفحة لا قبلها، فمجموعها هو «الكل» المعروض.
  const base = useMemo(() => filterIssuesBase(all, filters), [all, filters])
  const counts = useMemo(() => countByStatus(base), [base])
  const rows = useMemo(() => filterIssues(all, filters), [all, filters])
  const pages = useMemo(() => pageOptions(all), [all])

  const set = (patch: Partial<IssueFilters>) => onFiltersChange({ ...filters, ...patch })
  const tabCount = (value: IssueFilters['status']) =>
    value === 'all' ? base.length : counts[value]
  const empty = load.state === 'ready' && all.length === 0

  return (
    <div class={styles.page}>
      <div class={toolbar.toolbar}>
        <div class={toolbar.start} role="search" aria-label="البحث والتصفية">
          <label class={toolbar.search}>
            <Icon name="search" size="sm" class={toolbar.searchIcon} />
            <input
              type="search"
              class={cx(toolbar.searchInput, 't-arabic-ui-s')}
              value={filters.query}
              placeholder="ابحث في المشكلات والمحدّدات…"
              aria-label="ابحث في المشكلات"
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                set({ query: e.currentTarget.value })
              }
            />
          </label>
          <Select
            aria-label="المشروع"
            value={filters.project}
            options={[
              { value: ANY, label: 'كل المشاريع' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
              { value: NO_PROJECT, label: 'بلا مشروع' },
            ]}
            onChange={(project) => set({ project })}
          />
          <Select
            aria-label="الصفحة"
            value={filters.page}
            options={[{ value: ANY, label: 'كل الصفحات' }, ...pages]}
            onChange={(page) => set({ page })}
          />
        </div>
      </div>

      <div class={styles.content}>
        <div class={styles.head}>
          <div class={styles.heading}>
            <h1 class={cx(styles.title, 't-arabic-heading-m')}>المشكلات</h1>
            {load.state === 'ready' && !empty ? (
              <span class={cx(styles.count, 't-arabic-ui-xs')}>
                {countText(rows.length, ISSUE_FORMS)}
              </span>
            ) : null}
          </div>
          {load.state === 'ready' && !empty ? (
            <span class={cx(styles.sorted, 't-arabic-ui-xs')}>مرتّبة من الأحدث</span>
          ) : null}
        </div>

        {load.state === 'ready' && load.data.unreadable > 0 ? (
          <Banner tone="warning">
            {`تعذّرت قراءة ${countText(load.data.unreadable, ISSUE_FORMS)} فلم تُعرض — قد تكون من نسخة أحدث من الإضافة.`}
          </Banner>
        ) : null}

        {load.state === 'loading' ? (
          <div
            class={styles.skeleton}
            role="status"
            aria-busy="true"
            aria-label="جارٍ تحميل المشكلات"
          >
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} kind="row" />
            ))}
          </div>
        ) : load.state === 'error' ? (
          <div class={styles.center}>
            <ErrorMessage
              layout="page"
              title="تعذّرت قراءة المشكلات"
              body="لم يستجب التخزين على هذا الجهاز. مشكلاتك لم تُحذف — أعد المحاولة."
              onRetry={() => setAttempt((n) => n + 1)}
            />
          </div>
        ) : empty ? (
          <div class={styles.center}>
            <div class={styles.empty}>
              <span class={styles.emptyIcon}>
                <Icon name="alert" size="lg" class={styles.emptyGlyph} />
              </span>
              <div class={styles.emptyText}>
                <p class={cx(styles.emptyTitle, 't-arabic-heading-xs')}>لا مشكلات مسجَّلة بعد</p>
                <p class={cx(styles.emptyHint, 't-arabic-ui-s')}>
                  سجّل مشكلة من الصفحة نفسها بزرّ «سجّل مشكلة» في لوحات الفحص والقياس واللون، فتظهر
                  هنا بحالتها. وإعادة الفحص تجري على الصفحة نفسها بعد تعديلها.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <TabRow aria-label="حالة المشكلة" class={styles.tabs}>
              {STATUS_TABS.map((t) => (
                <Tab
                  key={t.value}
                  id={tabId(t.value)}
                  controls={PANEL_ID}
                  label={`${t.label} · ${formatHuman(tabCount(t.value))}`}
                  selected={filters.status === t.value}
                  onClick={() => set({ status: t.value })}
                />
              ))}
            </TabRow>

            <div
              id={PANEL_ID}
              role="tabpanel"
              aria-labelledby={tabId(filters.status)}
              class={styles.panel}
            >
              {rows.length === 0 ? (
                <div class={styles.center}>
                  <div class={styles.empty}>
                    <div class={styles.emptyText}>
                      <p class={cx(styles.emptyTitle, 't-arabic-heading-xs')}>
                        لا نتائج لهذه المرشّحات
                      </p>
                      <p class={cx(styles.emptyHint, 't-arabic-ui-s')}>
                        غيّر البحث أو المشروع أو الصفحة أو الحالة، أو امسح المرشّحات.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="m"
                      onClick={() => onFiltersChange(DEFAULT_ISSUE_FILTERS)}
                    >
                      امسح المرشّحات
                    </Button>
                  </div>
                </div>
              ) : (
                <IssuesTable rows={rows} onOpen={onOpen} now={now} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const COLUMNS = ['المشكلة', 'الصفحة', 'النوع', 'الآن', 'المتوقّعة', 'الحالة', 'آخر فحص'] as const

function IssuesTable({
  rows,
  onOpen,
  now,
}: {
  rows: readonly IssueRecord[]
  onOpen: (id: string) => void
  now: number
}): JSX.Element {
  return (
    <table class={styles.table} aria-label="المشكلات المسجَّلة">
      <thead>
        <tr>
          {COLUMNS.map((name) => (
            <th key={name} scope="col" class={cx(styles.th, 't-arabic-ui-xs-strong')}>
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((issue) => (
          <IssueRow key={issue.id} issue={issue} onOpen={onOpen} now={now} />
        ))}
      </tbody>
    </table>
  )
}

function IssueRow({
  issue,
  onOpen,
  now,
}: {
  issue: IssueRecord
  onOpen: (id: string) => void
  now: number
}): JSX.Element {
  const tone = STATUS_TONE[issue.status]
  // الرابط رابطٌ حقيقيّ: النقر مع ⌘ أو Ctrl أو Shift يفتحه في تبويب جديد كأي رابط، وغيره يفتح التفصيل في مكانه.
  const href = hrefFor({ kind: 'issue', id: issue.id })
  return (
    <tr class={styles.row} data-issue-id={issue.id} onClick={() => onOpen(issue.id)}>
      <td class={styles.td}>
        <a
          class={cx(styles.link, 't-arabic-ui-s-strong')}
          href={href}
          onClick={(e: MouseEvent) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) e.stopPropagation()
            else e.preventDefault()
          }}
        >
          {issue.title}
        </a>
        <bdi dir="ltr" class={cx(styles.subject, 't-mono-xs')}>
          {subjectLine(issue)}
        </bdi>
      </td>
      <td class={styles.td}>
        <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
          {pageLabel(issue.page)}
        </bdi>
      </td>
      <td class={styles.td}>
        <KindChip kind={issue.check.kind} />
      </td>
      <td class={styles.td}>
        <bdi
          dir="ltr"
          class={cx(styles.mono, 't-mono-xs', issue.status !== 'resolved' && styles[`now-${tone}`])}
        >
          {displayValue(issue.check.kind, currentValue(issue))}
        </bdi>
      </td>
      <td class={styles.td}>
        <bdi dir="ltr" class={cx(styles.mono, 't-mono-xs')}>
          {displayExpected(issue.check)}
        </bdi>
      </td>
      <td class={styles.td}>
        <StatusChip status={issue.status} />
      </td>
      <td class={cx(styles.td, styles.checked, 't-arabic-ui-xs')}>
        {issue.lastCheck ? formatRelativeTime(issue.lastCheck.at, now) : 'لم تُفحص بعد'}
      </td>
    </tr>
  )
}
