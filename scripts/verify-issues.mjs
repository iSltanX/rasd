#!/usr/bin/env node
/**
 * يثبت رحلة المشكلة المرتبطة بالعنصر فوق Chrome حقيقي (`STAGES/32`، ADR 0030–0032).
 *
 * **ما لا تراه اختبارات الوحدة:** اللقطة من `captureVisibleTab` حقيقية، والنقرات من `Input` في CDP تمنح
 * تفعيل المستخدم الذي تشترطه إعادة الفحص، ومُرسِل الرسالة من سكربت محتوى يحمل أصل الصفحة فعلًا — وعلى هذا
 * الفرق وحده ترفض الخلفية «أعد الفحص» من غير النافذة. والقاعدة IndexedDB الحقيقية في الـservice worker.
 *
 * الرحلة: تُثبَّت `.cta-btn` في الفحص، ويُضغط «سجّل مشكلة»، ويُكتب العنوان والمتوقَّعة بمفاتيح حقيقية
 * (ومستمع الصفحة في طور الفقاعة لا يسمع شيئًا)، ويُحفظ ⟵ مشكلة «مفتوحة» بلقطتها وملاحظتها. ثمّ تُعدَّل
 * الحشوة ويُضغط «أعد الفحص» ⟵ «محلولة». ثمّ يُحذف العنصر ⟵ «تحتاج تحققًا». ثمّ مئة مشكلة تُفحص في جولة
 * واحدة ≤ 500ms.
 *
 * **حالته السالبة:** `RASD_BREAK_STATUS=1 pnpm verify:issues` يرقّع قرار الحالة في الحزمة المبنيّة
 * (المطابقة تعطي «مفتوحة») فيسقط الحارس عند خطوة الحلّ.
 *
 *   pnpm build && pnpm verify:issues
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { attachTarget, startGuard } from './lib/cdp.mjs'

const PORT = 9343
const BREAK = process.env.RASD_BREAK_STATUS === '1'
/** معيار القبول: إعادة فحص مئة مشكلة على صفحة واحدة. */
const RECHECK_BUDGET_MS = 500

// `captureVisibleTab` يرفض صلاحية المضيف الضيّقة — انظر تعليل `verify-colour.mjs`. النسخة المشحونة كما هي.
const HOST_PERMISSIONS = ['<all_urls>']

/**
 * ترقيع الحالة السالبة: جدول `statusFor` يعطي «مفتوحة» للمطابقة — في نسخة الفحص قبل تحميلها.
 *
 * **ويرمي بصوتٍ عالٍ إن لم يجد نمطه** — ترقيعٌ صامت يُنتج حارسًا أخضر لأنه لم يكسر شيئًا. نفس حكم
 * `RASD_BREAK_DEGRADE` في `verify-export.mjs`.
 */
function breakStatus(stagePath) {
  const Q = String.raw`["'\u0060]`
  const pattern = new RegExp(String.raw`match:${Q}resolved${Q}`, 'g')
  let patched = 0
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.name.endsWith('.js')) {
        const src = readFileSync(p, 'utf8')
        if (!pattern.test(src)) continue
        pattern.lastIndex = 0
        writeFileSync(p, src.replace(pattern, 'match:\u0060open\u0060'))
        patched++
      }
    }
  }
  walk(stagePath)
  if (patched === 0) {
    throw new Error(
      'RASD_BREAK_STATUS: لم يُعثر على جدول الحالة في الحزمة المبنيّة — عدِّل النمط.\n' +
        'الترقيع الصامت يُنتج فحصًا أخضر لأنه لم يكسر شيئًا.',
    )
  }
}

const g = await startGuard({
  prefix: 'issues',
  port: PORT,
  title: `── رحلة المشكلة في Chrome حقيقي${BREAK ? ' (قرار الحالة معطَّل عمدًا)' : ''} ──`,
  requires: 'content.js',
  fixtures: true,
  stage: { hostPermissions: HOST_PERMISSIONS, patch: BREAK ? breakStatus : undefined },
  args: ['--window-size=1280,800'],
  serviceWorker: true,
})
const { send, ok, fail } = g
const BASE = g.base
const { extId, sw } = g

const inSW = (expression) => sw.evaluate(expression)

const inWorld = (tabId, world, fnSource, args = []) =>
  inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: '${world}',
    func: ${fnSource},
    args: ${JSON.stringify(args)},
  }).then(r => r[0].result)`)

const inPage = (tabId, fnSource, args) => inWorld(tabId, 'MAIN', fnSource, args)
/** العالم المعزول — حيث الطبقة وجلستها `globalThis.__rasdIssues`. */
const inOverlay = (tabId, fnSource, args) => inWorld(tabId, 'ISOLATED', fnSource, args)

/** سجلّات المشكلات كما في القاعدة — من الـservice worker الذي يملكها. */
const readIssues = () =>
  inSW(`new Promise((resolve, reject) => {
    const open = indexedDB.open('rasd')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction(['issues', 'captures', 'annotations'])
      const out = {}
      const all = (name) => new Promise(r => { const q = tx.objectStore(name).getAll(); q.onsuccess = () => r(q.result) })
      Promise.all([all('issues'), all('captures'), all('annotations')]).then(([issues, captures, annotations]) => {
        db.close()
        resolve({ issues, captureIds: captures.map(c => c.id), annotations: annotations.map(a => ({ captureId: a.captureId, nodes: (a.scene?.nodes ?? []).map(n => ({ id: n.id, kind: n.kind })) })) })
      })
    }
  })`)

async function attachToPage(urlPart) {
  const { targetInfos } = await send('Target.getTargets')
  const t = targetInfos.find((x) => x.type === 'page' && String(x.url).includes(urlPart))
  if (!t) return null
  return attachTarget(send, t.targetId)
}

async function settle(pageSession) {
  await send(
    'Runtime.evaluate',
    {
      expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
      awaitPromise: true,
    },
    pageSession,
  )
}

async function clickAt(pageSession, x, y) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x, y, pointerType: 'mouse' },
    pageSession,
  )
  // الفحص يستهدف في إطار المزامنة التالي للحركة — النقر قبله يثبّت ما كان تحت المؤشِّر قبلها.
  await settle(pageSession)
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' },
    pageSession,
  )
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' },
    pageSession,
  )
  await settle(pageSession)
}

/** مفاتيح حقيقية حرفًا حرفًا — `keyDown` بنصّه يولّد `keydown` و`input` كما يفعل المستخدم. */
async function typeText(pageSession, text) {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }, pageSession)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }, pageSession)
  }
  await settle(pageSession)
}

/** مستطيل عنصرٍ في الطبقة (جذرها مغلق — من الجلسة لا من DOM الصفحة). */
const overlayRect = (tabId, selector) =>
  inOverlay(
    tabId,
    `(selector) => {
      const el = globalThis.__rasdIssues?.host.layer.querySelector(selector)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: !!el.disabled }
    }`,
    [selector],
  )

async function clickOverlay(pageSession, tabId, selector) {
  const r = await overlayRect(tabId, selector)
  if (!r) return false
  await clickAt(pageSession, r.x, r.y)
  return true
}

/** ينتظر شرطًا في العالم المعزول حتى مهلته — يُرجع آخر قيمة. */
async function waitOverlay(tabId, fnSource, done, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs
  let value
  do {
    value = await inOverlay(tabId, fnSource)
    if (done(value)) return value
    await new Promise((r) => setTimeout(r, 100))
  } while (Date.now() < until)
  return value
}

const panelStatuses = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const s = globalThis.__rasdIssues
      return {
        phase: s.issues.state.phase.value,
        checkedAt: s.issues.state.checkedAt.value,
        items: [...s.host.layer.querySelectorAll('[data-rasd-ov="issues-list"] li')].map(li => li.dataset.status),
      }
    }`,
  )

if (!extId || !sw) {
  fail('الإضافة أو الـservice worker لم يجهزا.')
} else {
  const url = `${BASE}/issues/`
  const tabId = await inSW(
    `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then(t => t.id)`,
  )
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${tabId}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  await inSW(
    `chrome.scripting.executeScript({ target: { tabId: ${tabId} }, files: ['content.js'] })`,
  )
  const started = await inOverlay(
    tabId,
    `() => globalThis.__rasdContent.startOverlay().then(r => {
      if (r.ok) globalThis.__rasdIssues = r.value
      return r.ok
    })`,
  )
  const pageSession = await attachToPage('/issues/')
  if (!started || !pageSession) {
    fail('الطبقة لم تُقلع أو تعذّر الارتباط بالصفحة.')
  } else {
    // ── 1) التسجيل من لوحة الفحص ───────────────────────────────
    await inOverlay(tabId, `() => { globalThis.__rasdIssues.modes.set('inspect'); return 1 }`)
    await settle(pageSession)
    const cta = await inPage(
      tabId,
      `() => { const r = document.querySelector('.cta-btn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }`,
    )
    await clickAt(pageSession, cta.x, cta.y)
    const pinned = await waitOverlay(
      tabId,
      `() => !!globalThis.__rasdIssues.inspect.pinnedElement()`,
      Boolean,
    )
    if (!pinned) fail('الفحص لم يثبّت .cta-btn بنقرة حقيقية.')

    if (!(await clickOverlay(pageSession, tabId, '[data-rasd-ov="log-issue"]'))) {
      fail('لا زرّ «سجّل مشكلة» في لوحة الفحص.')
    }
    const formOpen = await waitOverlay(
      tabId,
      `() => !!globalThis.__rasdIssues.host.layer.querySelector('[data-rasd-ov="issue-form"]')`,
      Boolean,
    )
    if (formOpen) ok('«سجّل مشكلة» في لوحة الفحص يفتح النموذج بجوارها')
    else fail('النموذج لم يُفتح.')

    await clickOverlay(pageSession, tabId, '[data-issue-field="title"]')
    await typeText(pageSession, 'حشوة الزرّ أكبر mM')
    // `⌥⇧M` اختصار القياس — والمستخدم يكتب، فلا يبدّل الأداة ولا يبلغ الصفحة.
    for (const type of ['rawKeyDown', 'keyUp']) {
      await send(
        'Input.dispatchKeyEvent',
        { type, modifiers: 9, code: 'KeyM', key: 'M', windowsVirtualKeyCode: 77 },
        pageSession,
      )
    }
    await settle(pageSession)
    const isolation = await inPage(tabId, `() => window.__pageKeys.length`)
    const mode = await inOverlay(tabId, `() => globalThis.__rasdIssues.modes.mode.value`)
    if (isolation === 0 && mode === 'inspect') {
      ok('الكتابة في النموذج لا تبلغ مستمع الصفحة ولا تبدّل الأداة (ADR 0032)')
    } else {
      fail(`تسرّب المفاتيح: الصفحة سمعت ${isolation} مفتاحًا، والوضع ${mode}`)
    }

    await clickOverlay(pageSession, tabId, '[data-issue-field="expected"]')
    await typeText(pageSession, '12px 24px')
    await clickOverlay(pageSession, tabId, '[data-rasd-ov="issue-submit"]')
    const closed = await waitOverlay(
      tabId,
      `() => globalThis.__rasdIssues.issues.state.form.value === null`,
      Boolean,
      15000,
    )
    let db = await readIssues()
    const created = db.issues[0]
    if (!closed || db.issues.length !== 1 || !created) {
      const error = await inOverlay(
        tabId,
        `() => globalThis.__rasdIssues.issues.state.formError.value`,
      )
      fail(`الحفظ لم يكتمل: ${db.issues.length} سجلّ، والخطأ ${JSON.stringify(error)}`)
    } else {
      const noteLinked = db.annotations.some(
        (a) =>
          a.captureId === created.evidence.captureId &&
          a.nodes.some((n) => n.kind === 'note' && n.id === created.note?.noteId),
      )
      if (
        created.status === 'open' &&
        created.check.actual === '14px 24px' &&
        created.check.expected === '12px 24px' &&
        created.title === 'حشوة الزرّ أكبر mM' &&
        created.page.url === url &&
        db.captureIds.includes(created.evidence.captureId) &&
        noteLinked
      ) {
        ok('المشكلة «مفتوحة» بقيمتها ورابطها من التبويب، ولقطة دليلها وملاحظتها في معاملة واحدة')
      } else {
        fail(`السجلّ المكتوب لا يطابق: ${JSON.stringify({ ...created, history: undefined })}`)
      }
    }

    // ── 2) الطلب من سكربت محتوى يُرفض: الإيماءة من النافذة وحدها ──────
    const refused = await inOverlay(
      tabId,
      `(tabId) => chrome.runtime.sendMessage({ __rasd: 1, id: 'x', type: 'issue/recheck-tab', payload: { tabId } })`,
      [tabId],
    )
    if (refused && refused.ok === false && refused.error?.code === 'permission-denied') {
      ok('«أعد الفحص» من سكربت محتوى تُرفض في الخلفية — مُرسِلٌ بأصل الصفحة لا النافذة')
    } else {
      fail(`طلب إعادة فحص من سكربت محتوى لم يُرفض: ${JSON.stringify(refused)}`)
    }

    // ── 3) الإصلاح ⟵ محلولة ─────────────────────────────────
    await inOverlay(tabId, `() => { globalThis.__rasdIssues.modes.set('issues'); return 1 }`)
    let panel = await waitOverlay(
      tabId,
      `() => [...globalThis.__rasdIssues.host.layer.querySelectorAll('[data-rasd-ov="issues-list"] li')].map(li => li.dataset.status)`,
      (v) => Array.isArray(v) && v.length === 1,
    )
    if (panel?.[0] === 'open') ok('لوحة «مشكلات هذه الصفحة» تعرضها «مفتوحة»')
    else fail(`اللوحة: ${JSON.stringify(panel)}`)

    await inPage(
      tabId,
      `() => { document.querySelector('.cta-btn').style.padding = '12px 24px'; return 1 }`,
    )
    const recheck = async () => {
      const before = (await panelStatuses(tabId)).checkedAt
      await clickOverlay(pageSession, tabId, '[data-rasd-ov="issues-recheck"]')
      return waitOverlay(
        tabId,
        `() => ({ phase: globalThis.__rasdIssues.issues.state.phase.value, at: globalThis.__rasdIssues.issues.state.checkedAt.value })`,
        (v) => v.phase === 'ready' && v.at !== before,
      )
    }
    await recheck()
    panel = (await panelStatuses(tabId)).items
    db = await readIssues()
    if (panel[0] === 'resolved' && db.issues[0]?.status === 'resolved') {
      ok('تعديل الحشوة ثمّ «أعد الفحص» بنقرة حقيقية ⟵ «محلولة» في اللوحة وفي القاعدة')
    } else {
      fail(`بعد الإصلاح: اللوحة ${JSON.stringify(panel)} والقاعدة ${db.issues[0]?.status}`)
    }

    // ── 4) الحذف ⟵ تحتاج تحققًا ─────────────────────────────
    await inPage(tabId, `() => { document.querySelector('.cta-btn').remove(); return 1 }`)
    await recheck()
    panel = (await panelStatuses(tabId)).items
    db = await readIssues()
    const gone = db.issues[0]
    if (
      panel[0] === 'needs-verification' &&
      gone?.status === 'needs-verification' &&
      gone.lastCheck?.reason === 'missing'
    ) {
      ok('حذف العنصر ثمّ «أعد الفحص» ⟵ «تحتاج تحققًا» بسبب الغياب')
    } else {
      fail(`بعد الحذف: اللوحة ${JSON.stringify(panel)} والقاعدة ${JSON.stringify(gone?.lastCheck)}`)
    }

    // ── 5) مئة مشكلة في جولة واحدة ≤ 500ms ─────────────────────
    // المشكلة الأولى تُحذف قبل البذر: الجولة تقف عند مئة، والقياس على مئةٍ معروفة الحكم.
    const template = db.issues[0]
    const identities = await inPage(
      tabId,
      `() => {
        const fnv = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) } return (h >>> 0).toString(16).padStart(8, '0') }
        return [...document.querySelectorAll('.items li')].map((li) => {
          const text = li.textContent.replace(/\\s+/g, ' ').trim()
          const r = li.getBoundingClientRect()
          return {
            selector: '[data-testid="' + li.dataset.testid + '"]',
            unique: true, positional: false, inShadow: false, hosts: [],
            fingerprint: { tag: 'li', attrs: ['data-testid'], textHash: fnv(text), textLength: text.length },
            rect: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height },
          }
        })
      }`,
    )
    await inSW(`new Promise((resolve, reject) => {
      const template = ${JSON.stringify(template)}
      const identities = ${JSON.stringify(identities)}
      const open = indexedDB.open('rasd')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction('issues', 'readwrite')
        tx.objectStore('issues').delete(template.id)
        identities.forEach((element, i) => tx.objectStore('issues').put({
          ...template, id: 'bulk-' + i, createdAt: template.createdAt + 1 + i, updatedAt: template.createdAt + 1 + i,
          element, status: 'open', lastCheck: null, note: null,
          check: { kind: 'style', property: 'padding', actual: '6px', expected: i % 2 ? '6px' : '8px', tolerance: 0 },
        }))
        tx.oncomplete = () => { db.close(); resolve(1) }
        tx.onerror = () => reject(tx.error)
      }
    })`)
    const timed = await inOverlay(
      tabId,
      `() => {
        const s = globalThis.__rasdIssues.issues
        return s.load().then(() => {
          const t0 = performance.now()
          return s.recheck(true).then((n) => ({ n, ms: performance.now() - t0 }))
        })
      }`,
    )
    db = await readIssues()
    const bulk = db.issues.filter((i) => i.id.startsWith('bulk-'))
    const resolvedHalf = bulk.filter((i) => i.status === 'resolved').length
    if (timed.n === 100 && timed.ms <= RECHECK_BUDGET_MS && resolvedHalf === 50) {
      ok(
        `مئة مشكلة في جولة واحدة: ${timed.ms.toFixed(0)}ms ≤ ${RECHECK_BUDGET_MS}ms، والحكم صحيح على خمسين محلولة`,
      )
    } else {
      fail(
        `جولة المئة: ${timed.n} في ${timed.ms?.toFixed(0)}ms، والمحلولة ${resolvedHalf} من ${bulk.length}`,
      )
    }
  }
}
await g.finish({
  success: '✓ المشكلة تُسجَّل وتُحلّ وتحتاج تحققًا كما تقول قاعدتها.',
  failure: (n) => `✗ ${n} إخفاق.\n`,
})
