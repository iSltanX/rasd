/**
 * فحص الإتاحة — صفر مخالفة خطيرة، وLighthouse ≥ 95 لكل صفحة، ولوحة مفاتيح بأثر مرئي، وحركةٌ تُصفَّر
 * تحت التفضيل (`STAGES/24`، ADR 0047).
 *
 * في كروم حقيقي بالحزمة المبنيّة، على **كل صفحة إضافة** (النافذة · المحرّر · المكتبة · الإعدادات · التعريف ·
 * المقارنة) بحالتها الافتراضية وبالوضعين، وعلى **الطبقة فوق الصفحة** بكل أوضاعها ذات الواجهة:
 *
 *  1. `axe-core` — مخالفةٌ `critical` أو `serious` واحدة تُسقط الحارس باسم قاعدتها وعنصرها. وجذر الطبقة مغلق
 *     (`content/host.ts`) فلا يبلغه axe من الصفحة؛ CDP يرى الجذور المغلقة، فيُسلَّم الجذر إلى axe عبر
 *     `shadowRoot` على المضيف في عالم الصفحة وحده — للفحص، بلا مسّ الإضافة (كما في `pnpm design:shots --axe`).
 *  2. Lighthouse Accessibility — ≥ 95 لكل صفحة. يحمّل Lighthouse الصفحة بنفسه في تبويبٍ جديد (بالوضع الفاتح:
 *     لا يحاكي تفضيل اللون؛ والداكن في بند axe). و`disableStorageReset` ضرورة: الافتراضي يمحو تخزين الأصل،
 *     وأصل الصفحة هنا أصل الإضافة.
 *  3. لوحة المفاتيح — Tab على كل صفحة حتى يعود التركيز إلى أوّل محطّة، وكل محطّة يُسأل عنها: هل يرى المستخدم أين
 *     التركيز؟ الأثر حدٌّ أو ظلّ على العنصر أو على أقرب ثلاثة آباء.
 *  4. `prefers-reduced-motion` — تحت المحاكاة كل مدّة انتقال أو حركة محسوبة صفر (عدا مؤشّر التحميل المسمّى:
 *     يبقى يدور)، ومسبارٌ يمرّ من توكنز المدد يقيس صفرًا تحتها وأكبر من صفر بدونها — فالقياس يقيس شيئًا.
 *
 * ## اختبار العكس
 *
 *     RASD_BREAK_ACCESSIBILITY=axe pnpm verify:accessibility        # يجب أن يفشل — زرٌّ بلا اسم في كل صفحة
 *     RASD_BREAK_ACCESSIBILITY=focus pnpm verify:accessibility      # يجب أن يفشل — كل أثر تركيز يُمحى
 *     RASD_BREAK_ACCESSIBILITY=motion pnpm verify:accessibility     # يجب أن يفشل — انتقالٌ حرفيّ لا يُصفَّر
 *     RASD_BREAK_ACCESSIBILITY=tokens pnpm verify:accessibility     # يجب أن يفشل — توكنز المدد لا تُصفَّر تحت التفضيل
 *     RASD_BREAK_ACCESSIBILITY=lighthouse pnpm verify:accessibility # يجب أن يفشل — ثلاثة عناصر بلا اسم في صفحة الإعدادات المبنيّة
 *
 * الأربعة الأولى تُحقن في الصفحة بعد تحميلها؛ والخامس يُرقَّع في نسخة الفحص قبل التحميل لأن Lighthouse يحمّل
 * الصفحة بنفسه. والترقيع يرمي بصوتٍ عالٍ إن لم يجد نمطه.
 *
 * الإقلاع والاتصال والتحميل والارتباط والتنظيف في النواة المشتركة (`scripts/lib/cdp.mjs`، `STAGES/17`).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { findAndAttach, openTarget, ROOT, startGuard } from './lib/cdp.mjs'

const PORT = 9354
const BREAK = process.env.RASD_BREAK_ACCESSIBILITY ?? ''
const LIGHTHOUSE_MIN = 95
const MAX_TAB_STOPS = 40
const WIDTH = 1440
const HEIGHT = 900

/** صفحات الإضافة المنشورة — الحالة الافتراضية لكلٍّ. */
const PAGES = [
  ['popup', 'src/pages/popup/index.html'],
  ['editor', 'src/pages/editor/index.html'],
  ['library', 'src/pages/library/index.html'],
  ['settings', 'src/pages/settings/index.html'],
  ['onboarding', 'src/pages/onboarding/index.html'],
  ['compare', 'src/pages/compare/index.html'],
]
/** أوضاع الطبقة ذات الواجهة. `idle` صامتة، فلا شيء فيها يُفحص. */
const OVERLAY_MODES = ['inspect', 'measure', 'colour', 'compare', 'issues']
const MODES = ['light', 'dark']
/** مؤشّر التحميل يبقى يدور تحت التفضيل — إيقافه يُخفي أن شيئًا يجري (`tests/unit/reduced-motion.test.ts`). */
const ESSENTIAL_ANIMATION = /spin/i

const AXE_SOURCE = readFileSync(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')

if (BREAK && !['axe', 'focus', 'motion', 'tokens', 'lighthouse'].includes(BREAK)) {
  console.error(
    `RASD_BREAK_ACCESSIBILITY=${BREAK}: القيم axe أو focus أو motion أو tokens أو lighthouse.`,
  )
  process.exit(1)
}

/** ترقيع سالب Lighthouse على نسخة الفحص قبل تحميلها — ويرمي إن لم يجد نمطه. */
function breakPatch(stage) {
  if (BREAK !== 'lighthouse') return
  const file = join(stage, 'src/pages/settings/index.html')
  const html = readFileSync(file, 'utf8')
  if (!html.includes('</body>')) {
    throw new Error(
      'RASD_BREAK_ACCESSIBILITY=lighthouse: لا `</body>` في صفحة الإعدادات المبنيّة — عدِّل النمط.',
    )
  }
  writeFileSync(
    file,
    html.replace(
      '</body>',
      '<button></button><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><input type="text"></body>',
    ),
  )
}

const g = await startGuard({
  prefix: 'accessibility',
  port: PORT,
  title: '── فحص الإتاحة (axe · Lighthouse · لوحة المفاتيح · تقليل الحركة) ──\n',
  requires: 'content.js',
  fixtures: true,
  stage: { hostPermissions: ['http://127.0.0.1/*'], patch: breakPatch },
  serviceWorker: true,
  args: [`--window-size=${WIDTH},${HEIGHT}`],
  hardTimeoutMs: 330_000,
})
const { send, ok, fail, note } = g
const extId = g.extId
if (BREAK) note(`اختبار العكس: RASD_BREAK_ACCESSIBILITY=${BREAK}`)
if (!extId || !g.sw) await g.abort('الإضافة لم تُحمَّل أو عاملها لم يُرتبط به')

const ORIGIN = `chrome-extension://${extId}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** صفحة بمقاس وتفضيلات الوسائط المطلوبة، ومعها تقييمٌ يرمي برسالة. */
async function openPage(url, { mode, reducedMotion = false }) {
  const { sessionId, targetId } = await openTarget(send, 'about:blank')
  const evaluate = g.evaluate(sessionId)
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
    sessionId,
  )
  await send(
    'Emulation.setEmulatedMedia',
    {
      features: [
        { name: 'prefers-color-scheme', value: mode },
        { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
      ],
    },
    sessionId,
  )
  await send('Page.navigate', { url }, sessionId)
  await waitFor(
    evaluate,
    `document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`,
  )
  // الصفحة تُرسَم بعد اكتمال المستند: انتظر محتوًى مرئيًّا ثمّ إطارين.
  await waitFor(evaluate, `document.body && document.body.innerText.trim().length > 0`)
  await evaluate(
    'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))',
  )
  await sleep(250)
  return { sessionId, targetId, evaluate, close: () => send('Target.closeTarget', { targetId }) }
}

async function waitFor(evaluate, expression, timeoutMs = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression).catch(() => false)) return true
    await sleep(100)
  }
  throw new Error(`لم يتحقّق: ${expression.slice(0, 100)}`)
}

/** axe: الخطيرة والحرجة وحدها. `include` يقصر الفحص على المضيف حين تكون الطبقة هي المفحوصة. */
async function axeViolations(evaluate, include) {
  if (!(await evaluate('typeof axe !== "undefined"'))) await evaluate(AXE_SOURCE)
  return evaluate(
    `axe.run(${include ?? 'document'}, { resultTypes: ['violations'] }).then((r) => r.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => ({ id: v.id, impact: v.impact,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })))`,
  )
}

const describeViolations = (list) =>
  list.map((v) => `${v.id} (${v.impact}) ← ${v.nodes.join(' · ')}`).join(' ؛ ')

// ── ١) axe على الصفحات ───────────────────────────────────────────
for (const [name, path] of PAGES) {
  for (const mode of MODES) {
    const page = await openPage(`${ORIGIN}/${path}`, { mode })
    try {
      if (BREAK === 'axe') {
        await page.evaluate(
          `document.body.appendChild(Object.assign(document.createElement('button'), { id: 'rasd-break' }))`,
        )
      }
      const found = await axeViolations(page.evaluate)
      if (found.length === 0) ok(`axe · ${name} · ${mode}: صفر مخالفة خطيرة أو حرجة`)
      else fail(`axe · ${name} · ${mode}: ${describeViolations(found)}`)
    } catch (e) {
      fail(`axe · ${name} · ${mode}: ${e.message}`)
    } finally {
      await page.close()
    }
  }
}

// ── ٢) لوحة المفاتيح على الصفحات ─────────────────────────────────
const WALK = `(() => {
  let a = document.activeElement
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement
  if (!a || a === document.body) return null
  const marked = (el) => {
    const cs = getComputedStyle(el)
    return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'
  }
  let el = a, visible = false
  for (let d = 0; d < 4 && el && !visible; d++, el = el.parentElement) visible = marked(el)
  const r = a.getBoundingClientRect()
  const name = (a.getAttribute('aria-label') || a.textContent || a.getAttribute('placeholder') || '').trim().slice(0, 40)
  return { key: a.tagName + '|' + name + '|' + Math.round(r.x) + ',' + Math.round(r.y), tag: a.tagName.toLowerCase(), name, visible }
})()`

for (const [name, path] of PAGES) {
  const page = await openPage(`${ORIGIN}/${path}`, { mode: 'dark' })
  try {
    if (BREAK === 'focus') {
      await page.evaluate(`document.head.appendChild(Object.assign(document.createElement('style'), {
        textContent: '*, *:focus, *:focus-visible, *:focus-within, *:has(:focus-visible) { outline: none !important; box-shadow: none !important }',
      }))`)
    }
    const seen = []
    const bare = []
    for (let i = 0; i < MAX_TAB_STOPS; i++) {
      for (const type of ['keyDown', 'keyUp']) {
        await send(
          'Input.dispatchKeyEvent',
          { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
          page.sessionId,
        )
      }
      const stop = await page.evaluate(WALK)
      if (!stop) continue
      if (seen.includes(stop.key)) break
      seen.push(stop.key)
      if (!stop.visible) bare.push(`${stop.tag} «${stop.name}»`)
    }
    if (seen.length === 0) fail(`لوحة المفاتيح · ${name}: Tab لم يبلغ أي عنصر`)
    else if (bare.length)
      fail(
        `لوحة المفاتيح · ${name}: ${bare.length} من ${seen.length} محطّة بلا أثر مرئي — ${bare.slice(0, 3).join(' ؛ ')}`,
      )
    else ok(`لوحة المفاتيح · ${name}: ${seen.length} محطّة تركيز، كلّها بأثر مرئي`)
  } catch (e) {
    fail(`لوحة المفاتيح · ${name}: ${e.message}`)
  } finally {
    await page.close()
  }
}

// ── ٣) تقليل الحركة ──────────────────────────────────────────────
const MOTION_PROBE = `(() => {
  const times = (v) => String(v).split(',').map((s) => s.trim()).map((s) => (s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000) || 0)
  const moving = []
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    const t = Math.max(...times(cs.transitionDuration))
    const a = cs.animationName !== 'none' ? Math.max(...times(cs.animationDuration)) : 0
    if (t > 0) moving.push({ what: 'transition', el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), ms: t })
    if (a > 0 && !${ESSENTIAL_ANIMATION}.test(cs.animationName)) moving.push({ what: 'animation:' + cs.animationName, el: el.tagName.toLowerCase(), ms: a })
  }
  const probe = document.createElement('div')
  probe.setAttribute('data-rasd-probe', '')
  probe.style.transition = 'opacity var(--rasd-motion-duration-slow)'
  document.body.appendChild(probe)
  const token = Math.max(...times(getComputedStyle(probe).transitionDuration))
  probe.remove()
  return { moving, token }
})()`

for (const [name, path] of PAGES) {
  try {
    const plain = await openPage(`${ORIGIN}/${path}`, { mode: 'dark', reducedMotion: false })
    const baseline = (await plain.evaluate(MOTION_PROBE)).token
    await plain.close()
    const reduced = await openPage(`${ORIGIN}/${path}`, { mode: 'dark', reducedMotion: true })
    try {
      // `motion`: مدّة حرفيّة تُفلت من التصفير (المسبار مستثنى فيبلغ الحكمُ عنصرَ الصفحة). `tokens`: التوكنز نفسها لا تُصفَّر.
      if (BREAK === 'motion') {
        await reduced.evaluate(`document.head.appendChild(Object.assign(document.createElement('style'), {
          textContent: '*:not([data-rasd-probe]) { transition: opacity 300ms !important }',
        }))`)
      }
      if (BREAK === 'tokens') {
        await reduced.evaluate(`document.head.appendChild(Object.assign(document.createElement('style'), {
          textContent: ':root { --rasd-motion-duration-slow: 300ms !important }',
        }))`)
      }
      const { moving, token } = await reduced.evaluate(MOTION_PROBE)
      if (!(baseline > 0))
        fail(
          `تقليل الحركة · ${name}: مسبار التوكنز يقيس ${baseline}ms بلا التفضيل — القياس لا يقيس شيئًا`,
        )
      else if (token !== 0)
        fail(
          `تقليل الحركة · ${name}: توكنز المدد ${token}ms تحت التفضيل (بلا التفضيل ${baseline}ms)`,
        )
      else if (moving.length) {
        const sample = moving
          .slice(0, 3)
          .map((m) => `${m.what} ${m.el} ${m.ms}ms`)
          .join(' ؛ ')
        fail(`تقليل الحركة · ${name}: ${moving.length} عنصرًا يتحرّك تحت التفضيل — ${sample}`)
      } else ok(`تقليل الحركة · ${name}: توكنز المدد ${baseline}ms ← 0، ولا عنصر يتحرّك`)
    } finally {
      await reduced.close()
    }
  } catch (e) {
    fail(`تقليل الحركة · ${name}: ${e.message}`)
  }
}

// ── ٤) الطبقة فوق الصفحة ─────────────────────────────────────────
const inSW = (expression) => g.sw.evaluate(expression)

async function auditOverlay(tabUrl, mode, overlayMode) {
  const found = await findAndAttach(send, (t) => t.type === 'page' && t.url === tabUrl, {
    enable: ['Page'],
  })
  if (!found) throw new Error('تبويب العيّنة لم يُعثر عليه')
  const { sessionId } = found
  const evaluate = g.evaluate(sessionId)
  try {
    await send(
      'Emulation.setEmulatedMedia',
      { features: [{ name: 'prefers-color-scheme', value: mode }] },
      sessionId,
    )
    const { root } = await send('DOM.getDocument', { depth: -1, pierce: true }, sessionId)
    const html = root.children?.find((n) => n.nodeName === 'HTML')
    const host = html?.children?.find((n) => n.shadowRoots?.[0]?.shadowRootType === 'closed')
    if (!host) throw new Error('جذر الطبقة المغلق غير موجود في الصفحة')
    const hostObj = await send('DOM.resolveNode', { nodeId: host.nodeId }, sessionId)
    const rootObj = await send('DOM.resolveNode', { nodeId: host.shadowRoots[0].nodeId }, sessionId)
    await send(
      'Runtime.callFunctionOn',
      {
        objectId: hostObj.object.objectId,
        functionDeclaration: `function (root) {
          Object.defineProperty(this, 'shadowRoot', { get: () => root, configurable: true })
          this.setAttribute('data-rasd-axe-host', '')
        }`,
        arguments: [{ objectId: rootObj.object.objectId }],
      },
      sessionId,
    )
    const found2 = await axeViolations(evaluate, `{ include: [['[data-rasd-axe-host]']] }`)
    if (found2.length === 0) ok(`axe · الطبقة · ${overlayMode} · ${mode}: صفر مخالفة خطيرة أو حرجة`)
    else fail(`axe · الطبقة · ${overlayMode} · ${mode}: ${describeViolations(found2)}`)
  } finally {
    await send('Target.detachFromTarget', { sessionId }).catch(() => undefined)
  }
}

try {
  const granted = await inSW(
    `chrome.permissions.contains({ origins: ['${g.base}/*'] }).then(g => g).catch(() => false)`,
  )
  if (!granted) throw new Error('صلاحية المضيف للعيّنات غير ممنوحة — الحقن غير ممكن')
  const url = `${g.base}/css/`
  for (const mode of MODES) {
    const tabId = await inSW(
      `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then(t => t.id)`,
    )
    await inSW(`new Promise(res => {
      const check = () => chrome.tabs.get(${tabId}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
      check()
    })`)
    await inSW(
      `chrome.scripting.executeScript({ target: { tabId: ${tabId} }, files: ['content.js'] }).then(() => 1)`,
    )
    const started = await inSW(`chrome.scripting.executeScript({
      target: { tabId: ${tabId} }, world: 'ISOLATED',
      func: () => globalThis.__rasdContent.startOverlay().then((r) => r.ok),
    }).then((r) => r[0].result)`)
    if (!started) throw new Error('الطبقة لم تبدأ')
    for (const overlayMode of OVERLAY_MODES) {
      try {
        const reply = await inSW(`chrome.tabs.sendMessage(${tabId}, {
          __rasd: 1, id: 'a11y-${overlayMode}', type: 'mode/set', payload: { mode: ${JSON.stringify(overlayMode)} },
        }).then((r) => r, (e) => ({ error: String(e.message) }))`)
        if (reply?.error || reply?.ok === false)
          throw new Error(`mode/set رُفض: ${JSON.stringify(reply)}`)
        await sleep(500)
        await auditOverlay(url, mode, overlayMode)
      } catch (e) {
        fail(`axe · الطبقة · ${overlayMode} · ${mode}: ${e.message}`)
      }
    }
    await inSW(`chrome.tabs.remove(${tabId})`)
  }
} catch (e) {
  fail(`axe · الطبقة: ${e.message}`)
}

// ── ٥) Lighthouse ────────────────────────────────────────────────
try {
  const { default: lighthouse } = await import('lighthouse')
  for (const [name, path] of PAGES) {
    try {
      const result = await lighthouse(`${ORIGIN}/${path}`, {
        port: PORT,
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['accessibility'],
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: WIDTH,
          height: HEIGHT,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttlingMethod: 'provided',
        disableStorageReset: true,
      })
      const lhr = result?.lhr
      const score = lhr?.categories?.accessibility?.score
      if (typeof score !== 'number') {
        fail(`Lighthouse · ${name}: لا نتيجة — ${lhr?.runtimeError?.message ?? 'بلا رسالة'}`)
        continue
      }
      const percent = Math.round(score * 100)
      if (percent >= LIGHTHOUSE_MIN)
        ok(`Lighthouse · ${name}: ${percent} (الحدّ ${LIGHTHOUSE_MIN})`)
      else {
        const failing = Object.values(lhr.audits)
          .filter((a) => a.score === 0 && a.scoreDisplayMode === 'binary')
          .map((a) => a.id)
        fail(`Lighthouse · ${name}: ${percent} دون ${LIGHTHOUSE_MIN} — ${failing.join(' · ')}`)
      }
    } catch (e) {
      fail(`Lighthouse · ${name}: ${e.message}`)
    }
  }
} catch (e) {
  fail(`Lighthouse: ${e.message}`)
}

await g.finish({
  success:
    '✓ الإتاحة: صفر مخالفة خطيرة، وLighthouse ≥ 95، ولوحة المفاتيح، وتقليل الحركة — على كل صفحة وعلى الطبقة.',
  failure: (n) => `\n✗ فشل فحص الإتاحة — ${n} مشكلة.\n`,
})
