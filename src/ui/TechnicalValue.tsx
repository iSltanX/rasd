import type { TechnicalKind } from '@/shared/bidi'
import type { JSX } from 'preact'

/**
 * `<TechnicalValue>` — المكوّن الأهمّ في طبقة الاتجاه.
 *
 * كل مقطع لاتيني تقني داخل واجهة عربية يمرّ من هنا: المحدِّدات، وأسماء الخصائص
 * والمتغيّرات، والقيم السداسية، والأبعاد، والتصريحات، والمسارات، والروابط،
 * ومفاتيح لوحة المفاتيح، وأسماء الصيغ.
 *
 * **لماذا `<bdi>` لا `<span dir="ltr">`:** `bdi` يعزل اتجاهه عن محيطه في
 * الاتجاهين معًا — فلا يتسرّب اتجاه المقطع إلى الجملة، ولا اتجاه الجملة إلى
 * المقطع. و`unicode-bidi: isolate` مضبوطة عليه في `tokens.css`.
 *
 * ولا يحمل محارف عزل غير مرئية، فالنسخ منه يعطي النصّ نظيفًا كما يُلصق في المحرّر.
 */
export interface TechnicalValueProps {
  /** النصّ التقني كما يُنسخ حرفيًا. */
  children: string
  /** صنف القيمة — يظهر في `data-kind` للتنسيق والاختبار. */
  kind?: TechnicalKind
  /** فئة نمط النص. الافتراضي أحادي المسافة لأن هذه قيم تقنية. */
  variant?: 'mono-s' | 'mono-xs' | 'mono-2xs' | 'mono-m' | 'inherit'
  class?: string | undefined
  title?: string
}

export function TechnicalValue({
  children,
  kind = 'code',
  variant = 'mono-s',
  class: className,
  title,
}: TechnicalValueProps): JSX.Element {
  const classes = [variant === 'inherit' ? '' : `t-${variant}`, className].filter(Boolean).join(' ')

  return (
    <bdi
      data-technical=""
      data-kind={kind}
      dir="ltr"
      {...(classes ? { class: classes } : {})}
      {...(title === undefined ? {} : { title })}
    >
      {children}
    </bdi>
  )
}

/** اختصار للقيم السداسية — يعرض عيّنة اللون بجانب القيمة. */
export function ColorValue({
  hex,
  class: className,
}: {
  hex: string
  class?: string | undefined
}): JSX.Element {
  return (
    <span class={['rasd-color-value', className].filter(Boolean).join(' ')}>
      <span class="rasd-color-chip" style={{ background: hex }} aria-hidden="true" />
      <TechnicalValue kind="color">{hex}</TechnicalValue>
    </span>
  )
}

/** مفتاح لوحة مفاتيح — لا يُعكس ولا يُترجم. مكوّن Figma `KeyCap` (`45:164`): يحتضن نصّه بخطّ `Mono/2XS`. */
export function KeyCap({ children }: { children: string }): JSX.Element {
  return (
    <kbd class="rasd-keycap">
      <TechnicalValue kind="key" variant="mono-2xs">
        {children}
      </TechnicalValue>
    </kbd>
  )
}
