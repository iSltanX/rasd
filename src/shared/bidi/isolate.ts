/**
 * عزل المقاطع التقنية داخل النصّ العربي.
 *
 * **المشكلة:** خوارزمية bidi تعيد ترتيب السطر كاملًا حين يجاور نصٌّ عربي مقطعًا
 * لاتينيًا يحمل رموزًا. جملة مثل «المحدِّد ‎.cta-btn‎ يستخدم ‎--color-primary‎»
 * قد تُعرض بترتيب مقلوب، والقيمة المنسوخة منها تصل إلى المحرّر خطأً.
 *
 * **الحلّ:** عزل كل مقطع تقني بحاجزَي `U+2066 LRI` و`U+2069 PDI` في النصّ،
 * وبـ`<bdi dir="ltr">` في DOM. العزل يمنع تسرّب اتجاه المقطع إلى ما حوله وبالعكس.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

/** `U+2066` — بداية عزل من اليسار إلى اليمين. */
export const LRI = '⁦'
/** `U+2067` — بداية عزل من اليمين إلى اليسار. */
export const RLI = '⁧'
/** `U+2068` — بداية عزل بالاتجاه الأول. */
export const FSI = '⁨'
/** `U+2069` — نهاية العزل. */
export const PDI = '⁩'

/** أصناف القيم التقنية التي تبقى إنجليزية دائمًا. */
export type TechnicalKind =
  | 'selector' // .cta-btn · #main > .row
  | 'property' // background-color
  | 'variable' // --color-primary
  | 'color' // #3B82F6 · oklch(...)
  | 'dimension' // 1440 × 900
  | 'declaration' // padding: 24px
  | 'path' // src/shared/bidi
  | 'url' // https://example.com
  | 'key' // ⇧⌘F · Esc
  | 'format' // PNG · JSON · OKLCH
  | 'code' // أي شيء آخر يُنسخ حرفيًا

/**
 * يعزل مقطعًا لاتينيًا داخل نصّ عربي.
 *
 * يُستخدم عند بناء **سلاسل نصّية**؛ في DOM استخدم `<TechnicalValue>` التي
 * تُخرج `<bdi>` — أوضح للقارئ الآلي ولا تحمل محارف غير مرئية.
 */
export function isolate(text: string): string {
  return `${LRI}${text}${PDI}`
}

/** يزيل محارف العزل — للمقارنة والنسخ والاختبار. */
export function stripIsolates(text: string): string {
  return text.replace(/[⁦-⁩]/g, '')
}

/** هل يحمل النصّ محارف عزل؟ */
export function hasIsolates(text: string): boolean {
  return /[⁦-⁩]/.test(text)
}

/**
 * يبني سطرًا يخلط عربية بقيم تقنية، ويعزل كل قيمة تلقائيًا.
 *
 *   mixed`الحشوة ${'14px 24px'} واللون ${'#3B82F6'}`
 */
export function mixed(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce<string>(
    (acc, part, i) => acc + part + (i < values.length ? isolate(String(values[i])) : ''),
    '',
  )
}

/**
 * أيقونات لا تُعكس في RTL أبدًا.
 *
 * العكس صحيح للأيقونات الاتجاهية (سهم، رجوع، تقدّم)، وخاطئ لكل ما يحمل معنى
 * ثابتًا: الشعار يفقد هويته، وعلامة الصحّ تصير غريبة، والوسائط تتبع الزمن لا
 * اتجاه القراءة، والأرقام والمونو لا تُعكس بحكم الاتجاه نفسه.
 */
export const NEVER_MIRROR = new Set([
  'logo',
  'check',
  'close',
  'plus',
  'minus',
  'search',
  'settings',
  'play',
  'pause',
  'record',
  'eye',
  'eye-off',
  'lock',
  'shield',
  'star',
  'palette',
  'eyedropper',
  'swatches',
  'gradient',
  'image',
  'grid-view',
  'list-view',
  'mock-page',
])

/** هل تُعكس هذه الأيقونة عند RTL؟ */
export function shouldMirror(iconName: string): boolean {
  const base = iconName.replace(/^icon\//, '')
  if (NEVER_MIRROR.has(base)) return false
  // اتجاهية بطبيعتها: أسهم، رجوع/تقدّم، محاذاة، مسافات أفقية.
  return /(^|-)(arrow|chevron|back|forward|next|prev|undo|redo|indent|align|dimension-h)(-|$)/.test(
    base,
  )
}
