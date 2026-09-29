import { SOURCE_LABELS } from '@/modules/colour/sources'
import { formatHuman, formatPercent, plural } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import type { PaletteFormat } from '@/modules/colour/export'
import type { ColourSource } from '@/modules/colour/sources'
import type { PaletteSwatch } from '@/shared/messaging/contract'
import type { JSX } from 'preact'

/**
 * لوحة استخراج لوحة الصفحة — `colors / palette-extract` (`122:157`). **تعرض
 * ولا تحسب**، على نمط `ColourPanel`/`ScalePanel` الملزِم حرفيًّا: تستقبل
 * تحكّمات وقيمًا جاهزة وتُبلّغ الأفعال بمعاودات. لا استدعاء لـ`extractPalette`
 * ولا `classifyPaletteSources` ولا `collectDeclaredColours` هنا — تلك تقع
 * كلّها في الخلفية (`ADR 0017`) أو سكربت المحتوى.
 *
 * **«طريقة القراءة: من CSS / من البكسل» — الفرق حقيقي، وهذا قراره.**
 * `§6.4` يسمّي مصدرين مختلفين حرفيًّا: «الاستخراج من البكسلات» (يقرأ اللون
 * الفعلي الظاهر — صور وتدرّجات وشفافية، وهذا **دائمًا** ما يفعله محرّك
 * `palette/extract`)، و«الاستخراج من CSS» (يقرأ `color`/`background-color`/
 * `border-color`/`fill`/`stroke`/الظلال والتدرّجات — وهذه بالضبط
 * `SITE_PROPS` في `modules/colour/usage.ts`). فـ«من CSS» هنا تعني: يبني
 * المستدعي اللوحة من `collectDeclaredColours` وحدها (تفريدًا بالقيمة
 * المنسَّقة، بلا أي التقاط بكسل)، متجاوزًا `palette/extract` كليًّا — لا
 * وسيطًا زخرفيًّا. القيمة `readMethod` تُبلَّغ فحسب؛ أيّ الرسالتين تُستدعى
 * قرار سكربت المحتوى.
 *
 * **«افصل ألوان الواجهة عن الصور» هو مفتاح `classifyPaletteSources`
 * حرفيًّا.** حين يُفعَّل، يجمع المستدعي `DeclaredColour[]` (عنده أصلًا من
 * الفقرة أعلاه) ويصنّف بها كل مدخل عبر `classifyPaletteSources` — **مرّة
 * واحدة على المصفوفة كاملة**، لا مرّة لكل عيّنة، فتلك دالّة O(عيّنات×مصرَّح)
 * لا تصلح نداءً متكرّرًا داخل عرض. النتيجة تصل هنا جاهزةً في
 * `PaletteSwatchView.source`. وحين يُطفأ المفتاح، `source` تصل `null` لكل
 * مدخل، فتُعرض النسبة وحدها بلا تسمية — لا نصّ بديل يُخترَع (خلافًا لحالة
 * `ColourVarView.origin` في `ColourPanel`، فتلك تصف **فشل قراءة** يستحقّ
 * إعلانًا، وهذه **تفضيل مستخدم** لا شيء ناقصًا فيه ليُعلَن).
 *
 * **وارداً استيراد `SOURCE_LABELS` بصفته قيمة لا نوعًا فقط — سابقة
 * `ViewportGallery.tsx` بالحرف.** تلك تستورد `classifyDiffStatus` (تصنيف)
 * و`DIFF_STATUS_LABELS` (تسميات) من `modules/compare/diff-status`، وتُطبِّق
 * الأولى وتفهرس الثانية **داخل المكوّن** — موثَّقةً هناك بأنها «وحدة منطق
 * خالصة قابلة للاختبار لا شرطٌ داخل المكوّن». هذا الملفّ يقتبس **نصف** تلك
 * السابقة فقط: يفهرس `SOURCE_LABELS[source]` (بحث O(1) في كائن ثابت، لا
 * حساب) ولا يستورد `classifyPaletteSources` نفسها إطلاقًا — تلك ثقيلة
 * (تُقارن كل عيّنة بكل لون مصرَّح) ومصرَّح عنها صراحةً في المهمّة أنها تقع في
 * سكربت المحتوى بعد وصول الردّ.
 *
 * **مصادر اللوحة أربعة من الخمسة في `§6.1` — «كل الصفحة» محذوفة، لا
 * معطَّلة.** `shared/messaging/contract.ts` يوثِّق مصدرين لرسالة
 * `palette/extract` فحسب: `viewport` (بمستطيل اختياري يغطّي «الظاهر» بلا
 * مستطيل، و«منطقة»/«عنصر» **بنفس الشكل** برأي المستدعي فيه) و`capture`
 * («من لقطة»). وتعليق تلك الرسالة صريح: «الصفحة كاملة» **غير مدعوم هنا**
 * — يحتاج خطّ تجميع متعدّد البلاطات (المرحلة 10) لا لقطةً واحدة، فجوة
 * معلَنة في العقد نفسه. وسابقة المرحلة 7 («ما لا محرّك له يُحذَف»، مطبَّقة
 * حرفيًّا في `ComparePanel`/`CompareIdle` لزرّ «أعد فحص كل المقاسات») تُطبَّق
 * هنا بالحرف: لا تبويب خامس بلا رسالة تخدمه.
 *
 * **عدد الألوان يقبل أيّ رقم موجب — لا الثلاثة الجاهزة فقط.** `§6.2` يذكر
 * «عدد مخصّص» صراحةً، و`PaletteOptions.count` في `modules/colour/palette.ts`
 * رقمٌ حرّ بلا سقف. فتبويب «مخصّص» ليس ديكوريًّا: حين يُفعَّل يظهر حقل رقم
 * صغير (`min=1`، مطابقًا لـ`Math.max(1, Math.floor(opts.count))` في
 * `palette.ts`) — **لا مرجع بصري لهيئة هذه الحالة بالذات** بين اللقطات
 * الخمس المفحوصة لهذه المرحلة، فهذا حقل أدنى يكفي الوظيفة بلا زخرفة
 * مُخترَعة، مُعلَنٌ هنا فجوةً بصريّة لا ادّعاء تطابق. `CUSTOM_SEED` (10) قيمة
 * بداية تعسّفية بين `8` و`12` الحاضرتين، تتبدّل فور أوّل تعديل من المستخدم.
 *
 * **عدّاد النتيجة والنِّسَب — قسمة `§3.5` البند 1، لا نسخًا حرفيًّا للقطة.**
 * الاستطلاع البصري لـ`122:157` رصد **تناقضًا داخل الإطار نفسه**: تجزئة
 * «عدد الألوان» تكتب «٨» بأرقام هندية، ورأس النتائج («المستخرَج») يكتب «8»
 * غربيًّا لنفس المفهوم بالضبط — عدد الألوان. النصّ لهذه المرحلة صريح: «قيم
 * الألوان غربية» (تخصّ السداسي/`OKLCH`، لا عدّ الألوان)، وعدّ عناصر بشريّ
 * كـ«٨ ألوان» يقع تحت البند نفسه الذي يحكم «يستخدمه ١٤ عنصرًا» في
 * `ColourPanel` — **هنديّ في الموضعين**، وما كتبه رأس النتائج بالعربية
 * الغربية هنا عيبُ مصدرٍ يُصحَّح في المرحلة 26أ لا سهوًا هنا (نفس معاملة
 * السطرين المكرَّرين حرفًا بحرف في `colors / idle`، ملفّ المرحلة 13 السابق (تاريخ Git) الصفّ 61).
 * أمّا **النِّسَب** (`٣٤٪` في اللقطة) فقياسٌ تقني بالتعريف — بند `§3.5` الأوّل
 * يسمّيها صراحةً: «غربية … لكل قياس وبُعد **ونسبة**… عبر `formatMeasure`»،
 * وهو نصّ الحكم الذي صحَّح `ComparePanel` عليه («شفافية المرجع»/«موضع
 * الفاصل») من هندية إلى `formatPercent` في إغلاق المرحلة 16 (`Docs/Engineering.md`
 * الصفّ 88) — فالإطار هنا يخالف القاعدة نفسها بالاتجاه نفسه، وتُحسم بها:
 * `formatPercent` (غربية) لا الأرقام الهندية التي ترسمها اللقطة.
 *
 * **بطاقة العيّنة: المربّع أوّلًا في DOM، لا النصّ — خلافًا لـ`ColourPanel`
 * قصدًا لا سهوًا.** `ColourPanel.rasd-ov-cp-swatch-block` يضع النصّ
 * (`ident`) أوّلًا فيقع يمينًا. وقياس هذا الإطار بالذات (`122:256`، مسحًا
 * لونيًّا للبكسلات) يعطي العكس: مربّع اللون عند حافّة كل بطاقة اليمنى،
 * والنصّ (السداسي فالتصنيف) يسارَه — فمربّع اللون هو الأوّل في DOM هنا.
 * إطاران مختلفان، وقياسان مختلفان، وكلاهما صحيح لصاحبه.
 *
 * **ترتيب الشبكة لا يُعاد بناؤه يدويًّا — يتبع `ScalePanel.tsx` حرفيًّا لا
 * اللقطة.** قياس `122:256` نفسه يكشف أن المدخل الأعلى حصّة (`٣٤٪`) يقع في
 * العمود **الأيسر** والثاني (`٢٢٪`) في الأيمن — أي ترتيب قراءة **لاتيني**
 * (يسار فيمين) داخل واجهة عربية، وهذا واحدٌ من ثلاثة مواضع ذكرتها المهمّة
 * صراحةً بصفتها مخالفات يكشفها القياس لا الوصف. لا قاعدة تُستنبَط من هذا
 * (لا شيء في البيانات يقول «الحصّة الثانية تسبق الأولى بصريًّا») — فأرجَح
 * تفسير أنه ترتيبٌ يدويّ عارض من المصمّم لا نيّة مبنيّة. فالشبكة هنا تتّبع
 * مبدأ `ScalePanel.tsx` المصرَّح صراحة في ترويسته: «بلا `flex-direction:
 * row-reverse` ولا مصفوفة معكوسة يدويًّا» — `swatches` تُرسَم بترتيبها كما
 * وصلت (الحصّة تنازليًّا، من `palette.ts`) تحت `direction: rtl` الموروثة،
 * فيقع المدخل الأوّل يمينًا تلقائيًّا بلا أي عكس هنا.
 *
 * **أيقونة العنوان وحدها ملوَّنة بلون الأداة — لا العنوان كلّه.** قِيس
 * تفصيل ألوان بكسلات `122:157` مباشرةً: نصّ «لوحة الصفحة» أبيض محايد
 * (‏≈`rgb(244,247,249)`، بلا انحياز حراري)، وأيقونة `swatches` كهرمانية
 * صريحة (‏≈`rgb(201,145,77)`، تطابق `--rasd-tool-colors-fg`). خلافًا
 * لـ`.rasd-ov-cp-title`/`.rasd-ov-scl-title` اللتين تُلوِّنان الكتلة كلّها
 * بلون الأداة — قياسٌ مختلف لإطار مختلف، فالتلوين هنا على الأيقونة وحدها.
 *
 * **زرّ «احفظ اللوحة» وأزرار التصدير: الأيقونة أوّلًا في DOM، لا النصّ —
 * خلافًا لِزرَّي `ColourPanel` أيضًا.** قِيست الأزرار الأربعة مباشرةً
 * (`122:157`، صفّ الإجراءات): في الأربعة كلّها الأيقونة تقع عند الحافّة
 * اليمنى للزرّ والنصّ يسارَها — عكس ترتيب «حفظ»/«جرّب بديلًا» في
 * `ColourPanel` (نصّ ثم أيقونة). كلاهما مقيسٌ من إطاره لا مفترَضًا من الآخر.
 *
 * **لا زرّ نسخ فرديّ لأي قيمة، ولا صيغة «نصّ قابل للنسخ» — نفس قرارَي
 * `ScalePanel` بالضبط ولنفس السبب.** فُحصت البطاقات الثماني في `122:256`:
 * لا أيقونة نسخ عند أيّ سداسي. وأزرار التصدير أربعة فقط (`CSS`/`JSON`/
 * `Tailwind`/حفظ) لا خامس — فـ`onExport` هنا `Exclude<PaletteFormat,
 * 'text'>` كما هناك بالحرف.
 *
 * **`droppedNeutrals` يُعلَن حين يقع، ولا يُخترَع حين لا لقطة تُثبته.**
 * `PaletteExtraction.droppedNeutrals` في `contract.ts` موسومٌ صراحةً «يُعلَن
 * ولا يُخفى بصمت» — فحين يصل هذا الرقم موجبًا (المستخدم فعَّل «إخفاء
 * الألوان الحيادية» بإسقاط لا وسمٍ فقط) تُعرض جملة تحته، على نمط تنبيه
 * `mismatch`/`outOfGamut` في `ColourPanel` (نصٌّ شرطي هادئ، لا شارة صارخة).
 * غيابه (٠ أو لم يُمرَّر) لا يرسم شيئًا — يطابق حال اللقطة المرجعية نفسها.
 *
 * **`extracting` حالة ثالثة صريحة — على نمط `ColourUsageView.scanning`
 * و`ComparePanelProps.diffBusy`.** الاستخراج عملية median-cut على بكسلات
 * حقيقية، لا فورية بالضرورة؛ وبلا هذا العلم كانت الشبكة الفارغة أثناء
 * الانتظار ستُقرأ «لا ألوان» كاذبةً بدل «لم يكتمل الاستخراج بعد».
 */

/** خيارا القراءة — الفرق حقيقي بينهما، انظر الفقرة الثانية في ترويسة الملفّ. */
export type PaletteReadMethod = 'pixel' | 'css'

/**
 * مصادر اللوحة الأربعة ذوات المحرّك — انظر فقرة «كل الصفحة محذوفة» أعلاه.
 * `region`/`element` تصلان الخلفية بالشكل السلكي نفسه (`viewport` + مستطيل)
 * لكنّهما نيّتا مستخدم متمايزتان: رسم منطقة مقابل نقر عنصر، وسكربت المحتوى
 * (خارج هذا الملفّ) من يترجم أيّهما إلى `DeviceRect` فعليّ.
 */
export type PaletteSourceKind = 'viewport' | 'element' | 'region' | 'capture'

/** لونٌ في اللوحة المستخرَجة، مصنَّفًا إن طُلب — يمدّد `PaletteSwatch` السلكي بحقل عرض واحد. */
export interface PaletteSwatchView extends PaletteSwatch {
  /** تصنيف `classifyPaletteSources`، أو `null` حين «افصل ألوان الواجهة عن الصور» مطفأ. */
  readonly source: ColourSource | null
}

export interface PalettePanelProps {
  readonly source: PaletteSourceKind
  readonly onSourceChange: (source: PaletteSourceKind) => void
  /** أيّ رقم موجب — ليس محصورًا بـ`5`/`8`/`12`؛ انظر فقرة «مخصّص» أعلاه. */
  readonly count: number
  readonly onCountChange: (count: number) => void
  readonly readMethod: PaletteReadMethod
  readonly onReadMethodChange: (method: PaletteReadMethod) => void
  readonly hideNeutrals: boolean
  readonly onHideNeutralsChange: (value: boolean) => void
  /** «افصل ألوان الواجهة عن الصور» — مفتاح `classifyPaletteSources` عند المستدعي. */
  readonly separateSources: boolean
  readonly onSeparateSourcesChange: (value: boolean) => void
  /** اللوحة الحالية — مصفوفة دائمًا، فارغة حين لا نتيجة بعد (لا `undefined`). */
  readonly swatches: readonly PaletteSwatchView[]
  /** استخراج جارٍ — يُعرض تقدّمًا نصّيًّا بدل شبكة فارغة أو قديمة كاذبة. */
  readonly extracting?: boolean
  /** عناقيد حيادية أُسقطت — `PaletteExtraction.droppedNeutrals`، يُعلَن لا يُخفى. */
  readonly droppedNeutrals?: number
  readonly onExport?: (format: Exclude<PaletteFormat, 'text'>) => void
  readonly onSave?: () => void
  readonly onClose?: () => void
  /**
   * سببٌ يمنع الاستخراج حاليًّا لهذا المصدر بعينه — يحلّ محلّ الشبكة، لا
   * يُضاف فوقها. **وليس هذا مكانًا لأخطاء الشبكة أو المحرّك** (تلك حالتها
   * `extracting`/شبكة فارغة عادية بعد محاولة حقيقية)، بل لمصدرٍ **يُعرَض
   * تبويبه ولا مسار كودٍ خلفه بعد** — نفس مبدأ سابقة المرحلة 7 («لا زرّ بلا
   * محرّك خلفه») مطبَّقًا على تبويب لا زرّ: التبويب يبقى قابلًا للاختيار
   * (حذفه كان سيخالف §6.1 الذي يسمّي المصادر الأربعة)، ونتيجة اختياره
   * رسالةٌ صادقة بدل شبكة فارغة تُقرأ «استُخرجت فلم يوجد لون».
   */
  readonly unavailable?: string
}

/** بترتيب DOM المقيس من `122:211`: الظاهر (يمينًا) → عنصر → منطقة → من لقطة (يسارًا). */
const SOURCE_OPTIONS: readonly { readonly kind: PaletteSourceKind; readonly label: string }[] = [
  { kind: 'viewport', label: 'الظاهر' },
  { kind: 'element', label: 'عنصر' },
  { kind: 'region', label: 'منطقة' },
  { kind: 'capture', label: 'من لقطة' },
]

/** بترتيب DOM المقيس من `122:211`: ٥ (يمينًا) → ٨ → ١٢ → مخصّص (يسارًا). */
const COUNT_PRESETS: readonly number[] = [5, 8, 12]

/** بداية تعسّفية لتبويب «مخصّص» عند أوّل تفعيل — انظر ترويسة الملفّ. */
const CUSTOM_SEED = 10

/** بترتيب DOM المقيس من `122:211`: من البكسل (يمينًا، فعّالة في اللقطة) → من CSS (يسارًا). */
const READ_METHOD_OPTIONS: readonly {
  readonly method: PaletteReadMethod
  readonly label: string
}[] = [
  { method: 'pixel', label: 'من البكسل' },
  { method: 'css', label: 'من CSS' },
]

/** صفّ تبويبات مشترك للتحكّمات الثلاثة — نفس توكنات `.rasd-ov-cmp-mode`/`.rasd-ov-cmp-tab`. */
function TabRow<T extends string>({
  ariaLabel,
  options,
  active,
  onChange,
  equalWidth = true,
}: {
  ariaLabel: string
  options: readonly { readonly label: string; readonly value: T }[]
  active: T
  onChange: (value: T) => void
  /** `false` للتحكّم ذي الخيارين — تبويبات بحجم محتواها، على نمط `.rasd-ov-scl-step-tab`. */
  equalWidth?: boolean
}): JSX.Element {
  return (
    <div
      class="rasd-ov-pal-tabs"
      data-compact={equalWidth ? 'false' : 'true'}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === active}
          class="rasd-ov-pal-tab"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function PalettePanel({
  source,
  onSourceChange,
  count,
  onCountChange,
  readMethod,
  onReadMethodChange,
  hideNeutrals,
  onHideNeutralsChange,
  separateSources,
  onSeparateSourcesChange,
  swatches,
  extracting = false,
  droppedNeutrals = 0,
  onExport,
  onSave,
  onClose,
  unavailable,
}: PalettePanelProps): JSX.Element {
  const isCustomCount = !COUNT_PRESETS.includes(count)

  return (
    <section class="rasd-ov-pal" data-rasd-ov="palette-panel" aria-label="لوحة الصفحة">
      {/* العنوان أوّلًا في DOM لا زرّ الإغلاق — نفس تصحيح مرآة `ColourPanel` (`Docs/Engineering.md §3.5` البند 3). */}
      <header class="rasd-ov-pal-head">
        <span class="rasd-ov-pal-title">
          <span>لوحة الصفحة</span>
          <Icon name="swatches" size="sm" class="rasd-ov-pal-title-icon" />
        </span>
        <button type="button" class="rasd-ov-pal-icon" onClick={onClose} aria-label="إغلاق">
          <Icon name="close" size="sm" />
        </button>
      </header>

      <div class="rasd-ov-pal-controls">
        <div class="rasd-ov-pal-group">
          <span class="rasd-ov-pal-group-label">المصدر</span>
          <TabRow
            ariaLabel="مصدر اللوحة"
            options={SOURCE_OPTIONS.map((o) => ({ value: o.kind, label: o.label }))}
            active={source}
            onChange={onSourceChange}
          />
        </div>

        <div class="rasd-ov-pal-group">
          <span class="rasd-ov-pal-group-label">عدد الألوان</span>
          <div class="rasd-ov-pal-tabs" role="tablist" aria-label="عدد الألوان">
            {COUNT_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={n === count}
                class="rasd-ov-pal-tab"
                onClick={() => onCountChange(n)}
              >
                {/* عدٌّ بشري بأرقام هندية (`§3.5` البند 1) — كتجزئة `ScalePanel` بالضبط. */}
                {formatHuman(n)}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={isCustomCount}
              class="rasd-ov-pal-tab"
              onClick={() => {
                if (!isCustomCount) onCountChange(CUSTOM_SEED)
              }}
            >
              {isCustomCount ? formatHuman(count) : 'مخصّص'}
            </button>
          </div>
          {isCustomCount ? (
            <label class="rasd-ov-pal-custom-count">
              <span>عدد مخصّص</span>
              <input
                type="number"
                min={1}
                class="rasd-ov-pal-custom-count-input"
                value={count}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
                  const next = Math.floor(Number(e.currentTarget.value))
                  onCountChange(Number.isFinite(next) && next > 0 ? next : 1)
                }}
              />
            </label>
          ) : null}
        </div>

        <div class="rasd-ov-pal-group">
          <span class="rasd-ov-pal-group-label">طريقة القراءة</span>
          <TabRow
            ariaLabel="طريقة القراءة"
            options={READ_METHOD_OPTIONS.map((o) => ({ value: o.method, label: o.label }))}
            active={readMethod}
            onChange={onReadMethodChange}
            equalWidth={false}
          />
        </div>

        <label class="rasd-ov-pal-toggle">
          <input
            type="checkbox"
            role="switch"
            class="rasd-ov-pal-toggle-input"
            checked={hideNeutrals}
            onChange={(e: JSX.TargetedEvent<HTMLInputElement>) =>
              onHideNeutralsChange(e.currentTarget.checked)
            }
          />
          <span class="rasd-ov-pal-toggle-text">
            <span class="rasd-ov-pal-toggle-title">إخفاء الألوان الحيادية</span>
            <span class="rasd-ov-pal-toggle-desc">الأبيض والأسود والرماديات</span>
          </span>
          <span class="rasd-ov-pal-toggle-track" aria-hidden="true">
            <span class="rasd-ov-pal-toggle-knob" />
          </span>
        </label>

        <label class="rasd-ov-pal-toggle">
          <input
            type="checkbox"
            role="switch"
            class="rasd-ov-pal-toggle-input"
            checked={separateSources}
            onChange={(e: JSX.TargetedEvent<HTMLInputElement>) =>
              onSeparateSourcesChange(e.currentTarget.checked)
            }
          />
          <span class="rasd-ov-pal-toggle-text">
            <span class="rasd-ov-pal-toggle-title">افصل ألوان الواجهة عن الصور</span>
            <span class="rasd-ov-pal-toggle-desc">يعرض مصدر كل لون</span>
          </span>
          <span class="rasd-ov-pal-toggle-track" aria-hidden="true">
            <span class="rasd-ov-pal-toggle-knob" />
          </span>
        </label>
      </div>

      <div class="rasd-ov-pal-results">
        <div class="rasd-ov-pal-results-head">
          <span class="rasd-ov-pal-results-label">المستخرَج</span>
          {!extracting && !unavailable ? (
            <span class="rasd-ov-pal-results-count">
              {/*
               * هنديّ — عدٌّ بشري (`§3.5` البند 1)، ويصحّح تناقضًا داخل
               * الإطار المرجعي نفسه؛ انظر فقرة «عدّاد النتيجة» في ترويسة الملفّ.
               */}
              {plural(swatches.length, 'لون', 'لونين', 'ألوان')}
            </span>
          ) : null}
        </div>

        {unavailable ? (
          <p class="rasd-ov-pal-status">{unavailable}</p>
        ) : extracting ? (
          <p class="rasd-ov-pal-status">جارٍ الاستخراج…</p>
        ) : (
          <div class="rasd-ov-pal-grid">
            {swatches.map((s, i) => (
              <div key={`${s.hex}-${i}`} class="rasd-ov-pal-card">
                <span
                  class="rasd-ov-pal-card-sw"
                  style={{ '--rasd-ov-sample': s.hex }}
                  data-rasd-ov-sample=""
                />
                <span class="rasd-ov-pal-card-text">
                  <TechnicalValue kind="color" variant="mono-xs">
                    {s.hex.toUpperCase()}
                  </TechnicalValue>
                  <span class="rasd-ov-pal-card-meta">
                    {s.source ? `${SOURCE_LABELS[s.source]} · ` : ''}
                    {/* نسبة — قياس تقني (`§3.5` البند 1)، غربية عبر `formatPercent`؛ انظر ترويسة الملفّ. */}
                    <TechnicalValue kind="code" variant="inherit">
                      {formatPercent(s.share)}
                    </TechnicalValue>
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {!extracting && droppedNeutrals > 0 ? (
          <p class="rasd-ov-pal-note">
            {`أُسقطت أيضًا ${plural(droppedNeutrals, 'لون حيادي واحد', 'لونان حياديان', 'ألوان حيادية')}`}
          </p>
        ) : null}
      </div>

      {/* الأيقونة أوّلًا في DOM في الأزرار الأربعة كلّها — مقيسٌ من `122:157`؛ انظر ترويسة الملفّ. */}
      {/*
       * `title` على الثلاثة — لا أيقونة ولا نصٍّ جديد يخالف عدّ Figma
       * الأربعة، لكنّها صارت تُنزِّل ملفًّا لا تنسخ (الوحدة 19.2)، والتلميح
       * وحده كان يكفي هنا لأن النصّ المرئي اسم صيغة مجرَّد بلا فعل («CSS»
       * لا «نسخ CSS») — فلا كلمة صريحة عليه تحتاج تصحيحًا كما في لوحة الفحص.
       */}
      <footer class="rasd-ov-pal-actions">
        <button type="button" class="rasd-ov-pal-btn" data-primary="true" onClick={onSave}>
          <Icon name="swatches" size="sm" />
          <span>احفظ اللوحة</span>
        </button>
        <button
          type="button"
          class="rasd-ov-pal-btn"
          title="تنزيل ملفّ Tailwind"
          onClick={() => onExport?.('tailwind')}
        >
          <Icon name="file-code" size="xs" />
          <TechnicalValue kind="format" variant="mono-xs">
            Tailwind
          </TechnicalValue>
        </button>
        <button
          type="button"
          class="rasd-ov-pal-btn"
          title="تنزيل ملفّ JSON"
          onClick={() => onExport?.('json')}
        >
          <Icon name="file-code" size="xs" />
          <TechnicalValue kind="format" variant="mono-xs">
            JSON
          </TechnicalValue>
        </button>
        <button
          type="button"
          class="rasd-ov-pal-btn"
          title="تنزيل ملفّ CSS"
          onClick={() => onExport?.('css')}
        >
          <Icon name="file-code" size="xs" />
          <TechnicalValue kind="format" variant="mono-xs">
            CSS
          </TechnicalValue>
        </button>
      </footer>
    </section>
  )
}
