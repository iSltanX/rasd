/**
 * قراءة الأنماط المحسوبة — بالمجموعة المنتقاة وبعلامة ثقة لكل قيمة.
 *
 * **لا تُقرأ كل الخصائص.** `getComputedStyle` يعدّد 2461 خاصّية في Chrome
 * اليوم، وقراءتها كلّها قِيست بـ776.67µs مقابل 8.5–12µs للمجموعة المنتقاة —
 * **111× أغلى**، ومئات القيم الابتدائية لا تقول شيئًا عن هذا العنصر.
 *
 * **ولكل قيمة علامة ثقة.** عنصر بلا تخطيط يُرجع نسبًا خامًا لا قيمًا
 * مستعمَلة، وعنصر متحرِّك تتقدّم حركته على تصريحه. وعرضهما كالموثوق يجعل
 * الفاحص يكذب بثقة — وهو أسوأ من أن يعترف بجهله.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import { INSPECT_PROPS, type Reliability, type StyleValue } from '@/shared/inspect-schema'

export interface StyleReading {
  readonly styles: Record<string, StyleValue>
  /** العنصر بلا صندوق — كل نسبة فيه خام. */
  readonly unlaid: boolean
  /** عدد الحركات الجارية عليه. */
  readonly animating: number
  /** أسماء الخصائص التي تحرّكها حركة جارية. */
  readonly animated: ReadonlySet<string>
}

/**
 * هل العنصر مخطَّط؟
 *
 * `getClientRects().length === 0` هو المعيار لا `getBoundingClientRect`:
 * الأخير يعطي `0×0` لثلاث حالات لا يجمعها شيء (`display:none` ·
 * `display:contents` · عنصر فارغ فعلًا)، والأولى تفرّق. وهو المعيار نفسه
 * الذي اعتمدته المرحلة 9 في `dom-picker/inspect.ts`.
 */
function isLaidOut(el: Element): boolean {
  return el.getClientRects().length > 0
}

/**
 * الخصائص التي تحرّكها حركة جارية.
 *
 * قِيس أن الحركة **تتقدّم على التصريح**: عنصر بـ`.anim{--z: STATIC}` مع
 * `animation: kf` أعطى `--z = A-FROM`. فقاعدة CSS الفائزة في التتالي ليست
 * مصدر القيمة المعروضة، والفاحص يجب أن يقول ذلك.
 */
function animatedProps(el: Element): Set<string> {
  const out = new Set<string>()
  const el2 = el as Element & { getAnimations?: () => Animation[] }
  if (typeof el2.getAnimations !== 'function') return out

  let running: Animation[]
  try {
    running = el2.getAnimations()
  } catch {
    return out
  }

  for (const anim of running) {
    const effect = anim.effect
    if (!effect || typeof (effect as KeyframeEffect).getKeyframes !== 'function') continue
    try {
      for (const frame of (effect as KeyframeEffect).getKeyframes()) {
        for (const key of Object.keys(frame)) {
          if (key === 'offset' || key === 'easing' || key === 'composite') continue
          out.add(hyphenate(key))
        }
      }
    } catch {
      // إطار مفاتيح غير قابل للقراءة — لا يُسقط القراءة كلّها.
    }
  }
  return out
}

/** `backgroundColor` ⟶ `background-color`. */
function hyphenate(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/**
 * يقرأ المجموعة المنتقاة لعنصر.
 *
 * ترتيب العمل مقصود: تُقرأ الحالة (تخطيط · حركات) **قبل** القيم، فتُوسَم
 * كل قيمة بثقتها في المرور نفسه بلا قراءة ثانية.
 */
export function readInspectStyles(
  el: Element,
  win: Window = window,
  props: readonly string[] = INSPECT_PROPS,
): StyleReading {
  const unlaid = !isLaidOut(el)
  const animated = animatedProps(el)

  const cs = win.getComputedStyle(el)
  const styles: Record<string, StyleValue> = {}

  for (const prop of props) {
    const value = cs.getPropertyValue(prop)
    let reliability: Reliability = 'used'
    if (animated.has(prop)) reliability = 'animating'
    else if (unlaid) reliability = 'unlaid'
    styles[prop] = { value, reliability }
  }

  return { styles, unlaid, animating: animated.size, animated }
}

/**
 * يقرأ أنماط عنصر زائف.
 *
 * `null` حين لا محتوى له: `content` يساوي `none` يعني أن العنصر الزائف غير
 * موجود أصلًا، وعرض أنماطه يوهم بوجوده.
 */
export function readPseudo(
  el: Element,
  which: '::before' | '::after',
  win: Window = window,
  props: readonly string[] = INSPECT_PROPS,
): Record<string, string> | null {
  const cs = win.getComputedStyle(el, which)
  const content = cs.getPropertyValue('content')
  if (!content || content === 'none' || content === 'normal') return null

  const out: Record<string, string> = { content }
  for (const prop of props) out[prop] = cs.getPropertyValue(prop)
  return out
}

/**
 * الحالات التفاعلية الفعلية للعنصر.
 *
 * تُقرأ بـ`matches()` لا بافتراض. وتحت درع الطبقة قِيس أنها كلّها `false`
 * حتى والمؤشِّر فوق العنصر — فقارئها يجب أن يعرف أن «لا حالة» قد تعني «لا
 * نستطيع أن نعرف».
 */
export function readState(el: Element): {
  hover: boolean
  focus: boolean
  active: boolean
  focusWithin: boolean
} {
  const has = (sel: string) => {
    try {
      return el.matches(sel)
    } catch {
      return false
    }
  }
  return {
    hover: has(':hover'),
    focus: has(':focus'),
    active: has(':active'),
    focusWithin: has(':focus-within'),
  }
}

/**
 * موضع العنصر في **المستند** لا في النافذة.
 *
 * `Rasd_Ar.md §7.1` يفرض «الموقع داخل الصفحة»، ومستطيل النافذة لا يعطيه:
 * عنصر عند أعلى النافذة بعد تمرير 2000px موضعه المستندي 2000 لا صفر.
 */
export function pageOffset(el: Element, win: Window = window): { pageX: number; pageY: number } {
  const r = el.getBoundingClientRect()
  return { pageX: r.left + win.scrollX, pageY: r.top + win.scrollY }
}
