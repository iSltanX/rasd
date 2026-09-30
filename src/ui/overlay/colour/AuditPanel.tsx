import {
  findingsSummary,
  floorRatio,
  noteOf,
  SEVERITIES,
  SEVERITY_TITLE,
  textsCount,
  type AuditFinding,
  type AuditSeverity,
} from '@/modules/colour/audit'
import { formatHuman } from '@/shared/bidi'
import { Icon, type IconName } from '@/ui/icons/Icon'

import type { JSX } from 'preact'

/**
 * `contrast-audit / *` (`303:20863` وأخواتها في `17 — Inspect`) — لوحة تدقيق تباين الصفحة فوق وضع الفحص.
 *
 * **تبني على `.rasd-ov-insp` ولا تكرّرها**: الزجاج والرأس والجسم والتذييل من لوحة الفحص، والرقاقات بألوان
 * الحالة من لوحة المشكلات. وما يزيد في `overlay.css` تحت `rasd-ov-au-`.
 *
 * **فروقٌ مكتوبة عن الإطارات** (`Docs/Design.md` §5): النتيجة المختارة تكشف «سجّلها مشكلة» تحتها — الإطار
 * بلا إجراءٍ للصفّ والمواصفة تطلبه؛ والنطاق الصفحة كلّها لا الجزء الظاهر، فحالة الفراغ «لا نصّ ظاهر في
 * الصفحة»؛ ولا دوّارة مع شريط التقدّم (المكوّن نفسه يقصرها على انتظارٍ بلا تقدّم مقيس)؛ ولا «أبلغ عن
 * المشكلة» في الخطأ — لا محرّك لها بعد.
 */

export type AuditView = 'idle' | 'scanning' | 'done' | 'timeout' | 'cancelled' | 'error'

export interface AuditPanelProps {
  readonly phase: AuditView
  readonly done: number
  readonly total: number
  readonly texts: number
  readonly findings: readonly AuditFinding[]
  readonly partialShown: boolean
  readonly selected: number | null
  readonly error: string | null
  readonly onStart: () => void
  readonly onCancel: () => void
  readonly onClose: () => void
  readonly onShowPartial: () => void
  readonly onSelect: (id: number) => void
  readonly onCopy: () => void
  readonly onLogIssue?: (() => void) | undefined
}

/** لون كل شريحة — الرقاقة هنا وإطار العنصر على الصفحة. */
export const AUDIT_TONE: Readonly<Record<AuditSeverity, string>> = {
  'below-3': 'danger',
  'below-4.5': 'warning',
  unknown: 'neutral',
}

/** زرٌّ في التذييل — `primary` للإجراء الأوّل وحده في كل حالة. */
function Action(props: {
  readonly label: string
  readonly icon?: IconName
  readonly primary?: boolean
  readonly id: string
  readonly onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      class={props.primary ? 'rasd-ov-cp-btn rasd-ov-cp-btn-primary' : 'rasd-ov-cp-btn'}
      data-rasd-ov={props.id}
      onClick={props.onClick}
    >
      {props.icon ? <Icon name={props.icon} size="sm" /> : null}
      {props.label}
    </button>
  )
}

/** رسالةٌ في وسط اللوحة بشارتها — النجاح والفراغ والإلغاء. */
function Message(props: {
  readonly icon: IconName
  readonly tone: string
  readonly title: string
  readonly body: string
  readonly id: string
}): JSX.Element {
  return (
    <div class="rasd-ov-iss-empty" data-rasd-ov={props.id}>
      <span class="rasd-ov-au-badge" data-tone={props.tone} aria-hidden="true">
        <Icon name={props.icon} size="md" />
      </span>
      <strong>{props.title}</strong>
      <p>{props.body}</p>
    </div>
  )
}

/** صفّان مفتاحٌ وقيمة — الحدّان في الخمول، وما فُحص عند الحدّ الزمني. */
function KeyValues({ rows }: { readonly rows: readonly (readonly [string, string])[] }) {
  return (
    <dl class="rasd-ov-au-kv">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            <bdi>{value}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Row(props: {
  readonly finding: AuditFinding
  readonly selected: boolean
  readonly onSelect: (id: number) => void
  readonly onLogIssue?: (() => void) | undefined
}): JSX.Element {
  const f = props.finding
  return (
    <li class="rasd-ov-au-item" data-selected={props.selected ? 'true' : undefined}>
      <button
        type="button"
        class="rasd-ov-au-row"
        data-rasd-ov="audit-row"
        data-severity={f.severity}
        aria-current={props.selected ? 'true' : undefined}
        onClick={() => props.onSelect(f.id)}
      >
        <span class="rasd-ov-insp-intro">
          <strong>{f.text || f.label}</strong>
          <span class="rasd-ov-iss-muted">
            <bdi class="rasd-ov-iss-mono">{f.label}</bdi> · {noteOf(f)}
          </span>
        </span>
        <span class="rasd-ov-iss-chip" data-tone={AUDIT_TONE[f.severity]}>
          {f.ratio === null ? 'بلا رقم' : <bdi>{`${floorRatio(f.ratio)} : 1`}</bdi>}
        </span>
      </button>
      {props.selected && props.onLogIssue ? (
        <div class="rasd-ov-au-log">
          <button
            type="button"
            class="rasd-ov-cp-btn-quiet"
            data-rasd-ov="audit-log-issue"
            disabled={f.ratio === null}
            onClick={props.onLogIssue}
          >
            <Icon name="alert" size="sm" />
            سجّلها مشكلة
          </button>
          {f.ratio === null ? (
            <span class="rasd-ov-iss-muted">لا رقم يُسجَّل — تحقّق منه بالقطّارة.</span>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function Results(props: AuditPanelProps): JSX.Element {
  return (
    <ol class="rasd-ov-insp-body rasd-ov-iss-list" data-rasd-ov="audit-results">
      {SEVERITIES.map((severity) => {
        const list = props.findings.filter((f) => f.severity === severity)
        if (!list.length) return null
        return (
          <li key={severity} class="rasd-ov-insp-group" data-rasd-ov={`audit-group-${severity}`}>
            <p class="rasd-ov-insp-group-title">
              {SEVERITY_TITLE[severity]} · {textsCount(list.length)}
            </p>
            <ul class="rasd-ov-au-card">
              {list.map((f) => (
                <Row
                  key={f.id}
                  finding={f}
                  selected={props.selected === f.id}
                  onSelect={props.onSelect}
                  onLogIssue={props.onLogIssue}
                />
              ))}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}

/** الرأس بعنوانه الثابت وسطر الحالة، وزرّ الإغلاق — في كل الحالات. */
function subtitleOf(props: AuditPanelProps): string {
  const { phase, findings } = props
  if (phase === 'idle') return 'يفحص كل نصّ ظاهر في الصفحة'
  if (phase === 'scanning') return 'يُفحص النصّ الظاهر'
  if (phase === 'cancelled') return 'أُلغي التدقيق'
  if (phase === 'error') return 'لم يكتمل التدقيق'
  if (phase === 'timeout' && !props.partialShown) return 'توقّف التدقيق عند حدّه الزمني'
  if (props.texts === 0) return 'لا نصّ ظاهر'
  const counted =
    phase === 'timeout'
      ? `نتائج جزئية: ${formatHuman(props.done)} من ${formatHuman(props.total)}`
      : textsCount(props.texts)
  return [counted, findingsSummary(findings)].filter(Boolean).join(' · ')
}

/** ما فُحص قبل الحدّ الزمني: «دون الحدّ» ما سقط وحده، و«بلا رقم» صفٌّ بجواره حين يكون. */
function partialRows(props: AuditPanelProps): (readonly [string, string])[] {
  const unknown = props.findings.filter((f) => f.severity === 'unknown').length
  const rows: (readonly [string, string])[] = [
    ['فُحص', `${textsCount(props.done)} من ${formatHuman(props.total)}`],
    ['دون الحدّ', textsCount(props.findings.length - unknown)],
  ]
  if (unknown) rows.push(['بلا رقم', textsCount(unknown)])
  return rows
}

function body(props: AuditPanelProps): JSX.Element {
  const { phase } = props
  if (phase === 'idle')
    return (
      <div class="rasd-ov-iss-sec rasd-ov-au-sec">
        <p class="rasd-ov-insp-desc">
          يقيس رصد تباين كل نصّ مع خلفيته الفعلية، ويرتّب النتائج بالخطورة.
        </p>
        <KeyValues
          rows={[
            ['الحدّ للنصّ العادي', '4.5 : 1'],
            ['الحدّ للنصّ الكبير', '3 : 1'],
          ]}
        />
        <p class="rasd-ov-iss-muted">تباين نصوص فقط، لا تدقيق إتاحة كامل.</p>
      </div>
    )
  if (phase === 'scanning') {
    const pct = props.total ? props.done / props.total : 0
    return (
      <div class="rasd-ov-iss-sec rasd-ov-au-sec" role="status" aria-live="polite">
        <p class="rasd-ov-au-center">تُقاس النصوص</p>
        <div class="rasd-ov-insp-row">
          <span>النصوص المفحوصة</span>
          {/* عدٌّ بشري فبأرقام هندية — كتقدّم الالتقاط الكامل؛ الإطار يرسمه بأرقام غربية. */}
          <span data-rasd-ov="audit-progress">
            {formatHuman(props.done)} من {formatHuman(props.total)}
          </span>
        </div>
        <div
          class="rasd-ov-fp-bar"
          role="progressbar"
          aria-label="تقدّم التدقيق"
          aria-valuemin={0}
          aria-valuemax={props.total}
          aria-valuenow={props.done}
          style={{ '--rasd-fp-pct': `${pct * 100}%` }}
        >
          <span class="rasd-ov-fp-bar-fill" />
        </div>
      </div>
    )
  }
  if (phase === 'cancelled')
    return (
      <Message
        id="audit-cancelled"
        icon="close"
        tone="neutral"
        title="أُلغي التدقيق"
        body="لم تُحفظ نتائج."
      />
    )
  if (phase === 'error')
    return (
      <div class="rasd-ov-iss-err" role="alert" data-rasd-ov="audit-error">
        <strong>تعذّر تدقيق هذه الصفحة</strong>
        <p>منعت الصفحة قراءة أنماطها. جرّب صفحة أخرى، أو أعد المحاولة.</p>
        {props.error ? <bdi class="rasd-ov-iss-mono">{props.error}</bdi> : null}
      </div>
    )
  if (phase === 'timeout' && !props.partialShown)
    return (
      <div class="rasd-ov-iss-sec rasd-ov-au-sec">
        <p class="rasd-ov-au-note" data-tone="warning" data-rasd-ov="audit-timeout">
          <Icon name="alert" size="sm" />
          الصفحة كبيرة، فتوقّف التدقيق بعد ٥ ثوانٍ. النتائج أدناه لما فُحص فقط.
        </p>
        <KeyValues rows={partialRows(props)} />
      </div>
    )
  if (props.texts === 0)
    return (
      <Message
        id="audit-empty"
        icon="info"
        tone="info"
        title="لا نصّ ظاهر في الصفحة"
        body="لا نصّ مرئيّ يُقاس هنا الآن. أعد التدقيق حين يظهر."
      />
    )
  if (props.findings.length === 0)
    return (
      <Message
        id="audit-all-pass"
        icon="check"
        tone="success"
        title="كل النصوص تبلغ الحدّ"
        body="لا نصّ ظاهر دون حدّ التباين في هذه الصفحة."
      />
    )
  return <Results {...props} />
}

function actions(props: AuditPanelProps): JSX.Element {
  const again = (
    <Action id="audit-restart" label="أعد التدقيق" icon="refresh" onClick={props.onStart} />
  )
  switch (props.phase) {
    case 'idle':
      return (
        <Action
          id="audit-start"
          label="ابدأ التدقيق"
          icon="contrast-check"
          primary
          onClick={props.onStart}
        />
      )
    case 'scanning':
      return <Action id="audit-cancel" label="ألغِ" onClick={props.onCancel} />
    case 'cancelled':
      return <Action id="audit-restart" label="ابدأ من جديد" onClick={props.onStart} />
    case 'error':
      return (
        <>
          <Action id="audit-restart" label="أعد المحاولة" onClick={props.onStart} />
          <Action id="audit-close" label="أغلق" onClick={props.onClose} />
        </>
      )
    default:
      if (props.phase === 'timeout' && !props.partialShown)
        return (
          <>
            {again}
            <Action
              id="audit-show-partial"
              label="اعرض النتائج"
              primary
              onClick={props.onShowPartial}
            />
          </>
        )
      // بترتيب الإطار: الأوّل في DOM أقربها إلى المنتصف، والأخير عند الحافّة.
      return props.findings.length ? (
        <>
          {again}
          <Action id="audit-copy" label="انسخ التقرير" icon="copy" onClick={props.onCopy} />
        </>
      ) : (
        again
      )
  }
}

export function AuditPanel(props: AuditPanelProps): JSX.Element {
  return (
    <section class="rasd-ov-insp rasd-ov-au" data-rasd-ov="audit-panel" data-phase={props.phase}>
      <div class="rasd-ov-insp-head">
        <div class="rasd-ov-insp-intro">
          <span class="rasd-ov-insp-title">تدقيق التباين</span>
          <span class="rasd-ov-iss-muted" data-rasd-ov="audit-subtitle">
            {subtitleOf(props)}
          </span>
        </div>
        <button
          type="button"
          class="rasd-ov-insp-icon"
          aria-label="أغلق التدقيق"
          data-rasd-ov="audit-x"
          onClick={props.onClose}
        >
          <Icon name="close" size="sm" />
        </button>
      </div>
      {body(props)}
      <div class="rasd-ov-insp-foot">{actions(props)}</div>
    </section>
  )
}
