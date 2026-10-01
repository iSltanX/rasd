/**
 * تجهيزة Playwright لمسارات رصد — كروم حقيقي بالإضافة محمَّلة، وكثافةٌ حقيقية (`STAGES/18`، ADR 0045).
 *
 * **سياقٌ دائم لا سياقٌ مؤقّت.** الإضافة لا تُحمَّل في سياق Playwright العادي (يُقلع بملفّ تعريف مؤقّت
 * بلا إضافات)، فيُقلَع `launchPersistentContext` بملفّ تعريف نملكه. **والتحميل بـ`Extensions.loadUnpacked`
 * لا بـ`--load-extension`**: كروم المُعلَّم (النسخة ≥137) يتجاهل العلم، وهو ما بُنيت عليه النواة المشتركة
 * (`scripts/lib/cdp.mjs`) — فنستعمل دالّتها `loadExtension` نفسها ولا ننسخ لها نظيرًا.
 *
 * ولأن Playwright يتّصل بكروم عبر **أنبوب** (`--remote-debugging-pipe`) والنداء `Extensions.loadUnpacked`
 * نطاق مستوى المتصفّح لا الصفحة، يُفتح معه **منفذ تنقيح حرّ** (`--remote-debugging-port=0`) يُقرأ رقمه من
 * `DevToolsActivePort` في الملفّ الشخصي. المنفذان يعيشان معًا — قِيس — ولا منفذ ثابتًا يتصادم مع الحرّاس.
 *
 * **ما لا تفعله هذه الوحدة: لا تُصدر حكمًا.** تُقلع وتحمّل وتُعيد أدوات؛ كل `expect` يبقى في ملفّ المسار.
 *
 * **الكثافة حقيقية.** `--force-device-scale-factor` يجعل `devicePixelRatio` كثافة النافذة نفسها، فيلتقط
 * `captureVisibleTab` بالكثافة التي تُرسم بها الصفحة — لا بكثافةٍ محاكاة على تبويبٍ واحد. ويُتحقَّق منها
 * عند الإقلاع (`dprOf`) فلا يُقرأ مسارٌ بكثافةٍ ادّعاها الإعداد ولم يُطبِّقها المتصفّح.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test as base, chromium } from '@playwright/test'

import {
  connectCdp,
  loadExtension,
  sabotageList,
  stageExtension,
  waitForExtensionContext,
} from '../../../scripts/lib/cdp.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** أخطاء الصفحة المتوقَّعة التي لا تعني عطلًا — تُملأ بالدليل لا بالتخمين. */
const IGNORED_ERRORS = [
  // المتصفّح يطلب أيقونة التبويب من كل أصل، وعيّنات الخادم الثابت بلا `favicon.ico` — لا أثر للمنتج فيه.
  /Failed to load resource: the server responded with a status of 404 .*\/favicon\.ico\)$/,
]

/** يقرأ منفذ التنقيح الذي اختاره كروم — السطر الأوّل من `DevToolsActivePort`. */
async function debugPortOf(profile, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0])
      if (Number.isInteger(port) && port > 0) return port
    } catch {
      /* لم يُكتب بعد */
    }
    await sleep(100)
  }
  throw new Error('لم يكتب كروم DevToolsActivePort — تعذّر فتح منفذ التنقيح.')
}

/**
 * يُقلع كروم بالإضافة محمَّلة ويعيد أدوات المسار.
 *
 * @param {{ dpr: number, hostPermissions?: string[] }} o
 */
export async function launchRasd({ dpr, hostPermissions = ['<all_urls>'] }) {
  const chrome = process.env.RASD_E2E_CHROME
  const fixtures = process.env.RASD_E2E_FIXTURES
  if (!chrome || !fixtures) {
    throw new Error(
      'RASD_E2E_CHROME وRASD_E2E_FIXTURES يضعهما `pnpm test:e2e` — لا تشغّل playwright مباشرةً.',
    )
  }

  /*
   * **`<all_urls>` في نسخة الفحص وحدها.** `activeTab` لا تُمنح برمجيًّا (تمنحها إيماءة مستخدم على
   * الأيقونة، ولا CDP ولا Playwright يصطنعها)، و`captureVisibleTab` يرفض كل نمطٍ أضيق منها — قِيس في
   * `verify-capture.mjs`. فالحزمة المشحونة تبقى بلا صلاحية مضيف ويحرسها ذلك الحارس و`verify:dist`.
   */
  // `RASD_GUARD_SABOTAGE=<ملفّ في dist>[,…]` يكسر ما يقوده المسار في نسخة الفحص وحدها — السالب الذي
  // يثبت أن المسار يسقط حين يُكسر المنتَج (ADR 0042 §3)، بلا لمس ملفّ متتبَّع.
  const extPath = stageExtension({ prefix: 'e2e', hostPermissions, sabotage: sabotageList() })
  const profile = mkdtempSync(join(tmpdir(), 'rasd-e2e-'))

  const context = await chromium.launchPersistentContext(profile, {
    executablePath: chrome,
    headless: true,
    // لا نافذة مُحاكاة: المتصفّح يرسم بكثافته وحجم نافذته، والصفحة ترى ما يراه المستخدم.
    viewport: null,
    acceptDownloads: true,
    // `--disable-extensions` الافتراضي يقتل الإضافة، و`--enable-automation` يضيف شريطًا يُزيح الصفحة.
    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
    args: [
      '--enable-unsafe-extension-debugging',
      '--remote-debugging-port=0',
      `--force-device-scale-factor=${String(dpr)}`,
      `--window-size=${process.env.RASD_E2E_WINDOW ?? '1440,1100'}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
    ],
  })

  const cleanups = [
    () => context.close(),
    () => rmSync(extPath, { recursive: true, force: true }),
    () => rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  ]
  const close = async () => {
    for (const fn of cleanups) {
      try {
        await fn()
      } catch {
        /* التنظيف لا يُسقط الحكم */
      }
    }
  }

  try {
    const conn = await connectCdp(await debugPortOf(profile))
    if (!conn) throw new Error('تعذّر الاتصال ببروتوكول DevTools على منفذ التنقيح.')
    cleanups.unshift(() => conn.close())

    const loaded = await loadExtension(conn.send, extPath)
    if (!loaded.id) throw new Error(`Chrome رفض الحزمة: ${loaded.error}`)
    const extId = loaded.id

    const sw =
      context.serviceWorkers().find((w) => w.url().startsWith(`chrome-extension://${extId}/`)) ??
      (await context.waitForEvent('serviceworker', {
        timeout: 25_000,
        predicate: (w) => w.url().startsWith(`chrome-extension://${extId}/`),
      }))
    // الهدف يظهر قبل أن يكتمل إقلاعه — ينتظر `chrome.runtime.id` لا وجود الهدف (`live-sw.mjs`).
    const live = await waitForExtensionContext((expr) => sw.evaluate(expr))
    if (!live) throw new Error('لم يصر سياق الـservice worker حيًّا')

    /*
     * **جولة التعريف تُنتظر حتى تستقرّ قبل أن يفتح المسار أيّ صفحة.** ملفّ التعريف جديد في كل مسار، فكل مسار
     * تثبيتٌ: `onInstalled` يفتح صفحة التأهيل في الخلفية ثمّ **يُقدّمها** إن بقي ما كان في الواجهة فيها
     * (`install-flow.ts`، ADR 0028). فصفحةٌ يفتحها المسار في نافذة ذلك القرار تُخبَّأ خلفها لحظةَ يصل
     * `tabs.update`، فلا يعود تبويبها النشط — والالتقاط يرفض ما ليس نشطًا، والعيّنة اللونية تبقى بلا إطار،
     * بلا خطأ ولا إشعار. قِيس: ~19% من التشغيلات تسقط هكذا على جهازٍ محمَّل، وصفرٌ على جهازٍ هادئ. وفي غياب
     * أي صفحةٍ أخرى القرار حتمي — الجولة تتقدّم — فننتظر ذلك بعينه لا مهلةً مقدَّرة.
     */
    const tour = `chrome-extension://${extId}/src/pages/onboarding/`
    const settled = await (async () => {
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline) {
        const front = await sw.evaluate(
          async (prefix) =>
            (await chrome.tabs.query({ active: true })).some((t) =>
              (t.url || t.pendingUrl || '').startsWith(prefix),
            ),
          tour,
        )
        if (front) return true
        await sleep(100)
      }
      return false
    })()
    if (!settled) throw new Error('جولة التعريف لم تتقدّم إلى الواجهة — تعذّر استقرار الإقلاع.')

    /** أخطاء كل صفحة وعامل — تُجمَع لتُحكَم في نهاية المسار. */
    const errors = []
    const watch = (page) => {
      page.on('pageerror', (e) => errors.push(`${page.url()} — ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error') {
          errors.push(`${page.url()} — console.error: ${m.text()} (${m.location().url})`)
        }
      })
    }
    context.pages().forEach(watch)
    context.on('page', watch)

    /**
     * **كل طلبٍ يخرج من الإضافة أو صفحاتها أو العيّنات** — يُحكم عليه في نهاية المسار: عيّنات الخادم المحلّي
     * وصفحات الإضافة والعناوين الداخلية (`blob:` · `data:`) مباحة، وما سواها طلبٌ خارجي. «رصد لا يُصدر أي
     * طلب» ادّعاءٌ في `fixtures-serve.mjs` ومواد المتجر؛ ومسارٌ يمرّ من طرف إلى طرف هو المحكّ الأوسع له.
     */
    const requests = []
    const retries = []
    // الأصلان المحلّيان للعيّنات (5399 و5400) ومنفذ أيّ خادم عيّنات محلّي — كلّها على 127.0.0.1.
    const local =
      /^(http:\/\/127\.0\.0\.1:\d+\/|chrome-extension:\/\/|blob:|data:|about:|chrome:\/\/)/
    context.on('request', (req) => {
      if (!local.test(req.url())) requests.push(req.url())
    })

    return makeRasd({ context, sw, extId, dpr, fixtures, errors, requests, retries, close })
  } catch (e) {
    await close()
    throw e
  }
}

/** الأدوات التي تراها ملفّات المسارات. */
function makeRasd({ context, sw, extId, dpr, fixtures, errors, requests, retries, close }) {
  const origin = `chrome-extension://${extId}`

  /** يفتح صفحة ويصير تبويبها النشط — كما يفعل مستخدمٌ يفتح موقعًا. */
  const openPage = async (url) => {
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'load' })
    await page.bringToFront()
    // التبويب النشط في نافذته هو هذه الصفحة — لا يُقاد مسارٌ على صفحةٍ مخبَّأة.
    const front = () =>
      sw.evaluate(
        async () =>
          (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url ?? null,
      )
    for (let i = 0; i < 50 && (await front()) !== page.url(); i++) {
      await page.bringToFront()
      await sleep(100)
    }
    if ((await front()) !== page.url()) throw new Error(`الصفحة ${url} ليست التبويب النشط`)
    return page
  }

  /**
   * يفتح صفحة إضافة **في تبويب غير نشط** ويعيدها. الأوامر المرسَلة منها (`capture/run` وأخواتها) تشترط أن
   * يبقى تبويب الهدف هو النشط وإلا رفضته حراسة «التبويب النشط» بحقّ — فصفحة الإضافة لا تأخذ الأمامية.
   */
  const openExtensionPageInBackground = async (path, windowId) => {
    const url = `${origin}/${path}`
    await sw.evaluate(
      ([target, win]) => chrome.tabs.create({ url: target, active: false, windowId: win }),
      [url, windowId],
    )
    for (let i = 0; i < 100; i++) {
      const page = context.pages().find((p) => p.url().startsWith(url))
      if (page) {
        await page.waitForLoadState('load')
        return page
      }
      await sleep(100)
    }
    throw new Error(`لم تُفتح صفحة الإضافة ${path}`)
  }

  /**
   * جسر الرسائل: صفحة إضافة غير نشطة تُرسَل منها رسائل العقد (`tool/activate` · `capture/run` …). الـservice
   * worker لا يرسل لنفسه، وسكربت المحتوى لا يُصدَّق في تحديد تبويب غير تبويبه، فالمُرسِل الحقيقي لأوامر
   * النافذة صفحةُ إضافة — وهي بالضبط مسار النافذة في المنتج.
   */
  let bridgePage = null
  const bridge = async () => {
    if (bridgePage && !bridgePage.isClosed()) return bridgePage
    const win = await sw.evaluate(async () => (await chrome.windows.getLastFocused()).id)
    bridgePage = await openExtensionPageInBackground('src/pages/library/index.html', win)
    return bridgePage
  }
  /** يرسل رسالة عقد ويعيد الردّ كما هو: `{ ok, value }` أو `{ ok: false, error }`. */
  const send = async (type, payload) => {
    const page = await bridge()
    return page.evaluate(
      ([t, p]) =>
        chrome.runtime.sendMessage({ __rasd: 1, id: crypto.randomUUID(), type: t, payload: p }),
      [type, payload],
    )
  }

  /**
   * قراءة مباشرة من قاعدة `rasd` عبر الـservice worker — ما حُفظ فعلًا لا ما ادّعاه ردّ.
   *
   * **تنتظر القاعدة ولا تُنشئها.** فتحُ `rasd` على قاعدة لم تُولَد بعد يُنشئها فارغةً بلا مخازن فيسبق قراءتُنا
   * ترقيةَ التطبيق ويكسرها («object store was not found» — `verify-library.mjs`). فيُسأل `databases()` أوّلًا،
   * ولا يُفتح إلا ما ظهر بمخزنه.
   */
  const dbOp = (store, op, key = null) =>
    sw.evaluate(
      async ([name, kind, k]) => {
        const open = async () => {
          for (let i = 0; i < 100; i++) {
            const list = await indexedDB.databases()
            if (list.some((d) => d.name === 'rasd')) {
              const conn = await new Promise((res, rej) => {
                const r = indexedDB.open('rasd')
                r.onsuccess = () => res(r.result)
                r.onerror = () => rej(r.error)
              })
              if (conn.objectStoreNames.contains(name)) return conn
              conn.close()
            }
            await new Promise((r) => setTimeout(r, 100))
          }
          throw new Error(`قاعدة rasd لم تجهز بمخزن ${name}`)
        }
        const conn = await open()
        try {
          const rec = await new Promise((res, rej) => {
            const os = conn.transaction(name, 'readonly').objectStore(name)
            const q = kind === 'all' ? os.getAll() : os.get(k)
            q.onsuccess = () => res(q.result)
            q.onerror = () => rej(q.error)
          })
          if (kind !== 'blob') return rec
          if (!rec) return null
          // `Blob` لا يعبر بروتوكول DevTools — يُعاد base64.
          const bytes = new Uint8Array(await rec.blob.arrayBuffer())
          let bin = ''
          for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          }
          return btoa(bin)
        } finally {
          conn.close()
        }
      },
      [store, op, key],
    )
  const db = {
    all: (store) => dbOp(store, 'all'),
    get: (store, key) => dbOp(store, 'get', key),
    /** بايتات كتلة `blobs` كما حُفظت، base64. */
    blobBase64: (id) => dbOp('blobs', 'blob', id),
  }

  /**
   * ينفّذ دالّةً في **العالم المعزول** لتبويب — حيث يعيش سكربت المحتوى. الطبقة بجذر ظلّ **مغلق**
   * (`host.ts`): لا `locator` ولا `page.evaluate` يصلان إليها، والعالم الرئيسي لا يرى `__rasdSession`. وهو
   * المسار نفسه الذي تسلكه الحرّاس. **الدالّة تُمرَّر نصًّا** لا نداءً: الـservice worker يمنع `eval`
   * و`new Function` (CSP)، و`sw.evaluate(<نصّ>)` يمرّ من بروتوكول DevTools لا منه.
   */
  const isolated = (tabId, fn, arg = null) =>
    sw.evaluate(
      `chrome.scripting.executeScript({ target: { tabId: ${String(tabId)} }, world: 'ISOLATED', func: ${typeof fn === 'string' ? fn : fn.toString()}, args: [${JSON.stringify(arg)}] }).then((r) => r[0].result)`,
    )
  /** كالسابقة، والدالّة تتلقّى **جلسة الطبقة الحيّة** (`window.__rasdSession`) ثمّ الوسيط. */
  const session = (tabId, fn, arg = null) =>
    isolated(
      tabId,
      `async (a) => { const s = (await window.__rasdSession).value; return (${fn.toString()})(s, a) }`,
      arg,
    )
  /** مركز عنصرٍ داخل الطبقة بالبكسل المنطقي، أو `null` — أوّل عنصر يطابق المحدِّد ونصّه (إن ذُكر). */
  const overlayCentre = (tabId, selector, text = null) =>
    session(
      tabId,
      (s, [sel, txt]) => {
        const el = [...s.host.layer.querySelectorAll(sel)].find(
          (e) => txt === null || e.textContent.trim() === txt,
        )
        if (!el) return null
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
      },
      [selector, text],
    )
  /**
   * نقرةٌ **حقيقية** على زرٍّ في الطبقة: يُنتظر ظهوره ثمّ تُحرَّك الفأرة إليه (أوّل ضغطة على نقطةٍ لم
   * تصلها الفأرة تُسقَط — `verify-compare.mjs`) فتُضغَط وتُترك. الطبقة تستجيب للمؤشّر لا لـ`click()`.
   */
  const clickOverlay = async (page, tabId, selector, text = null) => {
    let at = null
    for (let i = 0; i < 100 && !at; i++) {
      at = await overlayCentre(tabId, selector, text)
      if (!at) await sleep(100)
    }
    if (!at) throw new Error(`لا عنصر في الطبقة: ${selector}${text ? ` «${text}»` : ''}`)
    await page.mouse.move(at.x, at.y)
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    )
    await page.mouse.down()
    await page.mouse.up()
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    )
  }

  return {
    /**
     * يفكّ PNGين في كروم ويقارن بكسلاتهما: الأبعاد، وعدد البكسلات المختلفة، ومستطيل اختلافها. الفكّ
     * فعليّ (`createImageBitmap`) لا قراءة توقيع — ما لا يُفتح لا يُقبل مهما بدأت بايتاته صحيحة.
     */
    diffPng: (page, aBase64, bBase64) =>
      page.evaluate(
        async ([a, b]) => {
          const decode = async (b64) => {
            const bmp = await createImageBitmap(
              await (await fetch(`data:image/png;base64,${b64}`)).blob(),
            )
            const cv = new OffscreenCanvas(bmp.width, bmp.height)
            const cx = cv.getContext('2d', { willReadFrequently: true })
            cx.drawImage(bmp, 0, 0)
            return {
              w: bmp.width,
              h: bmp.height,
              px: cx.getImageData(0, 0, bmp.width, bmp.height).data,
            }
          }
          const [A, B] = await Promise.all([decode(a), decode(b)])
          if (A.w !== B.w || A.h !== B.h) return { sameSize: false, a: [A.w, A.h], b: [B.w, B.h] }
          let differing = 0
          let x0 = A.w,
            y0 = A.h,
            x1 = -1,
            y1 = -1
          for (let y = 0; y < A.h; y++) {
            for (let x = 0; x < A.w; x++) {
              const i = (y * A.w + x) * 4
              if (
                A.px[i] !== B.px[i] ||
                A.px[i + 1] !== B.px[i + 1] ||
                A.px[i + 2] !== B.px[i + 2]
              ) {
                differing++
                if (x < x0) x0 = x
                if (y < y0) y0 = y
                if (x > x1) x1 = x
                if (y > y1) y1 = y
              }
            }
          }
          return {
            sameSize: true,
            w: A.w,
            h: A.h,
            differing,
            bbox: differing ? { x0, y0, x1, y1 } : null,
          }
        },
        [aBase64, bBase64],
      ),
    isolated,
    session,
    overlayCentre,
    clickOverlay,
    /** إعادات الإيماءات (`until`) — تُرفق بتقرير المسار فلا تُخفي تقطّعًا. */
    noteRetry: (note) => retries.push(note),
    retries,
    /** الطلبات الخارجية المرصودة حتى الآن — يجب أن تكون فارغة في كل مسار. */
    externalRequests: () => [...requests],
    context,
    sw,
    extId,
    origin,
    dpr,
    fixtures,
    errors,
    close,
    openPage,
    openExtensionPageInBackground,
    bridge,
    send,
    db,
    /** رقم التبويب وفق `chrome.tabs` — الصفحات في Playwright لا تعرفه. */
    tabIdOf: (url) =>
      sw.evaluate(
        async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)?.id ?? null,
        url,
      ),
    /** كثافة الصفحة كما يراها المتصفّح، لا كما ادّعاها الإعداد. */
    dprOf: (page) => page.evaluate(() => window.devicePixelRatio),
    /** أخطاء الصفحات بعد استبعاد المعلَنة. */
    unexpectedErrors: () => errors.filter((e) => !IGNORED_ERRORS.some((re) => re.test(e))),
  }
}

/** `test` بتجهيزة `rasd` وخيار `rasdDpr` (يضعه المشروع في `playwright.config.mjs`). */
export const test = base.extend({
  rasdDpr: [1, { option: true }],
  rasd: async ({ rasdDpr }, use, testInfo) => {
    const rasd = await launchRasd({ dpr: rasdDpr })
    try {
      await use(rasd)
    } finally {
      for (const note of rasd.retries) {
        testInfo.annotations.push({ type: 'gesture-retry', description: note })
      }
      await rasd.close()
    }
  },
})

export { expect } from '@playwright/test'
