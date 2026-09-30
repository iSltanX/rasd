import { STATUS_LABEL, STATUS_TONE } from '@/modules/issues/labels'
import { countByStatus } from '@/modules/issues/status'
import { formatHuman } from '@/shared/bidi/numerals'
import { ISSUE_STATUSES, type IssueRecord } from '@/shared/issue-schema'
import { Icon } from '@/ui/icons/Icon'

import { box } from '../geometry'

import type { JSX } from 'preact'

/**
 * `issue / page-list` · `page-empty` · `rechecking` · `recheck-result` — لوحة «مشكلات هذه الصفحة».
 *
 * **الحالات الثلاث بلون واحد في كل موضع:** الرقاقة والرقم هنا، وإطار العنصر على الصفحة (`IssueBoxes`)، والرقم
 * نفسه في المكتبة — ترتيب التسجيل.
 */

export interface PageIssuesProps {
  readonly list: readonly IssueRecord[]
  /** سطر القيمتين أو السبب لكل مشكلة — تبنيه الخلفية. */
  readonly lines: Readonly<Record<string, string>>
  /** «آخر فحص قبل ٣ دقائق» — تحسبه الخلفية عند التحميل. */
  readonly checkedLabel: string
  /** `northwind.com/pricing` — المضيف والمسار بلا بروتوكول. */
  readonly page: string
  readonly phase: 'loading' | 'ready' | 'rechecking' | 'error'
  /** انتهت جولةٌ في هذه الجلسة — فيُعرض عدّ الحالات بدل «آخر فحص». */
  readonly checked: boolean
  readonly onRecheck: () => void
  readonly onOpenLibrary: () => void
  readonly onClose: () => void
}

export function StatusChip({ status }: { readonly status: IssueRecord['status'] }): JSX.Element {
  return (
    <span class="rasd-ov-iss-chip" data-tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </span>
  )
}

/**
 * **عدّ الحالات بعد الجولة سطرٌ لا رقاقات** — وكذلك «جارٍ الفحص» بلا عدّاد لكل مشكلة: الجولة تنتهي في أجزاء من
 * الثانية (مقيسة في سجلّ المرحلة)، والرقاقات والحالة لكل صفّ وزنٌ في `content.js` لا يراه المستخدم. الفرق عن
 * `issue / rechecking` و`recheck-result` مكتوب في `Docs/Design.md` §5.
 */
export function PageIssues(props: PageIssuesProps): JSX.Element {
  const { list, phase } = props
  const rechecking = phase === 'rechecking'
  const counts = countByStatus(list)
  const status = rechecking
    ? 'جارٍ الفحص…'
    : props.checked
      ? `اكتمل الفحص: ${ISSUE_STATUSES.filter((s) => counts[s])
          .map((s) => `${formatHuman(counts[s])} ${STATUS_LABEL[s]}`)
          .join(' · ')}`
      : props.checkedLabel

  return (
    <section
      class="rasd-ov-insp"
      aria-label="مشكلات هذه الصفحة"
      data-rasd-ov="issues-panel"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div class="rasd-ov-insp-head">
        <div class="rasd-ov-insp-id">
          <Icon name="alert" size="sm" />
          <span class="rasd-ov-iss-h">مشكلات هذه الصفحة</span>
        </div>
        <button
          type="button"
          class="rasd-ov-insp-icon"
          aria-label="أغلق اللوحة"
          onClick={props.onClose}
        >
          <Icon name="close" size="sm" />
        </button>
      </div>
      <div class="rasd-ov-iss-sec rasd-ov-insp-row">
        <bdi class="rasd-ov-iss-mono">{props.page}</bdi>
        {list.length ? (
          <span class="rasd-ov-iss-muted" role="status" data-rasd-ov="issues-status">
            {status}
          </span>
        ) : null}
      </div>
      {list.length === 0 && phase !== 'loading' ? (
        <div class="rasd-ov-iss-empty" data-rasd-ov="issues-empty">
          <strong>لا مشكلات مسجّلة لهذه الصفحة</strong>
          <p>«سجّل مشكلة» في لوحة الفحص أو القياس أو اللون.</p>
        </div>
      ) : (
        <ol class="rasd-ov-insp-body rasd-ov-iss-list" data-rasd-ov="issues-list">
          {list.map((issue, i) => (
            <li
              key={issue.id}
              class="rasd-ov-iss-item"
              data-issue={issue.id}
              data-status={issue.status}
            >
              <span class="rasd-ov-iss-ord" data-tone={STATUS_TONE[issue.status]}>
                {formatHuman(i + 1)}
              </span>
              <div class="rasd-ov-insp-intro">
                <strong>{issue.title}</strong>
                <bdi class="rasd-ov-iss-mono rasd-ov-iss-muted">
                  {issue.element.selector} ·{' '}
                  {issue.check.kind === 'spacing' ? 'gap' : issue.check.property}
                </bdi>
                <span class="rasd-ov-iss-muted">{props.lines[issue.id]}</span>
              </div>
              <StatusChip status={issue.status} />
            </li>
          ))}
        </ol>
      )}
      <div class="rasd-ov-insp-foot">
        {list.length ? (
          <button
            type="button"
            class="rasd-ov-cp-btn rasd-ov-cp-btn-primary"
            data-rasd-ov="issues-recheck"
            disabled={rechecking}
            onClick={props.onRecheck}
          >
            <Icon name="refresh" size="sm" />
            {rechecking ? 'جارٍ الفحص' : 'أعد الفحص'}
          </button>
        ) : null}
        <button type="button" class="rasd-ov-cp-btn" onClick={props.onOpenLibrary}>
          <Icon name="external" size="sm" />
          افتح في المكتبة
        </button>
      </div>
    </section>
  )
}

/**
 * إطار كل عنصرٍ معثورٍ عليه على الصفحة ورقمه — بلون حالته، كما في `issue / page-list`.
 *
 * `pointer-events: none` كبقيّة بدائيّات الطبقة: الصفحة تحت الإطار تعمل.
 */
export function IssueBoxes({
  list,
  boxes,
}: {
  readonly list: readonly IssueRecord[]
  readonly boxes: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>
}): JSX.Element {
  return (
    <>
      {list.map((issue, i) => {
        const r = boxes.get(issue.id)
        if (!r) return null
        return (
          <div
            key={issue.id}
            class="rasd-ov-place rasd-ov-iss-box"
            data-tone={STATUS_TONE[issue.status]}
            data-rasd-ov="issue-box"
            style={box(r)}
          >
            <span class="rasd-ov-iss-ord" data-tone={STATUS_TONE[issue.status]}>
              {formatHuman(i + 1)}
            </span>
          </div>
        )
      })}
    </>
  )
}
