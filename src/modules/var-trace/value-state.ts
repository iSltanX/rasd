/**
 * حالة متغيّر CSS — أربع حالات لا اثنتان.
 *
 * `getPropertyValue('--x')` يُرجع `""` لثلاث حالات مختلفة تمامًا: متغيّر
 * غير معرَّف، ومتغيّر معرَّف بقيمة فارغة، ومتغيّر قيمته باطلة (دورة أو
 * إشارة إلى غير معرَّف). وخلطها يجعل الفاحص يقول «لا متغيّر» حيث يوجد
 * واحد — وهو كذبٌ في قلب أهمّ ميزة تميّز.
 *
 * **التفريق يأتي من `computedStyleMap()` وحدها**، وقِيس كالتالي:
 *
 * | الاسم | `getPropertyValue` | `csm.has` | في تعداد `gcs` | الحالة |
 * |---|---|---|---|---|
 * | `--empty: ;` | `""` | **true** | true | `empty` |
 * | دورة | `""` | false | **true** | `invalid` |
 * | يشير إلى غير معرَّف | `""` | false | true | `invalid` |
 * | `--ok: 12px` | `"12px"` | true | true | `value` |
 * | غير معرَّف أصلًا | `""` | false | **false** | `undefined` |
 *
 * وقِيس أن `gcs.length = 505` مقابل `csm.size = 500` على العيّنة نفسها،
 * والفارق **خمسة بالضبط** هو مجموعة الأسماء الباطلة.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

export type VarState =
  /** قيمة فعلية. */
  | 'value'
  /** معرَّف بقيمة فارغة — `--x: ;` */
  | 'empty'
  /** معرَّف بقيمة لا تُحسَب: دورة، أو إشارة إلى غير معرَّف. */
  | 'invalid'
  /** غير معرَّف أصلًا. */
  | 'undefined'

export interface VarValue {
  readonly state: VarState
  readonly value: string
}

interface StyleMapLike {
  has(name: string): boolean
}

function styleMapOf(el: Element): StyleMapLike | null {
  const fn = (el as unknown as { computedStyleMap?: () => StyleMapLike }).computedStyleMap
  if (typeof fn !== 'function') return null
  try {
    return fn.call(el)
  } catch {
    return null
  }
}

/** هل يظهر الاسم في تعداد الأنماط المحسوبة؟ */
function isEnumerated(cs: CSSStyleDeclaration, name: string): boolean {
  for (let i = 0; i < cs.length; i++) if (cs.item(i) === name) return true
  return false
}

/**
 * يقرأ متغيّرًا ويصنّف حالته.
 *
 * بلا `computedStyleMap` (بيئة اختبار قديمة) يتدهور التصنيف إلى ثلاث
 * حالات: القيمة تُميَّز، والباطل يُخلط بالفارغ. والتدهور مُعلَن لا صامت.
 */
export function readVar(el: Element, name: string, win: Window = window): VarValue {
  const cs = win.getComputedStyle(el)
  const value = cs.getPropertyValue(name)

  if (value !== '') return { state: 'value', value }

  const enumerated = isEnumerated(cs, name)
  if (!enumerated) return { state: 'undefined', value: '' }

  const map = styleMapOf(el)
  if (!map) return { state: 'empty', value: '' }

  return map.has(name) ? { state: 'empty', value: '' } : { state: 'invalid', value: '' }
}

/**
 * هل يُستعمل الاحتياطي في `var(--x, احتياطي)`؟
 *
 * قِيس أن الاحتياطي يُستعمل حين يكون المتغيّر **غير معرَّف** أو **باطلًا**،
 * ولا يُستعمل حين يكون **معرَّفًا بقيمة فارغة** — وهي الحالة التي تخدع
 * القارئ: القيمة فارغة والاحتياطي لم يُستعمل.
 */
export function usesFallback(v: VarValue): boolean {
  return v.state === 'undefined' || v.state === 'invalid'
}

/**
 * الأب في الشجرة **المركَّبة** لا الفاتحة.
 *
 * المتغيّرات موروثة، والوراثة تعبر حدّ الظلّ من المضيف إلى جذره. فالصعود
 * بـ`parentElement` وحده يتوقّف عند أوّل جذر ظلّ فيفقد التعريف الحقيقي.
 */
export function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement
  const root = el.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

/**
 * كل أسماء المتغيّرات المرئية على العنصر.
 *
 * **تعبر الأوراق المحجوبة**: قِيس أن ورقة من أصل آخر ترمي `SecurityError`
 * عند قراءة قواعدها، ومع ذلك يعدّد `getComputedStyle` متغيّراتها بأسمائها
 * وقيمها. فالاسم والقيمة ينجوان، والضائع هو **مكان التعريف** وحده.
 */
export function customNames(el: Element, win: Window = window): string[] {
  const cs = win.getComputedStyle(el)
  const out: string[] = []
  for (let i = 0; i < cs.length; i++) {
    const name = cs.item(i)
    if (name.startsWith('--')) out.push(name)
  }
  return out
}
