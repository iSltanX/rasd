#!/usr/bin/env node
/**
 * حارس Firefox `popup` — نافذة الإضافة تُرسم بالعربية وتفتح صفحات رصد، في Firefox حقيقي.
 *
 * نظير `scripts/verify-popup.mjs` فوق `scripts/lib/bidi.mjs` (SS7). ما يُثبَت:
 *   1. النافذة (`action.default_popup`) تُرسم: حالتها (`data-popup-state`) واتّجاهها `rtl` ولغتها `ar` ونصّها عربي.
 *   2. زمن أوّل عرض — من طلب الفتح إلى `first-contentful-paint` في الصفحة نفسها — متوسّط خمس محاولات.
 *   3. `page/open` من النافذة يفتح المكتبة والمحرّر والإعدادات والمقارنة، وكلٌّ يرسم محتوًى فعليًّا.
 *   4. صفر خطأ من الإضافة في الطرفية.
 *
 * **ما لا يُثبَت هنا ولماذا:** النافذة تُفتح في تبويب لا من أيقونة الشريط — لا أتمتة تنقر واجهة المتصفّح، و
 * `input.performActions` لا يعمل في صفحات الإضافة (قِيس). وتصنيف الصفحة النشطة يقرأ التبويب النشط فيرى النافذة نفسها؛
 * منطقه في `tests/unit/popup-state.test.ts`، والنقر الحقيقي في `Docs/Firefox/checklist.md`.
 *
 *   pnpm build:firefox && pnpm firefox:popup
 *   RASD_GUARD_SABOTAGE=src/pages/popup/index.html pnpm firefox:popup   # السالب: يجب أن يسقط
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PAGE_PATHS } from '../../src/shared/page-paths.ts'
import { DIST, EXT_BASE, findContext, startGuard } from '../lib/bidi.mjs'

const PORT = 9232
/** ميزانية أوّل عرض — ميزانية نافذة كروم نفسها (`verify:popup`)، فالوعد للمستخدم واحد. */
const OPEN_BUDGET_MS = 100
const TRIALS = 5
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
const POPUP = manifest.action.default_popup

const g = await startGuard({
  prefix: 'popup',
  port: PORT,
  title: '── حارس Firefox: نافذة الإضافة ──',
  hardTimeoutMs: 120_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

/** يفتح النافذة في تبويب ويقرأ حالتها حين تُرسم — أو `null` إن لم تُرسم. */
async function openPopupOnce() {
  const url = `${EXT_BASE}${POPUP}`
  const startedAt = Date.now()
  const tabId = Number(
    await g.ext(
      `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then((t) => t.id)`,
    ),
  )
  const found = await findContext(g.send, (c) => c.url === url, { tries: 80, intervalMs: 25 })
  let reading = null
  if (found) {
    const inPopup = g.inContext(found.context)
    for (let i = 0; i < 300 && !reading; i++) {
      const raw = await inPopup(`JSON.stringify({
        state: document.querySelector('[data-popup-state]')?.getAttribute('data-popup-state') ?? null,
        timeOrigin: performance.timeOrigin,
        paint: performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime ?? null,
        dir: document.documentElement.dir,
        lang: document.documentElement.lang,
        arabic: /[\\u0600-\\u06FF]/u.test(document.body?.innerText ?? ''),
        buttons: document.querySelectorAll('button').length,
      })`).catch(() => null)
      const r = raw ? JSON.parse(raw) : null
      if (r?.state && r.paint !== null)
        reading = { ...r, elapsed: r.timeOrigin + r.paint - startedAt }
      else await sleep(10)
    }
  }
  await g.ext(`chrome.tabs.remove(${tabId}).then(() => true)`)
  return reading
}

// ── 1) النافذة تُرسم ──────────────────────────────────────────────
const first = await openPopupOnce()
if (!first) {
  fail('النافذة لم تُرسم — لا data-popup-state ولا أوّل رسم خلال المهلة')
} else {
  ok(`النافذة تُرسم — الحالة «${first.state}»، ${first.buttons} زرًّا`)
  first.dir === 'rtl' && first.lang === 'ar' && first.arabic
    ? ok('الاتّجاه rtl واللغة ar والنصّ عربي')
    : fail(`الاتّجاه/اللغة/النصّ: dir=${first.dir} lang=${first.lang} عربي=${first.arabic}`)
}

// ── 2) زمن أوّل عرض ──────────────────────────────────────────────
if (first) {
  const samples = []
  for (let i = 0; i < TRIALS; i++) {
    const r = await openPopupOnce()
    if (r) samples.push(r.elapsed)
  }
  if (samples.length === 0) {
    fail('تعذّر قياس زمن الفتح — لم تُرسم النافذة في أي محاولة')
  } else {
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    const line = `المتوسّط ${avg.toFixed(1)}ms عبر ${samples.length} محاولات (${samples.map((s) => `${s.toFixed(0)}ms`).join(' · ')})`
    avg < OPEN_BUDGET_MS
      ? ok(`زمن أوّل عرض أقلّ من ${OPEN_BUDGET_MS}ms — ${line}`)
      : fail(`زمن أوّل عرض تجاوز ${OPEN_BUDGET_MS}ms — ${line}`)
  }
}

// ── 3) `page/open` من النافذة ─────────────────────────────────────
const sender = await g.openExtensionPage(POPUP).catch(() => null)
if (!sender) {
  fail('تعذّر فتح النافذة مرسِلًا لـpage/open')
} else {
  const inSender = g.inContext(sender.context)
  for (const page of ['library', 'editor', 'settings', 'compare']) {
    try {
      const reply = JSON.parse(
        await inSender(
          `chrome.runtime.sendMessage({ __rasd: 1, type: 'page/open', payload: { page: ${JSON.stringify(page)} }, id: 'ff-popup-${page}' }).then((r) => JSON.stringify(r))`,
        ),
      )
      if (!reply?.ok) {
        fail(`page/open(${page}) ردّ بفشل: ${JSON.stringify(reply?.error ?? reply)}`)
        continue
      }
      const path = PAGE_PATHS[page]
      const target = await findContext(g.send, (c) => c.url.startsWith(`${EXT_BASE}${path}`), {
        tries: 60,
      })
      if (!target) {
        fail(`page/open(${page}) ردّ بنجاح ولا سياق يطابق ${path}`)
        continue
      }
      const inPage = g.inContext(target.context)
      let rendered = false
      for (let i = 0; i < 60 && !rendered; i++) {
        const state = JSON.parse(
          await inPage(
            `JSON.stringify({ ready: document.readyState, children: document.body?.children.length ?? 0, text: (document.body?.innerText ?? '').trim().length })`,
          ).catch(() => '{}'),
        )
        if (state.ready === 'complete' && state.children > 0 && state.text > 0) rendered = true
        else await sleep(100)
      }
      rendered
        ? ok(`page/open(${page}) فتح ${path} ورسم محتوًى فعليًّا`)
        : fail(`page/open(${page}) فتح ${path} ولم يرسم محتوًى خلال المهلة`)
      await g
        .ext(`chrome.tabs.remove(${reply.value.tabId}).then(() => true)`)
        .catch(() => undefined)
    } catch (e) {
      fail(`page/open(${page}) فشل: ${e.message}`)
    }
  }
}

// ── 4) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ نافذة الإضافة تُرسم في Firefox وتفتح صفحات رصد.' })
