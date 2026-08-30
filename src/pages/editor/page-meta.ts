/**
 * بيانات الصفحة — خمسة حقول تصف اللقطة نفسها.
 *
 * نصّ المرحلة: «العنوان، الرابط، الوقت، المقاس، المتصفح». وهي البيانات التي
 * تجعل صورةً في تذكرة عطل **دليلًا** لا لقطة: بلا الرابط والمقاس لا يُعاد
 * إنتاج ما تُظهره.
 *
 * **والوقت بأرقام غربية بصيغة ISO** خلافًا لبقيّة الواجهة العربية. القاعدة
 * اللغوية تعطي الهندية للعدّ البشري والغربية للقياس، وهذا ليس عدًّا: قيمةٌ
 * **تُنسَخ** إلى تذكرة أو سجلّ. و«٢٠٢٦-٠٨-٣٠» تُلصق في حقل تاريخ فلا يقبلها.
 * ويرافقه الزمن النسبي بالهندية للقراءة السريعة، فيجتمع الأمران.
 */

import { formatDimensions, formatRelativeTime } from '@/shared/bidi'

import type { TechnicalKind } from '@/shared/bidi'
import type { CaptureRecord } from '@/shared/storage/schema'

export interface MetaField {
  readonly key: 'title' | 'url' | 'time' | 'size' | 'browser'
  readonly label: string
  readonly value: string
  /** نصٌّ ثانٍ خفيف — الزمن النسبي مثلًا. `null` يعني لا شيء. */
  readonly note: string | null
  /** لاتينيٌّ يُعزَل بـ`<TechnicalValue>`؛ وإلّا فنصّ عربي عاديّ. */
  readonly technical: TechnicalKind | null
}

/** يقصّ عنوانًا طويلًا مع الحفاظ على المضيف والذيل — لا بترًا من اليمين. */
export function shortenUrl(url: string, max = 64): string {
  if (url.length <= max) return url
  try {
    const u = new URL(url)
    const head = `${u.protocol}//${u.host}`
    const tail = `${u.pathname}${u.search}`
    // المضيف كاملًا والذيل من آخره: المسار الأخير أدلّ على الصفحة من أوّله.
    const room = Math.max(8, max - head.length - 1)
    return tail.length <= room ? url : `${head}…${tail.slice(tail.length - room)}`
  } catch {
    // رابطٌ غير قابل للتحليل (`about:blank` مثلًا) — يُقصّ نصًّا.
    return `${url.slice(0, max - 1)}…`
  }
}

/**
 * زمن اللقطة بصيغة `YYYY-MM-DD HH:mm` **بتوقيت الجهاز**.
 *
 * لا `toISOString`: هي بتوقيت UTC، فلقطةٌ أُخذت الثامنة مساءً بالرياض تُعرض
 * الخامسة — ويقرؤها صاحبها خطأً على أنها لقطةٌ أخرى.
 */
export function formatCaptureTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ما يكفي من `navigator` — يُحقن في الاختبار. */
export interface BrowserSource {
  readonly userAgent?: string
  readonly userAgentData?: {
    readonly brands?: readonly { readonly brand: string; readonly version: string }[]
  }
}

/** علامات لا تصف متصفّحًا — تحقن نفسها في القائمة لإفساد البصمة. */
const NOT_A_BROWSER = /^(Not|Chromium$)/i

/**
 * اسم المتصفّح ونسخته.
 *
 * **من `userAgentData` أوّلًا**: سلسلة `userAgent` مجمَّدة عمدًا في كروم منذ
 * إصدارات، وتُعلن `Chrome/131` على متصفّحٍ أحدث. والقائمة المهيكلة تعطي
 * النسخة الحقيقية.
 *
 * وهو متصفّح **العرض** لا الالتقاط — وهما واحد عمليًّا: الإضافة محلّية،
 * والمحرر يُفتح في النافذة نفسها التي التقطت.
 */
export function browserLabel(nav: BrowserSource): string {
  const brands = nav.userAgentData?.brands ?? []
  const real = brands.find((b) => !NOT_A_BROWSER.test(b.brand))
  if (real) return `${real.brand} ${real.version}`

  const ua = nav.userAgent ?? ''
  const match = /(Edg|OPR|Brave|Chrome|Firefox|Safari)\/(\d+)/.exec(ua)
  if (match) return `${match[1]} ${match[2]}`
  return 'متصفّح غير معروف'
}

export function pageMetaFields(
  capture: CaptureRecord,
  nav: BrowserSource,
  now = Date.now(),
): readonly MetaField[] {
  return [
    {
      key: 'title',
      label: 'العنوان',
      value: capture.title || 'صفحة بلا عنوان',
      note: null,
      // العنوان نصّ الصفحة — قد يكون عربيًّا أو لاتينيًّا، فيُترك لاتجاهه.
      technical: null,
    },
    {
      key: 'url',
      label: 'الرابط',
      value: shortenUrl(capture.url),
      note: null,
      technical: 'url',
    },
    {
      key: 'time',
      label: 'الوقت',
      value: formatCaptureTime(capture.createdAt),
      note: formatRelativeTime(capture.createdAt, now),
      technical: 'code',
    },
    {
      key: 'size',
      label: 'المقاس',
      value: `${formatDimensions(capture.width, capture.height)} @${capture.devicePixelRatio}×`,
      note: null,
      technical: 'dimension',
    },
    {
      key: 'browser',
      label: 'المتصفّح',
      value: browserLabel(nav),
      note: null,
      technical: 'code',
    },
  ]
}
