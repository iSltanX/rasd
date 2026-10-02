#!/usr/bin/env node
/**
 * حارس Firefox `inspect` — محرّك الفحص يوافق Firefox نفسه حكَمًا، بمرورٍ ونقرٍ حقيقيين.
 *
 * نظير `scripts/verify-inspect.mjs` فوق `scripts/lib/bidi.mjs` (SS7)، على عيّنة `css/` نفسها. ما يقوله المحرّك
 * يُقارَن بما يعطيه `getComputedStyle` في Firefox — فالحارس يقيس صدق المحرّك على محرّك تخطيطٍ وتتالٍ آخر، لا
 * اتّساقه مع نفسه. وقراءة `cssRules` والطبقات (`CSSLayerBlockRule.name`) هي ما قد يختلف بين المحرّكين:
 *   1. التفعيل بالمسار الحقيقي، والدرع لا يُرفع في وضع الفحص (`pointer-events: none`) فتبقى `:hover` صادقة.
 *   2. مرورٌ ثمّ نقرٌ حقيقي على `#layered` يثبّت لقطة: القيمة المحسوبة هي قيمة Firefox، والقاعدة الفائزة محسومة
 *      عبر الطبقات، والمحدِّد مبنيّ، والفهرس كامل بلا ورقة محجوبة.
 *   3. أسماء الطبقات تُقرأ متداخلةً (`outer.inner`).
 *   4. حقائق العيّنة في Firefox (الطبقات و`!important` و`:where` و`@supports` والمتغيّرات) — كي يُعرف أن العيّنة
 *      تمثّل حالاتها في هذا المحرّك.
 *   5. صفر خطأ من الإضافة في الطرفية، ولقطة اللوحة في `artifacts/firefox/inspect.png`.
 *
 *   pnpm build:firefox && pnpm firefox:inspect
 *   RASD_GUARD_SABOTAGE=content.js pnpm firefox:inspect   # السالب: يجب أن يسقط
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROOT, startGuard } from '../lib/bidi.mjs'

const PORT = 9235
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'inspect',
  port: PORT,
  title: '── حارس Firefox: محرّك الفحص ──',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  hardTimeoutMs: 150_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

const site = await g.openSite('/css/')
const inPage = g.inContext(site.context)
const act = await g
  .message('tool/activate', { tool: 'inspect', tabId: site.tabId }, 45_000)
  .catch((e) => ({ ok: false, error: e.message }))
if (!act?.ok || act.value?.started !== true)
  await g.abort(`تعذّر تفعيل الفحص: ${JSON.stringify(act)}`)
ok(`الفحص مفعَّل بالمسار الحقيقي — ${JSON.stringify(act.value)}`)
await g.settle(site.context)

// ── 1) الدرع ─────────────────────────────────────────────────────
const shield = await g.overlay(
  site.tabId,
  `(s) => ({ mode: s.modes.mode.value, pointerEvents: getComputedStyle(s.host.hostEl).pointerEvents })`,
)
shield.mode === 'inspect' && shield.pointerEvents === 'none'
  ? ok('الدرع لا يُرفع في وضع الفحص — :hover تبقى صادقة على الصفحة')
  : fail(`المضيف في وضع الفحص: ${JSON.stringify(shield)} والمتوقَّع pointer-events=none`)

// ── 2) مرورٌ ونقرٌ حقيقيان ────────────────────────────────────────
const target = JSON.parse(
  await inPage(`JSON.stringify((() => {
    const r = document.getElementById('layered').getBoundingClientRect()
    return { x: Math.round(r.x + Math.min(20, r.width / 2)), y: Math.round(r.y + r.height / 2), truth: getComputedStyle(document.getElementById('layered')).color }
  })())`),
)
await g.pointer(site.context, [
  { type: 'pointerMove', x: target.x - 30, y: target.y - 20 },
  { type: 'pause', duration: 120 },
  { type: 'pointerMove', x: target.x - 8, y: target.y - 4, duration: 120 },
  { type: 'pause', duration: 120 },
  { type: 'pointerMove', x: target.x, y: target.y, duration: 120 },
  { type: 'pause', duration: 400 },
  { type: 'pointerDown', button: 0 },
  { type: 'pointerUp', button: 0 },
])
await g.settle(site.context)
let engine = { pinned: false }
for (let i = 0; i < 20 && !engine.pinned; i++) {
  engine = await g.overlay(
    site.tabId,
    `(s) => {
      const d = s.inspect.state.detail.value
      if (!d) return { pinned: false }
      const win = d.rules.get('color')
      return {
        pinned: true,
        selector: d.snapshot.selector,
        computed: d.snapshot.styles['color'] ? d.snapshot.styles['color'].value.trim() : null,
        declared: win ? win.declared : null,
        layer: win ? win.layer : null,
        blocked: d.snapshot.limits.unreadableSheets,
        indexComplete: d.snapshot.limits.indexComplete,
      }
    }`,
  )
  if (!engine.pinned) await sleep(150)
}
if (!engine.pinned) {
  fail('لم تُثبَّت لقطة فحص بعد المرور والنقر الحقيقيين')
} else {
  note(`المحرّك: ${JSON.stringify(engine)}`)
  engine.computed === target.truth
    ? ok(`المحرّك يقرأ القيمة المحسوبة نفسها التي يقرؤها Firefox — ${engine.computed}`)
    : fail(`المحرّك قرأ ${engine.computed} وFirefox ${target.truth}`)
  engine.declared === 'rgb(2, 2, 2)'
    ? ok(`القاعدة الفائزة محسومة عبر الطبقات — الطبقة ${engine.layer}`)
    : fail(`القاعدة الفائزة: صُرِّح بـ${engine.declared} والمتوقَّع rgb(2, 2, 2)`)
  engine.selector ? ok(`المحدِّد مبنيّ — ${engine.selector}`) : fail('لا محدِّد في اللقطة')
  engine.indexComplete === true && (engine.blocked ?? 0) === 0
    ? ok('فهرس الأوراق كامل بلا ورقة محجوبة')
    : fail(`فهرس الأوراق: كامل=${engine.indexComplete} محجوبة=${engine.blocked}`)
}
const shot = await g.screenshot(site.context).catch(() => null)
if (shot) {
  const dir = join(ROOT, 'artifacts', 'firefox')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'inspect.png'), shot)
  note('لقطة اللوحة: artifacts/firefox/inspect.png')
}

// ── 3) أسماء الطبقات ─────────────────────────────────────────────
const layers = await g.overlay(
  site.tabId,
  `() => {
    const names = []
    const walk = (rules, prefix) => {
      for (const r of rules) {
        const own = typeof r.name === 'string' ? r.name : null
        const path = own !== null ? (prefix ? prefix + '.' + own : own) : prefix
        if (own !== null) names.push(path)
        if (r.cssRules) walk(r.cssRules, path)
      }
    }
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules, '') } catch {}
    }
    return names
  }`,
)
Array.isArray(layers) && layers.includes('outer.inner')
  ? ok(`أسماء الطبقات تُقرأ متداخلةً — ${layers.join(' · ')}`)
  : fail(`أسماء الطبقات ناقصة: ${JSON.stringify(layers)}`)

// ── 4) حقائق العيّنة في Firefox ──────────────────────────────────
const truths = JSON.parse(
  await inPage(`JSON.stringify((() => {
    const c = (sel, prop = 'color') => { const el = document.getElementById(sel) || document.querySelector(sel); return el ? getComputedStyle(el).getPropertyValue(prop).trim() : null }
    return {
      reversed: c('reversed'), where: c('w', 'outline-color'), cond: c('cond'), sup: c('sup'),
      inline: c('inline'), varMid: c('var-mid'), varChain: c('var-chain'), varFallback: c('var-fallback'),
    }
  })())`),
)
const want = {
  reversed: 'rgb(3, 3, 3)',
  where: 'rgb(6, 6, 6)',
  cond: 'rgb(10, 10, 10)',
  sup: 'rgb(11, 11, 11)',
  inline: 'rgb(13, 13, 13)',
  varMid: 'rgb(255, 85, 119)',
  varChain: 'rgb(0, 227, 201)',
  varFallback: 'rgb(18, 52, 86)',
}
const wrong = Object.entries(want).filter(([k, v]) => truths[k] !== v)
wrong.length === 0
  ? ok(
      'حقائق العيّنة في Firefox: !important والطبقات و:where و@supports والسطري والمتغيّرات كلّها كما يُتوقَّع',
    )
  : fail(
      `حقائق العيّنة: ${wrong.map(([k, v]) => `${k}=${truths[k]} (المتوقَّع ${v})`).join(' · ')}`,
    )

// ── 5) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ محرّك الفحص يوافق Firefox.' })
