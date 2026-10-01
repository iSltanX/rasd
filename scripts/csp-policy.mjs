/**
 * حكم سياسة صفحات الإضافة على القائمة المسمّاة — منطقٌ خالص يستورده `verify-dist.mjs`، ويُختبر بلا بناء في
 * `tests/unit/build/csp-policy.test.ts` (موجبةٌ تمرّ وسالبةٌ لكل صنفٍ مرفوض).
 *
 * كان الفحص سطرين: «لا `https?://` في السياسة» و«`connect-src 'self'` حاضرة». والأوّل يمنع الخدمة المسمّاة
 * نفسها، فصار الفحص **مطابقةً لا منعًا** ([ADR 0046](../Docs/ADR/0046-named-network-services.md)): `connect-src`
 * تساوي `'self'` والقائمة المسمّاة حرفًا — لا مصدر زائد، ولا مسمًّى ناقص، ولا نجمة ولا مخطّط عامّ — وكل توجيهٍ غيرها
 * على الإضافة وحدها.
 */

/** أصلٌ مسمًّى صالح: `https` ومضيفٌ بلا منفذ ولا مسار ولا نجمة. */
const NAMED_ORIGIN =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

/** يقسم السياسة توجيهاتٍ بترتيبها: `[{ name, sources }]`. */
export function parseCsp(csp) {
  return String(csp ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name = '', ...sources] = part.split(/\s+/u)
      return { name: name.toLowerCase(), sources }
    })
}

/**
 * يحكم على `extension_pages` مقابل الأصول المسمّاة. يرجع `{ problems, connect }`: كل مشكلةٍ جملةٌ تسمّي ما سقط،
 * و`connect` مصادر `connect-src` كما قُرئت (للطباعة).
 */
export function judgeExtensionCsp(csp, namedOrigins) {
  const problems = []
  const directives = parseCsp(csp)
  if (directives.length === 0) return { problems: ['السياسة فارغة أو مفقودة'], connect: [] }

  for (const origin of namedOrigins) {
    if (!NAMED_ORIGIN.test(origin)) problems.push(`أصلٌ مسمًّى غير صالح في السياسة: ${origin}`)
  }

  const seen = new Set()
  for (const { name, sources } of directives) {
    if (seen.has(name)) {
      problems.push(`التوجيه ${name} مكرَّر — المتصفّح يأخذ أوّلهما ويتجاهل الثاني`)
    }
    seen.add(name)
    const unsafe = sources.filter((s) => /unsafe-/iu.test(s))
    if (unsafe.length > 0) problems.push(`${name} يحوي ${unsafe.join(' ')}`)
    if (name === 'connect-src') continue
    const foreign = sources.filter((s) => s !== "'self'" && s !== "'none'" && !/unsafe-/iu.test(s))
    if (foreign.length > 0) problems.push(`${name} يحوي مصدرًا غير الإضافة: ${foreign.join(' ')}`)
  }

  const connect = directives.find((d) => d.name === 'connect-src')?.sources ?? []
  if (!directives.some((d) => d.name === 'connect-src')) {
    problems.push('لا connect-src — والاتّصال بلا توجيهٍ مفتوحٌ لكل مصدر')
  } else {
    if (!connect.includes("'self'")) problems.push("connect-src بلا 'self'")
    const extra = connect.filter((s) => s !== "'self'" && !namedOrigins.includes(s))
    if (extra.length > 0) {
      problems.push(`connect-src يحوي مصدرًا غير مسمًّى في NETWORK_SERVICES: ${extra.join(' ')}`)
    }
    const missing = namedOrigins.filter((o) => !connect.includes(o))
    if (missing.length > 0) {
      problems.push(`خدمةٌ مسمّاة غائبة عن connect-src: ${missing.join(' ')}`)
    }
  }

  return { problems, connect }
}

/** صلاحيات المضيف الاختيارية تساوي السياسة مجموعةً: لا زائد ولا ناقص. */
export function judgeHostPermissions(declared, policy) {
  const list = Array.isArray(declared) ? declared : []
  const extra = list.filter((p) => !policy.includes(p))
  const missing = policy.filter((p) => !list.includes(p))
  return { extra, missing }
}
