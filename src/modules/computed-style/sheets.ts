/**
 * جمع أوراق الأنماط — من ثلاثة مصادر لا واحد، وبإعلان ما تعذّر.
 *
 * **`document.styleSheets` وحدها لا تكفي.** قِيس أن الأوراق **المتبنّاة**
 * (`adoptedStyleSheets`) لا تظهر فيها (`adoptedInDocList = false`)، وأنها
 * **تغلب** أوراق الجذر عند التعارض. والاكتفاء بالقائمة يعني أن كل موقع
 * مبنيّ بمكوّنات ويب يسقط من الفاحص **صامتًا** — أسوأ صنف عطل هنا.
 *
 * **والحجب يُعلَن لا يُخفى.** ورقة من أصل آخر ترمي `SecurityError` عند
 * قراءة `cssRules`، ومنح صلاحية المضيف **لا يفتحها** (مقيس في العالمين).
 * فالفاحص يقول «تعذّر قراءة هذه الورقة» بدل أن يدّعي أن لا قاعدة هناك.
 *
 * وحظّ سعيد مقيس: **اسم المتغيّر وقيمته يعبران الحجب** عبر
 * `getComputedStyle`. الضائع هو مكان التعريف والقاعدة الفائزة وحدهما.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل — ويجوز له
 * استعمال واجهات المتصفّح القياسية.
 */

/** من أين جاءت الورقة — يُعرَض للمستخدم مصدرًا للقاعدة الفائزة. */
export type SheetSource =
  | { readonly kind: 'link'; readonly href: string }
  | { readonly kind: 'style'; readonly label: string }
  | { readonly kind: 'imported'; readonly href: string; readonly viaHref: string }
  | { readonly kind: 'constructed'; readonly on: 'document' }
  | { readonly kind: 'constructed'; readonly on: 'shadow' }

export interface SheetEntry {
  readonly sheet: CSSStyleSheet
  readonly source: SheetSource
  readonly disabled: boolean
  readonly media: string
}

/**
 * قراءة قواعد ورقة — إمّا قواعد وإمّا سبب صريح للتعذّر.
 *
 * `Result` لا استثناء ولا مصفوفة فارغة: «صفر قاعدة» و«تعذّرت القراءة»
 * حالتان مختلفتان تمامًا، وخلطهما هو ما يجعل الفاحص يكذب.
 */
export type RulesRead =
  | { readonly state: 'readable'; readonly rules: readonly CSSRule[] }
  | { readonly state: 'blocked'; readonly origin: string; readonly detail: string }

export function readRules(sheet: CSSStyleSheet): RulesRead {
  try {
    return { state: 'readable', rules: Array.from(sheet.cssRules) }
  } catch (thrown) {
    return {
      state: 'blocked',
      origin: originOf(sheet.href),
      detail: String((thrown as { name?: unknown })?.name ?? thrown),
    }
  }
}

function originOf(href: string | null): string {
  if (!href) return ''
  try {
    return new URL(href).origin
  } catch {
    return href
  }
}

/** وصف مقروء لعنصر `<style>` — لا يملك عنوانًا يُعرَض. */
function labelOfStyleNode(node: Element | null, i: number): string {
  if (!node) return `style#${i}`
  const id = node.getAttribute('id')
  if (id) return `<style id="${id}">`
  const cls = node.getAttribute('class')
  if (cls) return `<style class="${cls.split(/\s+/)[0]}">`
  return `<style> #${i}`
}

function sourceOf(sheet: CSSStyleSheet, i: number): SheetSource {
  // الورقة المستورَدة بـ`@import` أبوها ورقة لا عقدة.
  const parent = sheet.parentStyleSheet
  if (parent) {
    return { kind: 'imported', href: sheet.href ?? '', viaHref: parent.href ?? '' }
  }
  if (sheet.href) return { kind: 'link', href: sheet.href }
  if (sheet.ownerNode)
    return { kind: 'style', label: labelOfStyleNode(sheet.ownerNode as Element, i) }
  // بلا عنوان وبلا عقدة: ورقة مُنشأة برمجيًّا.
  return { kind: 'constructed', on: 'document' }
}

/**
 * يجمع أوراق جذر واحد من مصادره الثلاثة.
 *
 * الترتيب مقصود: أوراق الجذر ثم **المتبنّاة بعدها** — قِيس أن المتبنّاة
 * تغلب عند التعارض، وترتيب المستند هو الفاصل الأخير في التتالي.
 */
export function collectSheets(root: Document | ShadowRoot): SheetEntry[] {
  const out: SheetEntry[] = []
  const seen = new Set<CSSStyleSheet>()

  const push = (sheet: CSSStyleSheet, source: SheetSource) => {
    if (seen.has(sheet)) return
    seen.add(sheet)
    out.push({
      sheet,
      source,
      disabled: sheet.disabled,
      media: sheet.media?.mediaText ?? '',
    })
  }

  const list = root.styleSheets
  for (let i = 0; i < list.length; i++) {
    const sheet = list[i]
    if (sheet) push(sheet, sourceOf(sheet, i))
  }

  const adopted = (root as { adoptedStyleSheets?: readonly CSSStyleSheet[] }).adoptedStyleSheets
  if (adopted) {
    const on = root instanceof Document ? 'document' : 'shadow'
    for (const sheet of adopted) push(sheet, { kind: 'constructed', on })
  }

  return out
}

/**
 * هل تُطبَّق هذه الورقة أصلًا؟
 *
 * بوّابتان قبل قراءة قواعدها: `disabled` (وقواعدها حاضرة رغم تعطيلها —
 * مقيس)، و`media` على الوسم نفسه (`<style media="print">` حاضرة بقواعدها
 * و`matchMedia` عليها `false`). وإغفال أيّهما يُدخل قواعد لا تُطبَّق في
 * حساب الفائز.
 */
export function sheetApplies(entry: SheetEntry, win: Window = window): boolean {
  if (entry.disabled) return false
  if (!entry.media) return true
  try {
    return win.matchMedia(entry.media).matches
  } catch {
    return true
  }
}

/**
 * بصمة الأوراق — للكشف عن تقادم الفهرس.
 *
 * **بلا حدث في المنصّة**: قِيس أن `'onchange' in CSSStyleSheet.prototype`
 * يساوي `false`، وأن `MutationObserver` **أعمى** عن `insertRule` وعن
 * `sheet.disabled` معًا. فالبصمة هي السبيل الوحيد.
 *
 * وتضمّ `disabled` و`media` لا العدد وحده: قِيس أن بصمة العدد لا تتغيّر حين
 * تُعطَّل ورقة، فيبقى الفهرس يحسب قواعدها وهي لا تُطبَّق.
 *
 * ويبقى حدٌّ معلَن: استبدال قاعدة بأخرى **بالعدد نفسه** لا تكشفه. وبصمة
 * حسّاسة للمحتوى (سرد `cssText`) قِيست بـ46.8ms على github — أغلى من إعادة
 * الفهرسة كلّها، فلا تُعتمَد.
 */
export function sheetsFingerprint(root: Document | ShadowRoot): string {
  const parts: string[] = []
  for (const entry of collectSheets(root)) {
    // المحجوبة تُبصَم بـ-1: قيمة ثابتة تميّزها عن «صفر قاعدة».
    let count: number
    try {
      count = entry.sheet.cssRules.length
    } catch {
      count = -1
    }
    parts.push(`${count}:${entry.disabled ? 1 : 0}:${entry.media}`)
  }
  return parts.join('|')
}
