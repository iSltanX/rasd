/**
 * أداة «العناصر التي تستخدم اللون» والاستبدال المؤقّت — `§6.10` و`§6.11`.
 *
 * **لماذا أداة مستقلّة لا توسعةٌ لـ`eyedropper`.** القطّارة تجيب سؤالًا
 * واحدًا («ما لون هذا البكسل؟») بحلقة مؤشِّر لا تتوقّف. وهذه تجيب سؤالين
 * مختلفين تمامًا («مَن يستعمل هذا اللون؟» ثم «ماذا لو بدّلناه؟») بعملٍ
 * طويل مُجزَّأ وأثرٍ يبقى في الصفحة بعد انتهائه. دمجُهما كان يخلط دورتَي
 * حياة لا تشتركان في شيء إلّا اللون المُمرَّر بينهما.
 *
 * **وهي ناقلٌ لا مالك**: المسح في [`modules/colour/usage.ts`](../../modules/colour/usage.ts)
 * والاستبدال في [`replace.ts`](../../modules/colour/replace.ts)، وكلاهما
 * منطق خالص مُختبَر بلا DOM. ما يقع هنا هو الوصل: متى يبدأ، وبأي مُجدوِل،
 * وأين تذهب النتيجة، ومتى يُتراجَع.
 *
 * **الإبراز يُرسم بعناصر منفصلة لا بتعديل العناصر نفسها.** لمس عنصر
 * الصفحة — ولو بـ`outline` — يغيّر تخطيطها أو يشتبك مع أنماطها، ويخلط
 * «الإبراز» بـ«الاستبدال» في مسار التراجع نفسه. فتُرسَم مستطيلات في طبقتنا
 * فوقها، وتُمحى بمسحها.
 */

import { signal, type Signal } from '@preact/signals'

import { replaceOnElements, replaceVariable, type ReplaceHandle } from '@/modules/colour/replace'
import { idleScheduler, scanColourUsage, type UsageHit } from '@/modules/colour/usage'
import { buildSelector } from '@/modules/dom-picker/selector'
import { viewportRect } from '@/shared/geometry'

import type { ColourReading } from '@/modules/colour/formats'
import type { ViewportRect } from '@/shared/geometry'

/** صفٌّ جاهز للعرض — محدِّد وخاصية، كما يرسمهما الإطار `65:55`. */
export interface UsageRow {
  readonly selector: string
  readonly property: string
}

/**
 * كم صفًّا يُعرَض في اللوحة.
 *
 * الإطار المرجعي يعرض **ثلاثة** صفوف لأربعة عشر عنصرًا: القائمة عيّنة
 * والعدّاد هو الحقيقة. والقصّ يقع هنا لا في المكوّن — ذاك يعرض ما يصله.
 */
export const ROW_LIMIT = 3

export interface ColourUsageState {
  readonly hits: Signal<readonly UsageHit[]>
  readonly rows: Signal<readonly UsageRow[]>
  readonly scanning: Signal<boolean>
  /** 0..1 — مقامه معلوم لأن التعداد يقع مرّة واحدة في البداية. */
  readonly progress: Signal<number>
  /** مستطيلات الإبراز في فضاء إطار العرض، أو فارغة. */
  readonly highlights: Signal<readonly ViewportRect[]>
  /** استبدالٌ حيّ الآن — وجودُه يعني أن الصفحة مُعدَّلة مؤقّتًا. */
  readonly replaced: Signal<ReplaceHandle | null>
}

export interface ColourUsageOptions {
  doc?: Document
  /** مضيف طبقتنا — يُستبعَد من المسح فلا نجد أنفسنا. */
  skip?: Element | null
  /** يُبلَّغ حين تتغيّر الحالة بما يستوجب إعادة رسم. */
  onInvalidate?: () => void
  /** يُحقن متزامنًا في الاختبار؛ الإنتاج يمرّر خمولًا بمهلة. */
  schedule?: (run: () => void) => void
}

export interface ColourUsageTool {
  readonly state: ColourUsageState
  /** يبدأ مسحًا جديدًا، ويُجهض أي مسحٍ جارٍ قبله. */
  scan(target: ColourReading): void
  cancel(): void
  highlightAll(): void
  clearHighlights(): void
  /** يستبدل اللون على كل ما وجده المسح — أو على متغيّر CSS كاملًا. */
  replace(colour: string, options?: { variable?: string }): void
  revert(): void
  /** يُعيد كل شيء: النتائج والإبراز والاستبدال. */
  reset(): void
  /** يُعيد قياس مستطيلات الإبراز — تمرير أو تغيير حجم. */
  frame(): void
  dispose(): void
}

export function createColourUsage(options: ColourUsageOptions = {}): ColourUsageTool {
  const doc = options.doc ?? document
  const win = doc.defaultView ?? globalThis.window
  const schedule = options.schedule ?? idleScheduler(win)

  const state: ColourUsageState = {
    hits: signal<readonly UsageHit[]>([]),
    rows: signal<readonly UsageRow[]>([]),
    scanning: signal(false),
    progress: signal(0),
    highlights: signal<readonly ViewportRect[]>([]),
    replaced: signal<ReplaceHandle | null>(null),
  }

  let running: { cancel(): void } | null = null
  let generation = 0

  const invalidate = (): void => options.onInvalidate?.()

  /**
   * يبني صفوف العرض من الإصابات.
   *
   * **الخاصية المعروضة هي الأولى في `matches`** لا كلّها: عنصرٌ قد يستعمل
   * اللون نصًّا وحدًّا معًا، والصفّ في الإطار يحمل خاصيةً واحدة. وعرضُ
   * الأولى أصدق من دمجهما بفاصلة في حقلٍ صُمِّم لواحدة.
   */
  const rowsOf = (hits: readonly UsageHit[]): readonly UsageRow[] =>
    hits.slice(0, ROW_LIMIT).map((hit) => ({
      selector: buildSelector(hit.element).selector || hit.element.localName,
      property: hit.matches[0]?.property ?? '',
    }))

  const measure = (hits: readonly UsageHit[]): readonly ViewportRect[] =>
    hits.map((hit) => {
      const r = hit.element.getBoundingClientRect()
      return viewportRect(r.left, r.top, r.width, r.height)
    })

  return {
    state,

    scan(target) {
      running?.cancel()
      const mine = ++generation
      state.scanning.value = true
      state.progress.value = 0
      state.hits.value = []
      state.rows.value = []
      state.highlights.value = []
      invalidate()

      const handle = scanColourUsage(target, {
        root: doc,
        win,
        schedule,
        ...(options.skip ? { skip: options.skip } : {}),
        onProgress: (scanned, total) => {
          // مسحٌ أُجهض ثمّ بدأ آخر: تقدّم القديم لا يكتب فوق الجديد.
          if (mine !== generation) return
          state.progress.value = total > 0 ? scanned / total : 1
          invalidate()
        },
      })
      running = handle

      void handle.done.then((hits) => {
        if (mine !== generation) return
        state.hits.value = hits
        state.rows.value = rowsOf(hits)
        state.scanning.value = false
        state.progress.value = 1
        running = null
        invalidate()
      })
    },

    cancel() {
      running?.cancel()
      running = null
      // الإجهاض يُسلّم ما وُجد — فالحالة تُحسم في `then` لا هنا، وإلّا
      // ظهر «انتهى» قبل أن تصل النتيجة الجزئية.
    },

    highlightAll() {
      state.highlights.value = measure(state.hits.peek())
      invalidate()
    },

    clearHighlights() {
      if (state.highlights.peek().length === 0) return
      state.highlights.value = []
      invalidate()
    },

    replace(colour, replaceOptions = {}) {
      // استبدالٌ سابق يُتراجَع عنه أوّلًا: تراكمُ طبقتين يجعل «التراجع»
      // يكشف طبقةً لا الأصل.
      state.replaced.peek()?.revert()

      const variable = replaceOptions.variable
      if (variable) {
        state.replaced.value = replaceVariable(variable, colour, win)
        invalidate()
        return
      }

      const hits = state.hits.peek()
      if (hits.length === 0) return
      /*
       * **الخاصية من الإصابة نفسها لا افتراضًا.** عنصرٌ يستعمل اللون نصًّا
       * يجب أن يُستبدَل نصُّه لا خلفيته — وقائمة واحدة بخاصية واحدة كانت
       * ستطلي الخلفيات على عناصر لم تكن ملوّنة أصلًا.
       */
      const byProperty = new Map<string, Element[]>()
      for (const hit of hits) {
        for (const match of hit.matches) {
          const list = byProperty.get(match.property) ?? []
          list.push(hit.element)
          byProperty.set(match.property, list)
        }
      }
      const handles = [...byProperty].map(([property, els]) =>
        replaceOnElements(els, property, colour),
      )
      state.replaced.value = {
        scope: handles.length === 1 && hits.length === 1 ? 'element' : 'matches',
        revert: () => {
          for (const h of handles) h.revert()
        },
      }
      invalidate()
    },

    revert() {
      const handle = state.replaced.peek()
      if (!handle) return
      handle.revert()
      state.replaced.value = null
      invalidate()
    },

    reset() {
      running?.cancel()
      running = null
      generation++
      state.replaced.peek()?.revert()
      state.replaced.value = null
      state.hits.value = []
      state.rows.value = []
      state.highlights.value = []
      state.scanning.value = false
      state.progress.value = 0
      invalidate()
    },

    frame() {
      if (state.highlights.peek().length === 0) return
      state.highlights.value = measure(state.hits.peek())
    },

    dispose() {
      running?.cancel()
      running = null
      generation++
      // **التراجع عند التخلّص إلزامي**: الأداة تترك أثرًا في صفحة المستخدم،
      // ومغادرة الوضع بلا تراجع تترك صفحته مطليّة بلا سبيل إلى فهم لماذا.
      state.replaced.peek()?.revert()
      state.replaced.value = null
    },
  }
}
