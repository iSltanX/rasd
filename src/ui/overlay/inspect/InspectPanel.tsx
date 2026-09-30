import { useEffect, useRef, useState } from 'preact/hooks'

import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import { LogIssueButton } from '../issues/IssueForm'

import type { InspectSnapshot } from '@/shared/inspect-schema'
import type { JSX } from 'preact'

/**
 * صفّ واحد في مجموعة: تسمية عربية يمينًا وقيمة تقنية يسارًا.
 *
 * `varName` يجعل القيمة تُعرَض بلون العلامة — وهو **اللون الوحيد** في
 * اللوحة كلّها الذي يخرج عن `text/primary`، لأنه الميزة التي تفرّق رصد عن
 * نسخة أخرى من DevTools.
 */
export interface InspectRow {
  readonly label: string
  readonly value: string
  /** اسم متغيّر CSS إن كانت القيمة تأتي منه. */
  readonly varName?: string
  /** مكان تعريف المتغيّر — يظهر تلميحًا لا صفًّا (لا عقدة له في الملفّ). */
  readonly varAt?: string
  /** عيّنة لون تُعرَض قبل القيمة. */
  readonly swatch?: string
}

export interface InspectGroupView {
  readonly title: string
  readonly rows: readonly InspectRow[]
}

/** التبويبات الخمسة، بترتيب DOM كما في الملفّ. */
export const INSPECT_TABS = ['styles', 'box', 'text', 'colour', 'a11y'] as const
export type InspectTabId = (typeof INSPECT_TABS)[number]

export const TAB_LABELS: Record<InspectTabId, string> = {
  styles: 'الأنماط',
  box: 'الصندوق',
  text: 'الخط',
  colour: 'اللون',
  a11y: 'الإتاحة',
}

export interface InspectPanelProps {
  snapshot: InspectSnapshot
  /** محتوى كل تبويب — يُبنى في طبقة المحتوى لا هنا. */
  groups: Readonly<Record<InspectTabId, readonly InspectGroupView[]>>
  onClose?: () => void
  /**
   * يُطلَب بصيغة مخرَج الفحص — تنزيل ملفّ لا نسخ حافظة (الوحدة 19.2).
   * الاسم بقي `onCopy` تفاديًا لسلكٍ عبر عدّة ملفّات لفارقٍ داخلي بحت؛
   * النصوص المعروضة صادقة («تنزيل» لا «نسخ»).
   */
  onCopy?: (kind: 'css' | 'tailwind' | 'json') => void
  /** «سجّل مشكلة» على العنصر المثبَّت (`STAGES/32`) — غيابه يُخفي الزرّ. */
  onLogIssue?: () => void
}

/**
 * `inspect / element-selected` — لوحة الفحص.
 *
 * **بلا سحب ولا تثبيت**: نصّ الخطّة يَعِد بهما، ومسحٌ كامل لشجرة الملفّ
 * (ستّة مستويات) لم يجد مقبضًا ولا أيقونة ولا أي تفاعل — و`icon-data.ts`
 * بلا `pin` أصلًا. فعرضهما وعدٌ بما لا يوجد في التصميم.
 *
 * **والسطح التفاعلي الوحيد هو اللوحة نفسها.** المضيف يبقى
 * `pointer-events: none` كي تبقى `:hover` صادقة على الصفحة تحتها — وهو
 * القرار المقيس في `content/tools/inspect.ts`.
 */
export function InspectPanel({
  snapshot,
  groups,
  onClose,
  onCopy,
  onLogIssue,
}: InspectPanelProps): JSX.Element {
  const [tab, setTab] = useState<InspectTabId>('styles')
  const tabsRef = useRef<HTMLDivElement>(null)

  /**
   * تنقّل بالأسهم داخل شريحة التبويبات (roving tabindex).
   *
   * الاتّجاه يُقرأ من النمط المحسوب لا من ثابت: اللوحة داخل جذر ظلّ محتواه
   * RTL، فالسهم الأيمن يعني «السابق» لا «التالي».
   */
  const onTabsKey = (event: KeyboardEvent) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()

    const rtl = tabsRef.current ? getComputedStyle(tabsRef.current).direction === 'rtl' : true
    const i = INSPECT_TABS.indexOf(tab)
    const last = INSPECT_TABS.length - 1

    let next: number
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else {
      const forward = rtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight'
      next = forward ? Math.min(last, i + 1) : Math.max(0, i - 1)
    }

    const id = INSPECT_TABS[next]
    if (id) {
      setTab(id)
      tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus()
    }
  }

  // العنصر تغيّر ⇒ يعود التبويب إلى الافتراضي، فلا يبقى المستخدم في تبويب
  // فارغ لعنصر لا يملك ما يعرضه فيه.
  useEffect(() => {
    setTab('styles')
  }, [snapshot.at])

  const visible = groups[tab]

  return (
    <div
      class="rasd-ov-insp"
      role="dialog"
      aria-label="لوحة فحص العنصر"
      data-rasd-ov="inspect-panel"
    >
      <div class="rasd-ov-insp-head">
        <div class="rasd-ov-insp-id">
          <TechnicalValue variant="mono-xs" kind="selector">
            {snapshot.label}
          </TechnicalValue>
          <span class="rasd-ov-insp-tag">{snapshot.tag}</span>
        </div>
        <div class="rasd-ov-insp-acts">
          <button
            type="button"
            class="rasd-ov-insp-icon"
            aria-label="نزّل CSS"
            title="نزّل CSS"
            onClick={() => onCopy?.('css')}
          >
            <Icon name="download" size="sm" />
          </button>
          <button
            type="button"
            class="rasd-ov-insp-icon"
            aria-label="أغلق اللوحة"
            title="أغلق اللوحة"
            onClick={onClose}
          >
            <Icon name="close" size="sm" />
          </button>
        </div>
      </div>

      <div
        ref={tabsRef}
        class="rasd-ov-insp-tabs"
        role="tablist"
        aria-label="أقسام الفحص"
        onKeyDown={onTabsKey}
      >
        {INSPECT_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-tab={id}
            id={`rasd-tab-${id}`}
            aria-selected={id === tab}
            aria-controls={`rasd-panel-${id}`}
            tabIndex={id === tab ? 0 : -1}
            class="rasd-ov-insp-tab"
            onClick={() => setTab(id)}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      <div
        class="rasd-ov-insp-body"
        role="tabpanel"
        id={`rasd-panel-${tab}`}
        aria-labelledby={`rasd-tab-${tab}`}
        // جسمٌ يُمرَّر بلا عنصر يقبل التركيز لا يبلغه من لا يستعمل الفأرة — نمط التبويبات في WAI.
        tabIndex={0}
      >
        {visible.length === 0 ? (
          <p class="rasd-ov-insp-empty">لا شيء يُعرَض لهذا العنصر في هذا القسم.</p>
        ) : (
          visible.map((group) => (
            <section key={group.title} class="rasd-ov-insp-group">
              <h3 class="rasd-ov-insp-group-title">{group.title}</h3>
              {group.rows.map((row) => (
                <div key={row.label} class="rasd-ov-insp-row">
                  <span class="rasd-ov-insp-label">{row.label}</span>
                  <span class="rasd-ov-insp-value">
                    {row.swatch ? (
                      <span
                        class="rasd-ov-insp-swatch"
                        style={{ background: row.swatch }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <TechnicalValue
                      variant="mono-xs"
                      class={row.varName ? 'rasd-ov-insp-var' : undefined}
                      {...(row.varAt ? { title: `مُعرَّف في ${row.varAt}` } : {})}
                    >
                      {row.varName ?? row.value}
                    </TechnicalValue>
                  </span>
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      <div class="rasd-ov-insp-foot">
        <button type="button" class="rasd-ov-insp-btn" onClick={() => onCopy?.('json')}>
          JSON
        </button>
        <button type="button" class="rasd-ov-insp-btn" onClick={() => onCopy?.('tailwind')}>
          Tailwind
        </button>
        <button type="button" class="rasd-ov-insp-btn" onClick={() => onCopy?.('css')}>
          تنزيل CSS
        </button>
      </div>
      {onLogIssue ? <LogIssueButton onClick={onLogIssue} /> : null}
    </div>
  )
}

/**
 * `inspect / idle` — قبل اختيار عنصر.
 *
 * **العنوان يُشحن مرّة واحدة**: الملفّ يحمله في عقدتين متطابقتين حرفًا
 * بحرف بنمطين مختلفين (98:143 و98:144) — وهو عيب في الملفّ لا تصميم، فلا
 * يُنسخ التكرار إلى الشيفرة. والسطر الثاني يصف الحالة فعلًا.
 */
export function InspectIdle(): JSX.Element {
  return (
    <div class="rasd-ov-insp rasd-ov-insp-idle" role="status" data-rasd-ov="inspect-idle">
      <span class="rasd-ov-insp-badge" aria-hidden="true">
        <Icon name="inspect" size="md" />
      </span>
      <div class="rasd-ov-insp-intro">
        <span class="rasd-ov-insp-title">مرّر فوق أي عنصر</span>
        <span class="rasd-ov-insp-sub">بانتظار عنصر</span>
        <p class="rasd-ov-insp-desc">
          تظهر الأنماط المحسوبة ونموذج الصندوق والرمز خلف كل قيمة فور استقرار المؤشر.
        </p>
      </div>
      {/*
       * المفاتيح بما يفعله محرّك الفحص (`content/tools/inspect.ts`): النقرة تثبّت العنصر، و`Esc`
       * يُخرج. والإطار يرسم «↑ ↓ تنقّل في الشجرة» و«⇧ قِس إلى ثانٍ» و«⌘C انسخ المحدّد» — لا
       * محرّك لأيٍّ منها في الفحص (المشي في الشجرة لأداة العنصر وحدها)، فلا تُعرض وعودًا.
       */}
      <dl class="rasd-ov-insp-hints">
        {[
          ['انقر', 'ثبّت العنصر'],
          ['Esc', 'اخرج من الفحص'],
        ].map(([key, label]) => (
          <div key={key} class="rasd-ov-insp-hint">
            <dt>
              <kbd class="rasd-ov-key">{key}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
