/**
 * أداة اللون — بكسل حقيقي تحت المؤشِّر، وما تقوله الأنماط عنه، معًا.
 *
 * **المصدران لا مصدر واحد، وهذا نصّ `Rasd_Ar.md §6.4` لا اجتهاد.** البكسل
 * من اللقطة يعطي ما **يُرى**: الصورة والتدرّج والشفافية المركَّبة و
 * `mix-blend-mode` وكل ما لا تعرفه `getComputedStyle`. والقيمة المصرَّحة
 * تعطي ما **كُتب**: اسم الخاصّية والمتغيّر وموضع تعريفه. والفرق بينهما هو
 * المعلومة نفسها في أكثر الحالات إفادةً — «كتبتُ `#3b82f6` وأرى `#5b95f8`»
 * جوابه دائمًا طبقة أو مزج أو شفافية.
 *
 * **بنية القرار مطابقة لـ`measure.ts` و`element-hover.ts`**: مسار بارد عند
 * تغيّر الهدف، ومسار ساخن كل إطار، وحالة ساخنة في متغيّرات عادية لا في
 * إشارات — كتابة الإشارة تُخطر كل مشترك، وهذا يقع ستّين مرّة في الثانية.
 *
 * **والتحليل الثقيل لا يجري مع الحركة.** الصيغ الخمس واسم Tailwind وفحص
 * التباين وتتبّع المتغيّر: كلّها تُحسب عند **التثبيت بنقرة** فقط. أمّا
 * الحركة فتقرأ بكسلات من لقطة مفكوكة سلفًا (2.25µs للرقعة كاملة) وتكتب
 * إشارة واحدة.
 */

import { signal, type Signal } from '@preact/signals'

import { resolveBackground, type BackgroundWalk } from '@/modules/colour/background'
import { checkPair, type ContrastCheck, type ContrastPair } from '@/modules/colour/contrast'
import {
  formatColour,
  fromPixel,
  readColour,
  type ColourFormats,
  type ColourReading,
} from '@/modules/colour/formats'
import { tailwindNaming, type TailwindNaming } from '@/modules/colour/tailwind'
import { pickAt } from '@/modules/dom-picker/hit-test'
import { buildSelector, shortLabel, type SelectorResult } from '@/modules/dom-picker/selector'
import { traceVariable, type VarTrace } from '@/modules/var-trace/declaration'
import { viewportPoint, type ViewportPoint } from '@/shared/geometry'

import { firstVarName, type CssResolver } from '../css-resolver'
import { createSampler, LOUPE_CELLS, type Pixel, type Sampler } from '../sampler'

import type { SyncReason } from '../sync'
import type { WinningRule } from '@/modules/computed-style/cascade'

/** خصائص اللون التي تُقرأ من العنصر تحت المؤشِّر — ترتيب العرض. */
export const COLOUR_PROPS = [
  'color',
  'background-color',
  'border-block-start-color',
  'outline-color',
  'fill',
  'stroke',
] as const

export type ColourProp = (typeof COLOUR_PROPS)[number]

/** قيمة لون مصرَّحة على العنصر، مع متغيّرها إن وُجد. */
export interface DeclaredColour {
  readonly prop: ColourProp
  readonly computed: string
  readonly reading: ColourReading
  /** تتبّع المتغيّر — `null` حين لا `var()` في التصريح. */
  readonly trace: VarTrace | null
}

/** ما يُعرض أثناء الحركة — رخيص، يُكتب كل إطار. */
export interface LiveSample {
  readonly point: ViewportPoint
  /** البكسل المركزي — قد يكون `null` قبل وصول أوّل لقطة. */
  readonly pixel: Pixel | null
  /** رقعة العدسة `LOUPE_CELLS²`، بترتيب الصفوف. */
  readonly patch: readonly Pixel[] | null
}

/** ما يُعرض بعد النقر — الغالي، يُحسب مرّة. */
export interface PinnedColour {
  readonly point: ViewportPoint
  /**
   * من أين جاءت القيمة المعروضة.
   *
   * `pixel` هو الافتراض: ما يُرى فعلًا. و`css` يأتي بـ`⌥`+نقرة، ويعرض
   * **القيمة المصرَّحة** بدلها — وهي مختلفة كلّما كان فوق العنصر طبقة أو
   * شفافية أو مزج. والحقل يُحفظ مع اللون في المكتبة (`ColorSource`)، فمن
   * يعود إليه بعد شهر يعرف أيّهما كان.
   */
  readonly source: 'pixel' | 'css'
  /** اللون المعروض — من البكسل أو من التصريح بحسب `source`. */
  readonly reading: ColourReading
  /** لون البكسل دائمًا، حتى في وضع `css` — للمقارنة بين المصدرين. */
  readonly pixelReading: ColourReading
  readonly formats: ColourFormats
  readonly tailwind: TailwindNaming
  /** العنصر تحت النقطة — `null` حين لا عنصر (نُقر على فراغ). */
  readonly element: Element | null
  readonly selector: SelectorResult | null
  readonly label: string | null
  /** ما تصرّح به الأنماط عن هذا العنصر — قد يخالف `reading`. */
  readonly declared: readonly DeclaredColour[]
  /** الخلفية الفعلية خلف العنصر، مركَّبة صعودًا. */
  readonly background: BackgroundWalk | null
  /** فحص التباين بين النصّ وخلفيته — `null` حين لا عنصر. */
  readonly contrast: ContrastCheck | null
  /**
   * البكسل يخالف ما صرّحت به `background-color` أو `color`.
   *
   * ليس خطأً بل **المعلومة**: طبقة فوقه، أو شفافية، أو مزج، أو صورة.
   */
  readonly mismatch: boolean
}

export interface ColourState {
  readonly live: Signal<LiveSample | null>
  readonly pinned: Signal<PinnedColour | null>
  /** اللقطة قيد الالتقاط الآن — العدسة تعرض حالة انتظار لا لونًا كاذبًا. */
  readonly loading: Signal<boolean>
  /** خطأ الالتقاط إن وقع — يُعرض ولا يُبتلع. */
  readonly error: Signal<string | null>
}

export interface EyedropperOptions {
  doc?: Document
  /** مضيف طبقتنا — يُستبعَد من كل اختبار إصابة، كما في كل أداة تفاعلية. */
  skip?: Element | null
  onInvalidate?: () => void
  /** يُبلَّغ عند تثبيت لون أو مسحه — لتغذية اللوحة والمكتبة. */
  onPin?: (pinned: PinnedColour | null) => void
  /**
   * حلّال التتالي المشترك — من `content/index.ts`.
   *
   * بدونه تعمل الأداة كاملةً عدا **اسم المتغيّر**: لا يُخمَّن ولا يُختلق.
   */
  resolver?: CssResolver
  /** يُستدعى بحقن `Sampler` بديل في الاختبار. */
  sampler?: Sampler
}

export interface EyedropperTool {
  readonly state: ColourState
  onPointerMove(event: PointerEvent): void
  /** `event.altKey` يبدّل المصدر إلى القيمة المصرَّحة — انظر `PinnedColour.source`. */
  onPointerUp(event: PointerEvent): void
  /** يمسح التثبيت ويعود إلى التتبّع الحيّ. */
  clear(): void
  frame(reasons: ReadonlySet<SyncReason>): void
  reset(): void
  dispose(): void
}

/**
 * هل الفرق بين لونين يُرى؟ — بايت واحد على أي قناة.
 *
 * ليست عتبة إدراكية بل عتبة **تمثيل**: ما دون البايت لا وجود له في مخرَج
 * ثمانيّ البتّات أصلًا، فالفرق الحقيقي يبدأ عنده.
 */
function differs(a: ColourReading, b: ColourReading): boolean {
  return a.rgb.r !== b.rgb.r || a.rgb.g !== b.rgb.g || a.rgb.b !== b.rgb.b
}

/**
 * قراءة الخصائص اللونية المصرَّحة، مع تتبّع متغيّراتها.
 *
 * **التتبّع يبدأ من اسم المتغيّر لا من اسم الخاصّية.** `traceVariable`
 * يأخذ `--brand` لا `background-color`، والاسم لا يُعرَف إلّا من **القيمة
 * المصرَّحة** في القاعدة الفائزة — و`getComputedStyle` تُرجع القيمة
 * **المحسوبة** وقد ذابت فيها كل `var()`. ولذلك يلزم حلّ التتالي، وهو ما
 * تفعله المرحلة 11 بالضبط. (أوّل تشغيل لـ`verify-colour.mjs` مرّر اسم
 * الخاصّية فأعاد `varName: 'background-color'` — سلسلةً لمتغيّر لا وجود له.)
 *
 * وبلا حلّال لا تتبّع: القيم والألوان تُقرأ كاملة، ويبقى حقل المتغيّر
 * `null` — نقصُ معلومةٍ معلَن، لا قيمة مخترَعة.
 */
function readDeclared(el: Element, win: Window, resolver: CssResolver | null): DeclaredColour[] {
  const cs = win.getComputedStyle(el)
  const out: DeclaredColour[] = []

  let rules: ReadonlyMap<string, WinningRule | null> | null = null
  if (resolver) {
    try {
      rules = resolver.resolve(el, [...COLOUR_PROPS])
    } catch {
      // حلّ التتالي يقرأ أوراق الأنماط، وقد ترمي ورقة عابرة للأصل.
      rules = null
    }
  }

  for (const prop of COLOUR_PROPS) {
    const computed = cs.getPropertyValue(prop).trim()
    if (!computed) continue
    const reading = readColour(computed)
    // `fill: none` و`stroke: none` قيمتان شائعتان لا لونان — تُتخطّى بلا
    // ضجيج، وهي الحالة العادية على كل عنصر غير SVG.
    if (!reading) continue
    // خلفية شفّافة تمامًا ليست معلومة: هي «لا خلفية هنا» لا لونًا مصرَّحًا.
    if (prop === 'background-color' && reading.alpha === 0) continue

    let trace: VarTrace | null = null
    const declared = rules?.get(prop)?.declared
    const name = declared ? firstVarName(declared) : null
    if (name && resolver) {
      try {
        trace = traceVariable(el, name, {
          win,
          index: resolver.ensureIndex(),
          ctx: resolver.ctx(),
          blocked: resolver.blocked,
        })
      } catch {
        trace = null
      }
    }

    out.push({ prop, computed, reading, trace: trace?.chain.length ? trace : null })
  }

  return out
}

/** الزوج المفحوص: نصّ العنصر على خلفيته الفعلية. */
const PAIR: ContrastPair = 'text-on-background'

export function createEyedropper(options: EyedropperOptions = {}): EyedropperTool {
  const doc = options.doc ?? document
  const win = doc.defaultView ?? globalThis.window

  const state: ColourState = {
    live: signal<LiveSample | null>(null),
    pinned: signal<PinnedColour | null>(null),
    loading: signal(false),
    error: signal<string | null>(null),
  }

  const sampler = options.sampler ?? createSampler({ win })

  // حالة ساخنة خارج الإشارات — السبب نفسه المكتوب في `measure.ts`.
  let px = -1
  let py = -1
  let pointerDirty = false
  let disposed = false

  /** التقاط لقطة جديدة، ثم رسم إطار بها. */
  const capture = async (): Promise<void> => {
    if (disposed) return
    state.loading.value = true
    const result = await sampler.refresh()
    if (disposed) return
    state.loading.value = false
    if (result.ok) {
      state.error.value = null
      pointerDirty = true
      options.onInvalidate?.()
    } else if (result.error.code !== 'cancelled') {
      state.error.value = result.error.message
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (event.clientX === px && event.clientY === py) return
    px = event.clientX
    py = event.clientY
    pointerDirty = true
    options.onInvalidate?.()
  }

  /**
   * التثبيت عند **الإفلات** لا عند الضغط.
   *
   * السابقة نفسها المسجَّلة في `inspect.ts`: الضغط قد يكون بداية سحب أو
   * تمرير بالمؤشِّر، والإفلات وحده نيّة مؤكَّدة.
   */
  const onPointerUp = (event: PointerEvent): void => {
    const point = viewportPoint(event.clientX, event.clientY)
    const pixel = sampler.pixelAt(point.x, point.y)

    // بلا بكسل لا تثبيت: لقطة لم تصل بعد، أو نقطة خارج حدود الصورة. وادّعاء
    // لون في هذه الحالة هو بالضبط ما بُنيت الأداة لتجنّبه.
    if (!pixel) return

    const pixelReading = fromPixel(pixel.r, pixel.g, pixel.b, pixel.a)
    const hit = pickAt(doc, point.x, point.y, options.skip)
    const el = hit?.el ?? null

    const declared = el ? readDeclared(el, win, options.resolver ?? null) : []
    const background = el ? resolveBackground(el, win) : null

    const textColour = declared.find((d) => d.prop === 'color')

    /*
     * `⌥` يبدّل المصدر إلى التصريح — تلميح `98:484` في الملفّ.
     *
     * والأولوية للخلفية على النصّ للسبب نفسه المكتوب في `colour-view.ts`:
     * المؤشِّر على مساحة لا على حرف في الغالب. وحين لا تصريح أصلًا يبقى
     * البكسل — لا يُلغى التثبيت ولا يُرجَع لون فارغ.
     */
    const fromCss = event.altKey
    const cssPick = declared.find((d) => d.prop === 'background-color') ?? textColour ?? declared[0]
    const useCss = fromCss && !!cssPick
    const reading = useCss ? cssPick.reading : pixelReading
    const contrast =
      textColour && background
        ? checkPair(PAIR, textColour.reading.rgb, background.colour.rgb)
        : null

    /*
     * المقارنة تقع مع أقرب تصريح **يفسِّر** البكسل: `background-color` إن
     * كانت معتمة، وإلّا `color`. ومقارنة البكسل بكل تصريح على العنصر تعطي
     * «اختلافًا» دائمًا وهو ضجيج: عنصر واحد يحمل لونَ نصٍّ ولونَ خلفية،
     * والبكسل لا يمكن أن يساويهما معًا.
     */
    const explains =
      declared.find((d) => d.prop === 'background-color' && d.reading.alpha >= 1) ?? textColour
    // المقارنة على **البكسل** دائمًا لا على المعروض: في وضع `css` يكون
    // المعروض هو التصريح نفسه، فمقارنته بذاته تعطي «لا اختلاف» أبدًا —
    // وهو أسوأ وقت لإخفاء الاختلاف، إذ صار المستخدم يرى التصريح لا ما يُرسَم.
    const mismatch = explains ? differs(pixelReading, explains.reading) : false

    const pinned: PinnedColour = {
      point,
      source: useCss ? 'css' : 'pixel',
      reading,
      pixelReading,
      formats: formatColour(reading),
      tailwind: tailwindNaming(reading),
      element: el,
      selector: el ? buildSelector(el) : null,
      label: el ? shortLabel(el) : null,
      declared,
      background,
      contrast,
      mismatch,
    }

    state.pinned.value = pinned
    options.onPin?.(pinned)
    options.onInvalidate?.()
  }

  /** المسار الساخن — قراءة بكسلات فقط، بلا لمس DOM ولا تخطيط. */
  const frame = (reasons: ReadonlySet<SyncReason>): void => {
    /*
     * التمرير وتغيّر المقاس وتغيّر كثافة البكسل: كلّها تُبطل اللقطة.
     *
     * والإبطال رخيص (راية)، وإعادة الالتقاط غالية (234–351ms مقيسة) —
     * فتُطلَب مرّة واحدة عند أوّل إطار يكتشف القِدَم، لا مع كل حدث تمرير.
     */
    if (reasons.has('scroll') || reasons.has('resize') || reasons.has('dpr')) {
      sampler.invalidate()
    }

    if (sampler.stale && !state.loading.peek()) {
      void capture()
      return
    }

    if (!pointerDirty || px < 0) return
    pointerDirty = false

    state.live.value = {
      point: viewportPoint(px, py),
      pixel: sampler.pixelAt(px, py),
      patch: sampler.patchAt(px, py, LOUPE_CELLS),
    }
  }

  const clear = (): void => {
    state.pinned.value = null
    options.onPin?.(null)
  }

  const reset = (): void => {
    px = -1
    py = -1
    pointerDirty = false
    state.live.value = null
    state.pinned.value = null
    state.error.value = null
    // اللقطة تُبطَل ولا تُحرَّر: العودة إلى الوضع تحتاجها فورًا، والالتقاط
    // محدود بنداءين في الثانية فإعادةُ ما لم يتغيّر إهدارٌ لهذا الحدّ.
    sampler.invalidate()
  }

  return {
    state,
    onPointerMove,
    onPointerUp,
    clear,
    frame,
    reset,
    dispose() {
      disposed = true
      sampler.dispose()
    },
  }
}
