/**
 * كشف الأسماء المولَّدة — الشرط الذي يجعل المحدِّد **مستقرًّا** لا مجرّد فريد.
 *
 * محدِّد يعتمد على `css-1x2y3z` صحيح الآن وميّت بعد أوّل إعادة بناء: أدوات
 * CSS-in-JS تولّد الاسم من محتوى القاعدة أو من عدّاد، فيتغيّر مع أي تعديل.
 * ومحدِّد يُنسَخ إلى تقرير أو اختبار ثم لا يطابق شيئًا أسوأ من محدِّد طويل.
 *
 * **المبدأ: الرفض عند الشكّ.** استبعاد صنف مستقرّ يكلّف محدِّدًا أطول قليلًا؛
 * وقبول صنف متقلّب يكلّف محدِّدًا يكذب. الكلفتان غير متكافئتين.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

/**
 * أنماط معروفة بالاسم، لكل إطار عمل.
 *
 * التسمية صريحة لأن كل سطر ادّعاء عن أداة بعينها، ويُراجَع حين تتغيّر تلك
 * الأداة — لا تعبير نمطي غامض يخمّن الجميع.
 */
const GENERATED_CLASS: ReadonlyArray<{ readonly tool: string; readonly re: RegExp }> = [
  // styled-components: `sc-bdVaJa` · `sc-gsTCUz`
  { tool: 'styled-components', re: /^sc-[A-Za-z0-9]{5,}$/ },
  // emotion: `css-1x2y3z` · `css-0` — والرقم وحده كافٍ للدلالة
  { tool: 'emotion', re: /^css-[a-z0-9]+$/ },
  // styled-jsx (Next.js): `jsx-1234567890`
  { tool: 'styled-jsx', re: /^jsx-\d{4,}$/ },
  // Svelte: `svelte-1x2y3z`
  { tool: 'svelte', re: /^svelte-[a-z0-9]{5,}$/ },
  // Angular: `_ngcontent-abc-c12` · `_nghost-xyz`
  { tool: 'angular', re: /^_ng(content|host)-/ },
  // CSS Modules بنمط `Button_root__2Ab3d`
  { tool: 'css-modules', re: /^[A-Za-z][\w]*_[\w]+__[A-Za-z0-9]{4,}$/ },
  // CSS Modules بنمط `_root_1a2b3_4`
  { tool: 'css-modules', re: /^_[A-Za-z][\w]*_[a-z0-9]{4,}_?\d*$/ },
  // Vue بنمط الصنف (النمط الشائع سمة `data-v-…` لا صنفًا، لكن كليهما يقع)
  { tool: 'vue', re: /^data-v-[a-f0-9]{6,}$/ },
]

/**
 * مقطع مقروء: كلمة، أو رقم، أو **رمز مقاس**.
 *
 * رموز المقاس (`2xl` · `3xl` · `4k` · `x2`) تخلط الحروف والأرقام وهي مع ذلك
 * من أشيع الأسماء الثابتة في سلالم المنافع. بلا هذا الاستثناء يُرفَض
 * `text-2xl` — وهو صنف Tailwind قياسي لا بصمة. اكتشفه اختبار كُتب له.
 *
 * الحدّ ثلاثة محارف لكل جانب: يسع كل رموز المقاس الشائعة، ولا يسع بصمة
 * (`1x2y3z` لا يطابق شيئًا من هذا).
 */
function isReadableSegment(part: string): boolean {
  if (/^[A-Za-z]+$/.test(part)) return true
  if (/^\d+$/.test(part)) return true
  if (/^\d{1,3}[A-Za-z]{1,3}$/.test(part)) return true
  if (/^[A-Za-z]{1,3}\d{1,3}$/.test(part)) return true
  return false
}

/**
 * هل يبدو الاسم بصمةً (hash) لا كلمةً؟
 *
 * احتياطي لما لا يطابق نمطًا مسمّى: أداة جديدة، أو إعداد مخصَّص. ثلاثة شروط
 * يجب أن تتحقّق كاملةً:
 *   1. طول ≥ 5 — الأسماء القصيرة (`btn`، `row`، `md`) شائعة ومقصودة.
 *   2. يحوي رقمًا **وحرفًا** معًا — البصمة تخلطهما، والكلمة لا.
 *   3. لا ينحلّ إلى مقاطع مقروءة كلّها.
 *
 * الشرط الثالث هو الذي يُنقذ سلالم المنافع: `grid-cols-12` و`p-4` و`z-50`
 * و`text-2xl` أرقام **دلالية** في أسماء مقروءة، لا بصمات.
 */
function looksLikeHash(name: string): boolean {
  if (name.length < 5) return false

  const hasDigit = /\d/.test(name)
  const hasAlpha = /[A-Za-z]/.test(name)
  if (!hasDigit || !hasAlpha) return false

  // مقاطع مفصولة: يكفي أن يكون كل مقطع مقروءًا ليكون الاسم كلّه مقروءًا.
  if (name.includes('-') || name.includes('_')) {
    const parts = name.split(/[-_]+/).filter(Boolean)
    if (parts.every(isReadableSegment)) return false
  }

  // مقطع متّصل يخلط الحروف والأرقام: `a1b2c3` · `1x2y3z`.
  const mixedRun = /[A-Za-z]\d|\d[A-Za-z]/.test(name.replace(/[-_]/g, ''))
  return mixedRun
}

/**
 * هل هذا الصنف غير صالح للاعتماد عليه في محدِّد؟
 *
 * تُقبَل `MuiButton-root` و`btn-primary` و`grid-cols-12`؛ وتُرفَض
 * `css-1x2y3z` و`sc-bdVaJa` و`Button_root__2Ab3d`.
 */
export function isUnstableClass(name: string): boolean {
  if (!name) return true
  for (const { re } of GENERATED_CLASS) if (re.test(name)) return true
  return looksLikeHash(name)
}

/**
 * أنماط المعرّفات المولَّدة.
 *
 * `useId` في React 18 يعطي `:r1:` و`«r1»` — وكلاهما ليس معرّفًا صالحًا في CSS
 * بلا تهريب أصلًا. وCDK وradix يعطيان عدّادات تتغيّر بترتيب التركيب.
 */
const GENERATED_ID: readonly RegExp[] = [
  /^:r[0-9a-z]+:$/i, // React useId
  /^«r[0-9a-z]+»$/i, // React useId (صيغة أخرى)
  /^radix-/i,
  /^headlessui-/i,
  /^cdk-(overlay|describedby|drop-list)-\d+$/i,
  /^mui-\d+$/i,
  /^:\w+:$/, // أي معرّف بنقطتين — اصطلاح مكتبات لا تسمية مؤلِّف
]

/** هل هذا المعرّف مولَّد فلا يُعتمَد عليه؟ */
export function isUnstableId(id: string): boolean {
  if (!id) return true
  for (const re of GENERATED_ID) if (re.test(id)) return true
  // معرّف ينتهي بعدّاد صرف (`input-42`) يتغيّر بترتيب العرض.
  if (/^[A-Za-z][\w-]*?-\d{1,4}$/.test(id) && !/[A-Za-z]\d/.test(id.replace(/-\d+$/, ''))) {
    return true
  }
  return looksLikeHash(id)
}

/** يُصدَّر للاختبار: أي أداة طابقت الاسم، أو `null`. */
export function generatorOf(name: string): string | null {
  for (const { tool, re } of GENERATED_CLASS) if (re.test(name)) return tool
  return looksLikeHash(name) ? 'hash-like' : null
}
