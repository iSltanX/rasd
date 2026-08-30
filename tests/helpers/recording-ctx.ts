import type { Ctx2D } from '@/modules/editor/renderer'

/**
 * سياق رسم يسجّل النداءات بدل أن يرسم.
 *
 * **هذا ما تشتريه واجهة `Ctx2D`.** بيئة الاختبار تُرجع `null` من
 * `getContext('2d')` لكل من `<canvas>` و`OffscreenCanvas` بالقياس — فبلا
 * هذا المسجِّل يبقى منطق الرسم كلّه خارج التغطية، ولا يُكتشف خطؤه إلّا
 * بالنظر إلى شاشة.
 *
 * ومعه تصير أسئلة من قبيل «هل رُسم الحجب بعد الملاحظة؟» و«هل ضُبطت
 * `filter` مرّة واحدة على غير `none`؟» أسئلةً يُجاب عنها في اختبار وحدة.
 */

export interface Call {
  readonly name: string
  readonly args: readonly unknown[]
}

export interface RecordingCtx extends Ctx2D {
  readonly calls: readonly Call[]
  /** أسماء النداءات بالترتيب — للمقارنة السريعة. */
  names(): readonly string[]
  /** كل قيمة أُسنِدت إلى خاصّية، بالترتيب. */
  assigned(prop: string): readonly unknown[]
  reset(): void
}

const METHODS = [
  'save',
  'restore',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'quadraticCurveTo',
  'bezierCurveTo',
  'arc',
  'ellipse',
  'rect',
  'roundRect',
  'clip',
  'fill',
  'stroke',
  'clearRect',
  'fillRect',
  'translate',
  'rotate',
  'scale',
  'setTransform',
  'setLineDash',
  'fillText',
  'strokeText',
  'drawImage',
] as const

const PROPS = [
  'fillStyle',
  'strokeStyle',
  'lineWidth',
  'lineCap',
  'lineJoin',
  'lineDashOffset',
  'globalAlpha',
  'globalCompositeOperation',
  'shadowColor',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
  'font',
  'direction',
  'textAlign',
  'textBaseline',
  'letterSpacing',
  'filter',
  'imageSmoothingEnabled',
] as const

/**
 * `measureText` مُحقَن.
 *
 * القياس الحقيقي يحتاج محرّك خطوط؛ والافتراضي هنا تقريبٌ خطّي كافٍ لاختبار
 * **منطق** اللفّ (متى يُقطع السطر) لا **دقّة** القياس — وتلك تُقاس حيًّا.
 */
export interface RecordingOptions {
  readonly measure?: (text: string) => number
  readonly fontHeight?: number
}

export function createRecordingCtx(options: RecordingOptions = {}): RecordingCtx {
  const calls: Call[] = []
  const assignments = new Map<string, unknown[]>()
  const measure = options.measure ?? ((t: string) => t.length * 8)
  const height = options.fontHeight ?? 23

  const target: Record<string, unknown> = {
    calls,
    names: () => calls.map((c) => c.name),
    assigned: (prop: string) => assignments.get(prop) ?? [],
    reset: () => {
      calls.length = 0
      assignments.clear()
    },
    measureText: (t: string) =>
      ({
        width: measure(t),
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: measure(t),
        actualBoundingBoxAscent: height * 0.8,
        actualBoundingBoxDescent: height * 0.2,
        fontBoundingBoxAscent: height * 0.8,
        fontBoundingBoxDescent: height * 0.2,
        emHeightAscent: height * 0.8,
        emHeightDescent: height * 0.2,
        hangingBaseline: 0,
        alphabeticBaseline: 0,
        ideographicBaseline: 0,
      }) as TextMetrics,
  }

  for (const name of METHODS) {
    target[name] = (...args: unknown[]) => {
      calls.push({ name, args })
    }
  }

  for (const prop of PROPS) {
    let value: unknown = prop === 'filter' ? 'none' : ''
    Object.defineProperty(target, prop, {
      get: () => value,
      set: (next: unknown) => {
        value = next
        const list = assignments.get(prop) ?? []
        list.push(next)
        assignments.set(prop, list)
      },
      enumerable: true,
      configurable: true,
    })
  }

  return target as unknown as RecordingCtx
}
