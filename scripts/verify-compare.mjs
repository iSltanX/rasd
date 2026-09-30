#!/usr/bin/env node
/**
 * يثبت أن أداة المقارنة (المرحلة 16) تعمل فوق Chrome حقيقي.
 *
 * happy-dom بلا محرّك تخطيط وبلا Shadow DOM حقيقي كاملًا، ورياضيات
 * `modules/compare/overlay.ts` مُختبَرة هناك بتحويلات مصطنعة — وما يُختبَر
 * هنا وحده هو **السلك**: هل يصل حدث سحب/عجلة/لوحة مفاتيح حقيقي من Chrome
 * إلى الأداة فعلًا، وهل الإفلات واللصق يحفظان مرجعًا في IndexedDB الحقيقي
 * ويحمّلانه حيًّا، وهل استدعاء المرجع المحفوظ عند إعادة دخول الوضع يعمل.
 *
 * حالتان لهما سابقة حيّة مباشرة هذه الدفعة تحديدًا: مستمع `paste` كان بلا
 * `capture: true` (مراجعة خصمة كشفته)، فاختبار اللصق هنا يُثبِت الإصلاح لا
 * يكتفي بإثبات أن اللصق يعمل — بتركيب مستمع صفحة مضيفة يستدعي
 * `stopPropagation` عمدًا، وهو بالضبط ما كان يُسكِت اللصق قبل الإصلاح.
 *
 * يعيد استعمال عيّنة `picker/` — هندستها معروفة ومختبَرة في
 * `verify-picker.mjs`/`verify-measure.mjs`، وأداة المقارنة لا تحتاج محتوى
 * صفحة محدَّدًا (تتفاعل مع طبقتنا نفسها لا عناصر الصفحة).
 *
 * والمناطق المستثناة (`STAGES/34`، القسم 8.7): الفرق الحيّ من زرّ اللوحة إلى الخلفية، وساعةٌ متغيّرة
 * تُحصى بلا منطقة وتسقط بمنطقة عنصر أو مستطيل، والمنطقة تُحفظ مع المرجع وتعود معه.
 *
 * الإقلاع والتحميل والارتباط والتقرير في `scripts/lib/cdp.mjs`؛ وأحكام هذا الملفّ هنا.
 *
 *   pnpm build && pnpm verify:compare
 */
import { attachTarget, startGuard } from './lib/cdp.mjs'

const PORT = 9341

/*
 * **`<all_urls>` لا `http://127.0.0.1/*`** منذ قسم المناطق المستثناة (8.7): الفرق الحيّ يلتقط بـ
 * `captureVisibleTab`، وهي لا تقبل صلاحية مضيف ضيّقة — «Either the '<all_urls>' or 'activeTab' permission
 * is required» (قِيس هنا، وعلّته نفسها في `verify-capture.mjs`). و`activeTab` لا تُمنح برمجيًّا. فالصلاحية
 * الشاملة محصورة في هذه النسخة المؤقّتة التي تُحذف بعد الفحص، والحزمة المشحونة كما هي.
 */
const g = await startGuard({
  prefix: 'compare',
  port: PORT,
  title: '── فحص أداة المقارنة في Chrome حقيقي ──',
  requires: 'content.js',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  args: ['--window-size=1280,800'],
  serviceWorker: true,
})
const { send, ok, fail, note } = g
const BASE = g.base

const extId = g.extId

/*
 * الارتباط بسياقٍ **حيّ** لا بهدفٍ موجود — انظر ترويسة `live-sw.mjs`:
 * الهدف يظهر قبل اكتمال إقلاع العامل، فيقع التقييم بلا ربط `chrome`.
 */
const sw = g.sw?.target ?? null
const inSW = (expression) => g.sw.evaluate(expression)

let granted = false
if (g.sw) {
  try {
    granted = await inSW(
      `chrome.permissions.contains({ origins: ['${BASE}/*'] }).then(g => g).catch(() => false)`,
    )
  } catch {
    granted = false
  }
}

if (!extId || !sw) {
  fail('الإضافة أو الـservice worker لم يجهزا — لا يمكن الحقن بالمسار الحقيقي.')
} else if (!granted) {
  fail('صلاحية المضيف للعيّنات غير ممنوحة — الحقن عبر chrome.scripting غير ممكن.')
} else {
  ok(`نسخة الفحص محمَّلة، والصلاحية ممنوحة للعيّنات (${BASE}/*) في النسخة المؤقّتة`)
}

async function openTab(path) {
  const url = `${BASE}${path}`
  const tabId = await inSW(
    `chrome.tabs.create({ url: ${JSON.stringify(url)}, active: true }).then(t => t.id)`,
  )
  await inSW(`new Promise(res => {
    const check = () => chrome.tabs.get(${tabId}).then(t => t.status === 'complete' ? res(1) : setTimeout(check, 100))
    check()
  })`)
  return tabId
}

async function inPage(tabId, fnSource) {
  const expr = `chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'MAIN',
    func: ${fnSource},
  }).then(r => r[0].result)`
  return inSW(expr)
}

async function injectOverlay(tabId) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId}, allFrames: true },
    files: ['content.js'],
  }).then(() => 'injected').catch(e => 'error: ' + e.message)`)
}

async function startOverlay(tabId) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'ISOLATED',
    func: () => globalThis.__rasdContent.startOverlay().then(r => {
      const g = { ok: r.ok, level: r.ok ? r.value.host.level : null, error: r.ok ? null : r.error.message }
      if (r.ok) globalThis.__rasdCompare = r.value
      return g
    }),
  }).then(r => r[0].result)`)
}

async function inOverlay(tabId, fnSource) {
  return inSW(`chrome.scripting.executeScript({
    target: { tabId: ${tabId} },
    world: 'ISOLATED',
    func: ${fnSource},
  }).then(r => r[0].result)`)
}

const setMode = (tabId, mode) =>
  inOverlay(
    tabId,
    `() => { globalThis.__rasdCompare.modes.set(${JSON.stringify(mode)}); return true }`,
  )

/** حالة أداة المقارنة مباشرة من الإشارات — لا انتظار قراءة DOM. */
const readCompareState = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const c = globalThis.__rasdCompare.compare.state
      return {
        reference: c.reference.value,
        transform: c.transform.value,
        displayMode: c.displayMode.value,
        opacity: c.opacity.value,
        splitPosition: c.splitPosition.value,
      }
    }`,
  )

/** ما رُسم فعلًا فوق الصفحة. */
const readDrawn = (tabId) =>
  inOverlay(
    tabId,
    `() => {
      const layer = globalThis.__rasdCompare.host.layer
      return {
        idle: !!layer.querySelector('[data-rasd-ov="compare-idle"]'),
        panel: !!layer.querySelector('[data-rasd-ov="compare-panel"]'),
        referenceImg: layer.querySelector('[data-rasd-ov="compare-reference"]')?.getAttribute('src') ?? null,
        dock: !!layer.querySelector('[data-rasd-ov="compare-dock"]'),
      }
    }`,
  )

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

/** انتظار قصير لسلسلة `await` غير متزامنة (IndexedDB، فكّ صورة) تستقرّ. */
const settleAsync = (ms = 300) => new Promise((r) => setTimeout(r, ms))

async function moveTo(pageSession, x, y, modifiers = 0) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseMoved', x, y, pointerType: 'mouse', modifiers },
    pageSession,
  )
  await settle(pageSession)
}

async function pressAt(pageSession, x, y) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mousePressed', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' },
    pageSession,
  )
  await settle(pageSession)
}

async function releaseAt(pageSession, x, y) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' },
    pageSession,
  )
  await settle(pageSession)
}

async function clickAt(pageSession, x, y) {
  await pressAt(pageSession, x, y)
  await releaseAt(pageSession, x, y)
}

async function wheelAt(pageSession, x, y, deltaY) {
  await send(
    'Input.dispatchMouseEvent',
    { type: 'mouseWheel', x, y, deltaX: 0, deltaY, pointerType: 'mouse' },
    pageSession,
  )
  await settle(pageSession)
}

async function keyPress(pageSession, key, modifiers = 0) {
  await send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key, windowsVirtualKeyCode: keyCode(key), modifiers },
    pageSession,
  )
  await send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key, windowsVirtualKeyCode: keyCode(key), modifiers },
    pageSession,
  )
  await settle(pageSession)
}
function keyCode(key) {
  const map = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }
  return map[key] ?? 0
}

const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol

/** ملفّ صورة PNG صالح ١×١ — بلا حاجة لعيّنة خارجية. */
const TEST_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

// ── الجولة ──────────────────────────────────────────────────────
if (extId && sw && granted) {
  const tabId = await openTab('/picker/')
  const injected = await injectOverlay(tabId)
  const started = await startOverlay(tabId)

  if (injected !== 'injected' || !started?.ok) {
    fail(`تعذّر بدء الطبقة: ${injected} / ${JSON.stringify(started)}`)
  } else {
    ok(`الطبقة بدأت (${started.level})`)
    const pageSession = await attachToPage('/picker/')
    if (!pageSession) fail('تعذّر الاتصال بهدف الصفحة.')
    else {
      const vw = await inPage(tabId, `() => window.innerWidth`)
      const vh = await inPage(tabId, `() => window.innerHeight`)
      note(`أبعاد النافذة الفعلية: ${vw}×${vh}`)
      // `classifyViewport` (المعرض أدناه) يُصنِّف من `documentElement.clientWidth`
      // لا `window.innerWidth` — الفرق شريط تمرير، وهو ما يشرح لماذا لا تُطبَع
      // هنا قيمة "desktop" ثابتة رغم أن `vw` قد تقع داخل حدّه: قِيس هنا 1265
      // مقابل `vw=1280`، أي `tablet` فعليًّا (768–1279) لا `desktop` (١٢٨٠+).
      const clientW = await inPage(tabId, `() => document.documentElement.clientWidth`)
      note(
        `عرض محتوى الصفحة (documentElement.clientWidth): ${clientW} — هذا ما يقرأه classifyViewport`,
      )
      // خارج مربّع اللوحة تمامًا (40,64)–(~380,~563) — أسفل يمين الشاشة.
      const bg = { x: vw - 80, y: vh - 80 }

      await setMode(tabId, 'compare')
      const diag = await inOverlay(
        tabId,
        `() => {
          const layer = globalThis.__rasdCompare.host.layer
          const hostEl = globalThis.__rasdCompare.host.hostEl
          return {
            layerInteractive: layer.getAttribute('data-rasd-interactive'),
            hostPointerEvents: hostEl.style.getPropertyValue('pointer-events'),
          }
        }`,
      )
      note(`تشخيص: ${JSON.stringify(diag)}`)

      // ── 1) الحالة الفارغة تُعرض، والوضع تفاعليّ ────────────────
      let drawn = await readDrawn(tabId)
      if (diag.layerInteractive === 'true' && diag.hostPointerEvents === 'auto') {
        ok('الطبقة تفاعلية في وضع المقارنة')
      } else {
        fail(`الطبقة ليست تفاعلية: ${JSON.stringify(diag)}`)
      }
      if (drawn.idle) ok('compare-idle مرسومة بلا مرجع')
      else fail(`compare-idle غائبة: ${JSON.stringify(drawn)}`)

      // ── 2) سهم بلا مرجع لا يفعل شيئًا (إصلاح مُراجَع هذه الدفعة) ──
      let st = await readCompareState(tabId)
      const tx0 = st.transform.tx
      await keyPress(pageSession, 'ArrowRight')
      st = await readCompareState(tabId)
      if (st.transform.tx === tx0 && !st.reference) {
        ok('سهم بلا مرجع لا يحرّك شيئًا (لا يُبتلع تمرير الصفحة بلا داعٍ)')
      } else {
        fail(`سهم بلا مرجع غيّر الحالة: tx ${tx0}→${st.transform.tx}`)
      }

      // ── 3) الإفلات يعيّن مرجعًا فعليًّا (لا نصًّا فقط) ─────────
      const dropped = await inOverlay(
        tabId,
        `() => (async () => {
          const blob = await (await fetch(${JSON.stringify(TEST_PNG_DATA_URL)})).blob()
          const file = new File([blob], 'ref.png', { type: 'image/png' })
          const dt = new DataTransfer()
          dt.items.add(file)
          const zone = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-cmp-dropzone')
          if (!zone) return 'no-dropzone'
          const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
          zone.dispatchEvent(ev)
          return 'dispatched'
        })()`,
      )
      await settleAsync(500)
      st = await readCompareState(tabId)
      drawn = await readDrawn(tabId)
      if (dropped === 'dispatched' && st.reference && drawn.referenceImg?.startsWith('blob:')) {
        ok(`الإفلات عيّن مرجعًا حيًّا (${drawn.referenceImg.slice(0, 24)}…)`)
      } else {
        fail(
          `الإفلات لم يعيّن مرجعًا: dropped=${dropped} reference=${JSON.stringify(st.reference)} img=${drawn.referenceImg}`,
        )
      }
      if (drawn.panel) ok('لوحة المقارنة النشطة ظهرت بعد تعيين المرجع')
      else fail('لوحة المقارنة لم تظهر رغم وجود مرجع')

      /*
       * ── الحدّ غير المتماثل: كُتب من الصفحة، فيُقرأ من **أصل الإضافة** ──
       *
       * كل ما سبق كتب وقرأ من الطرف نفسه، فينجح **حتى لو كان المخزن
       * خاطئًا** — وهذا بالضبط ما وقع: نجحت هذه الفحوص كاملةً بينما
       * المراجع تُكتب في قاعدة بيانات الموقع المزار لا قاعدة رصد (الصفّ
       * 78). خطأٌ متماثل الاتجاهين لا يكشفه اختبارٌ متماثل الاتجاهين.
       *
       * فالقراءة هنا من الـservice worker: أصلٌ آخر، وقاعدةٌ أخرى — إن
       * وُجد السجلّ فيها فالكتابة وقعت حيث يجب.
       */
      const inExtensionDb = await inSW(`(async () => {
        const db = await new Promise((res, rej) => {
          const q = indexedDB.open('rasd')
          q.onsuccess = () => res(q.result)
          q.onerror = () => rej(q.error)
        })
        if (![...db.objectStoreNames].includes('references')) return { stores: [...db.objectStoreNames], count: -1 }
        const count = await new Promise((res) => {
          const tx = db.transaction('references', 'readonly')
          const r = tx.objectStore('references').count()
          r.onsuccess = () => res(r.result)
          r.onerror = () => res(-2)
        })
        return { origin: self.location.origin, count }
      })()`)
      if (inExtensionDb.count > 0) {
        ok(
          `المرجع مكتوب في قاعدة **الإضافة** لا الموقع — ${inExtensionDb.count} سجلًّا مقروءًا من ${inExtensionDb.origin}`,
        )
      } else {
        fail(
          `المرجع غائب عن قاعدة الإضافة: ${JSON.stringify(inExtensionDb)} — أي أنه كُتب في مكان آخر (الصفّ 78)`,
        )
      }

      // ── 3.5) مقبض التقسيم القابل بالسحب — SplitHandle.tsx ──────
      // **قبل أي سحب لكامل الصورة عمدًا**: `transform` لا يزال محايدًا هنا
      // (`tx=ty=0` قبل النقل أدناه). `nudge` ينقل المرجع خارج مربّع لوحة
      // المقارنة (`PANEL_INSET=40`..~380 أفقيًّا، `PANEL_TOP=64`..~563
      // رأسيًّا) كي لا تلتقط اللوحة الحدث بدل المقبض تحتها.
      //
      // **نقلات صغيرة ضمن حدود المقبض ذاته عمدًا — لا سحبًا واسعًا كخطوة
      // 4.** قِيس مباشرةً أثناء بناء هذا الفحص أن `Input.dispatchMouseEvent`
      // في Chrome بلا رأس **لا يحترم `setPointerCapture`**: `pointerdown`
      // يصل المقبض دومًا، لكن `pointermove` بعد نقلة تُخرج المؤشِّر من
      // حدود المقبض (حتى مع `setPointerCapture` ناجحًا بلا رمي) لا يصله
      // إطلاقًا — CDP يوجّه بحسب اختبار إصابة عاديّ عند كل نقطة، لا بإعادة
      // توجيه الأسر. المقبض ثابت المقاس بصريًّا (`~28×48px`، انظر تعليق
      // `.rasd-ov-split-handle` في overlay.css)، فنقلات ≤10px تبقى داخله
      // دون حاجة للأسر أصلًا — وهذا الحدّ سمة بيئة CDP الاصطناعية لا
      // سلوك متصفّح حقيقي (لمسة أو فأرة حقيقيّان يستمرّان عبر `setPointerCapture`
      // بصرف النظر عن موضع المؤشِّر، وهو ما تثبته `split-handle.test.tsx`
      // بأحداث مصطنَعة مباشرة على العنصر لا بإحداثيات شاشة).
      //
      // `displayMode` الافتراضي `split` — لا حاجة لتبديل الوضع. **المقياس
      // اتجاهيّ لا دقيق**: عرض الصورة الطبيعي 1px يجعل أي دلتا سحب تُشبِع
      // الموضع فورًا عند 0 أو 100 — الدقّة الحسابية (بما فيها التحجيم 2×)
      // مُثبَتة في `split-handle.test.tsx` (10 حالات). ما لا تثبته الوحدات:
      // هل `setPointerCapture` الحقيقي في Chrome (بخلاف happy-dom الذي لا
      // يطبّقه قط) يمرّ بلا رمي، وهل حدث مؤشِّر CDP حقيقي — لا مصطنَع
      // بـ`dispatchEvent` — يصل المقبض عبر اختبار إصابة حقيقي.
      await inOverlay(
        tabId,
        `() => { globalThis.__rasdCompare.compare.nudge(700, 100); return true }`,
      )
      await settle(pageSession)
      const handleRect = await inOverlay(
        tabId,
        `() => {
          const el = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-split-handle')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        }`,
      )
      if (!handleRect) {
        fail('مقبض التقسيم غائب من DOM رغم وضع split ومرجع قائم.')
      } else {
        // **تسخين لازم قِيس لا حدس**: هذا أوّل `pressAt` في السكربت كلّه —
        // بلا `moveTo` أوّليّ هنا يفشل أوّل press+move صامتًا (٥٠٪→٥٠٪) رغم
        // نجاح الثاني مباشرةً بعده بالإحداثيات نفسها؛ CDP يحتاج مؤشِّرًا
        // «واصلًا» فعليًّا إلى نقطة قبل أن يقبل ضغطًا هناك أوّل مرّة في جلسة
        // جديدة. الخطوة 4 لاحقًا لا تحتاج تسخينًا مماثلًا لأن هذه الخطوة
        // سبقتها وأدّت الغرض عرَضًا.
        await moveTo(pageSession, handleRect.x, handleRect.y)
        st = await readCompareState(tabId)
        const splitBefore = st.splitPosition
        await pressAt(pageSession, handleRect.x, handleRect.y)
        await moveTo(pageSession, handleRect.x + 8, handleRect.y)
        await releaseAt(pageSession, handleRect.x + 8, handleRect.y)
        st = await readCompareState(tabId)
        if (st.splitPosition > splitBefore) {
          ok(`سحب المقبض يمينًا زاد موضع الفاصل (${splitBefore}٪ → ${st.splitPosition}٪)`)
        } else {
          fail(
            `سحب المقبض لم يغيّر الموضع في الاتجاه المتوقَّع: ${splitBefore} → ${st.splitPosition}`,
          )
        }

        // والاتجاه المعاكس — نفس المقبض، دلتا سالبة.
        await pressAt(pageSession, handleRect.x, handleRect.y)
        await moveTo(pageSession, handleRect.x - 8, handleRect.y)
        await releaseAt(pageSession, handleRect.x - 8, handleRect.y)
        const stAfterBack = await readCompareState(tabId)
        if (stAfterBack.splitPosition < st.splitPosition) {
          ok(
            `سحب المقبض يسارًا أنقص موضع الفاصل (${st.splitPosition}٪ → ${stAfterBack.splitPosition}٪)`,
          )
        } else {
          fail(`السحب العكسي لم يُنقص الموضع: ${st.splitPosition} → ${stAfterBack.splitPosition}`)
        }

        // إعادة الموضع إلى منتصفه — الخطوات اللاحقة (منزلق الشفافية،
        // إعادة الدخول) لا تفترض قيمة بعينها، لكن نظافة الحالة أوضح للقارئ.
        await inOverlay(
          tabId,
          `() => { globalThis.__rasdCompare.compare.setSplitPosition(50); return true }`,
        )
      }

      // ── 4) السحب يحرّك التحويل بمقدار حركة المؤشِّر الحقيقية ────
      //
      // **القراءة تنتظر الأثر، والحدث يُرسَل مرّةً.** قِيس في CI (جولة
      // 34669443490): `السحب لم يطابق حركة المؤشِّر` والتحويل لم يتغيّر
      // إطلاقًا — أي أن القراءة سبقت تطبيق الحركة لا أن المقدار خاطئ.
      // فتُستطلَع الحالة حتى تتغيّر أو ينفد السقف، **ثمّ** يُحكَم على
      // المقدار بتسامحه الأصلي (2px) بلا توسيع. ولا تُعاد الحركة: إعادتها
      // تضاعف ما يُقاس، وهذا فرقُ انتظار الأثر عن إخفاء السباق.
      st = await readCompareState(tabId)
      const before = st.transform
      await pressAt(pageSession, bg.x, bg.y)
      await moveTo(pageSession, bg.x - 40, bg.y - 25)
      for (let i = 0; i < 20; i++) {
        st = await readCompareState(tabId)
        if (st.transform.tx !== before.tx || st.transform.ty !== before.ty) break
        await new Promise((r) => setTimeout(r, 50))
      }
      const afterMove = st.transform
      await releaseAt(pageSession, bg.x - 40, bg.y - 25)
      if (near(afterMove.tx - before.tx, -40, 2) && near(afterMove.ty - before.ty, -25, 2)) {
        ok(
          `السحب حرّك المرجع بمقدار حركة المؤشِّر الحقيقية (Δx=${afterMove.tx - before.tx}, Δy=${afterMove.ty - before.ty})`,
        )
      } else {
        fail(
          `السحب لم يطابق حركة المؤشِّر: قبل ${JSON.stringify(before)} بعد ${JSON.stringify(afterMove)}`,
        )
      }

      // ── 5) عجلة الفأرة تُكبِّر/تُصغِّر فعليًّا ───────────────────
      //
      // **قراءةٌ واحدة فورية ليست قياسًا — هي سباق.** قِيس في CI (جولة
      // 34666125025): `العجلة لم تغيّر التحجيم: 1 → 1` على عدّاء بنواتين،
      // والأمرُ نفسه أخضر محليًّا. فالحدث **يُرسَل مرّةً واحدة** — لا تُعاد
      // العجلة فيتضاعف ما يُقاس — ثمّ تُستطلَع الحالة حتى تتغيّر أو ينفد
      // السقف. فإن نفد، فالرسالة تقول كم قراءةً استغرقت: «وصل متأخّرًا»
      // و«لم يصل» عطلان مختلفان ولا يصحّ خلطهما.
      st = await readCompareState(tabId)
      const scaleBefore = st.transform.scale
      await wheelAt(pageSession, bg.x, bg.y, -240) // دلتا سالبة = تكبير، انظر compare.ts
      const WHEEL_READS = 20
      let reads = 0
      for (; reads < WHEEL_READS; reads++) {
        st = await readCompareState(tabId)
        if (st.transform.scale !== scaleBefore) break
        await new Promise((r) => setTimeout(r, 50))
      }
      if (st.transform.scale > scaleBefore) {
        ok(
          `عجلة الفأرة كبّرت المرجع (${scaleBefore.toFixed(3)} → ${st.transform.scale.toFixed(3)})`,
        )
      } else {
        fail(
          `العجلة لم تغيّر التحجيم: ${scaleBefore} → ${st.transform.scale} بعد ${reads} قراءة — ` +
            `الحدث لم يصل أصلًا، لا تأخّر`,
        )
      }

      // ── 6) لوحة المفاتيح: 1px عاديًا، 10px مع ⇧ (مرجع موجود الآن) ──
      st = await readCompareState(tabId)
      const txBeforeNudge = st.transform.tx
      await keyPress(pageSession, 'ArrowRight')
      st = await readCompareState(tabId)
      const plainStep = st.transform.tx - txBeforeNudge
      await keyPress(pageSession, 'ArrowRight', 8) // Shift = bit 8 في قناع CDP
      st = await readCompareState(tabId)
      const shiftStep = st.transform.tx - (txBeforeNudge + plainStep)
      if (near(plainStep, 1, 0.1) && near(shiftStep, 10, 0.1)) {
        ok(`الأسهم تحرِّك 1px عاديًا و10px مع ⇧ (قِيس: ${plainStep}px ثم ${shiftStep}px)`)
      } else {
        fail(`خطوتا التحريك غير متوقَّعتين: عادي=${plainStep} ⇧=${shiftStep}`)
      }

      // ── 7) اللصق يعيّن مرجعًا جديدًا رغم `stopPropagation` من الصفحة ──
      // هذا يثبت إصلاح `capture: true` المُراجَع هذه الدفعة تحديدًا — بلاه،
      // مستمع الصفحة كان يُسكِت اللصق قبل وصوله إلى مستمعنا.
      const referenceUrlBeforePaste = drawn.referenceImg
      await inPage(
        tabId,
        `() => { document.addEventListener('paste', (e) => e.stopPropagation()) }`,
      )
      const pasted = await inPage(
        tabId,
        `() => (async () => {
          const blob = await (await fetch(${JSON.stringify(TEST_PNG_DATA_URL)})).blob()
          const file = new File([blob], 'pasted.png', { type: 'image/png' })
          const dt = new DataTransfer()
          dt.items.add(file)
          const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
          document.dispatchEvent(ev)
          return 'dispatched'
        })()`,
      )
      await settleAsync(500)
      drawn = await readDrawn(tabId)
      if (
        pasted === 'dispatched' &&
        drawn.referenceImg?.startsWith('blob:') &&
        drawn.referenceImg !== referenceUrlBeforePaste
      ) {
        ok('اللصق (مع capture:true) عيّن مرجعًا جديدًا رغم stopPropagation من الصفحة')
      } else {
        fail(
          `اللصق لم يعيّن مرجعًا جديدًا: قبل=${referenceUrlBeforePaste} بعد=${drawn.referenceImg}`,
        )
      }

      // ── 8) منزلق الشفافية في اللوحة يعمل فعليًّا ─────────────────
      const sliderRect = await inOverlay(
        tabId,
        `() => {
          const el = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-cmp-slider input[type="range"]')
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }`,
      )
      if (!sliderRect) {
        fail('لم يُعثر على منزلق الشفافية في DOM.')
      } else {
        const opacityBefore = (await readCompareState(tabId)).opacity
        // نقرة قرب الطرف الأيسر من المسار — قيمة منخفضة (RTL: الحدّ الأدنى يمين المسار حسب اتجاه اللوحة، لكن input[type=range] الأصلي يبقى بصريًا LTR داخليًا ما لم يُعكَس صراحةً؛ الاختبار هنا يتحقّق من *وجود* أثر لا قيمة محدَّدة).
        await clickAt(
          pageSession,
          sliderRect.x + sliderRect.w * 0.1,
          sliderRect.y + sliderRect.h / 2,
        )
        const opacityAfter = (await readCompareState(tabId)).opacity
        if (opacityAfter !== opacityBefore) {
          ok(`منزلق الشفافية يستجيب للنقر (${opacityBefore}٪ → ${opacityAfter}٪)`)
        } else {
          fail(`منزلق الشفافية بلا أثر: بقي ${opacityBefore}٪`)
        }
      }

      // ── 8.5) معرض المقاسات — `compare / viewports` (`127:315`، المرحلة 16) ──
      // زرّ «المقاس الحالي» في اللوحة يفتح المعرض. **المقاس الحيّ يُصنَّف من
      // `documentElement.clientWidth` لا `window.innerWidth`** — الفرق بينهما
      // شريط تمرير (~15px هنا)، فعرض 1280 المقيس أعلاه لا يعني `desktop`
      // بالضرورة: قِيس مباشرةً أن `clientWidth` هنا 1265، أي `tablet` فعليًّا
      // (حدّا `classifyViewport`: 768–1279). لا افتراض بالاسم — البطاقة
      // الممتلئة تُحدَّد بالعدّ لا بتخمين اسم التصنيف.
      const galleryBtnPresent = await inOverlay(
        tabId,
        `() => !!globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-cmp-vp-btn')`,
      )
      if (!galleryBtnPresent) {
        fail('زرّ فتح معرض المقاسات غائب من اللوحة.')
      } else {
        const btnRect = await inOverlay(
          tabId,
          `() => {
            const el = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-cmp-vp-btn')
            const r = el.getBoundingClientRect()
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
          }`,
        )
        await clickAt(pageSession, btnRect.x, btnRect.y)
        await settleAsync(400)

        const galleryOpen = await inOverlay(
          tabId,
          `() => {
            const layer = globalThis.__rasdCompare.host.layer
            const cards = [...layer.querySelectorAll('[data-rasd-ov="viewport-card"]')]
            return {
              present: !!layer.querySelector('[data-rasd-ov="viewport-gallery"]'),
              cardCount: cards.length,
              filledCount: cards.filter((c) => c.querySelector('img')).length,
            }
          }`,
        )
        if (galleryOpen.present && galleryOpen.cardCount === 4 && galleryOpen.filledCount === 1) {
          ok(`المعرض فُتح بأربع بطاقات، واحدة مملوءة (عرض محتوى الصفحة الحيّ — ${clientW}px)`)
        } else {
          fail(`المعرض غير مطابق للمتوقَّع: ${JSON.stringify(galleryOpen)}`)
        }

        // إفلات صورة على بطاقة «هاتف» الفارغة — مقاس يخالف المقاس الحيّ الآن.
        const referenceUrlBeforeGalleryDrop = (await readDrawn(tabId)).referenceImg
        const galleryDropped = await inOverlay(
          tabId,
          `() => (async () => {
            const blob = await (await fetch(${JSON.stringify(TEST_PNG_DATA_URL)})).blob()
            const file = new File([blob], 'phone-ref.png', { type: 'image/png' })
            const dt = new DataTransfer()
            dt.items.add(file)
            const zone = [...globalThis.__rasdCompare.host.layer.querySelectorAll('[data-rasd-ov="viewport-card"]')]
              .find((c) => c.getAttribute('aria-label') === 'هاتف')
              ?.querySelector('.rasd-ov-vpg-thumb-empty')
            if (!zone) return 'no-zone'
            const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
            zone.dispatchEvent(ev)
            return 'dispatched'
          })()`,
        )
        await settleAsync(500)
        const filledAfterGalleryDrop = await inOverlay(
          tabId,
          `() => [...globalThis.__rasdCompare.host.layer.querySelectorAll('[data-rasd-ov="viewport-card"]')]
            .filter((c) => c.querySelector('img')).length`,
        )
        const referenceUrlAfterGalleryDrop = (await readDrawn(tabId)).referenceImg
        if (
          galleryDropped === 'dispatched' &&
          filledAfterGalleryDrop === 2 &&
          referenceUrlAfterGalleryDrop === referenceUrlBeforeGalleryDrop
        ) {
          ok('إفلات على بطاقة «هاتف» عيّن مرجعها وحده — اللوحة الحيّة (مقاسها الآخر) لم تتأثّر')
        } else {
          fail(
            `إفلات المعرض لم يتصرّف كما يجب: dropped=${galleryDropped} filled=${filledAfterGalleryDrop} refBefore=${referenceUrlBeforeGalleryDrop} refAfter=${referenceUrlAfterGalleryDrop}`,
          )
        }

        // نفس الحدّ غير المتماثل أعلاه — بطاقة «هاتف» كُتبت من الصفحة، فتُقرأ من أصل الإضافة.
        const phoneRefCount = await inSW(`(async () => {
          const db = await new Promise((res, rej) => {
            const q = indexedDB.open('rasd')
            q.onsuccess = () => res(q.result)
            q.onerror = () => rej(q.error)
          })
          const all = await new Promise((res) => {
            const r = db.transaction('references', 'readonly').objectStore('references').getAll()
            r.onsuccess = () => res(r.result)
            r.onerror = () => res([])
          })
          return all.filter((r) => r.viewport === 'phone').length
        })()`)
        if (phoneRefCount > 0) {
          ok(`مرجع «هاتف» أيضًا في قاعدة الإضافة — ${phoneRefCount} سجلًّا`)
        } else {
          fail('مرجع «هاتف» غائب عن قاعدة الإضافة.')
        }

        // زرّ الإغلاق يطوي المعرض.
        const closeBtnRect = await inOverlay(
          tabId,
          `() => {
            const el = globalThis.__rasdCompare.host.layer.querySelector('.rasd-ov-vpg-icon')
            if (!el) return null
            const r = el.getBoundingClientRect()
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
          }`,
        )
        if (closeBtnRect) await clickAt(pageSession, closeBtnRect.x, closeBtnRect.y)
        await settleAsync(200)
        const galleryClosed = await inOverlay(
          tabId,
          `() => !globalThis.__rasdCompare.host.layer.querySelector('[data-rasd-ov="viewport-gallery"]')`,
        )
        if (galleryClosed) ok('زرّ الإغلاق يطوي المعرض')
        else fail('المعرض بقي مفتوحًا بعد نقر زرّ الإغلاق.')
      }

      // ── 8.7) المناطق المستثناة — ساعةٌ متغيّرة داخل منطقة ⟵ النسبة صفر (`STAGES/34`) ──
      /*
       * المرجع لقطةٌ للصفحة نفسها والطبقة مخفيّة، وساعةٌ تُكتب قبلها وتتغيّر بعدها — فالفرق الحيّ كلّه في الساعة،
       * معروف الموضع. بلا منطقة: نسبةٌ موجبة ومنطقةٌ متحرّكة، وهي الحالة التي يسقط عليها هذا القسم حين يُعطَّل
       * القناع في المحرّك (سجلّ `STAGES/34`). بمنطقة عنصرٍ فوق الساعة: صفرٌ ولا مناطق، والنسبة «على المناطق
       * المهمّة». ثمّ المنطقة تُحفظ مع المرجع وتعود معه، ومستطيلٌ مرسوم يؤدّي الشيء نفسه.
       *
       * أوّل قسمٍ يقود الفرق الحيّ من زرّ اللوحة إلى الخلفية ذهابًا وإيابًا — لا حارس غيره يمرّ به.
       */
      const dpr = await inPage(tabId, `() => window.devicePixelRatio`)
      const setClock = (text, background) =>
        inPage(
          tabId,
          `() => {
            let el = document.getElementById('rasd-verify-clock')
            if (!el) {
              el = document.createElement('time')
              el.id = 'rasd-verify-clock'
              el.style.cssText = 'position:fixed;top:120px;left:${vw - 320}px;width:200px;height:48px;' +
                'font:700 32px/48px monospace;color:#111;text-align:center;z-index:10'
              document.body.appendChild(el)
            }
            el.textContent = ${JSON.stringify(text)}
            el.style.background = ${JSON.stringify(background)}
            const r = el.getBoundingClientRect()
            return { x: r.x, y: r.y, w: r.width, h: r.height }
          }`,
        )
      const panelClick = (label) =>
        inOverlay(
          tabId,
          `() => {
            const btn = [...globalThis.__rasdCompare.host.layer.querySelectorAll('[data-rasd-ov="compare-panel"] button')]
              .find((b) => b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)})
            if (!btn) return false
            btn.click()
            return true
          }`,
        )
      const readLiveDiff = () =>
        inOverlay(
          tabId,
          `() => {
            const layer = globalThis.__rasdCompare.host.layer
            const section = layer.querySelector('[data-rasd-ov="compare-diff"]')
            const busy = [...layer.querySelectorAll('[data-rasd-ov="compare-panel"] button')]
              .some((b) => b.getAttribute('aria-busy') === 'true')
            return {
              busy,
              value: section?.querySelector('.rasd-ov-cmp-diff-value')?.textContent ?? null,
              count: [...(section?.querySelectorAll('.rasd-ov-cmp-diff-row') ?? [])]
                .find((r) => r.textContent.includes('عناصر تحرّكت'))
                ?.querySelector('.rasd-ov-cmp-diff-count')?.textContent ?? null,
              label: section?.querySelector('.rasd-ov-cmp-diff-label')?.textContent ?? null,
              excluded: section?.querySelector('[data-rasd-ov="compare-excluded"]')?.textContent ?? null,
              error: section?.querySelector('.rasd-ov-cmp-diff-error')?.textContent ?? null,
            }
          }`,
        )
      async function measureLive() {
        if (!(await panelClick('التقط الفرق'))) return null
        for (let i = 0; i < 60; i++) {
          await settleAsync(150)
          const d = await readLiveDiff()
          if (!d.busy && (d.value !== '—' || d.error)) return d
        }
        return null
      }
      const readZones = () =>
        inOverlay(
          tabId,
          `() => {
            const c = globalThis.__rasdCompare.compare.state
            const layer = globalThis.__rasdCompare.host.layer
            return {
              zones: c.zones.value.map((z) => ({ id: z.id, kind: z.anchor.kind, selector: z.anchor.selector ?? null, rect: z.anchor.rect })),
              rows: layer.querySelectorAll('[data-rasd-ov="compare-zone"]').length,
              marks: layer.querySelectorAll('[data-rasd-ov="compare-zone-mark"]').length,
            }
          }`,
        )

      if (dpr !== 1) {
        fail(`نسبة البكسل ${dpr} لا 1 — القسم يفترض مرجعًا بكسله بكسل النافذة`)
      } else {
        // المرجع: الطبقة مخفيّة كما يخفيها مسار الالتقاط نفسه، والساعة على «10:42».
        const clock = await setClock('10:42', '#fc6')
        await inOverlay(tabId, `() => globalThis.__rasdCompare.host.hide().then(() => true)`)
        const shot = await inSW(`chrome.tabs.captureVisibleTab(undefined, { format: 'png' })`)
        await inOverlay(tabId, `() => { globalThis.__rasdCompare.host.show(); return true }`)
        await inPage(
          tabId,
          `() => (async () => {
            const blob = await (await fetch(${JSON.stringify(shot)})).blob()
            const file = new File([blob], 'reference.png', { type: 'image/png' })
            const dt = new DataTransfer()
            dt.items.add(file)
            document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
            return 'dispatched'
          })()`,
        )
        await settleAsync(800)
        await setClock('11:59', '#36c')

        const plain = await measureLive()
        if (!plain || plain.error) {
          fail(`الفرق الحيّ بلا منطقة لم يُقَس: ${JSON.stringify(plain)}`)
        } else if (plain.value === '0%' || plain.count === '٠' || plain.excluded) {
          fail(`الساعة المتغيّرة لم تُعدّ فرقًا بلا منطقة: ${JSON.stringify(plain)}`)
        } else {
          ok(`بلا منطقة: الساعة المتغيّرة فرقٌ مقيس — ${plain.value}، ${plain.count} منطقة`)
        }

        // منطقة عنصر: «اختر عنصرًا» ثمّ نقرةٌ على الساعة نفسها.
        const cx = clock.x + clock.w / 2
        const cy = clock.y + clock.h / 2
        await panelClick('اختر عنصرًا')
        await moveTo(pageSession, cx, cy)
        await clickAt(pageSession, cx, cy)
        await settleAsync(600)
        let z = await readZones()
        const picked = z.zones[0]
        if (
          z.zones.length === 1 &&
          picked.kind === 'element' &&
          picked.selector?.includes('rasd-verify-clock') &&
          picked.rect.width === clock.w &&
          z.rows === 1 &&
          z.marks === 1
        ) {
          ok(`اختيار الساعة أنشأ منطقة عنصر «${picked.selector}» بمستطيلها، مرسومةً ومسرودة`)
        } else {
          fail(`منطقة العنصر لم تُنشأ كما يجب: ${JSON.stringify(z)}`)
        }

        const masked = await measureLive()
        if (
          masked &&
          !masked.error &&
          masked.value === '0%' &&
          masked.count === '٠' &&
          masked.label?.includes('على المناطق المهمّة') &&
          masked.excluded?.includes('منطقة')
        ) {
          ok(`بمنطقةٍ فوق الساعة: ${masked.value} «${masked.label}» — ${masked.excluded}`)
        } else {
          fail(`القناع لم يُسقط الساعة من الفرق: ${JSON.stringify(masked)}`)
        }

        // الحفظ مع المرجع: مغادرة الوضع ثمّ العودة تستدعي المرجع بمناطقه.
        await setMode(tabId, 'idle')
        await setMode(tabId, 'compare')
        await settleAsync(800)
        z = await readZones()
        if (z.zones.length === 1 && z.zones[0].id === picked?.id && z.rows === 1) {
          ok('المنطقة حُفظت مع المرجع وعادت معه بعد مغادرة الوضع')
        } else {
          fail(`المنطقة لم تعد مع المرجع: ${JSON.stringify(z)}`)
        }

        // مستطيلٌ مرسوم: حذف منطقة العنصر، ثمّ سحبٌ يحيط بالساعة.
        await panelClick('احذف المنطقة ١')
        await settleAsync(500)
        await panelClick('ارسم مستطيلًا')
        await pressAt(pageSession, clock.x - 4, clock.y - 4)
        await moveTo(pageSession, clock.x + clock.w + 4, clock.y + clock.h + 4)
        await releaseAt(pageSession, clock.x + clock.w + 4, clock.y + clock.h + 4)
        await settleAsync(600)
        z = await readZones()
        const drawnZone = await measureLive()
        if (
          z.zones.length === 1 &&
          z.zones[0].kind === 'rect' &&
          drawnZone?.value === '0%' &&
          drawnZone?.count === '٠'
        ) {
          ok(
            `مستطيلٌ مرسوم حول الساعة يُسقطها كذلك: ${JSON.stringify(z.zones[0].rect)} ⟵ ${drawnZone.value}`,
          )
        } else {
          fail(`المستطيل المرسوم لم يُسقط الساعة: ${JSON.stringify({ z, drawnZone })}`)
        }
        await panelClick('احذف المنطقة ١')
        await settleAsync(400)
      }
      await inPage(
        tabId,
        `() => { document.getElementById('rasd-verify-clock')?.remove(); return true }`,
      )

      // ── 9) مغادرة الوضع تمسح الحيّ، وإعادة الدخول تستدعي المحفوظ ──
      await setMode(tabId, 'idle')
      st = await readCompareState(tabId)
      drawn = await readDrawn(tabId)
      if (!st.reference && !drawn.dock) {
        ok('مغادرة الوضع مسحت المرجع الحيّ ولوحته')
      } else {
        fail(`بقايا بعد المغادرة: reference=${JSON.stringify(st.reference)} dock=${drawn.dock}`)
      }

      await setMode(tabId, 'compare')
      await settleAsync(500)
      st = await readCompareState(tabId)
      drawn = await readDrawn(tabId)
      if (st.reference && drawn.referenceImg?.startsWith('blob:')) {
        ok('إعادة دخول الوضع استدعت المرجع المحفوظ من IndexedDB تلقائيًّا')
      } else {
        fail(`لم يُستدعَ المرجع المحفوظ: reference=${JSON.stringify(st.reference)}`)
      }

      // ── 10) الخروج النهائي ينظّف كل شيء ───────────────────────
      await setMode(tabId, 'idle')
      drawn = await readDrawn(tabId)
      if (!drawn.idle && !drawn.panel && !drawn.dock) {
        ok('الخروج النهائي يمحو كل رسوم المقارنة')
      } else {
        fail(`رسوم باقية بعد الخروج: ${JSON.stringify(drawn)}`)
      }
    }
  }
}

// ── التقرير ─────────────────────────────────────────────────────
await g.finish({
  success: '✓ أداة المقارنة تعمل بدقّة فوق Chrome حقيقي.',
  failure: (n) => `✗ ${n} إخفاق.\n`,
})
