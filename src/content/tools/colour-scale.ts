/**
 * أداة «توليد درجات اللون» — `colors / scale` (`125:355`)، `§6.12`.
 *
 * **حساب محض بلا شبكة ولا DOM**: `generateScale` في `modules/colour/scale.ts`
 * خوارزمية خالصة — لا `Worker` ولا رسالة خلفية هنا (خلافًا لـ`colour-palette.ts`
 * المجاورة)، لأن لا بكسل صفحة متورّطًا: المدخل لونٌ واحد مثبَّت بالفعل عند
 * المستدعي، والناتج حسابٌ فوري. فالأداة هنا شكلٌ توافقيّ مع أخواتها
 * (`open`/`close`/إشارات) لا ضرورة أداء.
 *
 * **الدرجات الأربع في الجدول ثابتة (300/500/700/900) — قرارٌ مقتبَس من
 * `ScalePanel.tsx` نفسها لا مكرَّر هنا اجتهادًا.** انظر ترويستها: «عيّنة
 * مقصودة، لا قصور في الإطار … يلزمها أن تنتمي لكلا مجموعتَي 9 و11».
 */

import { signal, type Signal } from '@preact/signals'

import { contrastRatio, formatRatio } from '@/modules/colour/contrast'
import { formatColour, readColour } from '@/modules/colour/formats'
import { generateScale, type ScaleStop } from '@/modules/colour/scale'

import type { ColourReading } from '@/modules/colour/formats'
import type { ScaleSampleRow, ScaleStepCount, ScaleStripStop } from '@/ui/overlay/colour/ScalePanel'

/** الدرجات الأربع الثابتة في جدول العيّنة — انظر ترويسة الملفّ. */
const SAMPLE_STEPS: readonly number[] = [300, 500, 700, 900]

const WHITE = { r: 255, g: 255, b: 255 }

export interface ColourScaleState {
  readonly open: Signal<boolean>
  readonly base: Signal<ColourReading | null>
  readonly steps: Signal<ScaleStepCount>
  readonly stops: Signal<readonly ScaleStop[]>
}

export interface ColourScaleOptions {
  onInvalidate?: () => void
}

export interface ColourScaleTool {
  readonly state: ColourScaleState
  /** يفتح اللوحة على لونٍ أساس ويحسب سلّمه فورًا. */
  open(base: ColourReading): void
  close(): void
  setSteps(steps: ScaleStepCount): void
  /** الشريط دومًا 50→950 (11 درجة) — `steps` تختار **عدد ما يُعرض** لا حساب `generateScale`. */
  readonly stripStops: () => readonly ScaleStripStop[]
  readonly sampleRows: () => readonly ScaleSampleRow[]
  dispose(): void
}

/**
 * درجات الشريط بعدد `steps` — 9 تُسقِط الطرفين `50`/`950` من الإحدى عشرة.
 *
 * `generateScale` تُرجع 11 درجة دومًا (‏`SCALE_STEPS` في `scale.ts` ثابتة)؛
 * تجزئة «٩/١١» في `ScalePanel` تختار **ما يُعرض** من ذلك السلّم الواحد، لا
 * حسابًا موازيًا — الدالّة نفسها لا مثيلها، بمرشِّح عرض فوقها.
 */
function stripFor(stops: readonly ScaleStop[], steps: ScaleStepCount): readonly ScaleStripStop[] {
  const source = steps === 9 ? stops.filter((s) => s.step !== 50 && s.step !== 950) : stops
  return source.map((s) => ({ step: s.step, hex: s.hex }))
}

function sampleFor(stops: readonly ScaleStop[]): readonly ScaleSampleRow[] {
  return SAMPLE_STEPS.map((step) => {
    const stop = stops.find((s) => s.step === step)
    // `SCALE_STEPS` تحوي 300/500/700/900 دومًا — غياب أحدها خطأ في
    // `scale.ts` لا حالة تُعالَج هنا بصمت.
    if (!stop) throw new Error(`الدرجة ${String(step)} غائبة عن السلّم المولَّد.`)
    const reading = readColour(stop.hex)
    if (!reading) throw new Error(`قيمة درجة غير صالحة: ${stop.hex}`)
    return {
      step: stop.step,
      hex: stop.hex,
      oklch: formatColour(reading).oklch,
      contrastRatio: formatRatio(contrastRatio(reading.rgb, WHITE)),
    }
  })
}

export function createColourScale(options: ColourScaleOptions = {}): ColourScaleTool {
  const invalidate = (): void => options.onInvalidate?.()

  const state: ColourScaleState = {
    open: signal(false),
    base: signal<ColourReading | null>(null),
    steps: signal<ScaleStepCount>(11),
    stops: signal<readonly ScaleStop[]>([]),
  }

  return {
    state,

    open(base) {
      state.base.value = base
      state.stops.value = generateScale(base)
      state.open.value = true
      invalidate()
    },

    close() {
      state.open.value = false
      invalidate()
    },

    setSteps(steps) {
      state.steps.value = steps
      invalidate()
    },

    stripStops: () => stripFor(state.stops.value, state.steps.value),
    sampleRows: () => sampleFor(state.stops.value),

    dispose() {
      state.open.value = false
    },
  }
}
