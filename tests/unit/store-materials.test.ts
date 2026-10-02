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
  REQUIRED_PERMISSIONS,
} from '@/shared/permission-policy'

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
  if (channels === 3) return { width, height, alpha: null }
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = out[i * 4 + 3]!
  return { width, height, alpha }
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
    expect(readdirSync(join(LAUNCH, 'screens')).sort()).toEqual(expected.sort())
    for (const f of expected) expect([f, ...size(`screens/${f}`)]).toEqual([f, 1280, 800])
  })

  it('كل لقطة تأتي من لقطةٍ حيّة لها حارس أو اختبار في جدول المطابقة', () => {
    const features = read('Docs/Store/features.md')
    expect(
      content.screens.filter((s) => !features.includes(`\`${s.shot}\``)).map((s) => s.id),
    ).toEqual([])
  })

  it('الترويجيتان والشعار وصور README', () => {
    expect(size('promo/promo-small-440x280.png')).toEqual([440, 280])
    expect(size('promo/promo-marquee-1400x560.png')).toEqual([1400, 560])
    expect(size('icons/edge-logo-300.png')).toEqual([300, 300])
    expect(size('readme/social-preview.png')).toEqual([1280, 640])
    for (const lang of ['ar', 'en']) {
      expect(size(`readme/hero-${lang}.png`)).toEqual([2400, 1200])
      expect(size(`readme/browsers-${lang}.png`)).toEqual([2400, 600])
    }
  })

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

describe('قائمة المراجعة', () => {
  const checklist = read('Docs/Store/checklist.md')

  it('المصادر قُرئت بتاريخٍ مكتوب، وكل بندٍ بحالةٍ من الثلاث', () => {
    expect(checklist).toMatch(/قُرئت 2026-\d\d-\d\d/u)
    const rows = [...checklist.matchAll(/^\| (\d+) +\|(.*)$/gmu)]
    expect(rows.length).toBeGreaterThanOrEqual(40)
    const bad = rows.filter(
      ([, , rest]) => !/\| (?:✓|⏳ المالك|⏳ 30|✓ · ⏳ المالك) +\|/u.test(rest!),
    )
    expect(bad.map(([, n]) => n)).toEqual([])
  })
})
