import { formatHuman, formatPercent, plural } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import type { JSX } from 'preact'

/**
 * لوحة اللون — `colors / sampling` (`65:55`) و`colors / idle` (`98:471`).
 *
 * **تعرض ولا تحسب**، كبقيّة بدائيّات الطبقة: تستقبل صفوفًا جاهزة فتُرسم في
 * معرض ثابت بلا تشغيل أداة داخل صفحة.
 *
 * **الكتلتان المؤجَّلتان من المرحلة 13 بُنيتا هنا — المرحلة 14.** كان
 * الإطار `65:2` يحمل كتلتين منطقهما مُسنَد في الخطّة إلى 14 لا 13:
 * `usage` («يستخدمه ١٤ عنصرًا») من `§6.10`، وزرّ «جرّب بديلًا» من `§6.11`.
 * وقيل يومها إن «بنيته تنتظرهما ولا تفترض غيابهما» — وهذا ما تحقّق: أُضيفتا
 * بلا إعادة بناء، وكلتاهما **اختيارية** فالمكوّن يبقى صالحًا حيث لا مسح
 * ولا استبدال (معرضُ المكوّنات مثلًا).
 *
 * **وتبقى تعرض ولا تحسب**: المسح والاستبدال يقعان في سكربت المحتوى
 * (`modules/colour/usage.ts` و`replace.ts`)، وهذا يستقبل نتيجةً جاهزة
 * ويُبلّغ الأفعال بمعاودات — كبقيّة بدائيّات الطبقة.
 *
 * **القيمة تُعرض مضغوطة وتُنسخ كاملة.** الملفّ يكتب `59 130 246` لا
 * `rgb(59, 130, 246)`، وعرض 360px لا يتّسع للثانية. فالمعروض هو المضغوط
 * (وهو نحو CSS Color 4 صالح بذاته)، والمنسوخ هو القيمة الكاملة التي تُلصق
 * في محرّر. لا اختصار في ما يُنسخ.
 */

export interface ColourRow {
  /** التسمية اللاتينية: `HEX` · `RGB` · `HSL` · `OKLCH` · `TAILWIND`. */
  readonly label: string
  /** ما يُعرض — مضغوط. */
  readonly shown: string
  /** ما يُنسخ — كامل. */
  readonly copy: string
  /**
   * ملاحظة تُعرض بجانب القيمة حين لا تكون القيمة وحدها صادقة.
   *
   * مثالها الأهمّ: اسم Tailwind غير المطابق — «≈ blue-500» مع مسافته.
   */
  readonly note?: string
}

export interface ColourVarView {
  readonly name: string
  /** موضع التعريف: `tokens.css : 42`، أو `null` حين تعذّر تحديده. */
  readonly origin: string | null
}

export interface ColourContrastView {
  /** النسبة منسَّقة: `3.68 : 1`. */
  readonly ratio: string
  /** الحكم كما يُعرض: `AA` · `AAA` · `فشل`. */
  readonly level: string
  /** نصّ الشارة كاملًا — `AA للنص الكبير فقط`. */
  readonly badge: string
  /** وصف الخلفية المقارَن عليها: `على الأبيض`. */
  readonly against: string
  /** الخلفية **افتُرضت** بيضاء ولم تُقرأ — يُعلَن ولا يُخفى. */
  readonly assumed: boolean
  /** تباين شبه معدوم — تنبيه منفصل عن الفشل (`§6.13`). */
  readonly unreadable: boolean
}

/**
 * حصيلة مسح «العناصر التي تستخدم اللون» (`§6.10`) — جاهزةً للعرض.
 *
 * `null` تعني «لم يُطلب مسح بعد»، وهي حالةٌ ثالثة تخالف «مُسح فلم يوجد
 * شيء» (`total === 0`). خلطُهما كان سيقول «لا عنصر يستعمله» عن لون لم
 * يُبحَث عنه أصلًا.
 */
export interface ColourUsageView {
  /** عدد العناصر المطابقة — **عدٌّ بشري**، يُنسَّق بأرقام هندية عند العرض. */
  readonly total: number
  /** فهرس المُبرَز حاليًّا، أو `null` قبل أي تنقّل. */
  readonly current: number | null
  /** المسح جارٍ — يُعرض تقدّمه بدل رقم نهائي كاذب. */
  readonly scanning: boolean
  /** نسبة التقدّم 0..1 أثناء المسح. */
  readonly progress: number
}

export interface ColourPanelProps {
  /** القيمة السداسية للعيّنة — تُعرض كبيرة في رأس الكتلة. */
  hex: string
  /** لون المربّع — قيمة CSS تُمرَّر سطريًا، **من الصفحة لا من سمتنا**. */
  swatch: string
  rows: readonly ColourRow[]
  variable: ColourVarView | null
  contrast: ColourContrastView | null
  /**
   * البكسل يخالف ما صُرِّح به — يُعرض تنبيهًا لا يُبتلع.
   *
   * هذا هو حاصل «المصدرين معًا» في `§6.4`: الفرق نفسه هو المعلومة.
   */
  mismatch?: boolean
  /** اللون خارج مدى sRGB فالقيمة المعروضة مقصوصة. */
  outOfGamut?: boolean
  onCopy?: (value: string, label: string) => void
  onSave?: () => void
  onClose?: () => void
  /** `§6.10` — غيابها يُخفي الكتلة كاملةً، ولا يرسم صفرًا كاذبًا. */
  usage?: ColourUsageView
  onScanUsage?: () => void
  onCancelScan?: () => void
  onStepUsage?: (delta: 1 | -1) => void
  /** `§6.11` — زرّ «جرّب بديلًا». غيابه يُخفي الزرّ. */
  onReplace?: () => void
}

export function ColourPanel({
  hex,
  swatch,
  rows,
  variable,
  contrast,
  mismatch = false,
  outOfGamut = false,
  onCopy,
  onSave,
  onClose,
  usage,
  onScanUsage,
  onCancelScan,
  onStepUsage,
  onReplace,
}: ColourPanelProps): JSX.Element {
  return (
    <section class="rasd-ov-cp" data-rasd-ov="colour-panel" aria-label="اللون">
      <header class="rasd-ov-cp-head">
        <button type="button" class="rasd-ov-cp-icon" onClick={onClose} aria-label="إغلاق">
          <Icon name="close" size="sm" />
        </button>
        <span class="rasd-ov-cp-title">
          <span>اللون</span>
          <Icon name="eyedropper" size="sm" />
        </span>
      </header>

      <div class="rasd-ov-cp-swatch-block">
        <div class="rasd-ov-cp-ident">
          <div class="rasd-ov-cp-hexrow">
            <button
              type="button"
              class="rasd-ov-cp-icon"
              onClick={() => onCopy?.(hex, 'HEX')}
              aria-label="انسخ القيمة السداسية"
            >
              <Icon name="copy" size="sm" />
            </button>
            <TechnicalValue kind="color" variant="mono-m">
              {hex.toUpperCase()}
            </TechnicalValue>
          </div>

          {variable ? (
            <>
              <span class="rasd-ov-cp-var">
                <TechnicalValue kind="variable" variant="mono-xs">
                  {variable.name}
                </TechnicalValue>
                <Icon name="token" size="xs" />
              </span>
              {variable.origin ? (
                <span class="rasd-ov-cp-origin">
                  <TechnicalValue kind="path" variant="mono-xs">
                    {variable.origin}
                  </TechnicalValue>
                </span>
              ) : (
                /*
                 * الاسم معروف والموضع لا — حالة مقيسة لا نادرة (`Provenance`
                 * من نوع `opaque`: أوراق عابرة للأصل). تُقال ولا تُترك فراغًا
                 * يُقرأ «لا متغيّر».
                 */
                <span class="rasd-ov-cp-origin rasd-ov-cp-muted">موضع التعريف غير مقروء</span>
              )}
            </>
          ) : null}
        </div>

        {/* اللون من الصفحة، فيُمرَّر سطريًا: لا توكن لدينا يمثّله. */}
        <span class="rasd-ov-cp-sw" style={{ '--rasd-ov-sample': swatch }} data-rasd-ov-sample="" />
      </div>

      {mismatch || outOfGamut ? (
        <p class="rasd-ov-cp-flag">
          {mismatch
            ? 'البكسل المعروض يخالف القيمة المصرَّحة — طبقة فوقه أو شفافية أو مزج.'
            : 'اللون خارج مدى sRGB؛ القيمة المعروضة هي ما يرسمه المتصفّح مقصوصًا.'}
        </p>
      ) : null}

      <dl class="rasd-ov-cp-formats">
        {rows.map((row) => (
          <div key={row.label} class="rasd-ov-cp-row">
            <dd class="rasd-ov-cp-val">
              <button
                type="button"
                class="rasd-ov-cp-icon"
                onClick={() => onCopy?.(row.copy, row.label)}
                aria-label={`انسخ ${row.label}`}
              >
                <Icon name="copy" size="xs" />
              </button>
              <TechnicalValue kind="color" variant="mono-xs">
                {row.shown}
              </TechnicalValue>
              {row.note ? <span class="rasd-ov-cp-note">{row.note}</span> : null}
            </dd>
            <dt class="rasd-ov-cp-key">
              <TechnicalValue kind="format" variant="mono-xs">
                {row.label}
              </TechnicalValue>
            </dt>
          </div>
        ))}
      </dl>

      {contrast ? (
        <div class="rasd-ov-cp-contrast" data-unreadable={contrast.unreadable ? 'true' : 'false'}>
          <Icon name="contrast-check" size="sm" />
          <span class="rasd-ov-cp-against">
            {contrast.against}
            {contrast.assumed ? ' (مفترَضة)' : ''}
          </span>
          <TechnicalValue kind="code" variant="mono-xs">
            {contrast.ratio}
          </TechnicalValue>
          <span class="rasd-ov-cp-verdict" data-level={contrast.level}>
            {contrast.badge}
          </span>
        </div>
      ) : null}

      {usage || onScanUsage ? (
        <div class="rasd-ov-cp-usage" data-rasd-ov="colour-usage">
          {usage?.scanning ? (
            <>
              <span class="rasd-ov-cp-usage-text">جارٍ المسح… {formatPercent(usage.progress)}</span>
              <button type="button" class="rasd-ov-cp-btn-quiet" onClick={onCancelScan}>
                أوقف
              </button>
            </>
          ) : usage ? (
            <>
              <span class="rasd-ov-cp-usage-text">
                {/*
                 * `plural` تُصرّف العدد كاملًا: المثنّى بلا رقم («عنصران» لا
                 * «٢ عنصر»)، والعدد هنديّ لأنه عدٌّ بشري (`§3.5`، ونصّ `§17`
                 * لهذه المرحلة صريح: «عدّاد العناصر عدٌّ بشري بأرقام هندية»).
                 */}
                {usage.total > 0
                  ? `يستخدمه ${plural(usage.total, 'عنصر واحد', 'عنصران', 'عناصر')}`
                  : 'لا عنصر يستخدمه في هذه الصفحة'}
              </span>
              {usage.total > 0 && onStepUsage ? (
                <span class="rasd-ov-cp-usage-nav">
                  <button
                    type="button"
                    class="rasd-ov-cp-icon"
                    onClick={() => onStepUsage(-1)}
                    aria-label="العنصر السابق"
                  >
                    <Icon name="chevron-right" size="xs" />
                  </button>
                  <span class="rasd-ov-cp-usage-at">
                    {usage.current === null ? '—' : formatHuman(usage.current + 1)}
                  </span>
                  <button
                    type="button"
                    class="rasd-ov-cp-icon"
                    onClick={() => onStepUsage(1)}
                    aria-label="العنصر التالي"
                  >
                    <Icon name="chevron-left" size="xs" />
                  </button>
                </span>
              ) : null}
            </>
          ) : (
            <button type="button" class="rasd-ov-cp-btn-quiet" onClick={onScanUsage}>
              أظهر العناصر التي تستخدمه
            </button>
          )}
        </div>
      ) : null}

      <footer class="rasd-ov-cp-actions">
        {onReplace ? (
          <button type="button" class="rasd-ov-cp-btn-quiet" onClick={onReplace}>
            <span>جرّب بديلًا</span>
            <Icon name="color-replace" size="sm" />
          </button>
        ) : null}
        <button type="button" class="rasd-ov-cp-btn" onClick={onSave}>
          <span>حفظ</span>
          <Icon name="swatches" size="sm" />
        </button>
      </footer>
    </section>
  )
}

/** تلميحات لوحة الخمول — نصوصها من `98:479` حرفيًا، عدا ما أُسقط. */
export const COLOUR_HINTS: readonly { key: string; label: string }[] = [
  { key: 'انقر', label: 'اسحب اللون' },
  { key: '⌥ click', label: 'اسحب من CSS بدل البكسل' },
  { key: 'Esc', label: 'أغلق القطّارة' },
]

/**
 * `colors / idle` — قبل أوّل عيّنة.
 *
 * **سطران لا ثلاثة، وسطر مُسقَط بعلم.** الملفّ يضع في `98:475` ثلاث فقرات،
 * أوّلاها وثانيتها **بالنصّ نفسه حرفًا بحرف** («مرّر فوق أي بكسل») — عيب
 * مصدر لا تصميم مقصود، فالثانية موضعها موضع عنوان فرعي مختلف. فكُتب هنا
 * عنوان وشرح، ويُصحَّح الملفّ في المرحلة 26أ.
 *
 * وأُسقط تلميح `⇧ استخرج لوحة الصفحة`: استخراج اللوحة هو `§6.12` وهو
 * **المرحلة 14**. ووعدُ اختصارٍ لا يعمل أسوأ من غيابه.
 */
export function ColourIdle(): JSX.Element {
  return (
    <section class="rasd-ov-cp rasd-ov-cp-idle" data-rasd-ov="colour-idle" aria-label="اللون">
      <span class="rasd-ov-cp-badge">
        <Icon name="eyedropper" size="md" />
      </span>

      <div class="rasd-ov-cp-intro">
        <h2 class="rasd-ov-cp-h">مرّر فوق أي بكسل</h2>
        <p class="rasd-ov-cp-desc">
          يقرأ رصد اللون المعروض، ثم يتتبّعه إلى متغيّر CSS الذي يعرّفه.
        </p>
      </div>

      <dl class="rasd-ov-cp-hints">
        {COLOUR_HINTS.map((hint) => (
          <div key={hint.key} class="rasd-ov-cp-hint">
            <dt>
              <span class="rasd-ov-cp-key-cap">
                <TechnicalValue kind="key" variant="mono-xs">
                  {hint.key}
                </TechnicalValue>
              </span>
            </dt>
            <dd>{hint.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
