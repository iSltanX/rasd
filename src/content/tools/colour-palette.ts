/**
 * أداة «لوحة الصفحة» — `colors / palette-extract` (`122:157`)، `§6.1`–`§6.5`.
 *
 * **ناقلٌ لا مالك**، على نمط `colour-usage.ts` حرفيًّا: الاستخراج نفسه في
 * الخلفية (`palette/extract`، [ADR 0017](../../../Docs/ADR/0017-palette-extraction-host.md))،
 * وجمع الألوان المصرَّحة وتصنيفها منطقٌ خالص في `modules/colour/{usage,sources}.ts`
 * — وما هنا هو الوصل: متى يُستدعى كلٌّ منهما، وكيف تتحوّل الردود إلى ما
 * تعرضه `PalettePanel`.
 *
 * ## نطاق هذه الدفعة — مصدران من أربعة، بحدٍّ مُعلَن لا مسكوت
 *
 * `PalettePanel` تعرض تبويبات المصادر الأربعة كلّها (`§6.1`): الظاهر ·
 * عنصر · منطقة · من لقطة — وهذا صحيح، فحذف تبويب كـ«كل الصفحة» (فجوة عقد
 * `palette/extract` نفسها) لا يشابه هذه الحالة: العقد **يدعم** عنصرًا
 * ومنطقة (`{kind:'viewport', rect: DeviceRect}`) لو وصله مستطيل صحيح.
 * والناقص هنا فعليًّا هو **تفاعل** يُنتج ذلك المستطيل من نقرة أو سحب
 * المستخدم — لا العقد.
 *
 * وإنتاجه بأمانة يعني أحد مسارين: (أ) إعادة توجيه أداتَي `area`/`element`
 * القائمتين (المبنيّتين حصرًا لتغذية `runCaptureNow` عبر `onCommit` واحد
 * مربوط بوضعَي `area`/`element`)، وهو تغيير في مسار التقاطٍ حيّ ومحروس
 * (`verify:activate`/`verify:capture`) لغرض ثانٍ — خطر انحدار حقيقي على
 * مسار منتج أساسي؛ أو (ب) بناء ملتقِط مستقلّ ثانٍ (نقرة أو سحب) خاصّ
 * بهذه الأداة وحدها — وهو ازدواج واجهة تفاعلية كاملة (`AreaSelect.tsx`
 * ونظيرتها) لا وصلًا. كلا المسارين عملٌ معماري مستقلّ يستحقّ تصميمه
 * ومراجعته وقياسه بنفسه، لا أن يُبتسَر في نهاية دفعة.
 *
 * فبقي `element`/`region` **غير مسلوكين هذه الدفعة**، معلَنين بلا التباس
 * عبر `unavailable` (‏`PalettePanel` تعرض رسالة بدل شبكة فارغة تُقرأ
 * «استُخرجت فلم يوجد لون») — نفس سابقة «كل الصفحة» و«أعد فحص كل المقاسات»
 * في المرحلتين 14 و16: تبويبٌ يُعرض بحقّه الكامل (`§6.1` يسمّي الأربعة)،
 * ونتيجة اختياره صادقة لا صامتة ولا مزيَّفة.
 *
 * `readMethod: 'css'` مؤجَّلة بالمثل — لسببٍ مختلف: بطاقة النتيجة في
 * `PalettePanel` تعرض `formatPercent(s.share)` **بلا شرط** لكل عيّنة، وحصّة
 * بكسلات لا معنى لها لمصفوفة ألوان مصرَّحة (`collectDeclaredColours` تُفرِّد
 * بالقيمة لا بعدد التكرار — لا عدّ وراءها أصلًا). تلفيق `share: 0` لكل
 * مدخل كان يكتب في الواجهة رقمًا لا يسنده شيء؛ وتمثيلها بصريًّا بلا نسبة
 * يعني مسارًا مختلفًا في الشبكة نفسها — تصميمٌ مستقلّ لا وصلًا.
 * `readMethod` تُبلَّغ وتُخزَّن (يراها المستخدم مختارة) لكن الاستخراج الفعلي
 * يسلك `pixel` دومًا — وهو ما توثّقه `PalettePanel` أصلًا: «هذا **دائمًا**
 * ما يفعله محرّك `palette/extract`».
 *
 * **وما يعمل فعلًا هذه الدفعة يعمل كاملًا لا جزئيًّا**: المصدران المتبقّيان
 * (الظاهر · من لقطة) وعدد الألوان (بما فيها «مخصّص») وإخفاء الحياديات
 * وتصنيف الواجهة/الصورة — الأربعة الأخيرة معياريّ اكتمال §6 بأكمله عدا
 * المصدر، وكلّها مسلوكة بأثرٍ حقيقي مقيسًا حيًّا (`verify:palette`).
 */

import { signal, type Signal } from '@preact/signals'

import { readColour } from '@/modules/colour/formats'
import { classifyPaletteSources } from '@/modules/colour/sources'
import { collectDeclaredColours } from '@/modules/colour/usage'
import { send as realSend } from '@/shared/messaging'

import type { PaletteEntry } from '@/modules/colour/palette'
import type { PaletteSwatch } from '@/shared/messaging/contract'
import type {
  PaletteReadMethod,
  PaletteSourceKind,
  PaletteSwatchView,
} from '@/ui/overlay/colour/PalettePanel'

/** أعمّ محدَّد بينما «عنصر»/«منطقة» بلا ملتقِط بعد — انظر ترويسة الملفّ. */
const UNAVAILABLE_SOURCES: ReadonlySet<PaletteSourceKind> = new Set(['element', 'region'])

export interface ColourPaletteState {
  readonly open: Signal<boolean>
  readonly source: Signal<PaletteSourceKind>
  readonly count: Signal<number>
  readonly readMethod: Signal<PaletteReadMethod>
  readonly hideNeutrals: Signal<boolean>
  readonly separateSources: Signal<boolean>
  readonly swatches: Signal<readonly PaletteSwatchView[]>
  readonly extracting: Signal<boolean>
  readonly droppedNeutrals: Signal<number>
  /** انظر فقرة النطاق في ترويسة الملفّ — سببٌ صادق بدل شبكة فارغة. */
  readonly unavailable: Signal<string | null>
}

export interface ColourPaletteOptions {
  doc?: Document
  /** مضيف طبقتنا — يُستبعَد من جمع الألوان المصرَّحة فلا نُصنَّف نحن. */
  skip?: Element | null
  onInvalidate?: () => void
  /** مُحقَنة للاختبار — نفس نمط `win`/`schedule` في `colour-usage.ts` المجاورة. */
  send?: typeof realSend
}

export interface ColourPaletteTool {
  readonly state: ColourPaletteState
  open(): void
  close(): void
  setSource(source: PaletteSourceKind): void
  setCount(count: number): void
  setReadMethod(method: PaletteReadMethod): void
  setHideNeutrals(value: boolean): void
  setSeparateSources(value: boolean): void
  dispose(): void
}

export function createColourPalette(options: ColourPaletteOptions = {}): ColourPaletteTool {
  const doc = options.doc ?? document
  const win = doc.defaultView ?? globalThis.window
  const send = options.send ?? realSend
  const invalidate = (): void => options.onInvalidate?.()

  const state: ColourPaletteState = {
    open: signal(false),
    source: signal<PaletteSourceKind>('viewport'),
    count: signal(8),
    readMethod: signal<PaletteReadMethod>('pixel'),
    hideNeutrals: signal(false),
    separateSources: signal(false),
    swatches: signal<readonly PaletteSwatchView[]>([]),
    extracting: signal(false),
    droppedNeutrals: signal(0),
    unavailable: signal<string | null>(null),
  }

  let generation = 0
  let declaredCancel: (() => void) | null = null

  /**
   * يصنّف مصفوفة مستخرَجة بألوان الصفحة المصرَّحة — نداءٌ واحد للمصفوفة
   * كاملةً (توثيق `classifyPaletteSources` نفسه: O(عيّنات×مصرَّح)، لا لكل
   * عيّنة على حدة).
   */
  const classify = async (
    swatches: readonly PaletteSwatch[],
  ): Promise<readonly PaletteSwatchView[]> => {
    declaredCancel?.()
    const handle = collectDeclaredColours({ root: doc, win, skip: options.skip ?? null })
    declaredCancel = () => {
      handle.cancel()
    }
    const declared = await handle.done
    declaredCancel = null

    const entries: PaletteEntry[] = swatches.map((s) => {
      const colour = readColour(s.hex)
      // `s.hex` من `formatColour().hex` داخل `palette.ts` دومًا (نفس ضمان
      // `readSwatch` في `export.ts`) — الإخفاق هنا خطأ بيانات لا مدخل مستخدم.
      if (!colour) throw new Error(`قيمة لوحة غير صالحة: ${s.hex}`)
      return { colour, count: s.count, share: s.share, neutral: s.neutral }
    })
    const classified = classifyPaletteSources(entries, declared)
    return classified.map((c, i) => ({
      hex: swatches[i]!.hex,
      share: c.share,
      count: c.count,
      neutral: c.neutral,
      source: c.source,
    }))
  }

  const withoutClassification = (
    swatches: readonly PaletteSwatch[],
  ): readonly PaletteSwatchView[] => swatches.map((s) => ({ ...s, source: null }))

  /**
   * الاستخراج نفسه — يُعاد استدعاؤه من كل مُعدِّل (`setSource`/`setCount`/…)
   * لا من زرّ صريح: `PalettePanel` تفاعليّة بلا زرّ «استخرج» (لا `onExtract`
   * في عقدها)، فالتحكّمات نفسها هي الفعل.
   */
  const extract = (): void => {
    const source = state.source.peek()
    const mine = ++generation

    if (UNAVAILABLE_SOURCES.has(source)) {
      state.unavailable.value =
        source === 'element'
          ? 'الاستخراج من عنصر غير متاح بعد في هذه الدفعة.'
          : 'الاستخراج من منطقة غير متاح بعد في هذه الدفعة.'
      state.swatches.value = []
      state.extracting.value = false
      state.droppedNeutrals.value = 0
      invalidate()
      return
    }

    state.unavailable.value = null
    state.extracting.value = true
    state.swatches.value = []
    invalidate()

    void (async () => {
      const count = state.count.peek()
      const dropNeutrals = state.hideNeutrals.peek()
      const reply = await send('palette/extract', {
        source: { kind: 'viewport', rect: null },
        count,
        dropNeutrals,
      })
      if (mine !== generation) return // مُعدِّلٌ لاحق أُلغيت نتيجته — لا يُكتَب فوق الجديد.

      if (!reply.ok) {
        state.extracting.value = false
        state.unavailable.value = `تعذّر الاستخراج: ${reply.error.message}`
        invalidate()
        return
      }

      const { swatches, droppedNeutrals } = reply.value
      const views = state.separateSources.peek()
        ? await classify(swatches)
        : withoutClassification(swatches)
      if (mine !== generation) return

      state.swatches.value = views
      state.droppedNeutrals.value = droppedNeutrals
      state.extracting.value = false
      invalidate()
    })()
  }

  return {
    state,

    open() {
      state.open.value = true
      extract()
    },

    close() {
      state.open.value = false
      declaredCancel?.()
      declaredCancel = null
      generation++
    },

    setSource(source) {
      state.source.value = source
      extract()
    },

    setCount(count) {
      state.count.value = count
      extract()
    },

    setReadMethod(method) {
      // مُخزَّنة ومعروضة فقط — الاستخراج يسلك `pixel` دومًا هذه الدفعة،
      // انظر فقرة `readMethod: 'css'` في ترويسة الملفّ.
      state.readMethod.value = method
    },

    setHideNeutrals(value) {
      state.hideNeutrals.value = value
      extract()
    },

    setSeparateSources(value) {
      state.separateSources.value = value
      // لا إعادة التقاط — التصنيف يُعاد حساب فقط على ما استُخرج بالفعل.
      const current = state.swatches.peek()
      if (current.length === 0) return
      const mine = ++generation
      const raw: readonly PaletteSwatch[] = current.map(({ source: _s, ...rest }) => rest)
      void (async () => {
        const views = value ? await classify(raw) : withoutClassification(raw)
        if (mine !== generation) return
        state.swatches.value = views
        invalidate()
      })()
    },

    dispose() {
      generation++
      declaredCancel?.()
      declaredCancel = null
    },
  }
}
