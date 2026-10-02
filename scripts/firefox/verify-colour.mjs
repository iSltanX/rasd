#!/usr/bin/env node
/**
 * حارس Firefox `colour` — القطّارة تقرأ البكسل الذي يرسمه Firefox فعلًا، بمؤشّرٍ ونقرٍ حقيقيين.
 *
 * نظير `scripts/verify-colour.mjs` فوق `scripts/lib/bidi.mjs` (SS7)، على عيّنة `colour/` نفسها. السؤال الذي لا
 * يجيب عنه إلا متصفّحٌ يرسم: هل لقطة `tabs.captureVisibleTab` في Firefox تعطي بايتات CSS تمامًا حيث لا مزج، والناتج
 * المركَّب حيث يوجد — وهل مقياس الصورة إلى النافذة صحيح فيُقرأ البكسل تحت المؤشّر لا جاره:
 *   1. لونٌ صريح (`#solid` و`#probe`): البكسل يساوي التصريح بايتًا ببايت، ولا «اختلاف» معلَن.
 *   2. `mix-blend-mode: multiply` (`#blend-top` فوق `#blend-base`): البكسل أخضر لا ما تقوله `getComputedStyle`،
 *      والاختلاف معلَن.
 *   3. طبقة نصف شفّافة (`#over` فوق `#under`): البكسل المركَّب رماديٌّ وسيط، والاختلاف معلَن.
 *   4. تدرّج (`#gradient`): طرفه الأيسر أحمر وطرفه الأيمن أزرق — الموضع يُقرأ لا يُفترض.
 *   5. صفر خطأ من الإضافة في الطرفية، ولقطة العدسة في `artifacts/firefox/colour.png`.
 *
 *   pnpm build:firefox && pnpm firefox:colour
 *   RASD_GUARD_SABOTAGE=content.js pnpm firefox:colour   # السالب: يجب أن يسقط
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROOT, startGuard } from '../lib/bidi.mjs'

const PORT = 9236
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'colour',
  port: PORT,
  title: '── حارس Firefox: القطّارة على بكسل Firefox ──',
  fixtures: true,
  // `captureVisibleTab` يطلب `<all_urls>` أو `activeTab` — كما في كروم.
  stage: { hostPermissions: ['<all_urls>'] },
  hardTimeoutMs: 180_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

const site = await g.openSite('/colour/')
const inPage = g.inContext(site.context)
const act = await g
  .message('tool/activate', { tool: 'colour', tabId: site.tabId }, 45_000)
  .catch((e) => ({ ok: false, error: e.message }))
if (!act?.ok || act.value?.started !== true)
  await g.abort(`تعذّر تفعيل الألوان: ${JSON.stringify(act)}`)
ok(`الألوان مفعَّلة بالمسار الحقيقي — ${JSON.stringify(act.value)}`)
await g.settle(site.context)

/** نقطة في عنصر بنسبة من عرضه (`fx`) وارتفاعه (`fy`)، بإحداثيات النافذة. */
const at = async (selector, fx = 0.5, fy = 0.5) =>
  JSON.parse(
    await inPage(`JSON.stringify((() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
      return { x: Math.round(r.x + r.width * ${fx}), y: Math.round(r.y + r.height * ${fy}) }
    })())`),
  )

/** ينقر بمؤشّرٍ حقيقي ويعيد اللون المثبَّت الجديد — البكسل والمصدر والاختلاف. */
async function pinAt(point) {
  await g.pointer(site.context, [
    { type: 'pointerMove', x: point.x - 6, y: point.y - 4 },
    { type: 'pause', duration: 100 },
    { type: 'pointerMove', x: point.x, y: point.y, duration: 100 },
    { type: 'pause', duration: 250 },
    { type: 'pointerDown', button: 0 },
    { type: 'pointerUp', button: 0 },
  ])
  for (let i = 0; i < 40; i++) {
    await sleep(150)
    const r = await g.overlay(
      site.tabId,
      `(s) => {
        const p = s.colour.state.pinned.value
        if (!p || s.colour.state.loading.value) return null
        return { x: p.point.x, y: p.point.y, source: p.source, pixel: p.pixelReading.rgb, mismatch: p.mismatch, error: s.colour.state.error.value }
      }`,
    )
    if (r && !r.__none && r.x === point.x && r.y === point.y) return r
  }
  return null
}
const rgb = (p) => (p ? `rgb(${p.r}, ${p.g}, ${p.b})` : '∅')
const close = (p, want, tol) =>
  p &&
  Math.abs(p.r - want.r) <= tol &&
  Math.abs(p.g - want.g) <= tol &&
  Math.abs(p.b - want.b) <= tol

// تسليحٌ: الطبقة تستلم المؤشّر وتلتقط أوّل لقطة قبل أوّل حكم.
await g.pointer(site.context, [{ type: 'pointerMove', x: 600, y: 700 }])
await sleep(800)

// ── 1) لونٌ صريح ─────────────────────────────────────────────────
for (const [selector, want] of [
  ['#solid', { r: 255, g: 0, b: 0 }],
  ['#probe', { r: 17, g: 34, b: 51 }],
]) {
  const pinned = await pinAt(await at(selector))
  close(pinned?.pixel, want, 0) && pinned.mismatch === false
    ? ok(`${selector}: البكسل ${rgb(pinned.pixel)} يساوي التصريح بايتًا ببايت، ولا اختلاف معلَن`)
    : fail(
        `${selector}: البكسل ${rgb(pinned?.pixel)} (اختلاف ${pinned?.mismatch}) والتصريح ${rgb(want)} — ${JSON.stringify(pinned)}`,
      )
}

// ── 2) المزج ─────────────────────────────────────────────────────
{
  const declared = await inPage(
    `getComputedStyle(document.getElementById('blend-top')).backgroundColor`,
  )
  const pinned = await pinAt(await at('#blend-top'))
  close(pinned?.pixel, { r: 0, g: 255, b: 0 }, 1) && pinned.mismatch === true
    ? ok(
        `mix-blend-mode: البكسل ${rgb(pinned.pixel)} (أصفر × سماوي) لا ${declared}، والاختلاف معلَن`,
      )
    : fail(
        `mix-blend-mode: البكسل ${rgb(pinned?.pixel)} (اختلاف ${pinned?.mismatch}) والمتوقَّع rgb(0, 255, 0)`,
      )
}

// ── 3) الشفافية ──────────────────────────────────────────────────
{
  const pinned = await pinAt(await at('#over'))
  close(pinned?.pixel, { r: 128, g: 128, b: 128 }, 2) && pinned.mismatch === true
    ? ok(`طبقة نصف شفّافة: البكسل المركَّب ${rgb(pinned.pixel)}، والاختلاف معلَن`)
    : fail(
        `طبقة نصف شفّافة: البكسل ${rgb(pinned?.pixel)} (اختلاف ${pinned?.mismatch}) والمتوقَّع نحو rgb(128, 128, 128)`,
      )
}

// ── 4) التدرّج ───────────────────────────────────────────────────
{
  const left = await pinAt(await at('#gradient', 0.04))
  const right = await pinAt(await at('#gradient', 0.96))
  left?.pixel &&
  right?.pixel &&
  left.pixel.r > 200 &&
  left.pixel.b < 60 &&
  right.pixel.b > 200 &&
  right.pixel.r < 60
    ? ok(
        `التدرّج: الطرف الأيسر ${rgb(left.pixel)} والأيمن ${rgb(right.pixel)} — الموضع يُقرأ لا يُفترض`,
      )
    : fail(`التدرّج: الأيسر ${rgb(left?.pixel)} والأيمن ${rgb(right?.pixel)}`)
}

const shot = await g.screenshot(site.context).catch(() => null)
if (shot) {
  const dir = join(ROOT, 'artifacts', 'firefox')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'colour.png'), shot)
  note('لقطة العدسة: artifacts/firefox/colour.png')
}

// ── 5) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ القطّارة تقرأ بكسل Firefox الحقيقي.' })
