/**
 * مدير الأوضاع — وضع واحد نشط في أي لحظة.
 *
 * الانتقال **صريح**: يمرّ من `set()` وحدها، فتُشغَّل مغادرة الوضع السابق قبل
 * دخول الجديد ويُبثّ التغيير مرّة واحدة. لا وضع يتبدّل كأثر جانبي لشيء آخر،
 * وهذا ما يجعل «وضع واحد نشط» خاصيةً محفوظة لا اتفاقًا.
 *
 * `Esc` يعود إلى `idle` من أي وضع — تفرضه الخطة، ويُنفَّذ هنا لا في مستمع
 * المفاتيح، حتى يبقى صحيحًا أيًّا كان مصدر الأمر (مفتاح، نقرة، رسالة).
 */

import { signal, type Signal } from '@preact/signals'

import { isMode, type Mode } from '@/shared/modes'
import { errWith, ok, type RasdError, type Result } from '@/shared/result'

/** ما يُنفَّذ عند دخول وضع ومغادرته. */
export interface ModeHooks {
  onEnter?: (mode: Mode, previous: Mode) => void
  onExit?: (mode: Mode, next: Mode) => void
}

export interface ModeManager {
  /** الوضع الحالي — إشارة يقرأها العرض مباشرةً. */
  readonly mode: Signal<Mode>
  /**
   * هل الوضع منشغل بعملية لا تُقطع (سحب جارٍ مثلًا)؟
   *
   * الانشغال يرفض الانتقال بدل أن يُلغيه صامتًا: قطع سحب في منتصفه يفقد
   * عمل المستخدم بلا إشعار.
   */
  readonly busy: Signal<boolean>
  set(next: Mode): Result<Mode, RasdError>
  /** `Esc` — يعود إلى `idle` دائمًا، ويتجاوز الانشغال لأنه إلغاء صريح. */
  escape(): Mode
  /** يسجّل خطّافات وضع بعينه. يرجع دالّة إلغاء التسجيل. */
  on(mode: Mode, hooks: ModeHooks): () => void
  subscribe(listener: (mode: Mode, previous: Mode) => void): () => void
  dispose(): void
}

export function createModeManager(initial: Mode = 'idle'): ModeManager {
  const mode = signal<Mode>(initial)
  const busy = signal(false)
  const hooks = new Map<Mode, Set<ModeHooks>>()
  const listeners = new Set<(mode: Mode, previous: Mode) => void>()

  const fire = (m: Mode, pick: 'onEnter' | 'onExit', other: Mode) => {
    for (const h of hooks.get(m) ?? []) {
      try {
        h[pick]?.(m, other)
      } catch {
        // خطّاف يرمي لا يوقف الانتقال: الحالة تبقى متّسقة، والعطل محصور
        // في الأداة التي رمت لا في المدير.
      }
    }
  }

  const transition = (next: Mode): Mode => {
    const previous = mode.value
    if (previous === next) return next
    fire(previous, 'onExit', next)
    mode.value = next
    busy.value = false
    fire(next, 'onEnter', previous)
    for (const l of listeners) {
      try {
        l(next, previous)
      } catch {
        /* مستمع يرمي لا يمنع البقيّة */
      }
    }
    return next
  }

  return {
    mode,
    busy,

    set(next) {
      if (!isMode(next)) return errWith('unknown', `وضع غير معروف: ${String(next)}`)
      if (next === mode.value) return ok(next)
      if (busy.value) {
        return errWith('cancelled', 'الوضع الحالي منشغل بعملية جارية — أنهها أو ألغِها أوّلًا')
      }
      return ok(transition(next))
    },

    escape() {
      // الإلغاء الصريح يتجاوز الانشغال: هذا هو معناه.
      busy.value = false
      return transition('idle')
    },

    on(m, h) {
      const set = hooks.get(m) ?? new Set<ModeHooks>()
      set.add(h)
      hooks.set(m, set)
      return () => set.delete(h)
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose() {
      hooks.clear()
      listeners.clear()
      mode.value = 'idle'
      busy.value = false
    },
  }
}
