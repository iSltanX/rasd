/**
 * الحفظ التلقائي — تهدئةٌ ودورةُ كتابةٍ مشروطة.
 *
 * **التهدئة شرط بنيوي لا تحسين.** كل كتابة تمرّ من `guardWrite`، وهي تنادي
 * `navigator.storage.estimate()` غير المتزامنة قبل أن تلمس القاعدة. وحفظٌ
 * لكل أمر يعني نداء حصّةٍ لكل حركة سحب: ستّون نداءً في الثانية على قرصٍ،
 * لأجل مشهدٍ لم يستقرّ بعد.
 *
 * **والكتابة مشروطة لا عمياء.** `putIfUnchanged` تقرأ وتقارن وتكتب داخل
 * معاملة `readwrite` واحدة، ومعاملات IndexedDB مُسلسَلة — فالدورة ذرّية.
 * ودورةُ قراءة/تعديل/كتابة موزَّعة على ثلاث معاملات هي وحدها ما لا يضمن
 * شيئًا: يقرأ التبويبان القيمة نفسها، ويكتب كلٌّ منهما فوق الآخر، ويضيع عمل
 * أحدهما بلا رسالة.
 *
 * **والنتيجة تُعلَن ولا تُبتلَع.** «تعذّر الحفظ» بلا سبب يجعل المستخدم
 * يواصل ساعةً على عملٍ لن يُحفَظ. ولذلك أربع نتائج مسمّاة، لكلٍّ منها ما
 * يُعرَض وما يُفعَل.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` ولا مؤقّتات — الجدولة تُحقن.
 */

import { summariseRedaction } from './redact'
import { SCENE_SCHEMA_VERSION, type Scene } from './scene'
import { estimateSceneBytes } from './scene-schema'

import type { Result } from '@/shared/result'

/**
 * نافذة التهدئة — 800 مللي ثانية.
 *
 * أقصر منها يُعيد كلفة نداء الحصّة إلى كل حركة؛ وأطول يجعل إغلاق التبويب
 * بعد تعديلٍ أخير يخسره. وثمانمئة قريبةٌ من حدّ ما يُحسّه المستخدم توقّفًا
 * عن الكتابة.
 */
export const AUTOSAVE_DEBOUNCE_MS = 800

export interface SavePayload {
  readonly captureId: string
  readonly schemaVersion: number
  readonly scene: Scene
  readonly updatedAt: number
  /**
   * ملخّص الحجب — **يُكتب بجوار المشهد ليُقرأ بلا فكّه**.
   *
   * تقرؤه النافذة كي لا تعرض أصلًا غير محجوب، وتقرؤه مراحل المكتبة
   * والمشاركة. وفكُّ مشهدٍ كامل لقراءة رقمين عبءٌ يُدفع في كل عرض قائمة.
   */
  readonly redaction: { readonly total: number; readonly irreversible: number }
}

/**
 * نتيجة محاولة حفظ.
 *
 * `'conflict'` **منعٌ لا كشف**: الكتابة لم تقع أصلًا لأن الشرط لم يتحقّق.
 * و`'incognito-blocked'` **حدٌّ معلَن** لا عطل: التصفّح الخاص لا يُكتب فيه
 * بسياسة المشروع، والمستخدم يستحقّ أن يعرف قبل أن يعمل ساعة.
 */
export type SaveOutcome =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'conflict'
  | 'incognito-blocked'
  | 'quota-exceeded'
  | 'too-large'
  | 'failed'

/** ما يُبلَّغ به المستدعي بعد كل محاولة. */
export interface SaveState {
  readonly outcome: SaveOutcome
  /** آخر `updatedAt` كُتب بنجاح — أساس الشرط في الكتابة التالية. */
  readonly baseUpdatedAt: number | null
  /** رسالة عربية صالحة للعرض حين تكون النتيجة فشلًا. */
  readonly message: string | null
  /** هل بقي تعديلٌ لم يُكتب بعد؟ */
  readonly dirty: boolean
}

export interface AutosaveDeps {
  /**
   * الكتابة المشروطة.
   *
   * `expectedUpdatedAt` هو ما قُرئ عند الفتح أو ما كُتب آخر مرّة — لا ما هو
   * في القاعدة الآن. والفرق بينهما هو التعارض نفسه.
   */
  readonly write: (
    payload: SavePayload,
    bytes: number,
    expectedUpdatedAt: number | null,
  ) => Promise<
    Result<
      | { readonly written: true; readonly updatedAt: number }
      /** `actual` ما وُجد فعلًا — وبه وحده تصحّ الكتابة فوقه. */
      | { readonly written: false; readonly actual: number | null }
    >
  >
  readonly now: () => number
  /** يجدول ويُعيد ملغيًا. يُحقن كي تكون المهل حتمية في الاختبار. */
  readonly schedule: (fn: () => void, ms: number) => () => void
  readonly baseUpdatedAt?: number | null
  readonly onState?: (state: SaveState) => void
  readonly debounceMs?: number
  /** سقف بايتات المشهد — دونه يُرفض الحفظ بسببٍ معروض. */
  readonly maxBytes?: number
}

export interface Autosave {
  /** يسجّل مشهدًا جديدًا ويؤجّل الكتابة. */
  push(scene: Scene): void
  /** يكتب الآن ما لم يُكتب — للإغلاق ولزرّ «احفظ». */
  flush(): Promise<SaveOutcome>
  /** يقبل الحالة الحالية أساسًا بعد تعارض — المستخدم قرّر الكتابة فوقها. */
  overwrite(): Promise<SaveOutcome>
  readonly state: SaveState
  dispose(): void
}

/** سقف المشهد الافتراضي — يطابق `MAX_SCENE_BYTES`. */
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024

export function createAutosave(deps: AutosaveDeps): Autosave {
  const debounceMs = deps.debounceMs ?? AUTOSAVE_DEBOUNCE_MS
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES

  let pending: Scene | null = null
  /** ما وجده آخر تعارض — شرطُ الكتابة فوقه. */
  let theirUpdatedAt: number | null = null
  let cancel: (() => void) | null = null
  let inFlight: Promise<SaveOutcome> | null = null
  let disposed = false

  let state: SaveState = {
    outcome: 'idle',
    baseUpdatedAt: deps.baseUpdatedAt ?? null,
    message: null,
    dirty: false,
  }

  const emit = (next: Partial<SaveState>): void => {
    state = { ...state, ...next }
    deps.onState?.(state)
  }

  /** يكتب مشهدًا واحدًا. `force` يتجاوز الشرط بعد قرار المستخدم. */
  const writeOnce = async (scene: Scene, force: boolean): Promise<SaveOutcome> => {
    const bytes = estimateSceneBytes(scene)
    if (bytes > maxBytes) {
      /*
       * **يُرفَض بسببٍ معروض قبل أن يُحاوَل.** مشهدٌ تجاوز السقف يُرفض في
       * القاعدة أيضًا، لكن الرفض هناك يصل «تعذّر الحفظ» — فيواصل المستخدم
       * ساعةً على عملٍ لا يُحفَظ.
       */
      emit({
        outcome: 'too-large',
        message: 'المشهد تجاوز الحدّ المسموح. احذف بعض التعليقات أو صدّر ثمّ ابدأ من جديد.',
        dirty: true,
      })
      return 'too-large'
    }

    emit({ outcome: 'saving' })
    const at = deps.now()
    const payload: SavePayload = {
      captureId: scene.captureId,
      schemaVersion: SCENE_SCHEMA_VERSION,
      scene,
      updatedAt: at,
      redaction: summariseRedaction(scene),
    }

    /*
     * **الكتابة فوقهم تشترط قيمتهم لا `null`.**
     *
     * `putIfUnchanged` بشرط `null` تعني «اكتب إن لم يكن هناك سجلّ» — وعند
     * التعارض يوجد سجلّ بالتعريف، فالشرط يفشل **أبدًا**. أي أن زرّ «احفظ
     * نسختي» كان لا يفعل شيئًا، إلى الأبد، وبلا رسالة.
     */
    const expected = force ? theirUpdatedAt : state.baseUpdatedAt
    const result = await deps.write(payload, bytes, expected)

    if (!result.ok) {
      const code = result.error.code
      const outcome: SaveOutcome =
        code === 'incognito-blocked'
          ? 'incognito-blocked'
          : code === 'quota-exceeded'
            ? 'quota-exceeded'
            : 'failed'
      emit({ outcome, message: result.error.message, dirty: true })
      return outcome
    }

    if (!result.value.written) {
      /*
       * الشرط لم يتحقّق: تبويبٌ آخر كتب بيننا. **ولا يُكتَب فوقه ولا
       * يُرمى ما هنا** — القرار للمستخدم، وكلا الطرفين عملُ إنسان.
       */
      theirUpdatedAt = result.value.actual
      emit({
        outcome: 'conflict',
        message: 'حُرِّرت هذه اللقطة في مكان آخر. اختر ما تُبقيه.',
        dirty: true,
      })
      return 'conflict'
    }

    emit({
      outcome: 'saved',
      baseUpdatedAt: result.value.updatedAt,
      message: null,
      dirty: false,
    })
    return 'saved'
  }

  /** يكتب ما هو معلَّق، ويحمي من كتابتين متوازيتين. */
  const drain = async (force = false): Promise<SaveOutcome> => {
    if (inFlight) {
      // كتابةٌ جارية: تُنتظَر ثمّ يُعاد المحاولة لو بقي معلَّق.
      await inFlight
    }
    const scene = pending
    if (!scene) return state.outcome === 'saving' ? 'saved' : state.outcome
    pending = null

    const run = writeOnce(scene, force)
    inFlight = run
    try {
      const outcome = await run
      /*
       * **كتابةٌ لم تنجح تُعيد المشهد إلى الانتظار.**
       *
       * بدونها يضيع عمل المستخدم في اللحظة التي وُجدت هذه الوحدة لحمايته
       * فيها: يقع تعارض، فتُفرَّغ الحمولة، ثمّ يختار «أبقِ ما عندي» فلا
       * يجد ما يُبقيه. وكذلك التصفّح الخاص والحصّة الممتلئة — كلّها حالات
       * يُعاد فيها المحاولة، لا حالات يُرمى فيها ما بُني.
       *
       * ولا يُعاد إن كان `push` قد سجّل أحدث منه أثناء الكتابة: الأحدث
       * يحمل الأقدم أصلًا.
       */
      if (outcome !== 'saved' && pending === null) pending = scene
      return outcome
    } finally {
      inFlight = null
    }
  }

  return {
    get state() {
      return state
    },

    push(scene) {
      if (disposed) return
      pending = scene
      emit({ dirty: true })
      cancel?.()
      cancel = deps.schedule(() => {
        cancel = null
        void drain()
      }, debounceMs)
    },

    async flush() {
      if (disposed) return state.outcome
      cancel?.()
      cancel = null
      return drain()
    },

    async overwrite() {
      if (disposed) return state.outcome
      cancel?.()
      cancel = null
      /*
       * قرار المستخدم: «أبقِ ما عندي». يُكتب بلا شرط — والشرط يُعاد بناؤه
       * من `updatedAt` الجديد، فالكتابة التالية مشروطة كالمعتاد.
       */
      if (!pending) return state.outcome
      return drain(true)
    },

    dispose() {
      disposed = true
      cancel?.()
      cancel = null
      pending = null
    },
  }
}
