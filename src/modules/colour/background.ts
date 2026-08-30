/**
 * الخلفية الفعلية خلف عنصر — بالصعود في الشجرة وتركيب ما يُصادَف.
 *
 * **المسألة ليست «اقرأ `background-color`».** `getComputedStyle` يُرجع
 * `rgba(0, 0, 0, 0)` لأغلب العناصر، وهي **ليست** خلفية شفّافة بل «لا خلفية
 * مُصرَّح بها هنا». واللون الذي يراه المستخدم خلف نصّ قد يكون على جدٍّ
 * يبعد ستّ درجات، وقد يكون مركّبًا من طبقتين شبه شفّافتين لا يساوي أيًّا
 * منهما. وفحص التباين (`Rasd_Ar.md §6.13`) بلا هذا يقارن النصّ بالعدم.
 *
 * **يلمس DOM ولا يستورد طبقة تشغيل** — القاعدة نفسها المكتوبة في
 * `dom-picker/inspect.ts`: `modules/` تمنع الاستيراد من `content/` و`ui/`،
 * لا استعمال واجهات المتصفّح القياسية. وكل دالّة تأخذ عنصرها صراحةً فلا
 * تقرأ حالة عامّة.
 *
 * **حدّ معلَن**: الصعود يقرأ `background-color` وحدها. صورة خلفية أو تدرّج
 * أو `backdrop-filter` أو `mix-blend-mode` على جدّ **لا تُحسَب** — ولا
 * تُقرَّر هنا أصلًا: مسار البكسل من اللقطة هو الذي يراها، وهو الحَكَم عند
 * الاختلاف. لذلك تُرجَع `sawImage` صراحةً كي تعلن اللوحة أن القيمة تقريب.
 */

import { flatten, layerOf, type Layer } from './composite'
import { readColour, type ColourReading } from './formats'

/** أب في الشجرة **المركَّبة** — يعبر حدّ الظلّ لا يقف عنده. */
function composedParent(el: Element): Element | null {
  const parent = el.parentElement
  if (parent) return parent
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

/** هل لهذه القيمة صورة أو تدرّج؟ `none` وحدها تعني «لا شيء». */
function hasImage(value: string): boolean {
  const v = value.trim()
  return v !== '' && v !== 'none'
}

export interface BackgroundWalk {
  /** اللون المركَّب النهائي — معتم دائمًا، صالح لفحص التباين. */
  readonly colour: ColourReading
  /** العناصر التي أسهمت بطبقة، من الأقرب إلى الأبعد. */
  readonly contributors: readonly Element[]
  /**
   * لم تُغلَق السلسلة بطبقة معتمة، فأُضيف الأبيض افتراضًا.
   *
   * هذا هو سلوك المتصفّح نفسه (يرسم على سطحه الأبيض)، ونصّ WCAG صريح:
   * «If no background color is specified, then white is assumed». لكنه
   * **افتراض** يُعلَن لا قراءة تُدَّعى.
   */
  readonly assumedWhite: boolean
  /**
   * صُودفت صورة أو تدرّج في الطريق.
   *
   * القيمة المُرجَعة حينئذٍ **تقريب**: الصعود يقرأ ألوانًا لا بكسلات.
   * اللوحة تعرض عندها لون البكسل من اللقطة بوصفه الحقيقة، وهذه بوصفها
   * التصريح — وهو بالضبط «المصدران معًا» في صدر `§6`.
   */
  readonly sawImage: boolean
  /** بلغ الصعود حدّه دون أن يجد معتمًا — حماية من شجرة عميقة مرضية. */
  readonly truncated: boolean
}

/**
 * أقصى عمق صعود.
 *
 * سخيّ جدًّا مقابل أي شجرة حقيقية (أعمق صفحات جُرِّبت في المرحلة 11 لم
 * تتجاوز ~40)، وموجود لأن الحلقة تجري تحت المؤشِّر: شجرة مرضية أو حلقة في
 * `getRootNode` لا يجوز أن تعلّق الصفحة.
 */
export const MAX_BACKGROUND_DEPTH = 64

/**
 * يجمع طبقات الخلفية صعودًا ثم يركّبها.
 *
 * **يتوقّف عند أوّل معتم** — ما خلفه لا يُرى فلا يُقرأ. والترتيب المُمرَّر
 * إلى `flatten` من الأبعد إلى الأقرب، وهو ترتيب الرسم الفعلي.
 */
export function resolveBackground(el: Element, win: Window = globalThis.window): BackgroundWalk {
  /** الأقرب أوّلًا أثناء الجمع؛ يُعكَس قبل التركيب. */
  const near: Layer[] = []
  const contributors: Element[] = []
  let sawImage = false
  let closed = false

  let node: Element | null = el
  let depth = 0

  while (node && depth++ < MAX_BACKGROUND_DEPTH) {
    const cs = win.getComputedStyle(node)

    if (hasImage(cs.backgroundImage)) sawImage = true

    const reading = readColour(cs.backgroundColor)
    if (reading && reading.alpha > 0) {
      near.push(layerOf(reading))
      contributors.push(node)
      if (reading.alpha >= 1) {
        closed = true
        break
      }
    }

    node = composedParent(node)
  }

  const flat = flatten([...near].reverse())

  return {
    colour: flat.colour,
    contributors,
    assumedWhite: flat.assumedWhite,
    sawImage,
    truncated: !closed && depth >= MAX_BACKGROUND_DEPTH,
  }
}
