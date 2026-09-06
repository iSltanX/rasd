/**
 * تصنيف ألوان اللوحة إلى مصادرها — `§6.5` («فصل ألوان الواجهة عن الصور»).
 *
 * **المبدأ نصُّ الخطّة حرفيًّا**: «بمقاطعة نتائج البكسل مع نتائج CSS: اللون
 * الموجود في تصريح CSS هو لون واجهة، والموجود في البكسل فقط هو لون صورة».
 * فالتصنيف ليس تخمينًا على اللون نفسه (لا شيء في `#7C3AED` يقول إنه زرّ أو
 * سماء)، بل سؤالٌ عن **مصدره**: هل صرّحت به ورقة أنماط، أم ظهر في البكسل
 * وحده؟
 *
 * **والفئات تأتي من التصريح الذي طابقه لا من فئة مخترَعة**: `color` نصّ،
 * و`background-color` خلفية، و`border-*` حدّ — وهي `UsageSite` نفسها في
 * [`usage.ts`](./usage.ts)، لا نسخةٌ ثانية منها. فما زاد على ذلك في §6.5
 * («نصوص · حدود · خلفيات») مُغطًّى، وما لا تصريح له يقع في `image`.
 *
 * **عتبة المطابقة مقيسة لا مفترَضة.** بُنيت صفحةٌ اصطناعية فيها عناصر واجهة
 * مسطّحة فوق صورة متدرّجة، واستُخرجت لوحتها ثمّ قيس بُعد كل مدخل عن أقرب
 * لون مصرَّح:
 *
 *   - ألوان الواجهة المسطّحة: **ΔE = 0.00000 بالضبط** — حتى مع حوافّ منعَّمة
 *     بعرض 3px. لأن مركز العنقود في median-cut يقع على اللون الصرف نفسه:
 *     بكسلات الحافّة أقلّ من أن تزحزحه.
 *   - أقرب لون **صورة** إلى تصريح: **0.05792**، وبقيّتها 0.22–0.32.
 *
 * فالفجوة بين الصنفين تفصلهما بوضوح، و`USAGE_DELTA` (‏0.01) تقع في وسطها:
 * أعلى من أرضية ضجيج البايت (‏0.00097، القياس في `tailwind.ts`) بعشرة
 * أضعاف، ودون أقرب لون صورة بخمسة أضعاف ونصف. فلا حاجة إلى عتبة ثالثة
 * تُخترع لهذا الملفّ.
 *
 * **وحدٌّ مقيس يُعلَن**: في القياس نفسه لم يظهر لون زرٍّ مسطّح (‏6.4٪ من
 * البكسلات) في لوحة من ثمانية ألوان أصلًا — استهلكت الصورةُ المتدرّجة
 * المداخل. فالتصنيف يصنّف **ما استُخرج**، ولا يضمن أن كل لون واجهة سيُستخرَج
 * حين تزاحمه صورة متنوّعة. رفع عدد الألوان (`§6.2`: 12 أو مخصَّص) هو المخرج
 * المتاح للمستخدم، وهو معروضٌ في الشاشة فعلًا.
 */

import { deltaEReadings } from './distance'
import { USAGE_DELTA } from './usage'

import type { PaletteEntry } from './palette'
import type { DeclaredColour, UsageSite } from './usage'

/**
 * مصدر اللون: موضعُ تصريحه إن صُرِّح، و`image` إن لم يُصرَّح.
 *
 * `image` تسمية `§6.5` («صور ووسائط») — ويقع فيها كذلك ما رسمه canvas أو
 * تدرّجٌ أو فيديو، فكلّها بكسلاتٌ بلا تصريح لوني يقابلها.
 */
export type ColourSource = UsageSite | 'image'

export interface ClassifiedEntry extends PaletteEntry {
  readonly source: ColourSource
  /**
   * بُعده عن أقرب لون مصرَّح — يُعلَن ولا يُخفى.
   *
   * التصنيف قرارٌ ثنائي على عتبة، وهذا الرقم يقول كم كان قريبًا منها:
   * `0.0104` صُنِّف صورةً بفارق شعرة، و`0.31` صورةٌ بلا لبس. ومَن أراد
   * ضبط العتبة يحتاج أن يرى المسافة لا الحكم وحده.
   */
  readonly nearestDeclaredDelta: number
}

/**
 * أولوية الموضع حين يُصرَّح اللون نفسه في أكثر من موضع.
 *
 * لونٌ واحد قد يكون نصًّا هنا وحدًّا هناك. والترتيب هنا **ليس تفضيلًا
 * جماليًّا** بل ندرةً: `text` و`background` هما ما يصف اللون في لوحة صفحة
 * («خلفية · ٣٤٪»، «نص · ٢٢٪» في الإطار المرجعي `122:157`)، بينما `shadow`
 * و`icon` مواضع أضيق نادرًا ما تُعرِّف لونًا بذاتها. فالأعمّ يفوز.
 */
const SITE_RANK: Readonly<Record<UsageSite, number>> = {
  background: 0,
  text: 1,
  border: 2,
  icon: 3,
  shadow: 4,
}

/**
 * يصنّف مداخل اللوحة بمقاطعتها مع الألوان المصرَّحة.
 *
 * دالّة خالصة: لا DOM ولا `chrome.*`. جمعُ الألوان المصرَّحة من صفحة حيّة
 * مسؤولية `collectDeclaredColours` في `usage.ts`، وهذه تأخذ ناتجه.
 */
export function classifyPaletteSources(
  entries: readonly PaletteEntry[],
  declared: readonly DeclaredColour[],
  threshold: number = USAGE_DELTA,
): readonly ClassifiedEntry[] {
  return entries.map((entry) => {
    let bestDelta = Infinity
    let bestSite: UsageSite | null = null

    for (const candidate of declared) {
      const delta = deltaEReadings(entry.colour, candidate.colour)
      if (delta > threshold) {
        // ولو لم يطابق، يبقى الأقرب مسجَّلًا — الرقم يُعلَن حتى حين لا يُصنِّف.
        if (delta < bestDelta) bestDelta = delta
        continue
      }
      // داخل العتبة: يفوز الأقرب، وعند التساوي يفوز الموضع الأعمّ.
      const closer = delta < bestDelta
      const broader =
        bestSite !== null && delta === bestDelta && SITE_RANK[candidate.site] < SITE_RANK[bestSite]
      if (closer || broader) {
        bestDelta = delta
        bestSite = candidate.site
      }
    }

    return {
      ...entry,
      source: bestSite ?? 'image',
      nearestDeclaredDelta: Number.isFinite(bestDelta) ? bestDelta : Infinity,
    }
  })
}

/** تسميات المصادر كما تُعرض — عربية، ومطابقة لمفردات `§6.5`. */
export const SOURCE_LABELS: Readonly<Record<ColourSource, string>> = {
  background: 'خلفية',
  text: 'نص',
  border: 'حدود',
  icon: 'أيقونة',
  shadow: 'ظلّ',
  image: 'صورة',
}
