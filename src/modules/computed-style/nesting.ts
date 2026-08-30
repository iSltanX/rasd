/**
 * تفكيك تداخل CSS — استبدال `&` بمحدِّدات الأب.
 *
 * Chrome يُطبِّع التداخل في `selectorText` قبل أن يصلنا: قاعدة مكتوبة
 * `.txt {}` داخل `.card` تُقرأ **`& .txt`**، و`> .b` تُقرأ `& > .b`. فالعمل
 * هنا استبدال `&` لا تحليل نحوي.
 *
 * و`&` تحمل دلالة `:is()` على قائمة الأب — لا مجرّد لصق نصّي. قيس أن
 * `#c { .txt {} }` غلب `.txt` مكرَّرة خمس مرّات: أي أن الأولوية تُحسب
 * بـ`:is(#c)` لا بـ`#c` وحدها. ولذلك يُلَفّ الأب بـ`:is(…)` دائمًا حين
 * يكون قائمة، فتصحّ الأولوية بحكم البناء.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import { scanEscape, splitTop } from './specificity'

/** يستبدل كل `&` في المحدِّد بالنصّ المعطى، متخطّيًا السلاسل والتهريب. */
function replaceAmpersand(selector: string, parent: string): string {
  let out = ''
  let quote: string | null = null

  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!

    if (c === '\\') {
      const end = scanEscape(selector, i)
      out += selector.slice(i, end)
      i = end - 1
      continue
    }

    if (quote) {
      out += c
      if (c === quote) quote = null
      continue
    }

    if (c === '"' || c === "'") {
      quote = c
      out += c
      continue
    }

    out += c === '&' ? parent : c
  }

  return out
}

/**
 * يلفّ قائمة الأب بـ`:is()` حين تلزم.
 *
 * القائمة المفردة لا تُلَفّ: `:is(.card)` و`.card` متساويتان أولويةً،
 * واللفّ يزيد ضجيجًا في النصّ المعروض للمستخدم بلا فائدة.
 */
function wrapParent(parent: string): string {
  return splitTop(parent, ',').length > 1 ? `:is(${parent})` : parent
}

/**
 * المحدِّدات الفعّالة لقاعدة نمط، بعد تفكيك التداخل صعودًا.
 *
 * تُرجع قائمة: قاعدة مفصولة بفواصل تعطي عضوًا لكل فرع، وكل فرع يُفكّ ضدّ
 * كل فرع من الأب.
 */
export function effectiveSelectors(rule: CSSStyleRule): string[] {
  const own = splitTop(rule.selectorText, ',')
  const parents = parentSelectors(rule)

  if (!parents) return own

  const out: string[] = []
  const wrapped = wrapParent(parents.join(', '))
  for (const branch of own) {
    out.push(branch.includes('&') ? replaceAmpersand(branch, wrapped) : `${wrapped} ${branch}`)
  }
  return out
}

/**
 * محدِّدات أقرب قاعدة نمط جدّة، أو `null` حين لا تداخل.
 *
 * يُمشى على `parentRule` لا على `parentStyleSheet`: القاعدة قد تكون داخل
 * `@media` داخل قاعدة نمط، فالأب النحوي ليس الأب المباشر.
 */
function parentSelectors(rule: CSSRule): string[] | null {
  let node: CSSRule | null = rule.parentRule
  let guard = 0

  while (node && guard++ < 64) {
    const text = (node as { selectorText?: unknown }).selectorText
    if (typeof text === 'string') return effectiveSelectors(node as CSSStyleRule)
    node = node.parentRule
  }
  return null
}

/**
 * محدِّدات القاعدة المالكة لكتلة تصريحات متداخلة.
 *
 * `CSSNestedDeclarations` نوع قائم بذاته يظهر حين تُكتب تصريحات **بعد**
 * قاعدة متداخلة — وهي تخصّ المحدِّد الأب لا محدِّدًا خاصًّا بها. و`rule.type`
 * لها **صفر**، كما هو لخمسة أنواع أخرى، فلا يُميَّز بها.
 *
 * `null` يعني: هذه ليست كتلة تصريحات متداخلة.
 */
export function ownerSelectorsOfNestedDeclarations(rule: CSSRule): string[] | null {
  // لها `style` ولا `selectorText` — وهذا ما يميّزها بنيويًّا.
  const hasStyle = typeof (rule as { style?: unknown }).style === 'object'
  const hasSelector = typeof (rule as { selectorText?: unknown }).selectorText === 'string'
  if (!hasStyle || hasSelector) return null
  return parentSelectors(rule)
}
