/**
 * ميزانيتا الحزمة — دوالّ خالصة يستوردها `scripts/verify-dist.mjs` ويختبرها
 * `tests/unit/bundle-budget.test.ts`. القرار ووحدة القياس في
 * [ADR 0027](../Docs/ADR/0027-content-bundle-shape.md).
 *
 * **ما يُقاس:** بايتات gzip بمستوى 9 من `node:zlib`، لكل ملفّ منفردًا ثمّ تُجمع. والكيلوبايت
 * ألف بايت لا 1024 — القراءة الأشدّ للرقم المكتوب منذ ADR 0002، فلا يُرفع السقف بتأويل الوحدة.
 * و`gzip -9` في الطرفية يعطي رقمًا أصغر بنحو 0.5% للملفّ نفسه، فالحارس هو الحكم لا الطرفية.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

export const KB = 1000

/**
 * المحتوى ≤ 120KB منذ ADR 0002، والنافذة ≤ 80KB بمعيار `STAGES/19`. لا تُرفعان: ما يقترب
 * من السقف يسلك الروافع بترتيبها في ADR 0027.
 */
export const BUDGETS = Object.freeze({ content: 120 * KB, popup: 80 * KB })

export const gzipBytes = (buffer) => gzipSync(buffer, { level: 9 }).length

/** ما تحمّله صفحة HTML عند فتحها: السكربت، و`modulepreload`، وأوراق الأنماط. */
export function htmlRefs(html) {
  const refs = []
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/giu)) {
    const attr = (name) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'iu').exec(tag)?.[1]
    if (/^<script/iu.test(tag)) {
      const src = attr('src')
      if (src) refs.push(src)
      continue
    }
    const rel = attr('rel')?.toLowerCase()
    const href = attr('href')
    if (href && (rel === 'modulepreload' || rel === 'stylesheet')) refs.push(href)
  }
  return refs
}

/**
 * محدِّدات الاستيراد الساكن في وحدة ES مبنيّة: `import … from`، و`export … from`، و`import "…"`.
 * و`import()` الديناميكي **لا يُعدّ**: قطعته تُحمَّل بعد تفاعل لا عند الفتح.
 */
export function staticImports(code) {
  const specifiers = new Set()
  for (const m of code.matchAll(/\b(?:import|export)\s*[^;"'()]*?\bfrom\s*(["'])([^"']+)\1/gu)) {
    specifiers.add(m[2])
  }
  for (const m of code.matchAll(/\bimport\s*(["'])([^"']+)\1/gu)) specifiers.add(m[2])
  return [...specifiers]
}

const isLocal = (specifier) => /^(?:\.{1,2}\/|\/)/u.test(specifier)

/**
 * مخطّط الإقلاع لصفحة: ما تذكره في HTML، ثمّ كل ما تستورده قطع JS استيرادًا ساكنًا، إلى آخره.
 * الخطوط خارجه: ثنائية مضغوطة أصلًا وتتشاركها الصفحات كلّها. ومرجعٌ لا ملفّ له يُعاد في
 * `missing` — حزمة مكسورة لا حجم صغير.
 */
export function pageGraph(distDir, htmlPath) {
  const files = new Set()
  const missing = []
  const visit = (ref, fromDir) => {
    const full = ref.startsWith('/') ? join(distDir, ref) : join(fromDir, ref)
    const rel = relative(distDir, normalize(full.split(/[?#]/u)[0]))
    if (files.has(rel)) return
    if (!existsSync(join(distDir, rel))) {
      missing.push(rel)
      return
    }
    files.add(rel)
    if (!rel.endsWith('.js')) return
    const code = readFileSync(join(distDir, rel), 'utf8')
    for (const specifier of staticImports(code)) {
      if (isLocal(specifier)) visit(specifier, dirname(join(distDir, rel)))
    }
  }
  const htmlFull = join(distDir, htmlPath)
  for (const ref of htmlRefs(readFileSync(htmlFull, 'utf8'))) {
    if (isLocal(ref)) visit(ref, dirname(htmlFull))
  }
  return { files: [...files], missing }
}

/** الحكم على رقم واحد: يمرّ ما لم يتجاوز السقف، والمساواة داخله. */
export function judge(bytes, budget) {
  return { ok: bytes <= budget, bytes, budget, ratio: bytes / budget, over: bytes - budget }
}

export const fmt = (n) => n.toLocaleString('en-US')
