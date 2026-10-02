/**
 * مواد المتجر تطابق الإضافة وحدود المتجرين — `STAGES/28`.
 *
 * ما يُلصق في لوحتي Chrome Web Store وEdge Add-ons مكتوبٌ في `Docs/Store/`، ويتقادم بصمت: صلاحيةٌ تُضاف بلا مبرّر،
 * أو اختبارٌ يُعاد تسميته فيبقى الوصف يحيل إليه، أو وصفٌ يطول فوق حدّ المتجر. فكل حدٍّ مقروءٍ من المصادر الرسمية
 * (`Docs/Store/checklist.md`) يُقاس هنا، ولكلّ فحصٍ حالته السالبة على مدخلٍ مصنوع — فحصٌ لا يسقط ليس ضمانًا.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import {
  OPTIONAL_HOST_PERMISSIONS,
  OPTIONAL_PERMISSIONS,
  NETWORK_SERVICES,
  REQUIRED_PERMISSIONS,
} from '@/shared/permission-policy'

import { buildManifest } from '../../manifest.config'
// @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لثابته وحده.
import { LINT_ALLOWED_WARNINGS as rawLintAllowed } from '../../scripts/lib/release-pack.mjs'

/** التحذيرات التي يقبلها مدقّق AMO وعددها (`release-pack.mjs`). */
const LINT_ALLOWED_WARNINGS = rawLintAllowed as Record<string, number>

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

// ── المساعدات — بيانات خالصة، وسالبها أدناه ───────────────────────

/** أسماء الصلاحيات في صفوف جداول `permissions.md`: أوّل خليّة بين علامتي اقتباس خلفيتين. */
export function permissionRows(doc: string): string[] {
  return [...doc.matchAll(/^\| `([^`]+)` +\|/gmu)].map((m) => m[1]!)
}

/** الفرق بين السياسة والوثيقة: صلاحيةٌ بلا صفّ، وصفٌّ بلا صلاحية. */
export function permissionDrift(policy: readonly string[], rows: readonly string[]) {
  return {
    missing: policy.filter((p) => !rows.includes(p)),
    stale: rows.filter((r) => !policy.includes(r)),
  }
}

/** كتلة نصٍّ مسوّرة بعد عنوانها، أو بوسمها بعد `text`. */
export function fenced(doc: string, marker: string): string | null {
  const byTag = new RegExp('```text ' + marker + '\\n([\\s\\S]*?)\\n```', 'u').exec(doc)
  if (byTag) return byTag[1]!
  const at = doc.indexOf(marker)
  if (at < 0) return null
  return /```text\n([\s\S]*?)\n```/u.exec(doc.slice(at))?.[1] ?? null
}

/** حدود الوصف الطويل (E1: 250–10,000 لكل لغة) ونظافته: لا حشو للاسم (C1)، ولا «قريبًا»، ولا رقم خطّة، ولا Chrome (E2 1.1.2). */
export function descriptionProblems(text: string, name: string): string[] {
  const problems: string[] = []
  const length = [...text].length
  if (length < 250 || length > 10_000) problems.push(`الطول ${length} خارج 250–10,000`)
  const count = text.split(name).length - 1
  if (count > 5) problems.push(`«${name}» ${count} مرّات — فوق خمس`)
  if (/قريب|coming soon|\bsoon\b/iu.test(text)) problems.push('وعدٌ بميزة لم تُنفَّذ')
  if (/(?:المرحلة|الوحدة|STAGES|§)\s*\d/u.test(text)) problems.push('رقم خطّة داخلي')
  if (/chrome/iu.test(text)) problems.push('إحالةٌ إلى متصفّحٍ بعينه')
  return problems
}

/** مصطلحات بحث Edge (E1): سبعة على الأكثر، 30 حرفًا لكلٍّ، 21 كلمة مجموعًا. */
export function searchTermProblems(terms: readonly string[]): string[] {
  const problems: string[] = []
  if (terms.length === 0 || terms.length > 7) problems.push(`${terms.length} مصطلحًا — المسموح 1–7`)
  for (const t of terms) if ([...t].length > 30) problems.push(`«${t}» فوق 30 حرفًا`)
  const words = terms.join(' ').split(/\s+/u).filter(Boolean).length
  if (words > 21) problems.push(`${words} كلمة — فوق 21`)
  return problems
}

interface Png {
  width: number
  height: number
  /** قناة الشفافية لكل بكسل، أو `null` لصورةٍ بلا قناة. */
  alpha: Uint8Array | null
  /** لون بكسلٍ واحد `[r, g, b]` (الإحداثيان من الزاوية العليا اليسرى). */
  rgb(x: number, y: number): [number, number, number]
}

/** فكّ PNG بثمانية بتّات غير متداخل (RGB أو RGBA) — ما يكتبه Chrome. يكفي لقياس الأبعاد والشفافية. */
export function decodePng(bytes: Buffer): Png {
  if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('ليس PNG')
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  const depth = bytes[24]
  const colour = bytes[25]
  const channels = colour === 6 ? 4 : colour === 2 ? 3 : 0
  if (depth !== 8 || channels === 0 || bytes[28] !== 0) {
    throw new Error(`PNG غير مدعوم: عمق ${depth} ونوع ${colour}`)
  }
  const idat: Buffer[] = []
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at)
    const type = bytes.toString('latin1', at + 4, at + 8)
    if (type === 'IDAT') idat.push(bytes.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x]!
      const a = x >= channels ? out[y * stride + x - channels]! : 0
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels]! : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][
        filter
      ]!
      out[y * stride + x] = (value + predictor) & 0xff
    }
  }
  const rgb = (x: number, y: number): [number, number, number] => {
    const at = (y * width + x) * channels
    return [out[at]!, out[at + 1]!, out[at + 2]!]
  }
  if (channels === 3) return { width, height, alpha: null, rgb }
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = out[i * 4 + 3]!
  return { width, height, alpha, rgb }
}

/** بكسلاتٌ غير شفّافة في حاشيةٍ بعرض `pad` حول الصورة (C6: العمل الفنّي 96 في 128، والحاشية 16 شفّافة). */
export function opaqueInPadding({ width, height, alpha }: Png, pad: number): number {
  if (!alpha) return width * height
  let n = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= pad && x < width - pad && y >= pad && y < height - pad
      if (!inside && alpha[y * width + x]! > 0) n++
    }
  }
  return n
}

// ── AMO وOpera (SS8) — حدودٌ مقروءةٌ من مصادرها يوم 2026-10-02 ───────

/** ملخّص AMO (A1·A2): 250 حرفًا على الأكثر، سطرٌ واحد. */
export function amoSummaryProblems(text: string): string[] {
  const problems: string[] = []
  const length = [...text].length
  if (length === 0 || length > 250) problems.push(`الملخّص ${length} حرفًا — المسموح 1–250`)
  if (/\n/u.test(text)) problems.push('الملخّص أكثر من سطر')
  return problems
}

/** فئات AMO لإضافة (A5 — الواجهة البرمجية للفئات، type=extension). */
const AMO_CATEGORIES = [
  'Feeds, News & Blogging',
  'Web Development',
  'Download Management',
  'Privacy & Security',
  'Search Tools',
  'Appearance',
  'Bookmarks',
  'Language Support',
  'Photos, Music & Videos',
  'Social & Communication',
  'Alerts & Updates',
  'Other',
  'Tabs',
  'Shopping',
  'Games & Entertainment',
]
/** فئات Opera (O1). */
const OPERA_CATEGORIES = [
  'Accessibility',
  'Appearance',
  'Entertainment',
  'Games',
  'Music',
  'News & Blogging',
  'Pictures',
  'Productivity',
  'Reference',
  'Shopping',
  'Social',
  'Travel',
  'Weather',
  'Web Development',
]

/** حتى `max` فئات، كلٌّ من القائمة الرسمية. */
export function categoryProblems(
  chosen: readonly string[],
  allowed: readonly string[],
  max: number,
): string[] {
  const problems: string[] = []
  if (chosen.length === 0 || chosen.length > max)
    problems.push(`${chosen.length} فئة — المسموح 1–${max}`)
  for (const c of chosen) if (!allowed.includes(c)) problems.push(`«${c}» ليست فئة رسمية`)
  return problems
}

/** النسخة عند Opera (O1): من عدد إلى أربعة أعداد بنقاط، بلا صفر بادئ. */
export function operaVersionOk(version: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/u.test(version)
}

/** لقطة Opera (O1): 612×408 المفضَّل وأقصاها 800×600، على أبيض في زواياها الأربع. */
export function operaShotProblems(png: Png): string[] {
  const problems: string[] = []
  if (png.width !== 612 || png.height !== 408)
    problems.push(`${png.width}×${png.height} — المفضَّل 612×408`)
  if (png.width > 800 || png.height > 600) problems.push('فوق الأقصى 800×600')
  const corners: [number, number][] = [
    [0, 0],
    [png.width - 1, 0],
    [0, png.height - 1],
    [png.width - 1, png.height - 1],
  ]
  if (corners.some(([x, y]) => png.rgb(x, y).some((v) => v !== 255)))
    problems.push('الخلفية ليست بيضاء')
  return problems
}

/** سطور الوصف الطويل (60 حرفًا فأكثر) التي تكرّرت حرفًا في وثيقةٍ أخرى — نسخةٌ تنحرف. */
export function copiedLines(doc: string, longDescription: string): string[] {
  const lines = new Set(longDescription.split('\n').filter((l) => [...l].length >= 60))
  return doc.split('\n').filter((l) => lines.has(l))
}

/** صفوف جدول المفاتيح `| \`required\` | \`none\` |` — حقل البيان وقيمته. */
export function dataCollectionRows(doc: string): { required: string[]; optional: string[] } {
  const out = { required: [] as string[], optional: [] as string[] }
  for (const [, key, value] of doc.matchAll(/^\| `(required|optional)` +\| `([^`]+)`/gmu)) {
    out[key as 'required' | 'optional'].push(value!)
  }
  return out
}

/** ملاحظة المراجعين تذكر عدد تحذيرات `innerHTML` المقبولة كما في `LINT_ALLOWED_WARNINGS`. */
export function noteWarningProblems(note: string, allowed: number): string[] {
  const word = { 1: 'one', 2: 'two', 3: 'three' }[allowed as 1 | 2 | 3]
  return note.includes(`exactly ${word} UNSAFE_VAR_ASSIGNMENT`)
    ? []
    : [`الملاحظة لا تذكر ${allowed} تحذيرات UNSAFE_VAR_ASSIGNMENT كما يقبل المدقّق`]
}

/** صفوف قائمة المراجعة التي تحيل إلى رمز مصدرٍ غير موجود في جدول المصادر. */
export function unknownSources(section: string, known: readonly string[]): string[] {
  const bad: string[] = []
  for (const [, n, , source] of section.matchAll(/^\| (\d+) +\|([^|]*)\| ([^|]*?) +\|/gmu)) {
    const codes = (source ?? '').match(/\b[AO]\d\b/gu) ?? []
    for (const c of codes) if (!known.includes(c)) bad.push(`${n}: ${c}`)
  }
  return bad
}

/** قنوات النشر الأربع في `channels.md` — صفٌّ لكلٍّ بترتيبها. */
export function channelRows(doc: string): string[] {
  return [
    ...doc.matchAll(
      /^\| (Chrome Web Store|Microsoft Edge Add-ons|Firefox Add-ons \(AMO\)|Opera Add-ons) +\|/gmu,
    ),
  ].map((m) => m[1]!)
}

// ── EULA (قرار المالك 2026-10-02) ───────────────────────────────

/** عناوين البنود المرقَّمة `N. العنوان` في نصّ — بترتيبها. */
export function eulaSections(text: string): { n: number; title: string }[] {
  return [...text.matchAll(/^(\d+)\. (.+)$/gmu)].map((m) => ({
    n: Number(m[1]),
    title: m[2]!.trim(),
  }))
}

/** المواضيع التي كلّفه المالك بتغطيتها — كلٌّ بكلمةٍ مفتاحية في عنوان بندٍ إنجليزي. */
const EULA_TOPICS = [
  'Ownership',
  'Licence',
  'Restrictions',
  'Privacy',
  'Updates',
  'warranty',
  'liability',
  'termination',
  'Stores',
  'contact',
]

/** عيوب النصّ الإنجليزي والعربي: التغطية، والتطابق العددي، وما لا يجوز أن يقوله. */
export function eulaProblems(en: string, ar: string, email: string, privacyUrl: string): string[] {
  const problems: string[] = []
  const e = eulaSections(en)
  const a = eulaSections(ar)
  if (e.some((x, i) => x.n !== i + 1)) problems.push('ترقيم البنود الإنجليزية غير متتابع')
  if (e.length !== a.length) problems.push(`${e.length} بندًا إنجليزيًّا و${a.length} عربيًّا`)
  const titles = e.map((x) => x.title).join(' | ')
  for (const t of EULA_TOPICS) {
    if (!new RegExp(t, 'iu').test(titles)) problems.push(`لا بند عن «${t}»`)
  }
  for (const [name, text] of [
    ['الإنجليزي', en],
    ['العربي', ar],
  ] as const) {
    if (!text.includes(email)) problems.push(`النصّ ${name} بلا بريد الدعم`)
    if (!text.includes(privacyUrl)) problems.push(`النصّ ${name} بلا رابط سياسة الخصوصية`)
  }
  // التزاماتٌ لا وجود لها في رصد، وقانونٌ ومحكمة لم يحدّدهما المالك، واسم متصفّحٍ يربط النصّ بمتجر.
  if (
    /subscription|per month|premium|advertis|analytics|telemetry|account is required|you must create an account/iu.test(
      en,
    )
  ) {
    problems.push('التزام أو ميزة غير موجودة في رصد (اشتراك · إعلان · قياس · حساب)')
  }
  if (/governed by the laws? of|exclusive jurisdiction|courts of/iu.test(en)) {
    problems.push('قانون واجب التطبيق أو محكمة — لم يحدّدهما المالك')
  }
  if (/\b(?:chrome|edge|firefox|opera|brave|vivaldi)\b/iu.test(en))
    problems.push('اسم متصفّح في النصّ الملزِم')
  const urls = (en.match(/https?:\/\/[^\s)]+/gu) ?? []).map((u) => u.replace(/[.,;:]+$/u, ''))
  if (urls.some((u) => u !== privacyUrl)) problems.push('رابط غير رابط سياسة الخصوصية')
  return problems
}

/** ترخيص المشروع في `package.json` يجب أن يطابق ما تقوله EULA (مملوكة، لا مفتوحة المصدر). */
export function licenceConflict(packageLicense: string, en: string): string[] {
  if (packageLicense !== 'UNLICENSED') return [`ترخيص المشروع صار «${packageLicense}» — راجع EULA`]
  return /proprietary software/iu.test(en) && /not open-source/iu.test(en)
    ? []
    : ['EULA لا تقول إن رصد مملوكة وليست مفتوحة المصدر']
}

/** بريدٌ في وثيقة غير البريد الرسمي وما سُمّح به (معرّف Firefox يشبه بريدًا وليس بريدًا). */
export function foreignEmails(
  text: string,
  official: string,
  allowed: readonly string[] = [],
): string[] {
  return [...new Set(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu) ?? [])].filter(
    (m) => m !== official && !allowed.includes(m),
  )
}

// ── الوثائق الحقيقية ─────────────────────────────────────────────

const listing = read('Docs/Store/listing.md')

describe('مبرّرات الصلاحيات', () => {
  const policy = [...REQUIRED_PERMISSIONS, ...OPTIONAL_PERMISSIONS, ...OPTIONAL_HOST_PERMISSIONS]

  it('لكل صلاحية في السياسة صفّ، ولا صفّ لصلاحيةٍ ليست فيها', () => {
    expect(permissionDrift(policy, permissionRows(read('Docs/Store/permissions.md')))).toEqual({
      missing: [],
      stale: [],
    })
  })

  it('سالب: صفٌّ ناقص وصفٌّ زائد يُرصدان', () => {
    const doc = '| `activeTab` | x |\n| `tabs` | y |\n'
    expect(permissionDrift(['activeTab', 'scripting'], permissionRows(doc))).toEqual({
      missing: ['scripting'],
      stale: ['tabs'],
    })
  })
})

describe('الوصف القصير — من البيان (C11: 132 حرفًا نصًّا خالصًا)', () => {
  for (const locale of ['ar', 'en']) {
    it(`_locales/${locale}`, () => {
      const messages = JSON.parse(read(`public/_locales/${locale}/messages.json`)) as Record<
        string,
        { message: string }
      >
      const text = messages.extDescription!.message
      expect([...text].length).toBeGreaterThan(0)
      expect([...text].length).toBeLessThanOrEqual(132)
      expect(text).not.toMatch(/[<>\n]/u)
    })
  }
})

describe('الوصف الطويل', () => {
  it('العربية', () => {
    const text = fenced(listing, '## الوصف الطويل — العربية')
    expect(text).not.toBeNull()
    expect(descriptionProblems(text!, 'رصد')).toEqual([])
  })

  it('الإنجليزية — وتذكر أن الواجهة عربية (E2 1.7)', () => {
    const text = fenced(listing, '## Long description — English')
    expect(text).not.toBeNull()
    expect(descriptionProblems(text!, 'Rasd')).toEqual([])
    expect(text).toMatch(/interface is in Arabic/u)
  })

  it('سالب: قصيرٌ، ومحشوّ، ويعد بقريب، ويحمل رقم خطّة، ويسمّي متصفّحًا', () => {
    expect(descriptionProblems('Rasd '.repeat(6), 'Rasd')).toEqual([
      'الطول 30 خارج 250–10,000',
      '«Rasd» 6 مرّات — فوق خمس',
    ])
    const long = 'x'.repeat(300)
    expect(descriptionProblems(`${long} قريبًا`, 'رصد')).toEqual(['وعدٌ بميزة لم تُنفَّذ'])
    expect(descriptionProblems(`${long} المرحلة 12`, 'رصد')).toEqual(['رقم خطّة داخلي'])
    expect(descriptionProblems(`${long} for Chrome`, 'رصد')).toEqual(['إحالةٌ إلى متصفّحٍ بعينه'])
  })
})

describe('مصطلحات بحث Edge', () => {
  for (const lang of ['ar', 'en']) {
    it(lang, () => {
      const block = fenced(listing, `search-terms-${lang}`)
      expect(block).not.toBeNull()
      expect(searchTermProblems(block!.split('\n').filter(Boolean))).toEqual([])
    })
  }

  it('سالب: ثمانية، وطويلٌ، وكلماتٌ فوق 21', () => {
    expect(searchTermProblems(Array.from({ length: 8 }, (_, i) => `t${i}`))).toEqual([
      '8 مصطلحًا — المسموح 1–7',
    ])
    expect(searchTermProblems(['a'.repeat(31)])).toEqual([`«${'a'.repeat(31)}» فوق 30 حرفًا`])
    expect(searchTermProblems(['a b c d e f g h i j k', 'a b c d e f g h i j k'])).toEqual([
      '22 كلمة — فوق 21',
    ])
  })
})

describe('جدول المطابقة — كل دليلٍ يحيل إلى ما يوجد', () => {
  const features = read('Docs/Store/features.md')
  const scripts = Object.keys(
    (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts,
  )

  it('كل مسار اختبار موجود', () => {
    const paths = [...features.matchAll(/`(tests\/[^`]+)`/gu)].map((m) => m[1]!)
    expect(paths.length).toBeGreaterThan(20)
    expect(paths.filter((p) => !existsSync(join(root, p)))).toEqual([])
  })

  it('كل حارسٍ مذكور سكربتٌ في package.json', () => {
    const guards = [...features.matchAll(/`pnpm (verify:[\w-]+)`/gu)].map((m) => m[1]!)
    expect(guards.length).toBeGreaterThan(15)
    expect(guards.filter((g) => !scripts.includes(g))).toEqual([])
  })
})

describe('مواد الإطلاق — بأبعاد المتجرين (C6 · C7 · E1) ومن مصدرها', () => {
  const LAUNCH = join(root, 'Docs', 'Launch')
  const content = JSON.parse(read('Docs/Launch/content.json')) as {
    screens: { id: string; shot: string; ar: string[]; en: string[] }[]
  }
  const png = (path: string) => decodePng(readFileSync(join(LAUNCH, path)))
  const size = (path: string) => {
    const { width, height } = png(path)
    return [width, height]
  }

  it('لقطةٌ لكل بندٍ في content.json باللغتين، كلٌّ 1280×800 — وما يُرفع منها في حدود المتجرين', () => {
    // Chrome يقبل خمسًا على الأكثر وEdge ستًّا: الرفع بالترتيب، فيكفي أن تبلغ القائمة ستًّا.
    expect(content.screens.length).toBeGreaterThanOrEqual(6)
    const expected = content.screens.flatMap((s, i) =>
      ['ar', 'en'].map((lang) => `${lang}-${String(i + 1).padStart(2, '0')}-${s.id}.png`),
    )
    // لقطات Opera (612×408) في المجلّد نفسه بادئتها `opera-`، وتُقاس في اختبارها أدناه.
    const opera = content.screens
      .slice(0, 5)
      .flatMap((s, i) =>
        ['ar', 'en'].map((lang) => `opera-${lang}-${String(i + 1).padStart(2, '0')}-${s.id}.png`),
      )
    expect(readdirSync(join(LAUNCH, 'screens')).sort()).toEqual([...expected, ...opera].sort())
    for (const f of expected) expect([f, ...size(`screens/${f}`)]).toEqual([f, 1280, 800])
    // فكّ ستّ عشرة صورة 1280×800 بالجافاسكربت الصرف: 2.2s محلّيًّا تحت التغطية، فيعبر حدّ الخمس ثوانٍ على عدّاء بنواتين
    // (سقط في جولتين من CI على التوالي؛ المرحلة SS9).
  }, 30_000)

  it('كل لقطة تأتي من لقطةٍ حيّة لها حارس أو اختبار في جدول المطابقة', () => {
    const features = read('Docs/Store/features.md')
    expect(
      content.screens.filter((s) => !features.includes(`\`${s.shot}\``)).map((s) => s.id),
    ).toEqual([])
  })

  /** صور README — ألواح Figma (`35 — README`) بعرضها المنطقي ×2؛ وصورة المشاركة بمقاس GitHub نفسه. */
  const README_IMAGES: Record<string, [number, number]> = {
    'hero-ar.png': [1920, 960],
    'hero-en.png': [1920, 960],
    'browsers-ar.png': [1920, 256],
    'browsers-en.png': [1920, 256],
    'inspect-ar.png': [1920, 960],
    'colours-ar.png': [1920, 960],
    'compare-ar.png': [1920, 960],
    'editor-ar.png': [1920, 960],
    'capture-ar.png': [944, 720],
    'library-ar.png': [944, 720],
    'workflow-ar.png': [1920, 440],
    'privacy-ar.png': [1920, 800],
    'privacy-en.png': [1920, 800],
    'social-preview.png': [1280, 640],
  }

  it('الترويجيتان والشعار وصور README', () => {
    expect(size('promo/promo-small-440x280.png')).toEqual([440, 280])
    expect(size('promo/promo-marquee-1400x560.png')).toEqual([1400, 560])
    expect(size('icons/edge-logo-300.png')).toEqual([300, 300])
    expect(readdirSync(join(LAUNCH, 'readme')).sort()).toEqual(Object.keys(README_IMAGES).sort())
    for (const [name, dims] of Object.entries(README_IMAGES))
      expect([name, ...size(`readme/${name}`)]).toEqual([name, ...dims])
  }, 30_000)

  /** صور `Docs/Launch/readme/` التي يحيل إليها README.md. */
  const referenced = (doc: string) =>
    [...doc.matchAll(/Docs\/Launch\/readme\/([\w-]+\.png)/gu)].map((m) => m[1]!)

  it('كل صورة يحيل إليها README موجودة، وكل صورة README مستعملة (إلا صورة المشاركة لإعدادات GitHub)', () => {
    const used = [...new Set(referenced(read('README.md')))].sort()
    expect(used.filter((f) => !existsSync(join(LAUNCH, 'readme', f)))).toEqual([])
    expect(used).toEqual(
      Object.keys(README_IMAGES)
        .filter((f) => f !== 'social-preview.png')
        .sort(),
    )
  })

  it('سالب: إحالة إلى صورة غير موجودة تُرصد', () => {
    const forged = `${read('README.md')}\n<img src="Docs/Launch/readme/ghost-ar.png">`
    expect(referenced(forged).filter((f) => !existsSync(join(LAUNCH, 'readme', f)))).toEqual([
      'ghost-ar.png',
    ])
  })

  it('ألواح README بزوايا شفّافة وجسمٍ معتم — فتعمل على وضعَي GitHub بلا <picture>', () => {
    for (const name of Object.keys(README_IMAGES).filter((f) => f !== 'social-preview.png')) {
      const p = png(`readme/${name}`)
      expect([name, p.alpha?.[0]]).toEqual([name, 0])
      expect([name, p.alpha?.[(p.height >> 1) * p.width + (p.width >> 1)]]).toEqual([name, 255])
    }
    // سالب: صورة المشاركة معتمة حتى ركنها — لا يُقبل لوحٌ بلا زوايا شفّافة.
    expect(png('readme/social-preview.png').alpha?.[0] ?? 255).toBe(255)
  }, 30_000)

  it('أيقونة المتجر 128 بحاشية شفّافة 16 وعملٍ فنّي في وسطها', () => {
    const icon = png('icons/store-icon-128.png')
    expect([icon.width, icon.height]).toEqual([128, 128])
    expect(opaqueInPadding(icon, 16)).toBe(0)
    expect(icon.alpha![64 * 128 + 64]).toBe(255)
  })

  it('سالب: أيقونة الشريط بلا حاشية تُرصد', () => {
    const toolbar = decodePng(readFileSync(join(root, 'public', 'icons', 'icon-128.png')))
    expect(opaqueInPadding(toolbar, 16)).toBeGreaterThan(0)
  })
})

describe('المتصفّحات المدعومة — من الاختبار لا من الذاكرة', () => {
  const data = JSON.parse(read('Docs/Launch/browsers.json')) as {
    browsers: { name: string; status: string; evidence: string[] }[]
  }
  const supported = data.browsers.filter((b) => b.status === 'supported')
  const readme = read('README.md')
  /** أسماء المتصفّحات في جدول «المتصفّحات» في README بعلامة ✓ — ما يقول README إنه مدعوم. */
  const claimed = (doc: string) =>
    [...doc.matchAll(/^\| \*\*([^*]+)\*\* +\|[^\n]*✓/gmu)].map((m) => m[1]!.trim())

  it('لكل متصفّح «مدعوم» دليلٌ مسجَّل', () => {
    expect(supported.length).toBeGreaterThan(0)
    expect(supported.filter((b) => b.evidence.length === 0).map((b) => b.name)).toEqual([])
  })

  it('README لا يقول «مدعوم» إلا عمّا أثبته الاختبار، ولا يُسقط منه شيئًا', () => {
    expect(claimed(readme).sort()).toEqual(supported.map((b) => b.name).sort())
  })

  it('سالب: متصفّحٌ يُضاف إلى README بلا اختبار يُرصد', () => {
    const forged = `${readme}\n| **Netscape** | 4 | ✓ |\n`
    expect(claimed(forged)).toContain('Netscape')
    expect(claimed(forged).sort()).not.toEqual(supported.map((b) => b.name).sort())
  })
})

describe('Firefox Add-ons (AMO) — مواد القائمة (A1 · A2 · A4 · A5)', () => {
  const doc = read('Docs/Store/firefox/listing.md')
  const gecko = (
    buildManifest('firefox') as unknown as {
      browser_specific_settings: {
        gecko: {
          id: string
          data_collection_permissions: { required: string[]; optional: string[] }
        }
      }
    }
  ).browser_specific_settings.gecko

  for (const lang of ['ar', 'en']) {
    it(`الملخّص ${lang}: حتى 250 حرفًا`, () => {
      const text = fenced(doc, `summary-${lang}`)
      expect(text).not.toBeNull()
      expect(amoSummaryProblems(text!)).toEqual([])
    })
  }

  it('سالب: ملخّص طويل ومتعدّد الأسطر يُرصد', () => {
    expect(amoSummaryProblems('x'.repeat(251))).toEqual(['الملخّص 251 حرفًا — المسموح 1–250'])
    expect(amoSummaryProblems('a\nb')).toEqual(['الملخّص أكثر من سطر'])
    expect(amoSummaryProblems('')).toEqual(['الملخّص 0 حرفًا — المسموح 1–250'])
  })

  it('الفئتان من القائمة الرسمية، حتى اثنتين', () => {
    const row = /^\| Firefox \(سطح المكتب\) +\| `([^`]+)` · `([^`]+)`/mu.exec(doc)
    expect(row).not.toBeNull()
    expect(categoryProblems([row![1]!, row![2]!], AMO_CATEGORIES, 2)).toEqual([])
  })

  it('سالب: ثلاث فئات وفئةٌ مختلقة تُرصدان', () => {
    expect(categoryProblems(['Other', 'Tabs', 'Appearance'], AMO_CATEGORIES, 2)).toEqual([
      '3 فئة — المسموح 1–2',
    ])
    expect(categoryProblems(['Developer Tools'], AMO_CATEGORIES, 2)).toEqual([
      '«Developer Tools» ليست فئة رسمية',
    ])
  })

  it('إفصاح البيانات في القائمة = ما في بيان Firefox', () => {
    const rows = dataCollectionRows(doc)
    expect(rows.required).toEqual(gecko.data_collection_permissions.required)
    expect(rows.optional).toEqual(gecko.data_collection_permissions.optional)
  })

  it('سالب: فئة إفصاح زائدة في الوثيقة تنحرف عن البيان', () => {
    const forged = `${doc}\n| \`optional\` | \`browsingActivity\` | x |\n`
    expect(dataCollectionRows(forged).optional).not.toEqual(
      gecko.data_collection_permissions.optional,
    )
  })

  it('المعرّف في القائمة هو معرّف البيان', () => {
    expect(doc).toContain(`\`${gecko.id}\``)
  })

  it('لا نسخة ثانية من الوصف الطويل — يحيل إلى listing.md', () => {
    const long = `${fenced(listing, '## الوصف الطويل — العربية')}\n${fenced(listing, '## Long description — English')}`
    expect(copiedLines(doc, long)).toEqual([])
    expect(doc).toContain('../listing.md')
  })

  it('سالب: وثيقةٌ تنسخ سطرًا من الوصف تُرصد', () => {
    const long = fenced(listing, '## Long description — English')!
    const line = long.split('\n').find((l) => [...l].length >= 60)!
    expect(copiedLines(`x\n${line}\ny`, long)).toEqual([line])
  })

  it('ملاحظات المراجعين: المصدر والتحذيران المقبولان كما يقبلهما المدقّق', () => {
    const note = fenced(doc, 'reviewer-notes')
    expect(note).not.toBeNull()
    expect(note).toContain('rasd-<version>-source.zip')
    expect(note).toContain('pnpm-lock.yaml')
    expect(noteWarningProblems(note!, LINT_ALLOWED_WARNINGS['UNSAFE_VAR_ASSIGNMENT']!)).toEqual([])
  })

  it('سالب: عدد تحذيراتٍ لا يطابق المدقّق يُرصد', () => {
    expect(noteWarningProblems('exactly two UNSAFE_VAR_ASSIGNMENT', 3)).toHaveLength(1)
  })

  it('أيقونة AMO 64×64 تملأ مربّعها؛ وأيقونة 128 للمتجر ليست هي (سالب)', () => {
    const icon = decodePng(readFileSync(join(root, 'Docs', 'Launch', 'icons', 'amo-icon-64.png')))
    expect([icon.width, icon.height]).toEqual([64, 64])
    expect(opaqueInPadding(icon, 4)).toBeGreaterThan(0)
    const store = decodePng(
      readFileSync(join(root, 'Docs', 'Launch', 'icons', 'store-icon-128.png')),
    )
    expect([store.width, store.height]).not.toEqual([64, 64])
  })
})

describe('Opera Add-ons — مواد القائمة (O1 · O2)', () => {
  const doc = read('Docs/Store/opera/listing.md')
  const LAUNCH = join(root, 'Docs', 'Launch', 'screens')
  const shots = readdirSync(LAUNCH).filter((f) => f.startsWith('opera-'))

  it('الفئة Web Development من القائمة الرسمية', () => {
    const row = /^\| الفئة +\| `([^`]+)`/mu.exec(doc)
    expect(row).not.toBeNull()
    expect(categoryProblems([row![1]!], OPERA_CATEGORIES, 1)).toEqual([])
  })

  it('سالب: فئةٌ من فئات AMO لا تُقبل عند Opera', () => {
    expect(categoryProblems(['Developer Tools'], OPERA_CATEGORIES, 1)).toEqual([
      '«Developer Tools» ليست فئة رسمية',
    ])
  })

  it('النسخة الحالية تصلح عند Opera؛ وبصفر بادئ أو خمسة أعداد (سالب) لا', () => {
    const { version } = JSON.parse(read('package.json')) as { version: string }
    expect(operaVersionOk(version)).toBe(true)
    expect(operaVersionOk('01.2')).toBe(false)
    expect(operaVersionOk('1.2.3.4.5')).toBe(false)
    expect(operaVersionOk('1.0.0.0')).toBe(true)
  })

  it('خمس لقطات لكل لغة، كلٌّ 612×408 على أبيض', () => {
    expect(shots).toHaveLength(10)
    for (const f of shots) {
      expect([f, ...operaShotProblems(decodePng(readFileSync(join(LAUNCH, f))))]).toEqual([f])
    }
  })

  it('سالب: لقطة Chrome 1280×800 الداكنة تسقط على الأبعاد والخلفية والأقصى', () => {
    const chrome = decodePng(readFileSync(join(LAUNCH, 'ar-01-inspect.png')))
    expect(operaShotProblems(chrome)).toEqual([
      '1280×800 — المفضَّل 612×408',
      'فوق الأقصى 800×600',
      'الخلفية ليست بيضاء',
    ])
  })

  it('لا نسخة ثانية من الوصف الطويل — يحيل إلى listing.md', () => {
    const long = `${fenced(listing, '## الوصف الطويل — العربية')}\n${fenced(listing, '## Long description — English')}`
    expect(copiedLines(doc, long)).toEqual([])
    expect(doc).toContain('../listing.md')
  })

  it('Opera ضمن 1.0 بقرار المالك، وEULA الخاصّة بدل الافتراضية، وبلا تقديم الآن', () => {
    expect(doc).toContain('ضمن نطاق إصدار 1.0 ولا يُؤجَّل')
    expect(doc).toContain('../eula.md')
    expect(doc).toContain('بلا تقديم الآن')
    expect(doc).not.toContain('إن قُرّر')
  })
})

describe('EULA — اتفاقية ترخيص المستخدم النهائي (Opera وAMO)', () => {
  const OFFICIAL_EMAIL = 'isultanby@gmail.com'
  const PRIVACY_URL = 'https://www.bysltan.com/rasd/privacy'
  const doc = read('Docs/Store/eula.md')
  const en = fenced(doc, 'eula-en')
  const ar = fenced(doc, 'eula-ar')

  it('نسختان، وكل المواضيع مغطّاة، والبنود متطابقة عددًا، والبريد والرابط فيهما', () => {
    expect(en).not.toBeNull()
    expect(ar).not.toBeNull()
    expect(eulaProblems(en!, ar!, OFFICIAL_EMAIL, PRIVACY_URL)).toEqual([])
    expect(eulaSections(en!)).toHaveLength(12)
  })

  it('سالب: نصٌّ ناقص يُرصد على كل محور', () => {
    const base = eulaProblems('1. Ownership', '1. a\n2. b', OFFICIAL_EMAIL, PRIVACY_URL)
    expect(base).toContain('1 بندًا إنجليزيًّا و2 عربيًّا')
    expect(base).toContain('لا بند عن «Licence»')
    expect(base).toContain('النصّ الإنجليزي بلا بريد الدعم')
    expect(base).toContain('النصّ العربي بلا رابط سياسة الخصوصية')
    expect(eulaProblems('2. Ownership', '', OFFICIAL_EMAIL, PRIVACY_URL)).toContain(
      'ترقيم البنود الإنجليزية غير متتابع',
    )
  })

  it('سالب: التزام لا وجود له، وقانونٌ مختلق، واسم متصفّح، ورابط غريب تُرصد', () => {
    const good = `${en}`
    const bad = (extra: string) =>
      eulaProblems(`${good}\n${extra}`, ar!, OFFICIAL_EMAIL, PRIVACY_URL)
    expect(bad('Rasd offers a premium subscription.')).toContain(
      'التزام أو ميزة غير موجودة في رصد (اشتراك · إعلان · قياس · حساب)',
    )
    expect(bad('This agreement is governed by the laws of Narnia.')).toContain(
      'قانون واجب التطبيق أو محكمة — لم يحدّدهما المالك',
    )
    expect(bad('Works in Firefox.')).toContain('اسم متصفّح في النصّ الملزِم')
    expect(bad('See https://example.com/terms')).toContain('رابط غير رابط سياسة الخصوصية')
  })

  it('تطابق ترخيص المشروع: UNLICENSED ⇒ مملوكة لا مفتوحة المصدر', () => {
    const { license } = JSON.parse(read('package.json')) as { license: string }
    expect(licenceConflict(license, en!)).toEqual([])
    expect(read('README.md')).toContain('جميع الحقوق محفوظة')
  })

  it('سالب: ترخيص مفتوح أو نصٌّ لا يقول «مملوكة» يُرصد', () => {
    expect(licenceConflict('MIT', en!)).toEqual(['ترخيص المشروع صار «MIT» — راجع EULA'])
    expect(licenceConflict('UNLICENSED', 'Rasd is free.')).toEqual([
      'EULA لا تقول إن رصد مملوكة وليست مفتوحة المصدر',
    ])
  })

  it('ما تقوله عن الاتصالات يطابق الشيفرة: اتصالان اختياريان، ووثيقة الإشعارات موجودة في البناء', () => {
    expect(NETWORK_SERVICES).toHaveLength(2)
    expect(en).toContain('two optional connections')
    expect(read('vite.config.ts')).toContain('THIRD_PARTY_LICENSES.txt')
    expect(en).toContain('THIRD_PARTY_LICENSES.txt')
  })

  it('بريد الدعم واحد في كل وثائق المتجر: الرسمي وحده (ومعرّف Firefox ليس بريدًا)', () => {
    const geckoId = (
      buildManifest('firefox') as unknown as {
        browser_specific_settings: { gecko: { id: string } }
      }
    ).browser_specific_settings.gecko.id
    const files = [
      'Docs/Store/eula.md',
      'Docs/Store/listing.md',
      'Docs/Store/firefox/listing.md',
      'Docs/Store/opera/listing.md',
      'Docs/Store/owner-pages.md',
    ]
    for (const f of files) {
      expect([f, ...foreignEmails(read(f), OFFICIAL_EMAIL, [geckoId])]).toEqual([f])
    }
    for (const f of [
      'Docs/Store/firefox/listing.md',
      'Docs/Store/opera/listing.md',
      'Docs/Store/listing.md',
    ]) {
      expect(read(f)).toContain(OFFICIAL_EMAIL)
    }
  })

  it('سالب: بريدٌ آخر في وثيقة يُرصد', () => {
    expect(foreignEmails(`a ${OFFICIAL_EMAIL} b other@example.com`, OFFICIAL_EMAIL)).toEqual([
      'other@example.com',
    ])
    expect(foreignEmails('x rasd@bysltan.com', OFFICIAL_EMAIL)).toEqual(['rasd@bysltan.com'])
  })

  it('قائمتا Opera وAMO تحيلان إلى EULA، ولا تعتمدان الافتراضية', () => {
    for (const f of ['Docs/Store/firefox/listing.md', 'Docs/Store/opera/listing.md']) {
      expect(read(f)).toContain('../eula.md')
    }
  })
})

describe('سجلّ القنوات', () => {
  const channels = read('Docs/Release/channels.md')

  it('صفٌّ لكل قناة من الأربع بترتيبها', () => {
    expect(channelRows(channels)).toEqual([
      'Chrome Web Store',
      'Microsoft Edge Add-ons',
      'Firefox Add-ons (AMO)',
      'Opera Add-ons',
    ])
  })

  it('سالب: جدولٌ ينقصه صفّ Opera يُرصد', () => {
    expect(channelRows(channels.replace(/^\| Opera Add-ons.*$/mu, ''))).toHaveLength(3)
  })
})

describe('قائمة المراجعة', () => {
  const checklist = read('Docs/Store/checklist.md')

  it('المصادر قُرئت بتاريخٍ مكتوب، وكل بندٍ بحالةٍ من الأربع', () => {
    expect(checklist).toMatch(/قُرئت 2026-\d\d-\d\d/u)
    const rows = [...checklist.matchAll(/^\| (\d+) +\|(.*)$/gmu)]
    expect(rows.length).toBeGreaterThanOrEqual(70)
    const bad = rows.filter(
      ([, , rest]) => !/\| (?:✓|⏳ المالك|⏳ 30|⏳ 10|✓ · ⏳ المالك) +\|/u.test(rest!),
    )
    expect(bad.map(([, n]) => n)).toEqual([])
  })

  it('قسما AMO وOpera: كل بندٍ يحيل إلى مصدرٍ مقروء في جدول المصادر', () => {
    const section = checklist.slice(checklist.indexOf('# Firefox Add-ons (AMO) وOpera Add-ons'))
    const known = [...section.matchAll(/^\| ([AO]\d) +\|/gmu)].map((m) => m[1]!)
    expect(known).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'O1', 'O2', 'O3'])
    expect(unknownSources(section, known)).toEqual([])
    expect([...section.matchAll(/^\| (\d+) +\|/gmu)]).toHaveLength(30)
  })

  it('سالب: بندٌ يحيل إلى مصدرٍ غير مقروء يُرصد', () => {
    const forged = '| 80 | بند | A9 | ✓ | x |\n'
    expect(unknownSources(forged, ['A1'])).toEqual(['80: A9'])
  })
})
