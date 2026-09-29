/**
 * منسّقا الأرقام — **مفصولان قصدًا**.
 *
 * رصد عربي يعرض بيانات تقنية. الأرقام فيه صنفان لا صنف واحد:
 *
 *   • **عدّ بشري** — «قبل ٣ دقائق»، «٢٤٨ عنصرًا». أرقام هندية، لأن النصّ عربي.
 *   • **قياس** — `1440 × 900`، `4.82 : 1`، `14px`، `#3B82F6`. أرقام غربية دائمًا،
 *     لأنها قيمة تقنية يقرأها المطوّر وينسخها إلى محرّره.
 *
 * دالّتان منفصلتان لا واحدة بمعامل: المعامل يُنسى، والاسم لا يُنسى. وقاعدة
 * ESLint تمنع تمرير قياس إلى `formatHuman`.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

/** أرقام هندية للعدّ البشري. */
const arabicDigits = new Intl.NumberFormat('ar-EG-u-nu-arab', { useGrouping: false })

/** أرقام غربية للقياسات — لا تتأثّر بلغة الواجهة. */
const latinDigits = new Intl.NumberFormat('en-US-u-nu-latn', {
  useGrouping: false,
  maximumFractionDigits: 4,
})

/**
 * عدد بشري بأرقام هندية: «٢٤٨ عنصرًا» · «قبل ٣ دقائق».
 *
 * **لا تستخدمها لقياس.** الأبعاد والنسب والقيم السداسية تمرّ من `formatMeasure`.
 */
export function formatHuman(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return arabicDigits.format(value)
}

/**
 * قياس بأرقام غربية: `1440` · `4.82` · `-12.5`.
 *
 * تبقى غربية مهما كانت لغة الواجهة — القيمة التقنية تُنسخ إلى الكود.
 */
export function formatMeasure(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return latinDigits.format(value)
}

/** قياس بوحدة: `14px` · `1.5rem`. */
export function formatUnit(value: number, unit = 'px'): string {
  return `${formatMeasure(value)}${unit}`
}

/** بُعدان: `1440 × 900`. علامة الضرب حرف رياضي لا حرف x. */
export function formatDimensions(width: number, height: number): string {
  return `${formatMeasure(width)} × ${formatMeasure(height)}`
}

/** نسبة تباين: `4.82 : 1`. */
export function formatRatio(value: number, against = 1): string {
  return `${formatMeasure(Math.round(value * 100) / 100)} : ${formatMeasure(against)}`
}

/** نسبة مئوية بأرقام غربية: `62%`. */
export function formatPercent(fraction: number): string {
  return `${formatMeasure(Math.round(fraction * 1000) / 10)}%`
}

/** حجم ملف — العدد غربي والوحدة عربية: `4.6 كيلوبايت`. */
export function formatBytes(bytes: number): string {
  const units = ['بايت', 'كيلوبايت', 'ميغابايت', 'غيغابايت']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${formatMeasure(rounded)} ${units[unit]}`
}

/**
 * حجم بوحدة لاتينية لخانة أحادية المسافة: `184 MB` · `1.2 GB`.
 *
 * مؤشّر المساحة يعرض القيمة بخطّ `Geist Mono`، وهو بلا حروف عربية — فوحدة
 * `formatBytes` العربية تسقط فيه إلى خطّ احتياطي مفكّك. أقلّ من عشرة بخانة عشرية.
 */
export function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return `${formatMeasure(rounded)} ${units[unit]}`
}

/** زمن نسبي بأرقام هندية: «قبل ٣ دقائق» · «الآن». */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000)
  if (seconds < 45) return 'الآن'

  const steps: [number, (n: number) => string][] = [
    [60, (n) => plural(n, 'دقيقة', 'دقيقتين', 'دقائق')],
    [3600, (n) => plural(n, 'ساعة', 'ساعتين', 'ساعات')],
    [86_400, (n) => plural(n, 'يوم', 'يومين', 'أيام')],
    [2_592_000, (n) => plural(n, 'شهر', 'شهرين', 'أشهر')],
  ]

  let unitSeconds = 60
  let label = steps[0]![1]
  for (const [size, fn] of steps) {
    if (seconds >= size) {
      unitSeconds = size
      label = fn
    }
  }
  const count = Math.max(1, Math.floor(seconds / unitSeconds))
  return `قبل ${label(count)}`
}

/**
 * تصريف العدد العربي: مفرد ومثنّى وجمع.
 *
 * العربية ليست لها صيغتان بل ثلاث، والمثنّى لا يحمل رقمًا: «قبل دقيقتين»
 * لا «قبل ٢ دقيقة».
 */
export function plural(count: number, one: string, two: string, many: string): string {
  if (count === 1) return one
  if (count === 2) return two
  if (count >= 3 && count <= 10) return `${formatHuman(count)} ${many}`
  return `${formatHuman(count)} ${one}`
}
