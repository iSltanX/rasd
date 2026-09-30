/**
 * تدقيق تباين الصفحة داخل وضع الفحص — `contrast-audit / *` في `Docs/Design.md` §5 (ADR 0035).
 *
 * **ناقلٌ لا مالك**: الجمع والقراءة والحكم منطقٌ في `modules/colour/{text-contrast,audit}.ts`، وما هنا متى
 * يجري كلٌّ منها، وكيف يُترك الخيط للصفحة، وكيف يُلغى، وأين يقفز المستخدم.
 *
 * **شرائح لا حلقة واحدة.** المسح يعمل في شرائح من `SLICE_MS` ثمّ يترك الخيط للصفحة، فيبقى التمرير والنقر
 * حيّين، ويُرسم التقدّم، ويصل «ألغِ» بين شريحتين. وحدّه الأعلى `LIMIT_MS`: ما فُحص قبله يُعرض نتائج جزئية
 * معلَنة (`contrast-audit / timeout`) لا يُرمى.
 *
 * **الإلغاء فوري.** كل جولة برقمها (`run`)، والإلغاء والإغلاق ومغادرة الوضع تزيده؛ فالشريحة التي تعود بعد
 * الانتظار ترى رقمًا غير رقمها فتخرج بلا كتابة. لا نتيجة تُكتب بعد «ألغِ».
 *
 * والنتيجة في ذاكرة الطبقة وحدها: لا تُخزَّن ما لم يسجّلها المستخدم مشكلة.
 */

import { signal, type Signal } from '@preact/signals'

import {
  auditReport,
  bandOf,
  bySeverity,
  type AuditFinding,
  type AuditSeverity,
} from '@/modules/colour/audit'
import {
  collectTextElements,
  createContrastProbe,
  visibleBox,
} from '@/modules/colour/text-contrast'
import { elementBounds } from '@/modules/dom-picker/inspect'
import { shortLabel } from '@/modules/dom-picker/selector'

import type { ViewportRect } from '@/shared/geometry'
import type { OverlayNotice } from '@/ui/overlay/Notice'

export type AuditPhase = 'idle' | 'scanning' | 'done' | 'timeout' | 'cancelled' | 'error'

export interface ContrastAuditState {
  readonly open: Signal<boolean>
  readonly phase: Signal<AuditPhase>
  /** عناصر نصٍّ مُرّ عليها — ظاهرةً أو مخفيّة — من `total`. */
  readonly done: Signal<number>
  readonly total: Signal<number>
  /** نصوصٌ ظاهرة قيست. */
  readonly texts: Signal<number>
  readonly findings: Signal<readonly AuditFinding[]>
  /** بعد الحدّ الزمني: «اعرض النتائج» يبدّل الملخّص بالقائمة. */
  readonly partialShown: Signal<boolean>
  readonly selected: Signal<number | null>
  /** إطار النتيجة المختارة على الصفحة — يتبع التمرير. */
  readonly box: Signal<ViewportRect | null>
  readonly error: Signal<string | null>
  /** مدّة آخر جولة بالمللي ثانية — يقرؤها `verify:colour`. */
  readonly elapsed: Signal<number | null>
}

export interface ContrastAuditOptions {
  readonly doc?: Document
  /** مضيف الطبقة — لا يُدقَّق نصّ رصد نفسه. */
  readonly skip?: Element | null
  readonly notify?: (notice: OverlayNotice) => void
  readonly onInvalidate?: () => void
  /** للاختبار: الساعة، وترك الخيط، وطول الشريحة، والحدّ الأعلى. */
  readonly now?: () => number
  readonly yieldToPage?: () => Promise<void>
  readonly sliceMs?: number
  readonly limitMs?: number
}

export interface ContrastAuditTool {
  readonly state: ContrastAuditState
  open(): void
  close(): void
  start(): Promise<void>
  cancel(): void
  showPartial(): void
  /** يقفز إلى عنصر النتيجة ويبرزه. */
  select(id: number): void
  /** العنصر المختار ونتيجته — لـ«سجّلها مشكلة». */
  selection(): { readonly el: Element; readonly finding: AuditFinding } | null
  copyReport(): Promise<void>
  frame(): void
  reset(): void
}

/** طول الشريحة — تحت إطارٍ واحد على 60Hz بعد ما يحتاجه الرسم. */
export const SLICE_MS = 12

/** الحدّ الأعلى للجولة — ما يقوله `contrast-audit / timeout`: «توقّف التدقيق بعد ٥ ثوانٍ». */
export const LIMIT_MS = 5000

/** أقصى طول لمطلع النصّ في القائمة والتقرير. */
const EXCERPT = 60

const nextTask = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** النصّ الذي يلوّنه العنصر نفسه — عقده النصّية المباشرة لا نصّ أبنائه. */
function excerptOf(el: Element): string {
  let text = ''
  for (const n of el.childNodes) if (n.nodeType === 3) text += ` ${(n as Text).data}`
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT - 1)}…` : text
}

export function createContrastAudit(options: ContrastAuditOptions = {}): ContrastAuditTool {
  const doc = options.doc ?? document
  const win = doc.defaultView ?? globalThis.window
  const now = options.now ?? (() => performance.now())
  const yieldToPage = options.yieldToPage ?? nextTask
  const sliceMs = options.sliceMs ?? SLICE_MS
  const limitMs = options.limitMs ?? LIMIT_MS
  const invalidate = (): void => options.onInvalidate?.()

  const state: ContrastAuditState = {
    open: signal(false),
    phase: signal<AuditPhase>('idle'),
    done: signal(0),
    total: signal(0),
    texts: signal(0),
    findings: signal<readonly AuditFinding[]>([]),
    partialShown: signal(false),
    selected: signal<number | null>(null),
    box: signal<ViewportRect | null>(null),
    error: signal<string | null>(null),
    elapsed: signal<number | null>(null),
  }

  /** عنصر كل نتيجة بمعرّفها — في ذاكرة الطبقة لا في الإشارة. */
  let elements = new Map<number, Element>()
  let run = 0

  const clearSelection = (): void => {
    state.selected.value = null
    state.box.value = null
  }

  const clearResults = (): void => {
    elements = new Map()
    state.findings.value = []
    state.done.value = 0
    state.total.value = 0
    state.texts.value = 0
    state.partialShown.value = false
    state.error.value = null
    clearSelection()
  }

  const start = async (): Promise<void> => {
    if (state.phase.peek() === 'scanning') return
    const mine = ++run
    clearResults()
    state.phase.value = 'scanning'
    state.open.value = true
    const began = now()

    try {
      const candidates = collectTextElements(doc, options.skip ?? null)
      state.total.value = candidates.length
      const probe = createContrastProbe(win)
      const found: AuditFinding[] = []
      const byId = new Map<number, Element>()
      let texts = 0
      let i = 0

      while (i < candidates.length) {
        const sliceEnd = now() + sliceMs
        do {
          const el = candidates[i] as Element
          const order = i++
          const box = visibleBox(el, win)
          const read = box ? probe.measure(el, box) : null
          if (!read) continue
          texts += 1
          const severity: AuditSeverity | 'pass' = read.unknown
            ? 'unknown'
            : bandOf(read.ratio, read.large)
          if (severity === 'pass') continue
          byId.set(order, el)
          found.push({
            id: order,
            order,
            severity,
            ratio: read.unknown ? null : read.ratio,
            large: read.large,
            unknown: read.unknown,
            label: shortLabel(el),
            text: excerptOf(el),
          })
        } while (i < candidates.length && now() < sliceEnd)

        state.done.value = i
        state.texts.value = texts
        if (i >= candidates.length) break
        await yieldToPage()
        if (mine !== run) return
        if (now() - began >= limitMs) break
      }

      elements = byId
      state.findings.value = found.sort(bySeverity)
      state.elapsed.value = now() - began
      state.phase.value = i < candidates.length ? 'timeout' : 'done'
    } catch (e) {
      if (mine !== run) return
      state.error.value = e instanceof Error ? e.message : String(e)
      state.phase.value = 'error'
    }
    invalidate()
  }

  const cancel = (): void => {
    if (state.phase.peek() !== 'scanning') return
    run += 1
    clearResults()
    state.phase.value = 'cancelled'
    invalidate()
  }

  const frame = (): void => {
    const id = state.selected.peek()
    const el = id === null ? undefined : elements.get(id)
    state.box.value = el?.isConnected ? elementBounds(el) : null
  }

  const select = (id: number): void => {
    const el = elements.get(id)
    if (!el) return
    // أزالته الصفحة بعد المسح: لا قفز ولا تسجيل على عنصرٍ غائب — يُقال لا يُسكت عنه.
    if (!el.isConnected) {
      clearSelection()
      options.notify?.({
        tone: 'danger',
        title: 'لم يعد هذا النصّ في الصفحة',
        detail: 'تغيّرت الصفحة بعد التدقيق — أعد التدقيق.',
      })
      invalidate()
      return
    }
    state.selected.value = id
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
    frame()
    invalidate()
  }

  const close = (): void => {
    run += 1
    clearResults()
    state.phase.value = 'idle'
    state.open.value = false
    invalidate()
  }

  return {
    state,
    open() {
      if (state.open.peek()) return
      state.open.value = true
      invalidate()
    },
    close,
    start,
    cancel,
    showPartial() {
      state.partialShown.value = true
    },
    select,
    selection() {
      const id = state.selected.peek()
      const el = id === null ? undefined : elements.get(id)
      const finding = state.findings.peek().find((f) => f.id === id)
      return el?.isConnected && finding ? { el, finding } : null
    },
    async copyReport() {
      const partial =
        state.phase.peek() === 'timeout'
          ? { done: state.done.peek(), total: state.total.peek() }
          : null
      const text = auditReport({
        page: `${win.location.origin}${win.location.pathname}`,
        texts: state.texts.peek(),
        findings: state.findings.peek(),
        partial,
      })
      const clipboard = win.navigator.clipboard as Clipboard | undefined
      try {
        if (!clipboard) throw new Error('no clipboard')
        await clipboard.writeText(text)
        options.notify?.({ tone: 'success', title: 'نُسخ التقرير' })
      } catch {
        options.notify?.({
          tone: 'danger',
          title: 'تعذّر نسخ التقرير',
          detail: 'منع المتصفّح الكتابة إلى الحافظة في هذه الصفحة.',
        })
      }
    },
    frame,
    reset: close,
  }
}
