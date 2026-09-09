import { formatHuman } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import type { WcagLevel } from '@/modules/colour/contrast'
import type { ReplaceScope } from '@/modules/colour/replace'
import type { JSX } from 'preact'

/**
 * لوحة الاستبدال المؤقّت — `colors / replace` (`125:227`). **تعرض ولا
 * تحسب**، على نمط `ColourPanel`/`PalettePanel`/`ScalePanel` الملزِم حرفيًّا:
 * تستقبل الحالة والقياسات جاهزة وتُبلِّغ الأفعال بمعاودات. لا استدعاء
 * لـ`replaceOnElements`/`replaceVariable`/`revertAll` هنا (`modules/colour/
 * replace.ts`)، ولا لـ`wcagVerdict`/`contrastRatio` (`modules/colour/
 * contrast.ts`) — تلك تقع كلّها في سكربت المحتوى الذي يصل هذه اللوحة
 * بـ`onReplace` في `ColourPanel` (المهمّة الموازية).
 *
 * **ثلاثة أوضاع لا أربعة — `ReplaceScope` نفسه هو الحسم.** `replace.ts`
 * يصدّر `type ReplaceScope = 'element' | 'matches' | 'variable'` (السطر 73)
 * وتعليقه المباشر يقول: «الأوضاع الثلاثة التي تُنتج مقبضًا؛ ‹التراجع/إعادة
 * الضبط› فعل لا وضع». **ترويسة الملفّ نفسه** تفتتح بجملة مضلِّلة («أربعة
 * أوضاع») تخالف هذا التعريف وتخالف تعليقها الداخلي هي الأخرى — عيبٌ موروث
 * في ملفٍّ خارج نطاق هذه المهمّة (`src/modules/**` ممنوع لمسه)، يُعلَن هنا
 * ولا يُصحَّح ولا يُقلَّد: هذه اللوحة تبني ثلاثة صفوف اختيار فقط، مطابقةً
 * لِما يُنتج مقبضًا فعليًّا لا لما تقوله الجملة الأولى الخاطئة.
 *
 * **ترتيب الرأس مقيسٌ من `125:227` مباشرةً — العنوان أوّلًا في DOM.** نفس
 * تصحيح مرآة `ColourPanel`/`PalettePanel`/`ScalePanel`: «×» تقع يسارًا
 * والعنوان («استبدال مؤقّت» + أيقونة `color-replace`) يمينًا في اللقطة، وتحت
 * `direction: rtl` بلا `justify-content` معكوس يدويًّا أوّل عنصر في DOM يقع
 * عند بداية المحور أي يمينًا — فالعنوان يسبق زرّ الإغلاق هنا.
 *
 * **أيقونة العنوان وحدها ملوَّنة، لا العنوان كلّه — قياس بكسل مباشر.** أُخذت
 * عيّنات من `125:227`: نصّ «استبدال مؤقّت» رمادي محايد (`rgb≈169-232`، بلا
 * انحياز حراري)، والأيقونة كهرمانية صريحة (`rgb(255,178,87)` بالضبط، تطابق
 * `--rasd-tool-colors-fg`). هذا يوافق قرار `PalettePanel` («الأيقونة وحدها
 * بلون الأداة») لا قرار `ColourPanel` (يلوّن الكتلة كلّها) — إطاران مختلفان
 * وقياسان مختلفان.
 *
 * **حلقة التركيز البرتقالية على عيّنة «البديل» وحدها — نفس اللون الكهرماني
 * بالضبط (`rgb(255,178,87)` = `--rasd-tool-colors-fg`)، مقيسة بكسليًّا حول
 * حدود العيّنة اليسرى في الصفّ.** لا معاودة ولا حالة تبديل مذكورة في العقد
 * لتفسيرها وظيفيًّا (لا منتقي لون داخل هذه اللوحة، ولا `onPick` في أيّ عقد
 * وصل)؛ فهي تُبنى هنا **علامة ثابتة** تُميّز عيّنة «البديل» بصفتها ناتج
 * الأداة — لا حالة تفاعلية مشروطة بخاصية، تجنّبًا لاختراع سلوك لا يسنده شيء.
 *
 * **ترتيب صفّ المقارنة مقيسٌ**: «الأصلي» (بنفسجي `#7C3AED`) يقع يمينًا،
 * و«البديل» (فيروزي `#0EA5A3`) يسارًا — فالأصلي أوّلًا في DOM.
 *
 * **`matchCount` عدد حيّ لا يُحسب هنا — `number | null` لا `number`.**
 * مصدره الحقيقي `colourUsage.state.hits.length` (`content/tools/
 * colour-usage.ts`)، خارج نطاق هذا الملفّ. والافتراضي حين لا مسح بعد هو
 * **`null` لا `0`** — نفس تعليل `ColourUsageView.total`/`null` الموثَّق في
 * ترويسة `ColourPanel.tsx` بالحرف: لو كان الافتراضي `0` لقالت اللوحة «٠
 * عنصرًا يستخدم اللون نفسه» عن لون **لم يُمسَح بعد**، فتخلط «مُسح فلم يوجد
 * شيء» بـ«لم يُطلب مسح أصلًا» — وهما حالتان مختلفتان تمامًا. حين `null`
 * يُعرض نصّ محايد بدل رقم كاذب.
 *
 * **صياغة سطر «كل العناصر المطابقة» لا تستعمل `plural()` العامّة رغم أنها
 * الأداة المرشَّحة — اختُبرت فعليًّا ورُفضت لسبب مسجَّل.** `plural(14, 'عنصر
 * واحد', 'عنصران', 'عناصر')` تُنتج «١٤ عنصر واحد» لا «١٤ عنصرًا»: فرعها
 * الأخير (`count >= 11`) يُلحق معامل `one` حرفيًّا بعد الرقم، وهذا يناسب
 * اسمًا ينتهي بتاء مربوطة كـ«دقيقة» (يصلح مفردًا صريحًا ومُميِّزًا معًا بلا
 * تغيير) لا اسمًا مذكَّرًا كـ«عنصر» يحتاج تنوين الألف في حالة النصب للتمييز
 * (`عنصرًا`) ويختلف عن صيغة المفرد الصريح (`عنصر واحد`) — معامل واحد لا يفي
 * بالدورين معًا. واللقطة المرجعية (`125:293`) تكتب «١٤ عنصرًا» حرفيًّا؛
 * `matchCountLabel` أدناه تبنيها مباشرةً بصيَغ صحيحة لكل مدى عدديّ، مستعملةً
 * `formatHuman` وحدها لتنسيق الرقم (سياسة الأرقام تبقى محترَمة).
 *
 * **«الزر المحدَّد فقط» في اللقطة عُمِّمت هنا إلى «العنصر المحدَّد فقط».**
 * نصّ `125:293` الحرفي لخيار «عنصر واحد» يقول «الزر المحدَّد فقط» — لكن
 * `replaceOnElements` (`replace.ts`) تعمل على أيّ `Element`، لا زرّ تحديدًا؛
 * وترويسة تلك الوحدة نفسها تسمّي هذا الوضع «عنصر واحد» لا «زرّ واحد». الأرجح
 * أن نصّ اللقطة عيّن مثال العرض (زرّ CTA بنفسجي) لا نيّة تصميم مقصودة تقصر
 * الوضع على أزرار فقط — فعُمِّم النصّ ليصحّ لأيّ عنصر، مطابقةً لعقد الوحدة لا
 * لمثالها العرضي.
 *
 * **اسم متغيّر CSS («`--color-primary` في كل الصفحة») مبنيّ من عنصرين
 * منفصلين في DOM، لا سطرًا واحدًا مُدمَجًا — تفاديًا لانقلاب بصري رصدته هذه
 * المرحلة نفسها.** قِيست اللقطة المرجعية عن كثب: اسم المتغيّر يظهر **يسار**
 * جملته رغم أنه أوّل كلمة منطقيًّا — عطلٌ من نوع الانقلاب الذي حذّرت منه
 * المهمّة صراحةً («قِس أن أبعادًا لاتينية بلا عزل تنقلب بصريًّا في RTL — لا
 * تكرّر ذلك مع `--color-primary`»). فبُني الوصف هنا بعقدين مستقلّين بترتيب
 * DOM الصحيح: `<TechnicalValue>` لاسم المتغيّر أوّلًا (فيقع يمينًا تحت
 * RTL الطبيعي، كبداية الجملة منطقيًّا) ثم نصّ «في كل الصفحة» ثانيًا — يخالف
 * هذا **عمدًا** ما ترسمه اللقطة بكسليًّا، طاعةً لنصّ المهمّة لا نسخًا لعطل
 * فيها.
 *
 * **حين `variableName` هو `null` يُعطَّل خيار «متغيّر CSS كاملًا» ولا
 * يُخفى.** لا معنى لاستبدال متغيّر لا وجود له لهذا اللون؛ فالصفّ يبقى
 * ظاهرًا (يُعلن الخيار الثالث موجودًا في العقد) لكن مُعطَّلًا بوصف يشرح
 * السبب — نفس فلسفة `ColourVarView.origin: string | null` في `ColourPanel`
 * («الاسم معروف والموضع لا» يُقال ولا يُترك فراغًا يُقرأ خطأً).
 *
 * **شارة التباين: `AAA`/`AA` أخضر (`--rasd-status-success-*`)، و`fail`
 * يرث اللون الافتراضي الكهرماني — نفس تعيين `ColourPanel.rasd-ov-cp-verdict`
 * بالحرف (`overlay.css` حول `data-level='AA']`)، لا تصنيف ثلاثي منفصل
 * (أخضر/كهرماني/أحمر) كالذي تستعمله `ViewportGallery` لحالات المقارنة
 * الثلاث.** السبب مزدوج: (١) قياس بكسل مباشر لشارة `125:227` — خلفيتها
 * `rgb(0,40,12)` ونصّها `rgb(0,185,85)`، مطابقان تمامًا لـ`--rasd-status-
 * success-surface`/`-fg` في السمة الداكنة، وهذا **نفس** التعيين الذي تستعمله
 * `ColourPanel` لمستوى `AA` بالضبط — لا لون كهرماني ولا أحمر ظاهر في أيّ حالة
 * مصوَّرة من هذا الإطار. (٢) هذا العقد **نفسه** (`wcagVerdict` من
 * `modules/colour/contrast.ts`) هو ما تستهلكه `ColourPanel` أصلًا لبناء
 * الشارة المطابقة تمامًا — فتكرار تعيينها هنا (لا اختراع تعيين ثلاثي جديد)
 * هو الاتّساق الصحيح بين لوحتين تستهلكان العقد نفسه لا إطارين مختلفين.
 * لا حالة «غير مقروء» (`unreadable`) هنا خلافًا لـ`ColourPanel`: تلك تأتي من
 * `checkPair` (عقد أوسع لم يُذكر في مهمّة هذه اللوحة)، وهذه تستهلك
 * `wcagVerdict` وحدها — ثلاث قيم فقط، ولا رابعة تُخترَع.
 *
 * **`against` (« مع الأبيض ») نصّ حرّ يقرّره المستدعي، لا ثابتًا مُضمَّنًا.**
 * اللقطة المرجعية تُظهر حالة واحدة فقط («مع الأبيض»)، فلا دليل بصري على
 * حالة ثانية تسند شكلًا مختلفًا؛ لكن **أيّ** خلفية تُقارَن عليها قرار
 * المستدعي (يعرف ما إذا كانت مفترَضة أو مقروءة فعلًا)، لا ثابتًا يُجمَّد في
 * هذا المكوّن — نفس معاملة `ColourContrastView.against` في `ColourPanel`.
 *
 * **شريط الملاحظة يستعمل توكنات `--rasd-status-info-*` — قياس بكسل
 * مباشر.** خلفيّته `rgb(0,31,65)` تطابق `--rasd-color-info-950` تمامًا (هي
 * قيمة `--rasd-status-info-surface` في السمة الداكنة)، فهذا تنبيه معلوماتيّ
 * محايد لا تحذيريّ (`warning`) كتنبيه `mismatch/outOfGamut` في `ColourPanel`
 * — الفرق دلاليّ: هذا يشرح حدود الأداة (معاينة مؤقّتة)، لا يُبلغ عن اختلاف
 * غير متوقَّع. نفس عائلة التوكنات التي يستعملها `.tone-info` في
 * `Banner.module.css` لغرض مطابق حرفيًّا.
 *
 * **صفوف الاختيار: مدخل `<input type="radio">` مخفيّ + عنصرا نصّ ونقطة
 * مرئيّان — نفس تقنية `.rasd-ov-pal-toggle` بالحرف (مدخل بمكانه الطبيعي في
 * DOM لكنه خارج التخطيط البصري بـ`position: absolute`، ثم شقيقان يؤدّيان
 * العرض).** هذا يمنح تنقّل لوحة مفاتيح ودلالة `radiogroup` أصيلة من
 * المتصفّح (زرّا الاتّجاه ينقلان التحديد بين الخيارات) بدل إعادة بنائها
 * يدويًّا، ويطابق قياس ألوان الصفوف بكسليًّا: غير المحدَّد خلفيّته
 * `rgb(7,11,13)` (=`--rasd-surface-sunken`، تطابق قرار بطاقات `PalettePanel`
 * لنفس السطح)، والمحدَّد خلفيّته `rgb(0,38,32)` وحدّه `rgb(0,140,124)`
 * (=`--rasd-surface-selected`/`--rasd-border-brand` بالضبط)، وحلقة الدائرة
 * غير المحدَّدة `rgb≈(60,74,82)` (=`--rasd-border-strong`).
 *
 * **الأزرار: النصّ أوّلًا في DOM ثم الأيقونة — يطابق `ColourPanel`، يخالف
 * `PalettePanel`/`ScalePanel`.** قِيس زرَّا `125:227` مباشرةً: الأيقونة
 * (✓ للتطبيق، ⟳ لإعادة الضبط) تقع عند الحافّة **اليسرى** من كل زرّ والنصّ
 * يمينَها — فالنصّ يسبق الأيقونة في DOM هنا، مثل زرَّي «حفظ»/«جرّب بديلًا»
 * في `ColourPanel` بالحرف لا كأزرار التصدير في `PalettePanel`/`ScalePanel`.
 * والبارز («طبّق المعاينة») أوّل في DOM فيقع يمينًا، مطابقًا للقطة.
 */

/** شارة التباين — حقول جاهزة من المستدعي عبر `wcagVerdict`/`formatRatio`. */
export interface ReplaceContrastView {
  /** منسَّقة جاهزة عبر `formatRatio` من `contrast.ts` — `4.82 : 1`. */
  readonly ratio: string
  /** حكم `wcagVerdict` — يقرّر لون الشارة؛ انظر فقرة الشارة في ترويسة الملفّ. */
  readonly level: WcagLevel
  /** نصّ الشارة كما يُعرض — `AA` في اللقطة المرجعية. */
  readonly badge: string
  /** وصف الخلفية المقارَن عليها — `مع الأبيض` في اللقطة. */
  readonly against: string
}

export interface ReplacePanelProps {
  /** اللون الأصلي — يُعرض يمينًا في صفّ المقارنة. */
  readonly originalHex: string
  /** عيّنة الأصلي — قيمة CSS سطرية، كـ`ColourPanel.swatch`. */
  readonly originalSwatch: string
  /** اللون البديل — يُعرض يسارًا، بحلقة تركيز ثابتة (انظر ترويسة الملفّ). */
  readonly replacementHex: string
  readonly replacementSwatch: string

  readonly scope: ReplaceScope
  readonly onScopeChange: (scope: ReplaceScope) => void

  /** عدد العناصر المطابقة — `null` قبل أوّل مسح؛ انظر فقرة `matchCount` أعلاه. */
  readonly matchCount: number | null

  /** اسم متغيّر CSS الذي يعرّف الأصلي، أو `null` حين لا متغيّر — يُعطِّل الخيار الثالث. */
  readonly variableName: string | null

  readonly contrast: ReplaceContrastView | null

  readonly onApply?: () => void
  readonly onReset?: () => void
  readonly onClose?: () => void
}

/**
 * سطر «كل العناصر المطابقة» — عدٌّ بشري بأرقام هندية عبر `formatHuman`
 * وحدها، بصيَغ عربية صحيحة لكل مدى عدديّ. انظر فقرة رفض `plural()` في
 * ترويسة الملفّ لتعليل عدم استعمال المُصرِّف العامّ هنا.
 */
function matchCountLabel(count: number): string {
  if (count === 1) return 'عنصر واحد يستخدم اللون نفسه'
  if (count === 2) return 'عنصران يستخدمان اللون نفسه'
  if (count >= 3 && count <= 10) return `${formatHuman(count)} عناصر تستخدم اللون نفسه`
  return `${formatHuman(count)} عنصرًا يستخدم اللون نفسه`
}

/** صفّ اختيار واحد في مجموعة النطاق — مدخل مخفيّ + نصّ ونقطة مرئيّان. */
function ScopeRow({
  label,
  description,
  selected,
  disabled = false,
  onSelect,
}: {
  label: string
  description: JSX.Element | string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <label
      class="rasd-ov-rep-scope-row"
      data-selected={selected ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
    >
      <input
        type="radio"
        name="rasd-ov-rep-scope"
        class="rasd-ov-rep-scope-input"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
      />
      <span class="rasd-ov-rep-scope-text">
        <span class="rasd-ov-rep-scope-label">{label}</span>
        <span class="rasd-ov-rep-scope-desc">{description}</span>
      </span>
      <span class="rasd-ov-rep-scope-dot" aria-hidden="true" />
    </label>
  )
}

export function ReplacePanel({
  originalHex,
  originalSwatch,
  replacementHex,
  replacementSwatch,
  scope,
  onScopeChange,
  matchCount,
  variableName,
  contrast,
  onApply,
  onReset,
  onClose,
}: ReplacePanelProps): JSX.Element {
  return (
    <section class="rasd-ov-rep" data-rasd-ov="replace-panel" aria-label="استبدال مؤقّت">
      {/* العنوان أوّلًا في DOM لا زرّ الإغلاق — مقيسٌ من `125:227`؛ انظر ترويسة الملفّ. */}
      <header class="rasd-ov-rep-head">
        <span class="rasd-ov-rep-title">
          <span>استبدال مؤقّت</span>
          <Icon name="color-replace" size="sm" class="rasd-ov-rep-title-icon" />
        </span>
        <button type="button" class="rasd-ov-rep-icon" onClick={onClose} aria-label="إغلاق">
          <Icon name="close" size="sm" />
        </button>
      </header>

      {/* الأصلي يمينًا (أوّلًا في DOM) — البديل يسارًا، بحلقة تركيز ثابتة. */}
      <div class="rasd-ov-rep-swap">
        <span class="rasd-ov-rep-swatch">
          <span
            class="rasd-ov-rep-swatch-color"
            data-role="original"
            style={{ '--rasd-ov-sample': originalSwatch }}
            data-rasd-ov-sample=""
          />
          <TechnicalValue kind="color" variant="mono-s">
            {originalHex.toUpperCase()}
          </TechnicalValue>
          <span class="rasd-ov-rep-swatch-label">الأصلي</span>
        </span>

        <span class="rasd-ov-rep-swatch">
          <span
            class="rasd-ov-rep-swatch-color"
            data-role="replacement"
            style={{ '--rasd-ov-sample': replacementSwatch }}
            data-rasd-ov-sample=""
          />
          <TechnicalValue kind="color" variant="mono-s">
            {replacementHex.toUpperCase()}
          </TechnicalValue>
          <span class="rasd-ov-rep-swatch-label">البديل</span>
        </span>
      </div>

      <div class="rasd-ov-rep-scope" role="radiogroup" aria-label="نطاق الاستبدال">
        <span class="rasd-ov-rep-scope-title">نطاق الاستبدال</span>

        {/* «العنصر المحدَّد فقط» — تعميم عن «الزر المحدَّد فقط» في اللقطة؛ انظر ترويسة الملفّ. */}
        <ScopeRow
          label="عنصر واحد"
          description="العنصر المحدَّد فقط"
          selected={scope === 'element'}
          onSelect={() => onScopeChange('element')}
        />

        <ScopeRow
          label="كل العناصر المطابقة"
          description={matchCount === null ? 'لم يُحسب العدد بعد' : matchCountLabel(matchCount)}
          selected={scope === 'matches'}
          onSelect={() => onScopeChange('matches')}
        />

        <ScopeRow
          label="متغيّر CSS كاملًا"
          description={
            variableName === null ? (
              'لا متغيّر CSS يعرّف هذا اللون'
            ) : (
              <>
                <TechnicalValue kind="variable" variant="inherit">
                  {variableName}
                </TechnicalValue>
                <span> في كل الصفحة</span>
              </>
            )
          }
          selected={scope === 'variable'}
          disabled={variableName === null}
          onSelect={() => onScopeChange('variable')}
        />
      </div>

      {contrast ? (
        <div class="rasd-ov-rep-contrast">
          <Icon name="contrast-check" size="sm" />
          <span class="rasd-ov-rep-against">{contrast.against}</span>
          <TechnicalValue kind="code" variant="mono-xs">
            {contrast.ratio}
          </TechnicalValue>
          <span class="rasd-ov-rep-verdict" data-level={contrast.level}>
            {contrast.badge}
          </span>
        </div>
      ) : null}

      <p class="rasd-ov-rep-note">
        <Icon name="info" size="sm" />
        <span>المعاينة مؤقتة داخل المتصفح ولا تُعدّل أي ملف في المشروع.</span>
      </p>

      {/* البارز («طبّق المعاينة») أوّلًا في DOM فيقع يمينًا؛ النصّ قبل الأيقونة في كليهما — يطابق `ColourPanel`. */}
      <footer class="rasd-ov-rep-actions">
        <button type="button" class="rasd-ov-rep-btn rasd-ov-rep-btn-primary" onClick={onApply}>
          <span>طبّق المعاينة</span>
          <Icon name="check" size="sm" />
        </button>
        <button type="button" class="rasd-ov-rep-btn" onClick={onReset}>
          <span>أعد الضبط</span>
          <Icon name="refresh" size="sm" />
        </button>
      </footer>
    </section>
  )
}
