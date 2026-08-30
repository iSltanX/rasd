/**
 * نوبة الكتابة — متى تُغلَق علامة التاريخ أثناء الطباعة.
 *
 * **الحالة الوحيدة التي لا تصفها دورة ضغط/إفلات.** كل إيماءة أخرى في المحرر
 * لها بداية ونهاية واضحتان: `pointerdown` يفتح العلامة و`pointerup` يغلقها.
 * والكتابة تدفّق بلا نهاية معلومة.
 *
 * **والطرفان كلاهما يُسقط بند القبول على أشيع فعل في المحرر:**
 *   - علامة واحدة للجلسة ⇒ `⌘Z` تمحو **فقرة كاملة** كتبها المستخدم.
 *   - علامة لكل حرف ⇒ سطرٌ واحد يُخلي مكدّسًا سعته خمسون، فيضيع كل ما قبله.
 *
 * فثلاثة قواطع، تُغلَق العلامة بأوّل ما يقع منها:
 *   ١. **سكون** — توقّفٌ عن الكتابة يعني نهاية فكرة.
 *   ٢. **حدّ كلمة** — مسافة أو سطر جديد أو لصق.
 *   ٣. **طول** — نوبة لا تتوقّف تُقطَع عند حدّ كي لا تصير فقرة.
 *
 * `modules/` منطق خالص: لا DOM ولا مؤقّتات — الزمن يُمرَّر، والمستدعي يجدول.
 */

/** سكونٌ يُغلق النوبة. */
export const TYPING_IDLE_MS = 700

/** أقصى ما تحمله نوبة واحدة قبل أن تُقطَع. */
export const TYPING_MAX_CHARS = 80

export type TypingBreak = 'idle' | 'word' | 'length' | null

export interface TypingState {
  /** لحظة آخر ضغطة داخل النوبة الجارية؛ `null` يعني لا نوبة. */
  readonly lastAt: number | null
  /** عدد المحارف المضافة داخل النوبة. */
  readonly chars: number
}

export const idleTyping: TypingState = { lastAt: null, chars: 0 }

/** هل هذا الإدخال حدّ كلمة؟ */
export function isWordBreak(input: string): boolean {
  return /\s/u.test(input)
}

/**
 * يقرّر هل تُغلَق النوبة **قبل** استيعاب هذا الإدخال.
 *
 * الترتيب مقصود: السكون يُفحَص أوّلًا لأنه يصف ما وقع **قبل** الإدخال، ثمّ
 * الطول لأنه يصف النوبة المتراكمة، ثمّ حدّ الكلمة لأنه يصف الإدخال نفسه —
 * وهو الوحيد الذي يُغلق العلامة **بعد** ضمّه، كي تنتهي النوبة بالكلمة لا
 * ببدايتها.
 */
export function breakBefore(state: TypingState, at: number, input: string): TypingBreak {
  if (state.lastAt === null) return null
  if (at - state.lastAt >= TYPING_IDLE_MS) return 'idle'
  if (state.chars + input.length > TYPING_MAX_CHARS) return 'length'
  return null
}

/** هل تُغلَق النوبة بعد ضمّ هذا الإدخال؟ */
export function breakAfter(input: string): TypingBreak {
  return isWordBreak(input) ? 'word' : null
}

/** يستوعب إدخالًا في النوبة. */
export function absorb(state: TypingState, at: number, input: string): TypingState {
  return { lastAt: at, chars: state.chars + input.length }
}

export interface TypingDecision {
  /** أغلق العلامة الجارية قبل تطبيق هذا الإدخال. */
  readonly closeBefore: TypingBreak
  /** الحالة بعد الاستيعاب. */
  readonly next: TypingState
  /** أغلق العلامة بعد تطبيق هذا الإدخال. */
  readonly closeAfter: TypingBreak
}

/**
 * القرار الكامل لإدخال واحد.
 *
 * يُرجع الأمرين معًا كي يستدعيهما المستدعي بالترتيب الصحيح بلا اجتهاد:
 * `closeBefore` ثمّ `mark` ثمّ `push` ثمّ `closeAfter`.
 */
export function decide(state: TypingState, at: number, input: string): TypingDecision {
  const closeBefore = breakBefore(state, at, input)
  const base = closeBefore === null ? state : idleTyping
  return {
    closeBefore,
    next: absorb(base, at, input),
    closeAfter: breakAfter(input),
  }
}

/**
 * هل يعترض المحرر هذا الاختصار؟
 *
 * **`⌘Z` داخل حقل نصّ يُعترَض ويُوجَّه إلى تاريخنا.** الحقل يملك مكدّس تراجع
 * أصليًّا للمتصفّح، ولو تُرك لتنازع المكدّسان: تراجعٌ يمحو حرفًا في الحقل ولا
 * يمسّ المشهد، ثمّ تراجعٌ ثانٍ يمحو شكلًا رُسم قبل الكتابة — فيقفز المستخدم
 * بين تاريخين لا يعرف أيّهما يعمل.
 */
export function isHistoryShortcut(e: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}): 'undo' | 'redo' | null {
  if (!(e.metaKey || e.ctrlKey)) return null
  const key = e.key.toLowerCase()
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  // `⌃Y` إعادةٌ متعارفة على ويندوز ولينكس.
  if (key === 'y' && !e.metaKey) return 'redo'
  return null
}
