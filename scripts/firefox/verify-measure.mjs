#!/usr/bin/env node
/**
 * حارس Firefox `measure` — محرّك القياس على هندسة Firefox الحقيقية، بمؤشّرٍ حقيقي.
 *
 * نظير `scripts/verify-measure.mjs` فوق `scripts/lib/bidi.mjs` (SS7)، على عيّنة `picker/` نفسها. الطبقة تُفعَّل
 * بالمسار الحقيقي (`tool/activate`)، والمؤشّر أحداثٌ موثوقة من BiDi (`input.performActions`)، والحكم من حالة
 * الأداة في الجلسة الحيّة ومن الهندسة في الصفحة:
 *   1. التتبّع: المرور فوق `#plain` يملأ `hover` بمستطيله الحقيقي، والإبراز مرسوم.
 *   2. النقر يثبّت `#plain` مرجعًا، والمرور فوق `#scaled` يحسب فجوةً تطابق الفرق بين حدّيهما الحقيقيين، وخطوط
 *      القياس مرسومة.
 *   3. نقرة على الخلفية تمسح المرجع.
 *   4. صفر خطأ من الإضافة في الطرفية. ولقطة الطبقة في `artifacts/firefox/measure.png` للمراجعة بالعين.
 *
 *   pnpm build:firefox && pnpm firefox:measure
 *   RASD_GUARD_SABOTAGE=content.js pnpm firefox:measure   # السالب: يجب أن يسقط
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ROOT, startGuard } from '../lib/bidi.mjs'

const PORT = 9234
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol

const g = await startGuard({
  prefix: 'measure',
  port: PORT,
  title: '── حارس Firefox: محرّك القياس ──',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  hardTimeoutMs: 150_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

const site = await g.openSite('/picker/')
const inPage = g.inContext(site.context)
const act = await g
  .message('tool/activate', { tool: 'measure', tabId: site.tabId }, 45_000)
  .catch((e) => ({ ok: false, error: e.message }))
if (!act?.ok || act.value?.started !== true)
  await g.abort(`تعذّر تفعيل القياس: ${JSON.stringify(act)}`)
ok(`القياس مفعَّل بالمسار الحقيقي — ${JSON.stringify(act.value)}`)

const state = () =>
  g.overlay(
    site.tabId,
    `(s) => ({
      mode: s.modes.mode.value,
      hover: s.measure.state.hover.value,
      reference: s.measure.state.reference.value,
      comparison: s.measure.state.comparison.value,
    })`,
  )
const drawn = () =>
  g.overlay(
    site.tabId,
    `(s) => ({
      highlights: [...s.host.layer.querySelectorAll('[data-rasd-ov="measure-highlight"]')].map((el) => el.getAttribute('data-role')),
      gaps: s.host.layer.querySelectorAll('[data-rasd-ov="measure-gap"]').length,
    })`,
  )
const rect = async (selector) =>
  JSON.parse(
    await inPage(`JSON.stringify((() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    })())`),
  )
const centre = (r) => ({ x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) })
const moveTo = async ({ x, y }) => {
  await g.pointer(site.context, [{ type: 'pointerMove', x, y }])
  await g.settle(site.context)
}
const clickAt = async ({ x, y }) => {
  await g.pointer(site.context, [
    { type: 'pointerMove', x, y },
    { type: 'pointerDown', button: 0 },
    { type: 'pointerUp', button: 0 },
  ])
  await g.settle(site.context)
}

// ── التسليح: الطبقة تستلم المؤشّر (السباق الأوّل نفسه في `verify:measure`) ──
const NEUTRAL = { x: 710, y: 45 }
let armed = 0
for (let i = 1; i <= 20 && !armed; i++) {
  await moveTo(NEUTRAL)
  if ((await state()).hover) armed = i
}
armed
  ? note(`التسليح: وصل المؤشّر إلى الطبقة بعد ${armed} حركة`)
  : await g.abort('الطبقة لم تستلم حدث المؤشّر بعد 20 حركة — انقطاعٌ قائم لا سباق')

// ── 1) التتبّع ───────────────────────────────────────────────────
const plain = await rect('#plain')
await moveTo(centre(plain))
let st = await state()
st.hover && near(st.hover.rect.width, plain.w) && near(st.hover.rect.height, plain.h)
  ? ok(`التتبّع: hover يطابق #plain الحقيقي (${st.hover.rect.width}×${st.hover.rect.height})`)
  : fail(`التتبّع: hover=${JSON.stringify(st.hover?.rect)} و#plain=${JSON.stringify(plain)}`)
let painted = await drawn()
painted.highlights.includes('hover')
  ? ok('الإبراز المرسوم يحمل data-role="hover"')
  : fail(`لا إبراز hover مرسوم: ${JSON.stringify(painted)}`)

// ── 2) المرجع والمقارنة ──────────────────────────────────────────
await clickAt(centre(plain))
st = await state()
st.reference && near(st.reference.rect.x, plain.x) && near(st.reference.rect.y, plain.y)
  ? ok('نقرة على #plain ثبّتته مرجعًا')
  : fail(`لم يُثبَّت المرجع: ${JSON.stringify(st.reference?.rect)}`)

const scaled = await rect('#scaled')
await moveTo(centre(scaled))
st = await state()
if (st.comparison) {
  // الصيغة نفسها في `modules/measure/distance.ts`، من الهندسة الحقيقية.
  const expected = {
    top: plain.y - (scaled.y + scaled.h),
    right: scaled.x - (plain.x + plain.w),
    bottom: scaled.y - (plain.y + plain.h),
    left: plain.x - (scaled.x + scaled.w),
  }
  const gap = st.comparison.gap
  ;['top', 'right', 'bottom', 'left'].every((k) => near(gap[k], expected[k], 2))
    ? ok(
        `الفجوة تطابق الهندسة الحقيقية بين #plain و#scaled (nearest=${gap.nearest}, ${Math.round(gap.nearestValue ?? -1)}px)`,
      )
    : fail(`فجوة غير مطابقة: حُسبت ${JSON.stringify(gap)} والمتوقَّع ${JSON.stringify(expected)}`)
} else {
  fail('لا مقارنة رغم وجود مرجع وهدف تتبّع')
}
painted = await drawn()
painted.gaps > 0
  ? ok(`${painted.gaps} خطّ قياس مرسوم بين المرجع والهدف`)
  : fail('لا خطوط قياس مرسومة رغم وجود مقارنة')

const shot = await g.screenshot(site.context).catch(() => null)
if (shot) {
  const dir = join(ROOT, 'artifacts', 'firefox')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'measure.png'), shot)
  note('لقطة الطبقة: artifacts/firefox/measure.png')
}

// ── 3) الخلفية تمسح المرجع ───────────────────────────────────────
const viewport = JSON.parse(await inPage('JSON.stringify([innerWidth, innerHeight])'))
const empty = await (async () => {
  for (const p of [
    { x: viewport[0] - 30, y: viewport[1] - 30 },
    { x: viewport[0] - 30, y: 30 },
    { x: 30, y: viewport[1] - 30 },
  ]) {
    const hit = await g.overlay(
      site.tabId,
      `(s) => { const el = document.elementFromPoint(${p.x}, ${p.y}); return el === null || el === document.body || el === document.documentElement || el === s.host.hostEl }`,
    )
    if (hit === true) return p
  }
  return null
})()
if (!empty) {
  fail('تعذّر إيجاد نقطة خلفية فارغة في العيّنة')
} else {
  await clickAt(empty)
  await sleep(100)
  st = await state()
  !st.reference
    ? ok('نقرة على الخلفية مسحت المرجع')
    : fail(`المرجع بقي بعد نقرة على الخلفية: ${JSON.stringify(st.reference.rect)}`)
}

// ── 4) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ محرّك القياس يطابق هندسة Firefox الحقيقية.' })
