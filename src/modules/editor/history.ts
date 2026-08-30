/**
 * التاريخ — مكدّسان من **علامات** لا من عمليات.
 *
 * **الفرق ليس تفصيلًا:** نصّ المرحلة يفرض «تراجع/إعادة بعمق ≥50 خطوة».
 * وسحبةٌ واحدة بالمؤشِّر تولّد عشرات الفروق؛ فعدُّها عمليات يجعل «خمسين
 * خطوة» ثلاثَ حركات فأرة. العلامة (mark) هي وحدة ما يفهمه المستخدم خطوةً:
 * سحبةٌ كاملة، أو حذفٌ، أو نوبة كتابة.
 *
 * **والتاريخ لا ينجو من إغلاق المحرر** — حدٌّ معلَن. المحفوظ هو المشهد لا
 * المكدّس: حفظ خمسين فرقًا لكل لقطة يضاعف حجم القاعدة مقابل قيمة لا يطلبها
 * نصّ المرحلة.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` ولا مؤقّتات.
 */

import { applyPatches, coalesce, invertPatches, type Patch } from './commands'

import type { Scene } from './scene'

/** «≥ 50» في نصّ المرحلة — **بالعلامات**. */
export const HISTORY_LIMIT = 50

/*
 * قواطع نوبة الكتابة — الحالة الوحيدة التي لا تصفها دورة ضغط/إفلات — تعيش
 * في `typing.ts` وحدها. كانت هنا قبل وجوده، ونسختان لعتبةٍ واحدة تتباعدان
 * بلا رسالة: تُعدَّل إحداهما فيبقى السلوك على الأخرى.
 */

export interface Mark {
  /** عربي — يظهر في «تراجع عن …». */
  readonly label: string
  readonly patches: readonly Patch[]
  readonly at: number
}

export interface EditorState {
  readonly scene: Scene
  readonly past: readonly Mark[]
  readonly future: readonly Mark[]
}

export interface History {
  readonly state: EditorState
  /** يفتح علامة. فتحُ علامةٍ فوق أخرى مفتوحة يُغلق الأولى أوّلًا. */
  mark(label: string): void
  /** يدفع فروقًا داخل العلامة المفتوحة — أو مباشرةً كعلامة مفردة إن لم تُفتَح. */
  push(patches: readonly Patch[]): void
  /** يغلق العلامة ويُدرجها في التاريخ. علامة بلا فرق لا تُدرَج. */
  commit(): void
  /** `Esc` أثناء السحب: يتراجع عمّا دُفع داخل العلامة ويغلقها بلا إدراج. */
  cancel(): void
  undo(): void
  redo(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** وسم العلامة القادمة للتراجع — لعرضه في الواجهة. */
  readonly undoLabel: string | null
  readonly redoLabel: string | null
}

export interface HistoryOptions {
  /** يُحقن في الاختبار كي تكون الطوابع حتمية. */
  now?: () => number
  limit?: number
}

export function createHistory(initial: Scene, options: HistoryOptions = {}): History {
  const now = options.now ?? (() => Date.now())
  const limit = options.limit ?? HISTORY_LIMIT

  let scene = initial
  let past: Mark[] = []
  let future: Mark[] = []

  /** العلامة المفتوحة — `null` يعني لا سحب جاريًا. */
  let open: { label: string; patches: Patch[] } | null = null

  const closeOpen = (): void => {
    if (!open) return
    const merged = coalesce(open.patches)
    if (merged.length > 0) {
      past.push({ label: open.label, patches: merged, at: now() })
      /*
       * السقف يُقصّ من **الأقدم**، ويُقصّ عند الإدراج لا عند القراءة: مكدّس
       * ينمو بلا حدّ ثم يُقرأ منه خمسون هو تسريب ذاكرة بواجهة سليمة.
       */
      if (past.length > limit) past = past.slice(past.length - limit)
      // أي تحرير جديد يُبطل مسار الإعادة — وهذا سلوك كل محرّر.
      future = []
    }
    open = null
  }

  return {
    get state(): EditorState {
      return { scene, past, future }
    },

    mark(label) {
      closeOpen()
      open = { label, patches: [] }
    },

    push(patches) {
      if (patches.length === 0) return
      scene = applyPatches(scene, patches)
      if (open) {
        open.patches.push(...patches)
        return
      }
      /*
       * دفعٌ بلا علامة مفتوحة = علامة مفردة. هذا يجعل العمليات الذرّية
       * (حذف، تبديل شكل الدبّوس) لا تحتاج `mark`/`commit` حولها.
       */
      past.push({ label: '', patches: coalesce(patches), at: now() })
      if (past.length > limit) past = past.slice(past.length - limit)
      future = []
    },

    commit() {
      closeOpen()
    },

    cancel() {
      if (!open) return
      if (open.patches.length > 0) {
        scene = applyPatches(scene, invertPatches(open.patches))
      }
      open = null
    },

    undo() {
      // علامةٌ مفتوحة تُغلَق أوّلًا: `⌘Z` أثناء سحب يعني «تراجع عن السحب».
      closeOpen()
      const mark = past.pop()
      if (!mark) return
      scene = applyPatches(scene, invertPatches(mark.patches))
      future.push(mark)
    },

    redo() {
      closeOpen()
      const mark = future.pop()
      if (!mark) return
      scene = applyPatches(scene, mark.patches)
      past.push(mark)
    },

    get canUndo() {
      return past.length > 0 || (open?.patches.length ?? 0) > 0
    },
    get canRedo() {
      return future.length > 0
    },
    get undoLabel() {
      return open?.patches.length ? open.label : (past.at(-1)?.label ?? null)
    },
    get redoLabel() {
      return future.at(-1)?.label ?? null
    },
  }
}
