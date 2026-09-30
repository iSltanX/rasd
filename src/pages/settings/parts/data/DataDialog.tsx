/**
 * هيكل نوافذ قسم البيانات — حاجب · ترويسة بعنوانٍ وسطرٍ تحته · جسم · إجراءات (إطارات `data / *`).
 *
 * الأنماط من `export.module.css` لا نسخةٌ منها: نوافذ التصدير والتسليم والبيانات هيكلٌ واحد في Figma،
 * ونسختان منه كانتا ستنحرفان عند أوّل تعديل.
 *
 * **السلوك نمط `DeleteConfirm` في المكتبة:** التركيز يبدأ على «ألغِ» (`data-rasd-cancel`) لا على الفعل —
 * فحذفٌ بلا تراجع لا يُنفَّذ بـEnter عابر؛ و`Tab` يدور داخل النافذة؛ و`Esc` يغلق. ويعود التركيز عند الإغلاق
 * إلى الزرّ الذي فتحها. وحين `busy` (نسخٌ أو استعادةٌ أو حذفٌ جارٍ) لا إغلاق ولا «×»: `Esc` يُلغي ما يقبل
 * الإلغاء (`onEscape`)، ولا شيء غيره.
 */
import { useEffect, useRef } from 'preact/hooks'

import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import sheet from '../../../export/export.module.css'

import type { ComponentChildren, JSX } from 'preact'

export interface DataDialogProps {
  readonly id: string
  readonly title: string
  readonly subtitle: ComponentChildren
  readonly children: ComponentChildren
  readonly actions: ComponentChildren
  readonly onClose: () => void
  /** عمليةٌ جارية: لا «×» ولا إغلاق بالحاجب. */
  readonly busy?: boolean
  /** ما يفعله `Esc` أثناء `busy` — إلغاء النسخ مثلًا. غيابه: `Esc` لا يفعل شيئًا. */
  readonly onEscape?: (() => void) | undefined
  /** اسم الحالة للاختبارات والحرّاس — `data-phase`. */
  readonly phase?: string
  /** ما يُركَّز عليه عند الفتح إن لم يكن «ألغِ» — حقل كلمة التأكيد مثلًا. */
  readonly focus?: string
}

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

export function DataDialog(props: DataDialogProps): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => opener?.focus()
  }, [])

  // التركيز عند كل حالة جديدة: الحالة تستبدل الأزرار، والتركيز على زرٍّ زال يضيع إلى `body`.
  useEffect(() => {
    const root = dialog.current
    if (!root) return
    const target =
      (props.focus ? root.querySelector<HTMLElement>(props.focus) : null) ??
      root.querySelector<HTMLElement>('[data-rasd-autofocus]') ??
      root.querySelector<HTMLElement>('[data-rasd-cancel]') ??
      root.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
  }, [props.phase])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { busy, onClose, onEscape } = latest.current
      if (e.key === 'Escape') {
        e.preventDefault()
        if (busy) onEscape?.()
        else onClose()
        return
      }
      if (e.key !== 'Tab' || !dialog.current) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const titleId = `${props.id}-title`
  return (
    <div
      class={sheet.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget && !props.busy) props.onClose()
      }}
    >
      <div
        ref={dialog}
        class={sheet.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={props.busy ? 'true' : undefined}
        data-data-dialog={props.id}
        data-phase={props.phase}
      >
        <header class={sheet.head}>
          {props.busy ? null : (
            <button type="button" class={sheet.close} aria-label="أغلق" onClick={props.onClose}>
              <Icon name="close" size="sm" />
            </button>
          )}
          <div class={sheet.headText}>
            <h2 id={titleId} class={cx(sheet.title, 't-arabic-heading-s')}>
              {props.title}
            </h2>
            <p class={cx(sheet.subtitle, 't-arabic-ui-s')}>{props.subtitle}</p>
          </div>
        </header>
        <div class={sheet.body}>{props.children}</div>
        <footer class={sheet.actions}>{props.actions}</footer>
      </div>
    </div>
  )
}

/** صفٌّ في بطاقة القيم: الاسم في البداية والقيمة في النهاية (`summary` في الإطارات). */
export function Row({
  label,
  children,
}: {
  label: string
  children: ComponentChildren
}): JSX.Element {
  return (
    <div class={sheet.kv}>
      <span class={sheet.rowLabel}>{label}</span>
      <span class={sheet.rowValue}>{children}</span>
    </div>
  )
}

export { sheet }
