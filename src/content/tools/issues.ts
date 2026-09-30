/**
 * المشكلات داخل الصفحة — نموذج «سجّل مشكلة» ولوحة «مشكلات هذه الصفحة» وجولة إعادة الفحص (ADR 0030–0032).
 *
 * **الصفحة تقرأ والخلفية تكتب وتحكم.** هنا تُقرأ القيم من العنصر الحيّ وتُبنى هويته، وتُقرأ المشكلات على DOM
 * الصفحة؛ أمّا التسجيل والحكم على القيمة وحفظ النتائج ونصوص العرض ففي الخلفية — المخزن في قاعدة الإضافة،
 * والرابط من التبويب، وكل ما لا يحتاج DOM خارج `content.js` وميزانيته (ADR 0031 §3).
 *
 * **والجولة بإيماءة وحدها** (ADR 0031 §4): من زرّ اللوحة بنقرة حقيقية (`userActivation`)، أو من النافذة عبر
 * الخلفية. لا منبّه ولا تنقّل يبدؤها.
 */

import { signal, type Signal } from '@preact/signals'

import { formatsOf } from '@/modules/colour/formats'
import { identify, refind } from '@/modules/dom-picker/identity'
import { elementBounds } from '@/modules/dom-picker/inspect'
import { readIssue, readValue } from '@/modules/issues/observe'
import {
  viewportRect,
  viewportRectToDevice,
  type ViewportRect,
  type CoordSpace,
} from '@/shared/geometry'
import {
  CONTRAST_PROPERTY,
  MAX_RECHECK,
  type CheckKind,
  type ElementIdentity,
  type IssueDraftInput,
  type IssueObservation,
  type IssueRecord,
} from '@/shared/issue-schema'
import { send } from '@/shared/messaging'

import type { FormOption, IssueFormModel, IssueFormValues } from '@/ui/overlay/issues/types'
import type { OverlayNotice } from '@/ui/overlay/Notice'

export type { FormOption, IssueFormModel, IssueFormValues }

export type IssueSource = 'inspect' | 'measure' | 'colour'

export type IssuesPhase = 'loading' | 'ready' | 'rechecking' | 'error'

export interface IssuesState {
  readonly list: Signal<readonly IssueRecord[]>
  /** سطر القيمتين أو السبب تحت كل مشكلة — تبنيه الخلفية. */
  readonly lines: Signal<Readonly<Record<string, string>>>
  /** «آخر فحص قبل…» كما حسبته الخلفية عند التحميل. */
  readonly checked: Signal<string>
  readonly phase: Signal<IssuesPhase>
  /** متى انتهت آخر جولة في هذه الجلسة — `null` قبلها. */
  readonly checkedAt: Signal<number | null>
  /** مستطيلات العناصر المعثور عليها، بالمعرّف — لإطارها ورقمها على الصفحة. */
  readonly boxes: Signal<ReadonlyMap<string, ViewportRect>>
  readonly form: Signal<IssueFormModel | null>
  readonly formBusy: Signal<boolean>
  readonly formError: Signal<string | null>
  /** حقلٌ من حقول النموذج مركَّز — تسأله الاختصارات (ADR 0032). */
  readonly typing: Signal<boolean>
}

export interface IssueTargets {
  inspect(): Element | null
  measure(): { readonly a: Element | null; readonly b: Element | null }
  colour(): { readonly el: Element | null; readonly hex: string } | null
}

export interface IssuesOptions {
  readonly doc?: Document
  /** مضيف الطبقة — لا يُعدّ مطابقًا ولا يُقرأ. */
  readonly skip?: Element | null
  readonly targets: IssueTargets
  readonly space: () => CoordSpace
  readonly notify: (notice: OverlayNotice) => void
  /** «اعرض مشكلات الصفحة» في إشعار التسجيل. */
  readonly showIssues: () => void
  readonly now?: () => number
}

export interface IssuesController {
  readonly state: IssuesState
  load(): Promise<void>
  openForm(source: IssueSource): void
  closeForm(): void
  submit(values: IssueFormValues): Promise<boolean>
  /** `gesture` نقرةٌ حقيقية أو طلبٌ من النافذة — وإلا تُرفض الجولة. يُرجع عدد ما قُرئ. */
  recheck(gesture: boolean): Promise<number>
  /** يحدّث المستطيلات مع التمرير والمقاس — العناصر نفسها محفوظة منذ آخر تحميل أو جولة. */
  frame(): void
}

/** خصائص النمط التي يعرضها النموذج — ما كانت قيمته فارغة لا يُعرض. */
const STYLE_PROPS = [
  'padding',
  'margin',
  'gap',
  'width',
  'height',
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'border-radius',
]

const COLOUR_PROPS = ['background-color', 'color', 'border-top-color']

/** جوانب الفجوة الأربعة ووصفها — «الفجوة» في لوحة القياس أحدها. */
const GAP_SIDES = ['gap-top', 'gap-right', 'gap-bottom', 'gap-left']
const SIDE: Readonly<Record<string, string>> = {
  'gap-top': 'أعلى',
  'gap-right': 'يمين',
  'gap-bottom': 'أسفل',
  'gap-left': 'يسار',
}

/** سقف الجولة الزمني — ما بعده يُسجَّل «لم يتّسع الوقت» (ADR 0031 §5). */
const RECHECK_BUDGET_MS = 2000

/** كل كم مشكلة يُترك الخيط للصفحة. */
const YIELD_EVERY = 20

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export function createIssues(options: IssuesOptions): IssuesController {
  const doc = options.doc ?? document
  const win = doc.defaultView ?? globalThis.window
  const skip = options.skip ?? null
  const now = options.now ?? Date.now

  const state: IssuesState = {
    list: signal<readonly IssueRecord[]>([]),
    lines: signal<Readonly<Record<string, string>>>({}),
    checked: signal(''),
    phase: signal<IssuesPhase>('loading'),
    checkedAt: signal<number | null>(null),
    boxes: signal<ReadonlyMap<string, ViewportRect>>(new Map()),
    form: signal<IssueFormModel | null>(null),
    formBusy: signal(false),
    formError: signal<string | null>(null),
    typing: signal(false),
  }

  /** العناصر كما وُجدت في آخر تحميل أو جولة — المستطيل يُقرأ منها كل إطار بلا بحث جديد. */
  let located = new Map<string, Element>()
  /** ما يُسجَّل عليه النموذج المفتوح — يُثبَّت لحظة الفتح، فحركة المؤشِّر بعدها لا تغيّره. */
  let pending: {
    el: Element
    pair: Element | null
    identity: ElementIdentity
    pairIdentity: ElementIdentity | null
    options: readonly FormOption[]
  } | null = null

  /** ما تعذّر في اللوحة يُقال في إشعار الطبقة — لا حقل خطأٍ ثانٍ في اللوحة. */
  const fail = (title: string): void => options.notify({ tone: 'danger', title })

  const frame = (): void => {
    const boxes = new Map<string, ViewportRect>()
    for (const [id, el] of located) {
      if (el.isConnected) boxes.set(id, elementBounds(el))
    }
    state.boxes.value = boxes
  }

  const locate = (list: readonly IssueRecord[]): void => {
    located = new Map()
    for (const issue of list) {
      const found = refind(issue.element, doc, skip)
      if (found.kind === 'found' || found.kind === 'changed') located.set(issue.id, found.el)
    }
    frame()
  }

  const load = async (): Promise<void> => {
    const reply = await send('issue/page', undefined)
    if (!reply.ok) {
      fail(reply.error.message)
      state.phase.value = 'error'
      return
    }
    state.list.value = reply.value.issues
    state.lines.value = reply.value.lines
    state.checked.value = reply.value.checked
    if (state.phase.peek() !== 'rechecking') state.phase.value = 'ready'
    locate(reply.value.issues)
  }

  /** قيمٌ من العنصر خياراتٍ في النموذج — اللون بصيغة `#RRGGBB` كما يعرضه الإطار، وما كان فارغًا لا يُعرض. */
  const read = (kind: CheckKind, props: readonly string[], el: Element, pair: Element | null) =>
    props.flatMap((property): FormOption[] => {
      const raw = readValue(kind, property, el, pair, win).value
      const value = raw && (formatsOf(raw)?.hex ?? raw)
      // جانبٌ سالب في المسافة تداخلٌ لا فجوة — لا يُعرض خيارًا.
      if (!value || value.startsWith('-')) return []
      const label = SIDE[property] ? `الفجوة (${SIDE[property]})` : property
      return [{ kind, property, label: kind === 'contrast' ? 'التباين' : label, value }]
    })

  const openForm = (source: IssueSource): void => {
    let el: Element | null
    let pair: Element | null = null
    let list: FormOption[]
    if (source === 'measure') {
      ;({ a: el, b: pair } = options.targets.measure())
      if (!el || !pair) return
      list = read('spacing', GAP_SIDES, el, pair)
    } else if (source === 'colour') {
      const picked = options.targets.colour()
      el = picked?.el ?? null
      if (!el || !picked) return
      // اللون المأخوذ أوّلًا، ثمّ بقية ألوان العنصر، ثمّ تباين نصّه.
      const colours = read('colour', COLOUR_PROPS, el, null)
      list = [
        ...colours.filter((o) => o.value === picked.hex),
        ...colours.filter((o) => o.value !== picked.hex),
        ...read('contrast', [CONTRAST_PROPERTY], el, null),
      ]
    } else {
      el = options.targets.inspect()
      if (!el) return
      list = read('style', STYLE_PROPS, el, null)
    }

    const identity = identify(el, win)
    const pairIdentity = pair ? identify(pair, win) : null
    pending = { el, pair, identity, pairIdentity, options: list }
    state.formError.value = null
    state.form.value = {
      options: list,
      subject: pairIdentity ? `${pairIdentity.selector} · ${identity.selector}` : identity.selector,
    }
  }

  const closeForm = (): void => {
    pending = null
    state.form.value = null
    state.formError.value = null
    state.formBusy.value = false
    state.typing.value = false
  }

  const submit = async (values: IssueFormValues): Promise<boolean> => {
    const target = pending
    if (!target || state.formBusy.peek()) return false
    const { option } = values
    const s = options.space()
    const a = elementBounds(target.el)
    const b = target.pair ? elementBounds(target.pair) : a
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    // العنصر (أو العنصران معًا) بفضاء الجهاز — الخلفية تضيف الهامش وتقصّه إلى النافذة (`evidenceRect`).
    const element = viewportRectToDevice(
      viewportRect(
        x,
        y,
        Math.max(a.x + a.width, b.x + b.width) - x,
        Math.max(a.y + a.height, b.y + b.height) - y,
      ),
      s,
    )
    const draft: IssueDraftInput = {
      element: target.identity,
      pair: option.kind === 'spacing' ? target.pairIdentity : null,
      check: {
        kind: option.kind,
        property: option.property,
        actual: option.value,
        expected: values.expected.trim(),
        tolerance: option.kind === 'contrast' ? 0 : values.tolerance,
      },
      snapshot: Object.fromEntries(target.options.map((o) => [o.property, o.value])),
      title: values.title,
      body: values.body,
      steps: [],
      projectId: null,
      withNote: values.withNote,
      shot: { element, dpr: s.dpr },
      viewport: { width: s.layoutWidth, height: s.layoutHeight },
    }

    state.formBusy.value = true
    state.formError.value = null
    const reply = await send('issue/create', draft, { timeoutMs: 20_000 })
    // أُغلق النموذج أثناء الحفظ (وربّما فُتح غيره): لا يُكتب خطأٌ ولا يُغلق ما لم يرسل هذا الطلب.
    const same = pending === target
    if (!reply.ok) {
      if (same) {
        state.formBusy.value = false
        state.formError.value = `تعذّر الحفظ: ${reply.error.message} ما كتبته باقٍ.`
      }
      return false
    }
    if (same) closeForm()
    options.notify({
      tone: 'success',
      title: 'سُجّلت المشكلة',
      action: { label: 'اعرضها', run: options.showIssues },
    })
    void load()
    return true
  }

  const recheck = async (gesture: boolean): Promise<number> => {
    if (!gesture) {
      fail('أعد الفحص بنقرة.')
      return 0
    }
    if (state.phase.peek() === 'rechecking') return 0
    state.phase.value = 'rechecking'
    await load()

    const started = performance.now()
    const observations: IssueObservation[] = []
    for (const [i, issue] of state.list.peek().slice(0, MAX_RECHECK).entries()) {
      observations.push(
        performance.now() - started > RECHECK_BUDGET_MS
          ? { id: issue.id, outcome: 'unreliable', observed: null, reason: 'budget', context: null }
          : readIssue(issue, doc, skip),
      )
      if ((i + 1) % YIELD_EVERY === 0) await tick()
    }

    // الحكم في الخلفية على الفحص المخزَّن — الصفحة تبلّغ ما رأت فقط (ADR 0030 §2).
    if (observations.length) {
      const saved = await send('issue/recheck-save', { observations })
      if (!saved.ok) {
        fail(saved.error.message)
        state.phase.value = 'error'
        return 0
      }
      const byId = new Map(saved.value.issues.map((it) => [it.id, it]))
      state.list.value = state.list.peek().map((it) => byId.get(it.id) ?? it)
      state.lines.value = { ...state.lines.peek(), ...saved.value.lines }
    }
    state.checkedAt.value = now()
    state.phase.value = 'ready'
    locate(state.list.peek())
    return observations.length
  }

  return {
    state,
    load,
    openForm,
    closeForm,
    submit,
    recheck,
    frame,
  }
}
