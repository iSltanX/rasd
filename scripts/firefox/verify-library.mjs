#!/usr/bin/env node
/**
 * حارس Firefox `library` — صفحة المكتبة تعرض لقطات Firefox الحقيقية وآلافًا معها بتمريرٍ افتراضي، وتبحث فيها.
 *
 * نظير `scripts/verify-library.mjs` فوق `scripts/lib/bidi.mjs` (SS7). المكتبة صفحة إضافة صرفة: IndexedDB في صفحات
 * Firefox والتخطيط والتمرير الافتراضي (`ResizeObserver` و`clientWidth`) هي ما قد يختلف:
 *   1. لقطة حقيقية من Firefox (`capture/run`) تظهر بطاقتها وصورتها المصغّرة تُرسم فعلًا.
 *   2. مع 5000 لقطة مزروعة بمخطّط المكتبة نفسه (كنظيرها في كروم)، الشبكة تُرسم بتمريرٍ افتراضي: بطاقاتٌ قليلة لا الكلّ،
 *      والتمرير يبدّل النافذة المرسومة.
 *   3. البحث النصّي يصفّي الآلاف إلى النتيجة الصحيحة الوحيدة.
 *   4. صفر خطأ من الإضافة في الطرفية.
 *
 *   pnpm build:firefox && pnpm firefox:library
 *   RASD_GUARD_SABOTAGE=src/pages/library/index.html pnpm firefox:library   # السالب: يجب أن يسقط
 */
import { startGuard } from '../lib/bidi.mjs'

const PORT = 9241
const BULK = 5000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'library',
  port: PORT,
  title: '── حارس Firefox: المكتبة ──',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  hardTimeoutMs: 180_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

// ── لقطة حقيقية ──────────────────────────────────────────────────
const site = await g.openSite('/colour/')
const dpr = Number(await g.inContext(site.context)('devicePixelRatio'))
const captured = await g
  .inContent(
    site.tabId,
    `() => chrome.runtime.sendMessage({
      __rasd: 1, id: 'ff-library', type: 'capture/run',
      payload: { kind: 'area', dpr: ${dpr}, rect: { space: 'device', x: 0, y: 0, width: ${Math.round(320 * dpr)}, height: ${Math.round(200 * dpr)} } },
    }).then((r) => JSON.stringify(r))`,
    45_000,
  )
  .then((raw) => JSON.parse(raw))
  .catch((e) => ({ ok: false, error: e.message }))
if (!captured?.ok) await g.abort(`تعذّر الالتقاط: ${JSON.stringify(captured)}`)

// ── الزرع: الآلاف بمخطّط المكتبة نفسه ─────────────────────────────
const library = await g
  .openExtensionPage('src/pages/library/index.html')
  .catch((e) => ({ error: e.message }))
if (library.error) await g.abort(`المكتبة لم تُفتح: ${library.error}`)
const inLib = g.inContext(library.context)
const seeded = JSON.parse(
  await inLib(
    `(async () => {
      const need = ['captures', 'tags']
      const db = await (async () => {
        for (let i = 0; i < 80; i++) {
          const list = await indexedDB.databases()
          if (list.some((d) => d.name === 'rasd')) {
            const opened = await new Promise((res, rej) => { const r = indexedDB.open('rasd'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
            if (need.every((n) => opened.objectStoreNames.contains(n))) return opened
            opened.close()
          }
          await new Promise((r) => setTimeout(r, 150))
        }
        throw new Error('قاعدة rasd لم تجهز بمخازنها')
      })()
      // يومٌ قبل اللقطة الحقيقية — فتبقى هي الأحدث في رأس الشبكة لا مدفونةً بين الآلاف.
      const now = Date.now() - 86400000
      const tx = db.transaction(need, 'readwrite')
      tx.objectStore('captures').put({
        id: 'ff-needle', createdAt: now - 10, origin: 'https://example.com', url: 'https://example.com/needle',
        title: 'لقطة الإبرة الفريدة', kind: 'area', status: 'ready', projectId: null, tags: [],
        width: 800, height: 600, devicePixelRatio: 1, favorite: false, trashedAt: null, archived: false,
      })
      for (let i = 0; i < ${BULK}; i++) {
        tx.objectStore('captures').put({
          id: 'bulk' + i, createdAt: now - 100 - i, origin: 'https://example.com', url: 'https://example.com/' + i,
          title: 'لقطة ' + i, kind: 'area', status: 'ready', projectId: null, tags: [],
          width: 800, height: 600, devicePixelRatio: 1, favorite: false, trashedAt: null, archived: false,
        })
      }
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
      db.close()
      return JSON.stringify({ ok: true })
    })().catch((e) => JSON.stringify({ ok: false, error: String(e) }))`,
    60_000,
  ),
)
if (!seeded.ok) await g.abort(`تعذّر الزرع: ${seeded.error}`)
await inLib('location.reload(), true').catch(() => undefined)
await sleep(500)

const waitFor = async (expression, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    const v = await inLib(expression).catch(() => null)
    if (v) return v
    await sleep(150)
  }
  return null
}
const scroller = `document.querySelector('[data-testid="library-grid-scroller"]')`
if (!(await waitFor(`!!${scroller}`))) await g.abort('الشبكة لم تظهر بعد التحميل')
ok(`المكتبة حمّلت ${BULK + 2} لقطة من IndexedDB في صفحة Firefox ورسمت شبكتها`)

// ── 1) اللقطة الحقيقية ───────────────────────────────────────────
const thumb = await waitFor(
  `(() => { const card = document.querySelector('[data-capture-id="${captured.value.id}"]'); const img = card?.querySelector('img'); return img && img.complete && img.naturalWidth > 0 ? JSON.stringify([img.naturalWidth, img.naturalHeight]) : null })()`,
)
thumb
  ? ok(`لقطة Firefox الحقيقية في المكتبة، وصورتها المصغّرة تُرسم (${JSON.parse(thumb).join('×')})`)
  : fail(`بطاقة اللقطة الحقيقية ${captured.value.id} أو صورتها المصغّرة لم تُرسم`)

// ── 2) التمرير الافتراضي ─────────────────────────────────────────
const cards = Number(await inLib(`document.querySelectorAll('[data-capture-id]').length`))
cards > 0 && cards < 200
  ? ok(`التمرير الافتراضي حقيقي: ${cards} بطاقة مرسومة من ${BULK + 2} — لا الكلّ`)
  : fail(`البطاقات المرسومة ${cards} — خارج المدى (1–199)`)
await inLib(`${scroller}.scrollTop = 20000, true`)
await sleep(400)
const first = await inLib(
  `document.querySelector('[data-capture-id]')?.getAttribute('data-capture-id') ?? null`,
)
first && first !== captured.value.id && first !== 'ff-needle'
  ? ok(`التمرير يبدّل النافذة المرسومة — أوّل بطاقة صارت ${first}`)
  : fail(`التمرير لم يبدّل النافذة المرسومة (أوّل بطاقة ${first})`)
await inLib(`${scroller}.scrollTop = 0, true`)
await sleep(300)

// ── 3) البحث ─────────────────────────────────────────────────────
const search = (query) =>
  inLib(`(() => {
    const el = document.querySelector('input[aria-label="ابحث في المكتبة"]')
    if (!el) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(query)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
if (!(await search('الإبرة الفريدة'))) {
  fail('حقل البحث غائب')
} else {
  const found = await waitFor(
    `(() => { const ids = [...document.querySelectorAll('[data-capture-id]')].map((e) => e.getAttribute('data-capture-id')); return ids.length === 1 && ids[0] === 'ff-needle' ? 'ok' : null })()`,
    40,
  )
  found
    ? ok(`البحث النصّي يصفّي ${BULK + 2} لقطة إلى النتيجة الصحيحة الوحيدة`)
    : fail(
        `البحث أعطى: ${await inLib(`[...document.querySelectorAll('[data-capture-id]')].map((e) => e.getAttribute('data-capture-id')).slice(0, 5).join(',')`)}`,
      )
  await search('')
}

// ── 4) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ المكتبة تعمل في Firefox بلقطاته الحقيقية وآلافٍ معها.' })
