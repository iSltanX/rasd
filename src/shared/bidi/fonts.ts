/**
 * حقن الخطوط للطبقة داخل الصفحة.
 *
 * الطبقة تعيش في Shadow Root مغلق، و`@font-face` المعلَنة في صفحة الإضافة
 * لا تصلها. **ولا تصلح كتابتها داخل ورقة الظلّ نفسها**: وجوه الخطّ مُلحقة
 * بالمستند لا بشجرة الظلّ، فقاعدة `@font-face` في ورقة متبنّاة على جذر ظلّ
 * تُهمَل بصمت — لا يُطلَب الملفّ أصلًا، مع أن القاعدة تبقى ظاهرة في CSSOM
 * فتبدو وكأنها عملت.
 *
 * الطريق الوحيد إذن هو واجهة `FontFace`: تُحمَّل من أصل
 * `chrome-extension://` وتُضاف إلى `document.fonts` — فتتاح داخل الظلّ.
 * وهذا أثر في مستند لا نملكه، فيجب أن يُزال في التفكيك: `releaseOverlayFonts`.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

/** ما تحتاجه الطبقة داخل الصفحة فعلًا — لا كل الأوزان. */
const OVERLAY_FACES = [
  { family: 'Cairo', weight: '400', file: 'cairo-400-arabic.woff2' },
  { family: 'Cairo', weight: '600', file: 'cairo-400-arabic.woff2' },
  { family: 'Geist Mono', weight: '400', file: 'geistmono-400-latin.woff2' },
] as const

let injected = false

/** ما أُضيف فعلًا، ليُزال حرفيًا في التفكيك — لا بالاسم ولا بالتخمين. */
const added = new Set<FontFace>()

/**
 * جيل الحقن الحالي.
 *
 * التحميل غير متزامن والتفكيك متزامن، فقد ينتهي وجه خطّ **بعد** الإفراج
 * فيُضاف إلى مستند تركناه — تسريب متقطّع يظهر على صفحة ويختفي على أخرى
 * حسب التوقيت وحده. كل إفراج يزيد الجيل، وكل تحميل يتحقّق من جيله قبل
 * الإضافة فيُسقط نفسه إن كان متأخّرًا.
 */
let generation = 0

/**
 * يحمّل خطوط الطبقة مرّة واحدة لكل مستند.
 *
 * لا يرمي: فشل تحميل خطّ يعني احتياطي النظام، لا تعطّل الأداة.
 */
export async function ensureOverlayFonts(target: Document = document): Promise<boolean> {
  if (injected) return true
  injected = true
  const mine = generation

  const results = await Promise.all(
    OVERLAY_FACES.map(async ({ family, weight, file }) => {
      try {
        const url = chrome.runtime.getURL(`assets/fonts/${file}`)
        // البايتات تُجلَب **بأنفسنا** ثم تُمرَّر إلى `FontFace`.
        //
        // الصيغة النصّية `url(…)` تجعل **المستند** هو من يطلب الملفّ، وبيان
        // رصد يضع `use_dynamic_url: true` على موارده (لمنع المواقع من
        // التبصيم بمعرّف ثابت) — فطلب المستند للعنوان الساكن محجوب، ويفشل
        // الخطّ بصمت: `font-display: swap` يعرض احتياطي النظام فتبدو الطبقة
        // صحيحة تقريبًا ولا شيء يشتكي. الجلب من سياقنا يتجاوز ذلك، ويجعل
        // الفشل — إن وقع — مرئيًا هنا لا مخفيًّا في المتصفّح.
        const bytes = await (await fetch(url)).arrayBuffer()
        const face = new FontFace(family, bytes, { weight, display: 'swap' })
        await face.load()
        // فُكِّكت الطبقة أثناء التحميل — لا نضيف شيئًا إلى مستند تركناه.
        if (mine !== generation) return false
        target.fonts.add(face)
        added.add(face)
        return true
      } catch {
        return false
      }
    }),
  )
  return results.every(Boolean)
}

/**
 * يزيل كل وجه خطّ أضفناه.
 *
 * `document.fonts` مجموعة تخصّ الصفحة المضيفة؛ تركُ وجوهنا فيها بعد
 * `teardown()` أثرٌ باقٍ يخالف شرط «لا يترك أثرًا». يُزال ما في `added`
 * وحده، فلا يُمسّ وجه أضافته الصفحة نفسها.
 */
export function releaseOverlayFonts(target: Document = document): number {
  let removed = 0
  for (const face of added) {
    try {
      target.fonts.delete(face)
      removed++
    } catch {
      /* المجموعة قد تكون أُفرغت أصلًا */
    }
  }
  added.clear()
  injected = false
  // كل تحميل ما يزال طائرًا يصير متأخّرًا الآن فلا يضيف شيئًا.
  generation++
  return removed
}

/** للاختبارات: يسمح بإعادة الحقن. */
export function resetFontInjection() {
  injected = false
  added.clear()
  generation++
}
