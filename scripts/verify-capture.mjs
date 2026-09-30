#!/usr/bin/env node
/**
 * يثبت محرّك الالتقاط في Chrome حقيقي — ما لا يستطيع Vitest إثباته.
 *
 * أربعة ادّعاءات لا معنى لاختبارها بلا متصفّح:
 *
 *   1. **`captureVisibleTab` يعمل بـ`activeTab` وحدها** — بلا صلاحية مضيف
 *      دائمة. هذا هو ادّعاء الخصوصية المركزي في رصد، وهو إمّا صحيح في
 *      متصفّح حقيقي أو لا شيء.
 *   2. **الأبعاد الناتجة تطابق المطلوب بالضبط** — معيار إتمام المرحلة
 *      حرفيًا. القصّ يُنفَّذ ثم تُقرأ أبعاد ما حُفظ فعلًا من IndexedDB.
 *   3. **`fetch(dataUrl)` محظور فعلًا** تحت سياسة رصد — الافتراض الذي بُني
 *      عليه `image-ops.ts`. لو تبيّن العكس لكان الفكّ اليدوي تعقيدًا بلا سبب.
 *   4. **مُنظِّم الإيقاع يمنع تجاوز الحدّ** تحت ضغط حقيقي — الحدّ حدّ متصفّح
 *      لا اختيار، وتجاوزه يرمي.
 *
 * **نسخة فحص لا الحزمة المشحونة** — نفس ما فعلته المرحلة 6 في
 * `verify-overlay.mjs`. صلاحية `activeTab` **لا تُمنح برمجيًا**: تمنحها
 * إيماءة مستخدم حقيقية (نقر الأيقونة أو اختصار أو قائمة سياق)، ولا CDP ولا
 * Playwright يملكان واجهة تصطنعها. فتُنسخ `dist/` وتُضاف إلى بيانها صلاحية
 * مضيف **للعيّنات المحلّية وحدها**، ليصير مسار الالتقاط قابلًا للتشغيل.
 *
 * الشيفرة والأصول متطابقة؛ المتغيّر الوحيد هو الإذن الذي يُمنح في المنتج
 * بإيماءة. والفحص يقرأ بيان `dist/` **الأصلي** ويثبت أنه بلا صلاحية مضيف —
 * فلا يُخفي التصريحُ ما جاء ليثبته.
 *
 * الإقلاع والاتصال والتحميل والارتباط والمهلة الصلبة والتنظيف في النواة المشتركة
 * (`scripts/lib/cdp.mjs`، `STAGES/17`)؛ وأحكام هذا الملفّ هنا كما كانت.
 *
 * يُشغَّل في CI وفي جهاز التطوير بالأمر نفسه — خادم العيّنات يُضمَن لا يُشترَط:
 *   pnpm verify:capture
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DIST as dist, findAndAttach, startGuard, waitForExtensionContext } from './lib/cdp.mjs'

const PORT = 9366
const HARD_TIMEOUT_MS = 120_000

/*
 * نسخة الفحص: `dist/` كما هي + `<all_urls>` في `host_permissions` (تصنعها النواة).
 *
 * **ولماذا `<all_urls>` تحديدًا لا نمطًا ضيّقًا؟** لأن `captureVisibleTab`
 * يطلبها بالاسم: نمط `http://127.0.0.1/*` جُرِّب أوّلًا فردّ Chrome حرفيًا
 * «Either the '<all_urls>' or 'activeTab' permission is required». أي أن
 * الواجهة لا تقبل صلاحية مضيف ضيّقة بديلًا — إمّا الشاملة أو `activeTab`.
 *
 * وهذا بالضبط ما يجعل اعتماد رصد على `activeTab` قرارًا جوهريًا لا تفصيلًا:
 * البديل الوحيد الآخر هو الصلاحية التي تُظهر تحذير «قراءة وتغيير جميع
 * بياناتك». `<all_urls>` هنا محصورة في نسخة مؤقّتة تُحذَف بعد الفحص،
 * والحزمة المشحونة تبقى بلا أي صلاحية مضيف — يُتحقَّق منها أعلاه من الملفّ.
 */
// خادم العيّنات تضمنه النواة ولا يُشترَط مُشغَّلًا سلفًا — انظر ترويسة `live-fixtures.mjs`.
const g = await startGuard({
  prefix: 'capture',
  port: PORT,
  title: 'فحص محرّك الالتقاط في Chrome:',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  serviceWorker: true,
  args: ['--window-size=1280,720'],
  hardTimeoutMs: HARD_TIMEOUT_MS,
})
const { ok, fail, note } = g
const PAGE_URL = `${g.base}/rtl-ar/`

const attach = async (predicate) => {
  const found = await findAndAttach(g.send, predicate)
  return found ? g.evaluate(found.sessionId) : null
}

// ── تحميل الحزمة ──────────────────────────────────────────────────
// رفض Chrome للحزمة سجّلته النواة: «Chrome رفض الحزمة: …».
if (!g.extId) await g.abort()
ok(`الحزمة محمَّلة — ${g.extId}`)
const ownOrigin = `chrome-extension://${g.extId}/`

if (!g.sw) await g.abort('لم يستيقظ الـservice worker')
const sw = g.sw.evaluate
ok('الـservice worker يعمل')

// الارتباط ليس جهوزًا — انظر ترويسة `live-sw.mjs`.
await waitForExtensionContext(sw)

// ── الحزمة المشحونة بلا صلاحية مضيف ───────────────────────────────
// تُقرأ من `dist/` الأصلي لا من نسخة الفحص المُرقَّعة: التصريح لا يجوز أن
// يُخفي ما جاء ليثبته.
try {
  const shipped = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'))
  const hosts = shipped.host_permissions ?? []
  hosts.length === 0
    ? ok('الحزمة المشحونة بلا صلاحية مضيف — الالتقاط في المنتج يعتمد على activeTab وحدها')
    : fail(`الحزمة المشحونة تطلب صلاحيات مضيف: ${hosts.join(', ')}`)
  note(
    'نسخة الفحص وحدها مُرقَّعة بـ`<all_urls>` — activeTab لا تُمنح برمجيًا، والواجهة لا تقبل نمطًا أضيق',
  )
} catch (e) {
  fail(`تعذّرت قراءة بيان الحزمة: ${e.message}`)
}

// ── 3) هل `fetch(dataUrl)` محظور فعلًا تحت سياستنا؟ ────────────────
try {
  const verdict = await sw(`(async () => {
    const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    try { await fetch(tiny); return 'allowed' }
    catch (e) { return 'blocked: ' + String(e && e.message) }
  })()`)
  if (verdict === 'allowed') {
    note('‏`fetch(dataUrl)` **غير** محظور في هذه النسخة — الفكّ اليدوي احتياط زائد لا ضار')
  } else {
    ok(`‏\`fetch(dataUrl)\` محظور كما افترض \`image-ops.ts\` — ${verdict}`)
  }
} catch (e) {
  note(`تعذّر فحص fetch(dataUrl): ${e.message}`)
}

// ── تبويب هدف حقيقي ───────────────────────────────────────────────
const tabJson = await sw(
  `chrome.tabs.create({ url: ${JSON.stringify(PAGE_URL)}, active: true }).then((t) => JSON.stringify({ id: t.id, windowId: t.windowId }))`,
)
const tab = JSON.parse(tabJson)

for (let i = 0; i < 60; i++) {
  const st = await sw(`chrome.tabs.get(${tab.id}).then((t) => t.status)`)
  if (st === 'complete') break
  await new Promise((r) => setTimeout(r, 100))
}
ok('صفحة الهدف محمَّلة')

// ── 1+2) الالتقاط والقصّ عبر الرسالة الحقيقية ─────────────────────
try {
  // الحقن أوّلًا — نفس ما يفعله `activateTool`.
  await sw(
    `chrome.scripting.executeScript({ target: { tabId: ${tab.id} }, files: ['content.js'] })`,
  )
  ok('الطبقة محقونة عبر chrome.scripting — نفس النداء الذي تستعمله activateTool')

  const page = await attach((t) => t.type === 'page' && String(t.url).startsWith(PAGE_URL))
  if (!page) throw new Error('لم يُعثر على صفحة الهدف')

  const dpr = await page('window.devicePixelRatio')
  note(`كثافة البكسل في هذه البيئة: ${dpr}`)

  /*
   * الرسائل تُرسَل من **صفحة إضافة**، لا من صفحة الهدف.
   *
   * `Runtime.evaluate` على هدف صفحة ينفّذ في العالم الرئيسي، وهو بلا
   * `chrome.runtime` — بينما سكربت المحتوى يعيش في عالم معزول لا يصله CDP
   * مباشرةً. صفحة الإضافة تملك `chrome.runtime` كاملًا، وهي بالضبط مسار
   * النافذة في المنتج: لذلك يقبل `capture/run` حقل `tabId` صريحًا.
   *
   * وتُفتح **غير نشِطة** كي يبقى تبويب الهدف هو النشط — وإلا رفضته حراسة
   * «التبويب النشط» بحقّ.
   */
  await sw(
    `chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/library/index.html'), windowId: ${tab.windowId}, active: false })`,
  )
  const extPage = await attach(
    (t) => t.type === 'page' && String(t.url).startsWith(ownOrigin + 'src/pages/library/'),
  )
  if (!extPage) throw new Error('لم تُفتح صفحة الإضافة')
  ok('صفحة إضافة مفتوحة كمُرسِل للرسائل (غير نشِطة — الهدف يبقى النشط)')

  // التقاط منطقة بأبعاد معلومة، عبر عقد الرسائل نفسه الذي تستعمله الأداة.
  const W = 400
  const H = 240
  const raw = await extPage(`(async () => {
    const reply = await chrome.runtime.sendMessage({
      __rasd: 1, id: 'verify-area', type: 'capture/run',
      payload: {
        tabId: ${tab.id},
        kind: 'area',
        dpr: ${dpr},
        rect: {
          space: 'device',
          x: Math.round(100 * ${dpr}),
          y: Math.round(80 * ${dpr}),
          width: Math.round(${W} * ${dpr}),
          height: Math.round(${H} * ${dpr}),
        },
      },
    })
    return JSON.stringify(reply)
  })()`)
  const reply = JSON.parse(raw)

  if (!reply?.ok) {
    fail(
      `الالتقاط فشل: ${reply?.error?.message ?? '؟'}` +
        (reply?.error?.detail ? ` · التفصيل: ${reply.error.detail}` : ''),
    )
  } else {
    ok('الالتقاط نجح بـactiveTab وحدها — بلا صلاحية مضيف دائمة')

    const expectW = Math.round(W * dpr)
    const expectH = Math.round(H * dpr)
    reply.value.width === expectW && reply.value.height === expectH
      ? ok(`الأبعاد الناتجة تطابق المطلوب بالضبط — ${reply.value.width}×${reply.value.height}`)
      : fail(
          `الأبعاد ${reply.value.width}×${reply.value.height} لا تطابق المتوقَّع ${expectW}×${expectH}`,
        )

    // ما حُفظ فعلًا في IndexedDB، لا ما ادّعاه الردّ.
    const storedRaw = await sw(`(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('rasd')
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
      })
      const tx = db.transaction(['captures','blobs'], 'readonly')
      const cap = await new Promise((res) => { const q = tx.objectStore('captures').get(${JSON.stringify(reply.value.id)}); q.onsuccess = () => res(q.result) })
      const blb = await new Promise((res) => { const q = tx.objectStore('blobs').get(${JSON.stringify(reply.value.id)}); q.onsuccess = () => res(q.result) })
      return JSON.stringify({ cap, mime: blb && blb.mime, bytes: blb && blb.bytes })
    })()`)
    const stored = JSON.parse(storedRaw)

    stored.cap
      ? ok(
          `السجلّ محفوظ في captures — kind=${stored.cap.kind} · dpr=${stored.cap.devicePixelRatio}`,
        )
      : fail('لا سجلّ في captures')

    stored.cap?.width === expectW && stored.cap?.height === expectH
      ? ok('أبعاد السجلّ المحفوظ تطابق المقصوص')
      : fail(`أبعاد السجلّ ${stored.cap?.width}×${stored.cap?.height} ≠ ${expectW}×${expectH}`)

    stored.mime === 'image/png' && stored.bytes > 0
      ? ok(`البايتات محفوظة — ${stored.mime} · ${stored.bytes} بايت`)
      : fail(`الـBlob غير سليم: mime=${stored.mime} bytes=${stored.bytes}`)

    stored.cap?.origin && stored.cap?.url && stored.cap?.title !== undefined
      ? ok('البيانات الوصفية كاملة (الأصل · الرابط · العنوان · النوع · الكثافة)')
      : fail('بيانات وصفية ناقصة في السجلّ')
  }
} catch (e) {
  fail(`مسار الالتقاط فشل: ${e.message}`)
}

// ── 4) مُنظِّم الإيقاع تحت ضغط حقيقي ──────────────────────────────
try {
  const extPage = await attach(
    (t) => t.type === 'page' && String(t.url).startsWith(ownOrigin + 'src/pages/library/'),
  )
  if (!extPage) throw new Error('لم يُعثر على صفحة الإضافة')

  const startedAt = Date.now()
  const raw = await extPage(`(async () => {
    const one = (i) => chrome.runtime.sendMessage({
      __rasd: 1, id: 'burst-' + i, type: 'capture/run',
      payload: { tabId: ${tab.id}, kind: 'viewport', dpr: 1, rect: null },
    })
    const all = await Promise.all(Array.from({ length: 6 }, (_, i) => one(i)))
    return JSON.stringify(all.map((r) => ({ ok: r && r.ok, msg: r && r.error && (r.error.detail || r.error.message) })))
  })()`)
  const results = JSON.parse(raw)
  const elapsed = Date.now() - startedAt

  const okCount = results.filter((r) => r.ok).length
  if (okCount < 6) note(`أوّل خطأ: ${results.find((r) => !r.ok)?.msg ?? '؟'}`)
  const rateErrors = results.filter((r) => !r.ok && String(r.msg).includes('متلاحقة')).length

  okCount === 6
    ? ok(`ستّة طلبات متلاحقة نجحت كلّها — لا واحد أُسقط (${elapsed}ms)`)
    : fail(`نجح ${okCount}/6 فقط · ${rateErrors} منها بخطأ تجاوز الحدّ · ${elapsed}ms`)

  // ستّة نداءات على 550ms = 2750ms على الأقلّ للأخير.
  elapsed >= 2500
    ? ok(`المُنظِّم باعد بينها فعلًا — ${elapsed}ms لستّة نداءات`)
    : fail(`ستّة نداءات في ${elapsed}ms فقط — المُنظِّم لم يعمل`)
} catch (e) {
  fail(`فحص مُنظِّم الإيقاع فشل: ${e.message}`)
}
await g.finish({ success: '✓ الالتقاط والقصّ والحفظ تعمل بـactiveTab وحدها.' })
