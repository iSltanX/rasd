import { formatMeasure, plural } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import type { PaletteFormat } from '@/modules/colour/export'
import type { JSX } from 'preact'

/**
 * لوحة توليد درجات اللون — `colors / scale` (`125:355`). **تعرض ولا
 * تحسب**، كبقيّة لوحات الطبقة (`ColourPanel`/`ComparePanel`/`InspectPanel`
 * هو النمط الملزِم المتّبَع هنا حرفيًّا): تستقبل سلّمًا جاهزًا وتُبلِّغ عن
 * الأفعال بمعاودات. لا تستدعي `generateScale` ولا `formatColour` ولا أي
 * دالّة من `modules/colour/*` — المستدعي (سكربت المحتوى) يفعل، ويُمرِّر كل
 * قيمة معروضة نصًّا جاهزًا تمامًا كما تفعل `ColourPanel` مع `ColourRow.shown`.
 *
 * **جدول العيّنة يعرض 4 درجات من 11 (أو من 9) — عيّنة مقصودة، لا قصور في
 * الإطار.** الإطار يثبّت `300`·`500`·`700`·`900` بصرف النظر عن اختيار
 * «١١ درجة»/«٩ درجات» في صفّ المصدر — لو كان الجدول يتبع الاختيار لاختلف
 * طول صفّيه بين وضعَي 9 و11، ولا شيء في اللقطة المرجعية يشي بذلك (لا عنصر
 * يتوسّع أو ينكمش معها). وأربعتها نقاط متباعدة بانتظام تقريبي عبر السلّم
 * (فاتح‑متوسط · متوسط · متوسط‑غامق · غامق) تكفي لقراءة اتجاه التباين
 * والتشبّع دون تكرار الشريط كاملًا بأربعة أعمدة إضافية — وأربعتها أعضاء في
 * **كلا** المجموعتين المحتملتين (انظر الفقرة التالية)، فلا تناقض بين
 * ثبوتها واختيار عدد الدرجات. والمكوّن لا يفترض عددًا معيّنًا لطول
 * `sample`: يعرضها كما وصلت، والقرار «لماذا هذه الأربع بالذات» قرار
 * المستدعي الذي يملك السلّم الكامل من `generateScale`.
 *
 * **اشتقاق «٩ درجات» من الإحدى عشرة — قرار المستدعي، لا هذا المكوّن ولا
 * `scale.ts`.** `SCALE_STEPS` تبقى 11 درجة كما هي، بلا تعديل. حين تكون
 * القيم الأربع الثابتة أعلاه (300/500/700/900) يلزمها أن تنتمي لكلا
 * المجموعتين، فأبسط اشتقاق ودَلالته الأوضح هو إسقاط الطرفين `50` و`950`
 * وحدهما — وهما الإضافتان فوق سلّم العقد التقليدي `100..900` المعروف في
 * أنظمة تصميم كثيرة، لا اختيار عشوائي من منتصف السلّم. لكن هذه **توصية
 * مسجَّلة هنا للمستدعي، لا منطقًا مبنيًّا في هذا الملفّ**: المكوّن لا
 * يشتقّ شيئًا بنفسه — يستقبل `stops` جاهزةً بأيّ طول يطابق `steps`
 * المُمرَّرة، تمامًا كما تستقبل `ColourPanel.rows` صفوفها جاهزة.
 *
 * **«احفظ في المكتبة» بلا مسار خلفي حقيقي بعد لحفظ لوحة متعدّدة الألوان —
 * فجوة معلَنة لا ادّعاء حفظ.** `Rasd_Ar.md §6.15` ينصّ على حفظ «لون واحد»
 * **و«لوحة كاملة»** معًا، لكن `shared/messaging/contract.ts` اليوم يحمل
 * `colour/save` للون المفرد وحده (المرحلة 13) — لا رسالة لحفظ سلّم/لوحة
 * متعدّدة الألوان. فـ`onSave` هنا معاودة مجرّدة (`() => void`) تُبلِّغ طلب
 * الحفظ فحسب، على نمط `ColourPanel.onSave` نفسه بالضبط؛ وما يقع خلفها —
 * حفظ حقيقي حين يوجد مساره، أو تنبيه «غير مدعوم بعد» حتى يوجد — قرار
 * المستدعي الذي يعرف حال السلك الخلفي. هذا المكوّن لا يفترض نجاحًا لم يقع.
 *
 * **ولا زرّ نسخ فرديًّا لأي قيمة هنا — خلافًا لـ`ColourPanel` تمامًا.**
 * فُحصت اللقطة المرجعية عند كل قيمة تقنية فيها (`#7C3AED` في صفّ المصدر،
 * وكل خلية `HEX`/`OKLCH`/تباين في الجدول): لا أيقونة نسخ ظاهرة عند أيٍّ
 * منها، خلافًا لأيقونات `copy` الصريحة بجانب كل صفّ في `ColourPanel`. فهذه
 * اللوحة تتّكئ على أزرار التصدير الأربعة في ذيلها كطريق النسخ الوحيد — لا
 * `onCopy` هنا، ولا زرّ نسخ مُخترَع بلا أثر في الإطار.
 *
 * **صيغ التصدير الثلاث تُبلَّغ بمعاودة مجرّدة أيضًا (`onExport`)، لا بنصّ
 * جاهز.** توليد النصّ الفعلي يمرّ بـ`exportPalette` في
 * `modules/colour/export.ts` (`§6.14`) — وهذا الملفّ لا يستورد منه غير
 * نوع `PaletteFormat` (نوعًا لا دالّة، على نمط استيراد `ComparePanel` نوع
 * `CompareDisplayMode` من `modules/compare/overlay.ts`): توليد كل صيغة
 * حسابٌ يخصّ المستدعي وحده، وتوليدها عند كل تغيّر بلا طلب فعلي هدرٌ لا
 * داعي له. وصيغة «نصّ قابل للنسخ» (الرابعة في `exportPalette`) غائبة
 * عمدًا هنا: أربعة أزرار فقط في اللقطة المرجعية، لا خامس أو رابع بديل.
 *
 * **ترتيب DOM يتبع اتجاه RTL الطبيعي لا انعكاسًا يدويًّا.** هذا الملفّ
 * كلّه بلا `flex-direction: row-reverse` ولا مصفوفة معكوسة يدويًّا — تحت
 * `direction: rtl` أوّل عنصر في DOM يقع عند بداية المحور دائمًا (يمينًا
 * لصفّ، وأعلى لعمود)، ونفس القاعدة الأصيلة لأعمدة `<table>`. فترتيب
 * `stops`/`sample` كما يصلان من المستدعي (تصاعديًّا 50→950، مطابقًا لترتيب
 * `SCALE_STEPS` نفسه) يُنتج تلقائيًّا الأغمق يسارًا/الأفتح يمينًا كما في
 * اللقطة المرجعية، بلا حاجة لعكس أي مصفوفة هنا.
 */

/** خيارا تجزئة عدد الدرجات، بترتيب DOM الذي يضع «١١» يمينًا و«٩» يسارًا. */
export type ScaleStepCount = 9 | 11

const STEP_OPTIONS: readonly ScaleStepCount[] = [11, 9]

/** درجة واحدة في شريط التدرّج — لون وعنوانها فقط، بلا صيغ إضافية. */
export interface ScaleStripStop {
  /** رقم الدرجة — 50…950. تسمية تقنية لمقياس لا عدّ بشري (`§3.5` البند 1). */
  readonly step: number
  /** القيمة السداسية بعد التقريب — للعيّنة المرئية فقط. */
  readonly hex: string
}

/** صفّ واحد في جدول العيّنة الأربعة — كل قيمة نصّ جاهز مُنسَّق مسبقًا. */
export interface ScaleSampleRow {
  readonly step: number
  readonly hex: string
  /** OKLCH منسَّقة مضغوطة، جاهزة: `"0.66 0.218 300"` — نفس فلسفة `ColourRow.shown`. */
  readonly oklch: string
  /** نسبة التباين على الأبيض، منسَّقة جاهزة من `contrast.ts` عبر المستدعي: `"3.47 : 1"`. */
  readonly contrastRatio: string
}

export interface ScalePanelProps {
  /** القيمة السداسية للون الأساس. */
  baseHex: string
  /** لون عيّنة الأساس — قيمة CSS تُمرَّر سطريًا، كـ`ColourPanel.swatch`: لا توكن يمثّل لونًا حسابيًا. */
  baseSwatch: string
  steps: ScaleStepCount
  /** درجات الشريط، بترتيب 50→950 — انظر فقرة ترتيب DOM في رأس الملفّ. */
  stops: readonly ScaleStripStop[]
  /** عيّنة الجدول الأربع — انظر شرح القرار «عيّنة مقصودة» في رأس الملفّ. */
  sample: readonly ScaleSampleRow[]
  onStepsChange: (steps: ScaleStepCount) => void
  /** صيغة «نصّ قابل للنسخ» مُستبعَدة عمدًا — انظر رأس الملفّ. */
  onExport?: (format: Exclude<PaletteFormat, 'text'>) => void
  onSave?: () => void
  onClose?: () => void
}

const EXPORT_BUTTONS: readonly {
  readonly format: Exclude<PaletteFormat, 'text'>
  readonly label: string
  /** تنزيلٌ لا نسخ منذ 19.2 — تلميحٌ لا زرّ إضافي، النصّ المرئي اسم صيغة مجرَّد. */
  readonly title: string
}[] = [
  { format: 'json', label: 'JSON', title: 'تنزيل ملفّ JSON' },
  { format: 'tailwind', label: 'Tailwind config', title: 'تنزيل ملفّ Tailwind' },
  { format: 'css', label: 'CSS Variables', title: 'تنزيل ملفّ CSS' },
]

export function ScalePanel({
  baseHex,
  baseSwatch,
  steps,
  stops,
  sample,
  onStepsChange,
  onExport,
  onSave,
  onClose,
}: ScalePanelProps): JSX.Element {
  return (
    <>
      <section class="rasd-ov-scl" data-rasd-ov="scale-panel" aria-label="توليد درجات اللون">
        <header class="rasd-ov-scl-head">
          {/*
           * العنوان أوّلًا في DOM لا زرّ الإغلاق — خلافًا لترتيب `ColourPanel`
           * الحرفي. اللقطة المرجعية لهذا الإطار بعينه تضع «×» يسارًا والعنوان
           * يمينًا؛ وتحت `direction: rtl` أوّل عنصر في `justify-content:
           * space-between` يقع يمينًا (انظر فقرة ترتيب DOM في رأس الملفّ)،
           * فالعنوان يجب أن يسبق الزرّ هنا كي يطابق تلك اللقطة بالذات.
           */}
          <span class="rasd-ov-scl-title">
            <span>توليد درجات اللون</span>
            <Icon name="gradient" size="sm" />
          </span>
          <button type="button" class="rasd-ov-scl-icon" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size="sm" />
          </button>
        </header>

        <div class="rasd-ov-scl-source">
          {/* اللون الأساس أوّلًا (يمينًا) — تجزئة عدد الدرجات ثانيًا (يسارًا). */}
          <div class="rasd-ov-scl-base">
            <span
              class="rasd-ov-scl-base-sw"
              style={{ '--rasd-ov-sample': baseSwatch }}
              data-rasd-ov-sample=""
            />
            <div class="rasd-ov-scl-base-text">
              <span class="rasd-ov-scl-base-label">اللون الأساس</span>
              <TechnicalValue kind="color" variant="mono-s">
                {baseHex.toUpperCase()}
              </TechnicalValue>
            </div>
          </div>

          <div class="rasd-ov-scl-steps" role="tablist" aria-label="عدد الدرجات">
            {STEP_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={n === steps}
                class="rasd-ov-scl-step-tab"
                onClick={() => onStepsChange(n)}
              >
                {/* عدٌّ بشري بأرقام هندية (`§3.5` البند 1) — «١١ درجة»/«٩ درجات». */}
                {plural(n, 'درجة', 'درجتين', 'درجات')}
              </button>
            ))}
          </div>
        </div>

        <div class="rasd-ov-scl-strip">
          {stops.map((s) => (
            <div key={s.step} class="rasd-ov-scl-stop">
              <span
                class="rasd-ov-scl-stop-sw"
                style={{ '--rasd-ov-sample': s.hex }}
                data-rasd-ov-sample=""
              />
              <span class="rasd-ov-scl-stop-num">
                <TechnicalValue kind="code" variant="mono-xs">
                  {formatMeasure(s.step)}
                </TechnicalValue>
              </span>
            </div>
          ))}
        </div>

        <table class="rasd-ov-scl-table">
          <thead>
            <tr>
              {/* عمود «الدرجة» أوّلًا في DOM فيقع يمينًا — يطابق ترتيب الرأس في اللقطة. */}
              <th scope="col">الدرجة</th>
              <th scope="col">
                <TechnicalValue kind="format" variant="mono-xs">
                  HEX
                </TechnicalValue>
              </th>
              <th scope="col">
                <TechnicalValue kind="format" variant="mono-xs">
                  OKLCH
                </TechnicalValue>
              </th>
              <th scope="col">التباين على الأبيض</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((row) => (
              <tr key={row.step}>
                <td>
                  <span class="rasd-ov-scl-cell-step">
                    <span
                      class="rasd-ov-scl-row-sw"
                      style={{ '--rasd-ov-sample': row.hex }}
                      data-rasd-ov-sample=""
                    />
                    <TechnicalValue kind="code" variant="mono-xs">
                      {formatMeasure(row.step)}
                    </TechnicalValue>
                  </span>
                </td>
                <td>
                  <TechnicalValue kind="color" variant="mono-xs">
                    {row.hex.toUpperCase()}
                  </TechnicalValue>
                </td>
                <td>
                  <TechnicalValue kind="color" variant="mono-xs">
                    {row.oklch}
                  </TechnicalValue>
                </td>
                <td>
                  <TechnicalValue kind="code" variant="mono-xs">
                    {row.contrastRatio}
                  </TechnicalValue>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer class="rasd-ov-scl-actions">
          {/* الحفظ أوّلًا (يمينًا، بارزًا) ثم JSON فـTailwind فـCSS — يطابق ترتيب أزرار اللقطة يمينًا-لِيسار. */}
          <button type="button" class="rasd-ov-scl-btn" data-primary="true" onClick={onSave}>
            احفظ في المكتبة
          </button>
          {EXPORT_BUTTONS.map((b) => (
            <button
              key={b.format}
              type="button"
              class="rasd-ov-scl-btn"
              title={b.title}
              onClick={() => onExport?.(b.format)}
            >
              <TechnicalValue kind="format" variant="mono-xs">
                {b.label}
              </TechnicalValue>
            </button>
          ))}
        </footer>
      </section>

      {/*
       * الجملة التفسيرية **خارج** بطاقة اللوحة — قِيست اللقطة المرجعية:
       * حدود اللوحة المستديرة تُغلَق بعد صفّ الإجراءات مباشرةً، والجملة
       * تقع بعدها على خلفية الصفحة نفسها بلا حدّ ولا خلفية مشتركة. فهي
       * عنصر شقيق للقسم لا طفل داخله — `Fragment` هنا على نمط `AreaSelect`.
       */}
      <p class="rasd-ov-scl-note">
        يبني رصد السلّم في OKLCH على شبكة إضاءة ثابتة، فتبقى كل درجة متساوية الوزن مع نظيرتها في أي
        لون آخر.
      </p>
    </>
  )
}
