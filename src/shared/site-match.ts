/**
 * مُطابِق أنماط المواقع — يقرأ `privacy.excludedSites` ويقرّر: هل هذا العنوان
 * موقعٌ استثناه المستخدم؟
 *
 * **صنف العطل الذي بُني له.** المستخدم يكتب نمطًا ويظنّ نفسه محميًّا. فإن
 * أخطأ المُطابِق سلبًا حقنّا الإضافة في مصرفه وهو يظنّ أننا لا نفعل —
 * ولا شيء يخبره. وإن أخطأ إيجابًا عطّلنا موقعًا سليمًا. الأوّل أسوأ، لكن
 * الثاني ليس مقبولًا: كلاهما نقضٌ لوعدٍ مكتوب في شاشة الإعدادات.
 *
 * ── القاعدة الحاكمة: لا مقارنة نصّية خامًا، أبدًا ───────────────
 *
 * الطرفان — النمط المكتوب بيد والعنوان القادم من `chrome.tabs` — يمرّان من
 * **الأنبوب نفسه** ثم يُقارَن **المضيف** وحده. لا `includes` على العنوان
 * كاملًا (‏`https://bank.com@evil.com/` مضيفه `evil.com`)، ولا `RegExp`
 * مبنيّة من نصّ المستخدم (نقطةٌ غير مهروبة تجعل `bankXcom.attacker.example`
 * مطابقًا، و`/****…x` تُشعل تراجعًا أُسّيًّا).
 *
 * ── ما يعطيه `new URL` مجّانًا — مقيسًا لا مفترضًا ──────────────
 *
 * قِيس على Node 24 (نفس محرّك التحليل في Chrome):
 *
 * | المُدخَل | المُخرَج |
 * |---|---|
 * | `بنك.مصر` | `xn--ngb8ci.xn--wgbh1c` |
 * | `İstanbul.com` | `xn--istanbul-o0e.com` |
 * | `ｒａｓｄ．ａｐｐ` | `rasd.app` |
 * | `café.com` (‏NFD) | `xn--caf-dma.com` |
 * | `0177.0.0.1` · `2130706433` | `127.0.0.1` |
 * | `BANK.com` · `bank.com\login` | `bank.com` |
 *
 * فلا نكتب شيئًا من هذا بأيدينا. وقِيس كذلك أن **الخلط الخادع لا يقع**:
 * `بريد` بالياء العربية و`بريد` بالياء الفارسية ينتجان punycode مختلفين،
 * وكذلك `apple` اللاتينية والسيريلية، وكذلك ZWNJ داخل نطاق عربي. ولهذا
 * **لا نطوي التشابهات البصرية ولا نجرّد ZWNJ/ZWJ**: طيُّها يخلط نطاقين
 * مسجَّلين مختلفين، وهو عطلٌ أسوأ من الذي يعالجه.
 *
 * ── وما لا يعطيه — وأُثبِت بالقياس أنه يسقط ────────────────────
 *
 * | المُدخَل | ما فعله `URL` | فالمعالجة |
 * |---|---|---|
 * | `‏rasd.app` (‏U+200F) | **يرمي** `ERR_INVALID_URL` | تُحذف علامات الاتجاه |
 * | `بًنك.مصر` | `xn--ngb8ci**t**…` ≠ `xn--ngb8ci…` | تُحذف الحركات والتنوين |
 * | `bank.com.` | `bank.com.` — النقطة تبقى | تُحذف نقطة الجذر |
 * | `‎ bank.com ‎` | **يرمي** | يُشذَّب الطرفان |
 *
 * وحذف الحركات قرارٌ عربيُّ المنشأ: التنوين والحركات والتطويل تنجو من
 * اللصق ولا تدخل في تسجيل نطاق. ويوسّع الاستثناء ولا يضيّقه — والاتجاه
 * الآمن في قائمة منعٍ هو التوسيع.
 *
 * ── دلالتان حُسمتا صراحةً، لأن السكوت عنهما عطل ────────────────
 *
 * **1. `bank.com` و`*.bank.com` سواء: الجذر وكل نطاقاته الفرعية.** هذه
 * دلالة أنماط المطابقة في Chrome نفسه (‏`*://*.example.com/*` يشمل الجذر)،
 * وهي ما يتوقّعه من كتب النمط. والحدّ عند النقطة لا عند النصّ، فـ
 * `notbank.com` و`evil-bank.com` و`bank.com.evil.com` **لا** تُطابِق.
 *
 * **2. المسار لا يضيّق الاستثناء إلا إذا كُتبت فيه `*`.** نمطٌ مُلصَق من
 * شريط العنوان (`https://bank.com/login?x=1`) يعني «هذا الموقع» لا «هذه
 * الصفحة وحدها» — فيُهمَل مساره. أمّا `bank.com/private/*` فقصدٌ صريح
 * بالتضييق، فيُحترم. والمطابقة على المسار **بادئة حرفية** لا نمطًا: ما
 * قبل أوّل `*` يُقارَن بـ`startsWith` — فلا `RegExp` تُبنى هنا أصلًا، ومعها
 * يسقط صنف التراجع الأُسّي كلّه بالبناء لا بالحذر.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

/**
 * رموز غير مرئية تنجو من اللصق ولا تنتمي إلى اسم مضيف.
 *
 * **وليست فيها `U+200C`/`U+200D`**: الرابط الصفري ونقيضه حرفان دالّان في
 * النطاقات العربية والفارسية — قِيس أن `بنك‌-الرياض` بـZWNJ ينتج punycode
 * غير `بنك-الرياض` بدونه، أي **نطاقان مختلفان**. حذفهما يخلطهما.
 */
const INVISIBLE = /[\u200B\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/gu

/**
 * حركات وتنوين وتطويل — تنجو من اللصق ولا تدخل في تسجيل نطاق.
 *
 * وتُكتب هروبًا صريحًا لا حرفًا: محتوى هذين الصنفين غير مرئي أو شبه مرئي في
 * المحرر، وملفٌّ يعالج عطل اللصق لا يجوز أن يحمله في مصدره.
 */
const ARABIC_MARKS = /[\u0640\u064B-\u0652\u0670]/gu

/** نمط مُحلَّل وجاهز للمقارنة. `null` من المُطبِّع يعني: نمط لا يصلح. */
export interface SitePattern {
  /** `true` للنمط `*` وحده — كل المواقع. */
  readonly everywhere: boolean
  /** مضيف ASCII بحروف صغيرة، بلا نقطة جذر. `[::1]` يبقى بقوسيه. */
  readonly host: string
  /** منفذ صريح، أو `''` أي «أي منفذ». */
  readonly port: string
  /** بادئة مسار حرفية حين كُتبت `*`، وإلّا `null` أي «كل الموقع». */
  readonly pathPrefix: string | null
}

const EVERYWHERE: SitePattern = { everywhere: true, host: '', port: '', pathPrefix: null }

/** المنافذ الضمنية — كي يطابق `bank.com:443` العنوان `https://bank.com/`. */
const DEFAULT_PORT: Record<string, string> = { 'https:': '443', 'http:': '80' }

/** يحذف ما لا ينتمي إلى اسم مضيف ثم يشذّب. الترتيب مقصود: العلامة قد تحفّ الفراغ. */
function scrub(raw: string): string {
  return raw.replace(INVISIBLE, '').replace(ARABIC_MARKS, '').trim()
}

/** نقطة الجذر تعني ما يعنيه غيابها — ويحتفظ بها `URL`، فتُحذف يدويًّا. */
function stripRootDot(host: string): string {
  return host.endsWith('.') ? host.slice(0, -1) : host
}

/** عنوان IP لا نطاقات فرعية له، فقاعدة اللاحقة لا تنطبق عليه. */
function isIpHost(host: string): boolean {
  return host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/u.test(host)
}

/**
 * يحوّل نمطًا مكتوبًا بيد إلى شكل قابل للمقارنة، أو `null` إن لم يصلح.
 *
 * **مُصدَّرة كي تستعملها شاشة الإعدادات وقت الحفظ**: نمطٌ يُرفض هنا يجب أن
 * يُرفض أمام المستخدم بنصٍّ يشرح، لا أن يُحفَظ صامتًا ثمّ يُتخطّى وقت
 * المطابقة — وذاك بعينه هو «يظنّ نفسه محميًّا وليس».
 */
export function normalizeSitePattern(raw: string): SitePattern | null {
  const cleaned = scrub(raw)
  if (cleaned === '') return null
  if (cleaned === '*') return EVERYWHERE

  // `*.` و`.` صدرًا: اصطلاحان لـ«وكل النطاقات الفرعية» — وهو سلوكنا أصلًا.
  const bare = cleaned.replace(/^\*\./u, '').replace(/^\./u, '')
  if (bare === '') return null

  const candidate = withScheme(bare)
  if (candidate === null) return null

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }

  // نمطٌ لمخطّط لا نحقن فيه أصلًا لا معنى له — `checkInjectable` سبقته.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const host = stripRootDot(parsed.hostname)
  if (host === '' || host === '.') return null

  const star = parsed.pathname.indexOf('*')
  return {
    everywhere: false,
    host,
    port: parsed.port,
    pathPrefix: star === -1 ? null : parsed.pathname.slice(0, star),
  }
}

/**
 * يضيف مخطّطًا حين يغيب، ويقوّس IPv6 العاري.
 *
 * القوسان شرطُ التحليل: `new URL('https://::1')` يرمي، بينما `[::1]` هو ما
 * يعيده `hostname` للطرف الآخر — فبلا التقويس لا يلتقيان أبدًا. والتمييز
 * بعدد النقطتين: `bank.com:8443` نقطتاه واحدة، و`::1` أكثر.
 */
function withScheme(bare: string): string | null {
  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(bare)) return bare
  const colons = (bare.match(/:/gu) ?? []).length
  if (colons >= 2 && !bare.startsWith('[')) return `https://[${bare}]`
  return `https://${bare}`
}

/** يمرّر مضيف العنوان من أنبوب النمط نفسه — التماثل شرط، لا تجميل. */
function canonicalHost(hostname: string): string {
  const cleaned = scrub(hostname)
  if (cleaned === hostname) return stripRootDot(hostname)
  try {
    return stripRootDot(new URL(`https://${cleaned}`).hostname)
  } catch {
    return stripRootDot(hostname)
  }
}

/** هل يطابق هذا العنوان نمطًا واحدًا؟ */
export function matchesSitePattern(url: URL, pattern: SitePattern): boolean {
  if (pattern.everywhere) return true

  const host = canonicalHost(url.hostname)
  const hostMatches = isIpHost(pattern.host)
    ? host === pattern.host
    : host === pattern.host || host.endsWith(`.${pattern.host}`)
  if (!hostMatches) return false

  if (pattern.port !== '') {
    const port = url.port === '' ? (DEFAULT_PORT[url.protocol] ?? '') : url.port
    if (port !== pattern.port) return false
  }

  return pattern.pathPrefix === null || url.pathname.startsWith(pattern.pathPrefix)
}

/**
 * هل استثنى المستخدم هذا العنوان؟
 *
 * **نمطٌ لا يصلح يُتخطّى ولا يُسقط البقيّة**: إدخالٌ واحد تالف لا يجوز أن
 * يُبطل قائمة منعٍ كاملة. ومنعُ التالف من الدخول أصلًا واجب شاشة الإعدادات
 * عبر `normalizeSitePattern`.
 */
export function isSiteExcluded(url: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false // عنوان لا يُحلَّل ممنوعٌ أصلًا بـ`invalid-url` — لا يصل هنا.
  }

  for (const raw of patterns) {
    const pattern = normalizeSitePattern(raw)
    if (pattern !== null && matchesSitePattern(parsed, pattern)) return true
  }
  return false
}
