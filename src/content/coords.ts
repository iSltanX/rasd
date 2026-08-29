/**
 * قراءة حالة النافذة الحيّة — الجزء الذي **يلمس المتصفّح** من نظام الإحداثيات.
 *
 * المفردات نفسها (الفضاءات الثلاثة، البنّاؤون، المحوّلات، `intersect`،
 * `normalizeRect`) انتقلت إلى [`shared/geometry.ts`](../shared/geometry.ts) في
 * المرحلة 8، حين صار لها مستهلك ثانٍ خارج طبقة المحتوى (`modules/capture/`):
 * منطق خالص لا يجوز أن يعتمد على طبقة تشغيل. هذا الملفّ يعيد تصديرها كاملةً،
 * فكل مستورد قائم من المرحلة 6 يبقى صحيحًا بلا تعديل.
 *
 * ما بقي هنا هو ما لا يمكن أن يكون خالصًا: قراءة `window` و`document`
 * ومراقبة تغيّر كثافة البكسل.
 *
 * **`devicePixelRatio` يُقرأ ولا يُخزَّن**: يتغيّر حين تُسحب النافذة بين
 * شاشتين، وافتراض ثباته يعطي قصًّا منزاحًا بعد السحب لا قبله.
 */

import { type CoordSpace } from '@/shared/geometry'

export * from '@/shared/geometry'

/** قيمة موجبة منتهية، وإلا الاحتياطي. */
function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** قيمة منتهية (يجوز أن تكون صفرًا أو سالبة — التمرير كذلك في RTL). */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readRootScale(
  win: Window,
): Pick<CoordSpace, 'rootScaleX' | 'rootScaleY' | 'rootDistorted'> {
  const root = win.document.documentElement
  if (!root) return { rootScaleX: 1, rootScaleY: 1, rootDistorted: false }
  const none = { rootScaleX: 1, rootScaleY: 1, rootDistorted: false }

  let m: DOMMatrixReadOnly
  try {
    const t = win.getComputedStyle(root).transform
    if (!t || t === 'none') return none
    // البانئ العالمي لا `win.DOMMatrixReadOnly`: النوع القياسي لا يعلن الأخير،
    // والمصفوفة قيمة عددية خالصة فلا يهمّ من أي عالَم جاءت.
    if (typeof DOMMatrixReadOnly === 'undefined') return none
    m = new DOMMatrixReadOnly(t)
  } catch {
    return none
  }

  const { a, b, c, d } = m
  const scaleX = Math.hypot(a, b)
  const scaleY = Math.hypot(c, d)
  // الدوران والميل يظهران في b و c؛ الإزاحة الخالصة تتركهما صفرًا.
  const skewed = Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6
  const scaled = Math.abs(scaleX - 1) > 1e-6 || Math.abs(scaleY - 1) > 1e-6
  return {
    rootScaleX: positive(scaleX, 1),
    rootScaleY: positive(scaleY, 1),
    rootDistorted: skewed || scaled,
  }
}

/**
 * يلتقط حالة النافذة الآن.
 *
 * الاحتياطيات ليست تجميلًا: في happy-dom (بيئة اختبارات الوحدة) ترجع
 * `documentElement.clientWidth` وأخواتها **صفرًا**، و`document.compatMode`
 * تكون `undefined`. وصفر عددٌ منتهٍ، فحارس «منتهٍ» وحده يمرّره ويعطي فضاء
 * إحداثيات كلّه أصفار يبدو صحيحًا. لذلك المقاسات تمرّ بحارس **موجب**.
 */
export function readSpace(win: Window = globalThis.window): CoordSpace {
  const doc = win.document
  const root = doc.documentElement
  // في وضع quirks يحمل `body` مقاس إطار العرض لا `documentElement`.
  const quirks = doc.compatMode === 'BackCompat'
  const viewportEl = (quirks ? doc.body : root) ?? root

  const layoutWidth = positive(viewportEl?.clientWidth, positive(win.innerWidth, 0))
  const layoutHeight = positive(viewportEl?.clientHeight, positive(win.innerHeight, 0))

  const rootDir = root ? win.getComputedStyle(root).direction : 'ltr'
  const bodyDir = doc.body ? win.getComputedStyle(doc.body).direction : 'ltr'

  return {
    scrollX: finite(win.scrollX, 0),
    scrollY: finite(win.scrollY, 0),
    layoutWidth,
    layoutHeight,
    pageWidth: positive(Math.max(root?.scrollWidth ?? 0, doc.body?.scrollWidth ?? 0), layoutWidth),
    pageHeight: positive(
      Math.max(root?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0),
      layoutHeight,
    ),
    dpr: positive(win.devicePixelRatio, 1),
    rtl: rootDir === 'rtl' || bodyDir === 'rtl',
    ...readRootScale(win),
  }
}

/**
 * يُنبِّه عند تغيّر `devicePixelRatio` — سحب النافذة بين شاشتين، أو تكبير
 * المتصفّح.
 *
 * لا حدث أصليًا لهذا. الحيلة القياسية: استعلام وسائط عند الكثافة الحالية
 * بالضبط؛ فمتى تغيّرت الكثافة توقّف الاستعلام عن المطابقة وأُطلق الحدث.
 * والاستعلام يُعاد بناؤه عند كل تغيّر لأنه مربوط بقيمة واحدة.
 */
export function watchDpr(
  onChange: (dpr: number) => void,
  win: Window = globalThis.window,
): () => void {
  let query: MediaQueryList | null = null
  let stopped = false

  const handler = () => {
    if (stopped) return
    onChange(positive(win.devicePixelRatio, 1))
    attach()
  }

  const attach = () => {
    if (stopped) return
    query?.removeEventListener?.('change', handler)
    const dpr = positive(win.devicePixelRatio, 1)
    query = win.matchMedia?.(`(resolution: ${dpr}dppx)`) ?? null
    query?.addEventListener?.('change', handler, { once: true })
  }

  attach()

  return () => {
    stopped = true
    query?.removeEventListener?.('change', handler)
    query = null
  }
}
