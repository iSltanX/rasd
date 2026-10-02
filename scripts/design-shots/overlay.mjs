/**
 * الأدوات فوق الصفحة — كل حالة تُبلَغ بمسارها الحقيقي على عيّنة محلّية، ثم تُلتقط بالوضعين
 * (`59:2` · `64:2` · `62:2` · `65:2` · `69:2` وأخواتها في `Docs/Design.md §5`).
 *
 * **نسخة مرحلية من الإضافة لا نسختها المحمَّلة في المشغِّل:** البناء المشترك بلا صلاحية مضيف،
 * والحقن اليدوي يحتاج واحدة. فتُنسخ حزمة `artifacts/design/ext` إلى مجلّد مؤقّت خارج المستودع بصلاحية
 * `<all_urls>` (كما تفعل `verify-capturing.mjs`)، وتُحمَّل بجوار الأولى، ويُقلَّد الحقن والتشغيل:
 * `chrome.scripting` ← `startOverlay()` في العالم المعزول ← أوضاع ← مؤشِّر ولوحة مفاتيح بـCDP.
 *
 * **لا يُفترض وصول حدث:** كل إدخال يُتبع بانتظار أثره في إشارات الأداة، ثم إطارا رسم قبل اللقطة.
 * والحالات العابرة (الاستخراج · الالتقاط الكامل) تُلتقط ثم يُتحقَّق أنها لم تتبدّل أثناء اللقطة.
 *
 *   RASD_OVERLAY_ONLY=colour-error,measure node scripts/design-shots.mjs --no-build --only=overlay
 *
 * **بلا إطار في هذه المجموعة** (لا محرّك أو في النافذة): `capture / error` · `capture / permission` ·
 * `capture / restricted` · `measure / copied` · `measure / error` · `measure / restricted` ·
 * `inspect / restricted` · `colors / restricted` · `contrast-audit / restricted`. **وبلا مشغِّل حيّ:**
 * `contrast-audit / timeout` (صفحةٌ يتجاوز مسحها خمس ثوانٍ) و`contrast-audit / error`، و`colors / replace`
 * (`onReplaceColour` غير مُمرَّرة، §6 الصفّ 92) و`inspect / error` (`FrameBlocked` لا تُركَّب في
 * `overlay-app.tsx`؛ ما يرسمها معرض الأدوات وحده).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { attachLiveServiceWorker } from '../lib/live-sw.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const only = (process.env.RASD_OVERLAY_ONLY ?? '').split(',').filter(Boolean)

const RTL = '/rtl-ar/'
const COLOUR = '/colour/'
/** تدقيق التباين (`STAGES/14`): حالاتٌ معروفة، وعيّنةٌ كبيرة يطول مسحها فتُلتقط وهي تجري. */
const AUDIT = '/contrast-5000/cases.html'
const AUDIT_HUGE = '/contrast-5000/?n=300000'

// ── النسخة المرحلية والمشغِّل ──────────────────────────────────────

let rigPromise = null
const getRig = (ctx, mode) => (rigPromise ??= buildRig(ctx, mode))

async function buildRig(ctx, mode) {
  const stage = mkdtempSync(join(tmpdir(), 'rasd-overlay-shots-'))
  process.on('exit', () => rmSync(stage, { recursive: true, force: true }))
  cpSync(join(root, 'artifacts', 'design', 'ext'), stage, { recursive: true })
  const file = join(stage, 'manifest.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  // `captureVisibleTab` يشترط `<all_urls>` أو `activeTab`؛ صلاحية أصل واحد لا تكفي (كما في `verify-capturing`).
  manifest.host_permissions = ['<all_urls>']
  writeFileSync(file, JSON.stringify(manifest, null, 2))

  const { id } = await ctx.send('Extensions.loadUnpacked', { path: stage })
  let sw = await attachLiveServiceWorker(ctx.send, id)
  if (!sw.swSession) throw new Error('عامل الخدمة للنسخة المرحلية لم يجهز')

  /** يقيّم تعبيرًا في عامل الخدمة؛ ويعيد الارتباط مرّة إن أُنهي العامل. */
  const inSW = async (expression) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await ctx.send(
          'Runtime.evaluate',
          { expression, awaitPromise: true, returnByValue: true },
          sw.swSession,
        )
        if (res.exceptionDetails) {
          const d = res.exceptionDetails
          throw new Error(String(d.exception?.description ?? d.text).split('\n')[0])
        }
        return res.result.value
      } catch (e) {
        if (attempt > 0 || !/session|target|closed/i.test(String(e.message))) throw e
        sw = await attachLiveServiceWorker(ctx.send, id)
      }
    }
  }

  // صفحة إضافة قائدة: عامل الخدمة لا يرسل إلى نفسه، فرسائل المهامّ والإعدادات تمرّ منها كما تمرّ من النافذة.
  const driver = await ctx.openPage(`chrome-extension://${id}/src/pages/library/index.html`, mode)
  const rpc = (type, payload) =>
    driver.evaluate(
      `chrome.runtime.sendMessage({ __rasd: 1, id: 'overlay-shots-${type.replace(/\W/g, '-')}', type: ${JSON.stringify(type)}, payload: ${JSON.stringify(payload ?? null)} })`,
    )
  const patch = async (settings) => {
    const done = await rpc('settings/patch', { patch: settings })
    if (!done?.ok) throw new Error(`تعذّر ضبط الإعدادات: ${JSON.stringify(done)}`)
  }
  await patch({ onboarding: { completed: true, completedAt: Date.now() } })

  /**
   * يجمّد عامل الخدمة عند أوّل تعليمة تصله: الطلب المعلَّق عنده يبقى معلَّقًا في الصفحة، فتُلتقط حالة
   * «جارٍ…» كما تُرى فعلًا لا كما تُحاكى. تُعيد دالّة الإفراج.
   */
  const freeze = async () => {
    const worker = sw.swSession
    await ctx.send('Debugger.enable', {}, worker)
    await ctx.send('Debugger.pause', {}, worker)
    return async () => {
      await ctx.send('Debugger.resume', {}, worker).catch(() => undefined)
      await ctx.send('Debugger.disable', {}, worker).catch(() => undefined)
    }
  }
  /**
   * هل العامل واقف؟ تقييم بسيط يعمل حتى والعامل واقف (الطرفية تعمل عند التوقّف)، فيُستعمل وعدٌ
   * يحتاج مؤقّتًا: المؤقّتات وحدها لا تعمل والعامل واقف.
   */
  const frozen = async (ms = 1500) =>
    Promise.race([
      ctx
        .send(
          'Runtime.evaluate',
          { expression: 'new Promise((r) => setTimeout(r, 0)).then(() => 1)', awaitPromise: true },
          sw.swSession,
        )
        .then(() => false),
      sleep(ms).then(() => true),
    ])

  return { id, inSW, rpc, patch, freeze, frozen, close: () => driver.close() }
}

// ── جلسة على صفحة عيّنة ────────────────────────────────────────────

/**
 * يفتح عيّنة ويحقن الطبقة ويبدأها. يعيد مقبضًا: تقييم في العالم المعزول (`ev`)، ومؤشِّر ولوحة
 * مفاتيح، وانتظار أثر، ولقطة.
 */
async function openOverlay(ctx, rig, mode, path, prep) {
  const url = `${ctx.BASE}${path}`
  const page = await ctx.openPage(url, mode)
  if (prep) await page.evaluate(prep)
  const tabId = await rig.inSW(
    `chrome.tabs.query({}).then((ts) => Math.max(...ts.filter((t) => t.url === ${JSON.stringify(url)}).map((t) => t.id)))`,
  )
  await rig.inSW(
    `chrome.scripting.executeScript({ target: { tabId: ${tabId} }, files: ['content.js'] })`,
  )

  /** دالّة تعمل في العالم المعزول حيث يعيش المقبض `globalThis.__rasdShot`. */
  const ev = (fn, ...args) =>
    rig.inSW(
      `chrome.scripting.executeScript({ target: { tabId: ${tabId} }, world: 'ISOLATED', func: ${fn.toString()}, args: ${JSON.stringify(args)} }).then((r) => r[0].result)`,
    )
  const started = await ev(() =>
    globalThis.__rasdContent.startOverlay().then((r) => {
      if (r.ok) globalThis.__rasdShot = r.value
      return r.ok ? 'ok' : r.error.message
    }),
  )
  if (started !== 'ok') throw new Error(`تعذّر بدء الطبقة: ${started}`)

  const sid = page.sessionId
  const mouse = (type, x, y, extra = {}) =>
    ctx.send(
      'Input.dispatchMouseEvent',
      {
        type,
        x,
        y,
        pointerType: 'mouse',
        ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }),
        ...extra,
      },
      sid,
    )
  const o = {
    page,
    tabId,
    shots: 0,
    ev,
    mode: async (m) => {
      const ok = await ev((name) => globalThis.__rasdShot.modes.set(name).ok, m)
      if (!ok) throw new Error(`رُفض الانتقال إلى «${m}»`)
    },
    /** ينتظر حتى تعيد الدالّة قيمة صادقة؛ ويسمّي ما انتظره إن نفدت المهلة. */
    until: async (what, fn, args = [], timeoutMs = 8000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < timeoutMs) {
        const v = await ev(fn, ...args)
        if (v) return v
        await sleep(80)
      }
      throw new Error(`لم يتحقّق: ${what}`)
    },
    move: async (x, y) => {
      await mouse('mouseMoved', x, y)
      await page.settle()
    },
    /**
     * يحرّك المؤشِّر حتى يظهر أثره في الأداة — الحدث الأوّل بعد الدخول قد لا يصل، فلا يُفترض وصوله.
     */
    hover: async (what, x, y, fn, args = []) => {
      for (let i = 0; i < 30; i++) {
        await o.move(x + (i % 2), y)
        if (await ev(fn, ...args)) return
        await sleep(80)
      }
      throw new Error(`المؤشِّر لم يبلغ الأداة: ${what}`)
    },
    click: async (x, y, extra = {}) => {
      // حركة قبل الضغط: CDP لا يقبل الضغطة الأولى على نقطة لم يصلها المؤشِّر.
      await mouse('mouseMoved', x, y, extra)
      await page.settle()
      await mouse('mousePressed', x, y, extra)
      await mouse('mouseReleased', x, y, extra)
      await page.settle()
    },
    /** ينقر زرًّا في الطبقة وينتظر أثره؛ ويعيد النقر إن لم يظهر — النقرة لا يُفترض وصولها. */
    press: async (what, selector, text, fn, args = []) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const at = await o.centreInLayer(selector, text)
        if (!at) throw new Error(`الزرّ غائب: ${what}`)
        await o.click(at.x, at.y)
        if (await o.until(what, fn, args, 2500).catch(() => false)) return
      }
      throw new Error(`النقر لم يُحدث أثره: ${what}`)
    },
    drag: async (from, to) => {
      await mouse('mouseMoved', from.x, from.y)
      await mouse('mousePressed', from.x, from.y)
      for (let i = 1; i <= 6; i++) {
        await mouse(
          'mouseMoved',
          from.x + ((to.x - from.x) * i) / 6,
          from.y + ((to.y - from.y) * i) / 6,
          { button: 'left', buttons: 1 },
        )
        await page.settle()
      }
      await mouse('mouseReleased', to.x, to.y)
      await page.settle()
    },
    key: async (key, code, vk, modifiers = 0) => {
      const base = { key, code, windowsVirtualKeyCode: vk, modifiers }
      await ctx.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }, sid)
      await ctx.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sid)
      await page.settle()
    },
    /** مركز عنصر في صفحة العيّنة بإحداثيات النافذة. */
    centre: (selector) =>
      page.evaluate(`(() => {
        const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
      })()`),
    /** مركز زرّ في طبقتنا بنصّه أو بـ`aria-label` أو بصنفه. */
    centreInLayer: (selector, text = '') =>
      ev(
        (sel, txt) => {
          const el = [...globalThis.__rasdShot.host.layer.querySelectorAll(sel)].find((e) =>
            (e.textContent + (e.getAttribute('aria-label') ?? '')).includes(txt),
          )
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
        },
        selector,
        text,
      ),
    /** نصّ الإشعار المعروض، أو `null`. */
    notice: () =>
      ev(
        () =>
          globalThis.__rasdShot.host.layer
            .querySelector('[data-rasd-ov="notice"]')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() ?? null,
      ),
    waitNotice: async (fragment) => {
      try {
        await o.until(
          `إشعار يحوي «${fragment}»`,
          (f) =>
            (
              globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="notice"]')
                ?.textContent ?? ''
            ).includes(f),
          [fragment],
        )
      } catch (e) {
        throw new Error(`${e.message} — المعروض: ${JSON.stringify(await o.notice())}`, { cause: e })
      }
    },
    /**
     * لقطة مستقرّة: الطبقة ظاهرة (تُخفى أثناء لقطة الخلفية)، وإطارا رسم، وانتقالات الواجهة (≤200ms)
     * انتهت. و`guard` (في العالم المعزول) يُتحقَّق منه قبل اللقطة وبعدها، فلا تُقبل لقطة تبدّلت حالتها.
     */
    shoot: async (frame, guard, ...args) => {
      const visible = () => !globalThis.__rasdShot.host.layer.hasAttribute('data-rasd-hidden')
      for (let attempt = 0; attempt < 3; attempt++) {
        await o.until('الطبقة ظاهرة', visible)
        if (guard) await o.until(`حالة ${frame}`, guard, args)
        await sleep(250)
        await page.settle()
        await ctx.shot(page, frame, mode)
        if ((await ev(visible)) && (!guard || (await ev(guard, ...args)))) {
          o.shots++
          return
        }
      }
      throw new Error(`الحالة تبدّلت أثناء اللقطة: ${frame}`)
    },
    close: () => page.close(),
  }
  return o
}

/** يشغّل مشهدًا على جلسة جديدة ويغلقها مهما كان المآل. */
async function scene(ctx, rig, mode, path, prep, run) {
  const o = await openOverlay(ctx, rig, mode, path, prep)
  try {
    await run(o)
    return o.shots
  } finally {
    await o.close().catch(() => undefined)
  }
}

// ── عناصر مشتركة ───────────────────────────────────────────────────

/** الشبكة إلى وسط النافذة — البطاقات الثلاث أهدافُ الكشف والقياس والفحص. */
const SCROLL_GRID = `document.querySelector('.grid').scrollIntoView({ block: 'center' })`

/** الصفحة تصير بلا لون سوى الحياديات — مصدر «لا ألوان» في اللوحة. */
const BLANK_PAGE = `document.body.replaceChildren(); document.body.style.background = '#fff'`

// حرّاس الحالة: تُنفَّذ في العالم المعزول قبل اللقطة وبعدها.
/** هل يعرض الإشعار الحاليّ هذا الجزء؟ — تُنفَّذ في العالم المعزول. */
const hasNotice = (fragment) =>
  (
    globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="notice"]')?.textContent ?? ''
  ).includes(fragment)

/** خطأ القطّارة مثبَّتًا في الطبقة. */
const hasColourError = () =>
  !!globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="colour-error"]')

/** لوحة الصفحة مفتوحة بألوان مستخرَجة. */
const paletteShown = () => {
  const p = globalThis.__rasdShot.colourPalette.state
  return p.open.value && !p.extracting.value && p.swatches.value.length > 0
}

/** مرجع معروض فوق الصفحة مع لوحة المقارنة. */
const hasReference = () => {
  const l = globalThis.__rasdShot.host.layer
  return (
    !!globalThis.__rasdShot.compare.state.reference.value &&
    !!l.querySelector('[data-rasd-ov="compare-reference"]') &&
    !!l.querySelector('[data-rasd-ov="compare-panel"]')
  )
}

/** معرض المقاسات مفتوح وبطاقاته الأربع ممتلئة. */
const galleryFull = () => {
  const cards = [
    ...globalThis.__rasdShot.host.layer.querySelectorAll('[data-rasd-ov="viewport-card"]'),
  ]
  return cards.length === 4 && cards.every((c) => c.querySelector('img'))
}

/** نقطة في حشو البطاقة الأيمن لا على نصّها: الأداة تهدف إلى صندوق البطاقة نفسه. */
const cardPoint = async (o, selector) => {
  const c = await o.centre(selector)
  const right = await o.page.evaluate(
    `Math.round(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().right - 8)`,
  )
  return { x: right, y: c.y }
}

/** يرسم تحديدًا في وضع المنطقة وينتظر أن يستقرّ. */
async function drawArea(o) {
  await o.mode('area')
  const from = { x: 420, y: 250 }
  const to = { x: 980, y: 560 }
  for (let attempt = 0; attempt < 4; attempt++) {
    await o.drag(from, to)
    const ready = await o
      .until('تحديد جاهز', () => globalThis.__rasdShot.area.state.phase.value === 'ready', [], 1200)
      .catch(() => false)
    if (ready) return
  }
  throw new Error('تعذّر رسم التحديد')
}

/** يمرّر مؤشِّر وضع العنصر على البطاقة وينتظر إبرازها. */
async function hoverCard(o, selector) {
  const c = await cardPoint(o, selector)
  await o.hover(`الكشف عن ${selector}`, c.x, c.y, () => {
    const s = globalThis.__rasdShot.element.state
    return !!s.info.value && !!s.rect.value
  })
  return c
}

/** صفحةٌ نصوصها كلّها فوق حدّها — مصدر `contrast-audit / all-pass`. */
const PASSING_PAGE = `document.body.innerHTML = '<h1 style="color:#111">عنوانٌ واضح</h1><p style="color:#333">نصٌّ يبلغ حدّه.</p>'`

/** طور التدقيق — حارس اللقطة في العالم المعزول. */
const auditPhase = (phase) => globalThis.__rasdShot.audit.state.phase.value === phase

/** وضع الفحص ثمّ «دقّق تباين الصفحة» في لوحة خموله — المدخل الحقيقي. */
async function openAudit(o) {
  await o.mode('inspect')
  await o.until(
    'لوحة خمول الفحص',
    () => !!globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="audit-open"]'),
  )
  await o.press('دقّق تباين الصفحة', '[data-rasd-ov="audit-open"]', '', auditPhase, ['idle'])
  await o.until('لوحة التدقيق', () => globalThis.__rasdShot.audit.state.open.value)
}

/** «ابدأ التدقيق» حتى يبلغ الطور ما يُنتظر — والمسح الجاري بعد أوّل شريحة، كي يُرى تقدّمه. */
async function startAudit(o, phase) {
  await o.press('ابدأ التدقيق', '[data-rasd-ov="audit-start"]', '', () => {
    const s = globalThis.__rasdShot.audit.state
    return s.phase.value !== 'idle' && (s.phase.value !== 'scanning' || s.done.value > 0)
  })
  await o.until('طور التدقيق', auditPhase, [phase], 60000)
}

/** يثبّت عنصرًا في الفحص وينتظر اللوحة: القاعدة الفائزة والتتالي تُبنيان بعد الإفلات. */
async function pinInspect(o, selector) {
  await o.mode('inspect')
  const c = await cardPoint(o, selector)
  await o.hover(`فحص ${selector}`, c.x, c.y, () => !!globalThis.__rasdShot.inspect.state.rect.value)
  await o.click(c.x, c.y)
  await o.until('عنصر مثبَّت', () => !!globalThis.__rasdShot.inspect.state.detail.value, [], 15000)
}

/** يدخل وضع اللون وينتظر أن تصل اللقطة الأولى: الطبقة تُخفى أثناءها. */
async function enterColour(o) {
  await o.mode('colour')
  await o.until('لقطة العيّنة', () => globalThis.__rasdShot.colour.state.loading.value === false)
  await o.until(
    'الطبقة ظاهرة',
    () => !globalThis.__rasdShot.host.layer.hasAttribute('data-rasd-hidden'),
  )
}

/** يأخذ عيّنة من كتلة اللون ويثبّتها: المؤشِّر ← عيّنة حيّة ← نقرة ← لوحة. */
async function pinColour(o, selector) {
  const c = await o.centre(selector)
  await o.hover(
    `عيّنة ${selector}`,
    c.x,
    c.y,
    () => !!globalThis.__rasdShot.colour.state.live.value?.pixel,
  )
  await o.click(c.x, c.y)
  await o.until('لون مثبَّت', () => !!globalThis.__rasdShot.colour.state.pinned.value)
}

/** يفتح لوحة الصفحة باختصارها الحقيقي `Ctrl+K`. */
const openPalette = (o) => o.key('k', 'KeyK', 75, 2)

const paletteReady = (o) => o.until('ألوان مستخرَجة', paletteShown)

/**
 * صورة مرجعية بحجم النافذة من الصفحة نفسها بإزاحة وصبغة، فيظهر الفرق على جانبَي التقسيم.
 *
 * **بالبكسل المنطقي لا بكثافة الالتقاط:** لقطة CDP بكثافة الشاشة، فتحت `--dpr=2` تخرج 2880 عرضًا — والمرجع يُعرض
 * بمقاسه الطبيعي (`ReferenceOverlay`)، فيقع موضع الفاصل 50% على حافّة النافذة. التصغير إلى عرض النافذة يعيد
 * المشهد كما هو في 1× (حيث النسبة 1 فلا يتغيّر شيء).
 */
async function loadReference(ctx, o) {
  const { data } = await ctx.send('Page.captureScreenshot', { format: 'png' }, o.page.sessionId)
  await o.ev(async (b64) => {
    const bitmap = await globalThis.createImageBitmap(
      await (await fetch(`data:image/png;base64,${b64}`)).blob(),
    )
    const dpr = globalThis.devicePixelRatio || 1
    const width = Math.round(bitmap.width / dpr)
    const height = Math.round(bitmap.height / dpr)
    const canvas = new globalThis.OffscreenCanvas(width, height)
    const g = canvas.getContext('2d')
    g.drawImage(bitmap, 14, 10, width, height)
    g.fillStyle = 'rgba(184, 68, 46, 0.12)'
    g.fillRect(0, 0, width, 100)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    globalThis.__rasdRefFile = new File([blob], 'reference.png', { type: 'image/png' })
  }, data)
}

/** إفلات ملفّ المرجع على أول منطقة إفلات تطابق المحدِّد ولا صورة فيها. */
const dropReference = (o, selector) =>
  o.ev((sel) => {
    const zone = globalThis.__rasdShot.host.layer.querySelector(sel)
    if (!zone) return false
    const dt = new globalThis.DataTransfer()
    dt.items.add(globalThis.__rasdRefFile)
    zone.dispatchEvent(
      new globalThis.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }),
    )
    return true
  }, selector)

/** المراجع المحفوظة تُمحى قبل «بلا مرجع»: الدخول إلى المقارنة يستدعي مرجع الصفحة المحفوظ. */
const clearReferences = (rig) =>
  rig.inSW(`new Promise((resolve, reject) => {
    const open = indexedDB.open('rasd')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('references', 'readwrite')
      tx.objectStore('references').clear()
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    }
  })`)

const withoutDownloads = async (ctx, run) => {
  await ctx.send('Browser.setDownloadBehavior', { behavior: 'deny' })
  try {
    return await run()
  } finally {
    await ctx.send('Browser.setDownloadBehavior', { behavior: 'default' })
  }
}

// ── المشاهد ────────────────────────────────────────────────────────

const SCENES = [
  // ─ الالتقاط ─
  {
    id: 'capture-area',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, null, async (o) => {
        await drawArea(o)
        await o.shoot('capture / area-select')
      }),
  },
  {
    id: 'capture-element',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
        await o.mode('element')
        await hoverCard(o, '.card:nth-child(2)')
        await o.shoot('capture / element-hover')
      }),
  },
  {
    // مهمّة حقيقية من الخلفية: التقدّم يُلتقط بين مقطعين والطبقة ظاهرة، ثم يُتحقَّق أنه لم يتبدّل أثناء اللقطة.
    id: 'capture-fullpage',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, '/fullpage/', null, async (o) => {
        const status = () =>
          o.ev(() => {
            const l = globalThis.__rasdShot.host.layer
            const el = l.querySelector('[data-rasd-ov="full-page-status"]')
            return el && !l.hasAttribute('data-rasd-hidden')
              ? el.textContent.replace(/\s+/g, ' ').trim()
              : null
          })
        await rig.rpc('tool/activate', { tool: 'full-page', tabId: o.tabId })
        const t0 = Date.now()
        while (!o.shots && Date.now() - t0 < 30000) {
          const before = await status()
          if (before && !before.includes('٠ من ٠')) {
            await o.page.settle()
            await ctx.shot(o.page, 'capture / full-page', mode)
            if ((await status()) === before) o.shots++
          }
          await sleep(60)
        }
        await rig.rpc('fullpage/cancel', undefined)
        if (!o.shots) throw new Error('لم تُلتقط لوحة التقدّم مستقرّة')
      }),
  },
  {
    id: 'capture-success',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, null, async (o) => {
        await drawArea(o)
        await o.key('Enter', 'Enter', 13)
        await o.waitNotice('حُفظت اللقطة')
        await o.shoot('capture / success', hasNotice, 'حُفظت اللقطة')
      }),
  },
  {
    id: 'capture-element-success',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
        await o.mode('element')
        const c = await hoverCard(o, '.card:nth-child(2)')
        await o.click(c.x, c.y)
        await o.waitNotice('حُفظ العنصر')
        await o.shoot('capture / element-success', hasNotice, 'حُفظ العنصر')
      }),
  },
  {
    id: 'capture-cancelled',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, null, async (o) => {
        await o.mode('area')
        await o.key('Escape', 'Escape', 27)
        await o.waitNotice('أُلغي الالتقاط')
        await o.shoot('capture / cancelled', hasNotice, 'أُلغي الالتقاط')
      }),
  },
  {
    // الحافظة يرفضها المتصفّح نفسه: اللقطة تُحفظ أوّلًا ثم يفشل النسخ وحده.
    id: 'capture-clipboard',
    run: async (ctx, rig, mode) => {
      await rig.patch({ capture: { copyToClipboard: true } })
      await ctx.send('Browser.setPermission', {
        permission: { name: 'clipboard-write' },
        setting: 'denied',
        origin: ctx.BASE,
      })
      try {
        return await scene(ctx, rig, mode, RTL, null, async (o) => {
          await drawArea(o)
          await o.key('Enter', 'Enter', 13)
          await o.waitNotice('لم تُنسخ اللقطة')
          await o.shoot('capture / clipboard-denied', hasNotice, 'لم تُنسخ اللقطة')
        })
      } finally {
        await ctx.send('Browser.resetPermissions', {})
        await rig.patch({ capture: { copyToClipboard: false } })
      }
    },
  },

  // ─ القياس ─
  {
    id: 'measure-two',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
        await o.mode('measure')
        // بطاقة ثم الصورة تحتها: فجوة رأسية ومحاذاة الحافّة اليمنى، بلا تراكب بين شارات القياس.
        const a = await cardPoint(o, '.card:nth-child(1)')
        const b = await o.centre('.ph')
        await o.hover(
          'البطاقة الأولى',
          a.x,
          a.y,
          () => !!globalThis.__rasdShot.measure.state.hover.value,
        )
        await o.click(a.x, a.y)
        await o.until('مرجع مثبَّت', () => !!globalThis.__rasdShot.measure.state.reference.value)
        await o.hover(
          'الصورة',
          b.x,
          b.y,
          () => !!globalThis.__rasdShot.measure.state.comparison.value,
        )
        await o.shoot(
          'measure / two-elements',
          () => !!globalThis.__rasdShot.measure.state.comparison.value,
        )
      }),
  },
  {
    id: 'measure-idle',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
        await o.mode('measure')
        await o.until(
          'بطاقة الخمول',
          () => !!globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="measure-idle"]'),
        )
        await o.shoot('measure / idle')
      }),
  },
  {
    id: 'measure-cancelled',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
        await o.mode('measure')
        await o.key('Escape', 'Escape', 27)
        await o.waitNotice('خرجت من القياس')
        await o.shoot('measure / cancelled', hasNotice, 'خرجت من القياس')
      }),
  },

  // ─ الفحص ─ (`inspect / error` بلا مشغِّل: انظر ترويسة الملفّ)
  {
    id: 'inspect-selected',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
        await pinInspect(o, '.card:nth-child(2)')
        await o.shoot('inspect / element-selected')
      }),
  },
  {
    id: 'inspect-idle',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
        await o.mode('inspect')
        await o.until(
          'لوحة الخمول',
          () => !!globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="inspect-idle"]'),
        )
        await o.shoot('inspect / idle')
      }),
  },
  {
    // أزرار اللوحة تنزّل ملفًّا (لا نسخ)، فالإشعار «نُزّل الملفّ»؛ ويُمنع التنزيل نفسه كي لا يُكتب على القرص.
    id: 'inspect-copied',
    run: (ctx, rig, mode) =>
      withoutDownloads(ctx, () =>
        scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
          await pinInspect(o, '.card:nth-child(2)')
          await o.press('زرّ CSS في لوحة الفحص', '.rasd-ov-insp-btn', 'CSS', hasNotice, [
            'نُزّل الملفّ',
          ])
          await o.shoot('inspect / copied', hasNotice, 'نُزّل الملفّ')
        }),
      ),
  },
  {
    id: 'inspect-cancelled',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, SCROLL_GRID, async (o) => {
        await o.mode('inspect')
        await o.key('Escape', 'Escape', 27)
        await o.waitNotice('خرجت من الفحص')
        await o.shoot('inspect / cancelled', hasNotice, 'خرجت من الفحص')
      }),
  },

  // ─ تدقيق التباين ─ (`timeout` و`error` بلا مشغِّل: انظر ترويسة الملفّ)
  {
    id: 'audit-idle',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, AUDIT, null, async (o) => {
        await openAudit(o)
        await o.shoot('contrast-audit / idle', auditPhase, 'idle')
      }),
  },
  {
    id: 'audit-scanning',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, AUDIT_HUGE, null, async (o) => {
        await openAudit(o)
        await startAudit(o, 'scanning')
        await o.shoot('contrast-audit / scanning', auditPhase, 'scanning')
      }),
  },
  {
    id: 'audit-results',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, AUDIT, null, async (o) => {
        await openAudit(o)
        await startAudit(o, 'done')
        await o.press('أوّل نتيجة', '[data-rasd-ov="audit-row"]', '', () => {
          return globalThis.__rasdShot.audit.state.selected.value !== null
        })
        await o.shoot('contrast-audit / results', auditPhase, 'done')
      }),
  },
  {
    id: 'audit-all-pass',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, AUDIT, PASSING_PAGE, async (o) => {
        await openAudit(o)
        await startAudit(o, 'done')
        await o.shoot('contrast-audit / all-pass', auditPhase, 'done')
      }),
  },
  {
    id: 'audit-empty',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, AUDIT, BLANK_PAGE, async (o) => {
        await openAudit(o)
        await startAudit(o, 'done')
        await o.shoot('contrast-audit / empty', auditPhase, 'done')
      }),
  },
  {
    id: 'audit-cancelled',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, AUDIT_HUGE, null, async (o) => {
        await openAudit(o)
        await startAudit(o, 'scanning')
        await o.press('ألغِ', '[data-rasd-ov="audit-cancel"]', '', auditPhase, ['cancelled'])
        await o.shoot('contrast-audit / cancelled', auditPhase, 'cancelled')
      }),
  },

  // ─ الألوان ─ (`colors / replace` بلا مشغِّل: انظر ترويسة الملفّ)
  {
    id: 'colour-idle',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, COLOUR, null, async (o) => {
        await enterColour(o)
        await o.until(
          'لوحة الخمول',
          () => !!globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="colour-idle"]'),
        )
        await o.shoot('colors / idle')
      }),
  },
  {
    // اللون مثبَّت في اللوحة، والعدسة حيّة فوق كتلة أخرى.
    id: 'colour-sampling',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, COLOUR, null, async (o) => {
        await enterColour(o)
        await pinColour(o, '#var-bg')
        // العدسة على حدّ الأزرق والأحمر: مركزها الأزرق نفسه المثبَّت، فتتّفق شارتها السداسية مع اللوحة.
        const c = await o.page.evaluate(`(() => {
          const r = document.querySelector('.tw-blue').getBoundingClientRect()
          return { x: Math.round(r.left + 3), y: Math.round(r.top + r.height / 2) }
        })()`)
        await o.hover('العدسة', c.x, c.y, () => {
          const l = globalThis.__rasdShot.colour.state.live.value
          return !!l?.pixel && !!l.patch && l.pixel.b > 200 && l.pixel.r < 100
        })
        await o.shoot('colors / sampling', () => !!globalThis.__rasdShot.colour.state.pinned.value)
      }),
  },
  {
    id: 'colour-copied',
    run: async (ctx, rig, mode) => {
      await ctx.send('Browser.grantPermissions', {
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
        origin: ctx.BASE,
      })
      try {
        return await scene(ctx, rig, mode, COLOUR, null, async (o) => {
          await enterColour(o)
          await pinColour(o, '#var-bg')
          await o.press('زرّ نسخ HEX', 'button', 'انسخ القيمة السداسية', hasNotice, ['نُسخ اللون'])
          await o.shoot('colors / copied', hasNotice, 'نُسخ اللون')
        })
      } finally {
        await ctx.send('Browser.resetPermissions', {})
      }
    },
  },
  {
    id: 'colour-palette',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, COLOUR, null, async (o) => {
        await enterColour(o)
        await openPalette(o)
        await paletteReady(o)
        await o.shoot('colors / palette-extract', paletteShown)
      }),
  },
  {
    // الطلب معلَّق عند عامل الخدمة الواقف، فالحالة «جارٍ الاستخراج» حقيقية طوال اللقطة.
    id: 'colour-palette-extracting',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, COLOUR, null, async (o) => {
        await enterColour(o)
        const release = await rig.freeze()
        try {
          await openPalette(o)
          await sleep(700)
          if (!(await rig.frozen())) throw new Error('عامل الخدمة لم يقف — الاستخراج قد يكون انتهى')
          await o.page.settle()
          await ctx.shot(o.page, 'colors / palette-extracting', mode)
          o.shots++
        } finally {
          await release()
        }
        // بعد الإفراج يكتمل الطلب المعلَّق نفسه — فالوقوف كان عند استخراج حيّ لا عند حالة جامدة.
        await o.until('اكتمال الاستخراج بعد الإفراج', paletteShown)
      }),
  },
  {
    // صفحة بلا ألوان غير الحياديات مع إخفائها: استخراج حقيقي ينتهي بلا ألوان.
    id: 'colour-palette-empty',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, COLOUR, BLANK_PAGE, async (o) => {
        await enterColour(o)
        await openPalette(o)
        await o.until('لوحة مفتوحة منتهية', () => {
          const p = globalThis.__rasdShot.colourPalette.state
          return p.open.value && !p.extracting.value
        })
        await o.ev(() => globalThis.__rasdShot.colourPalette.setHideNeutrals(true))
        await o.until('لا ألوان بعد إخفاء الحياديات', () => {
          const p = globalThis.__rasdShot.colourPalette.state
          return !p.extracting.value && p.swatches.value.length === 0 && p.hideNeutrals.value
        })
        await o.shoot('colors / palette-empty')
      }),
  },
  {
    id: 'colour-palette-saved',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, COLOUR, null, async (o) => {
        await enterColour(o)
        await openPalette(o)
        await paletteReady(o)
        await o.press('زرّ «احفظ اللوحة»', '.rasd-ov-pal-btn', 'احفظ اللوحة', hasNotice, [
          'حُفظت اللوحة',
        ])
        await o.shoot('colors / palette-saved', hasNotice, 'حُفظت اللوحة')
      }),
  },
  {
    id: 'colour-scale',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, COLOUR, null, async (o) => {
        await enterColour(o)
        await pinColour(o, '#var-bg')
        await o.press(
          'زرّ «توليد الدرجات»',
          '.rasd-ov-cp-btn',
          'توليد الدرجات',
          () => globalThis.__rasdShot.colourScale.state.open.value,
        )
        await o.shoot('colors / scale', () => globalThis.__rasdShot.colourScale.state.open.value)
      }),
  },
  {
    id: 'colour-cancelled',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, COLOUR, null, async (o) => {
        await enterColour(o)
        await o.key('Escape', 'Escape', 27)
        await o.waitNotice('أُغلقت القطّارة')
        await o.shoot('colors / cancelled', hasNotice, 'أُغلقت القطّارة')
      }),
  },
  {
    // المستخدم يستثني الموقع من الإعدادات والقطّارة مفتوحة: تُرفض اللقطة التالية بسببها، والخطأ مثبَّت.
    id: 'colour-error',
    run: async (ctx, rig, mode) => {
      try {
        return await scene(ctx, rig, mode, COLOUR, null, async (o) => {
          await rig.patch({ privacy: { excludedSites: ['127.0.0.1'] } })
          await o.mode('colour')
          await o.until('خطأ القطّارة', () => !!globalThis.__rasdShot.colour.state.error.value)
          await o.until('الخطأ مرسوم', hasColourError)
          await o.shoot('colors / error', hasColourError)
        })
      } finally {
        await rig.patch({ privacy: { excludedSites: [] } })
      }
    },
  },

  // ─ المقارنة ─
  {
    id: 'compare-none',
    run: async (ctx, rig, mode) => {
      await clearReferences(rig)
      return scene(ctx, rig, mode, RTL, null, async (o) => {
        await o.mode('compare')
        await o.until(
          'حالة بلا مرجع',
          () => !!globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="compare-idle"]'),
        )
        await o.shoot('compare / no-reference')
      })
    },
  },
  {
    id: 'compare-split',
    run: (ctx, rig, mode) =>
      scene(ctx, rig, mode, RTL, null, async (o) => {
        await loadReference(ctx, o)
        await o.mode('compare')
        await o.until(
          'منطقة الإفلات',
          () => !!globalThis.__rasdShot.host.layer.querySelector('.rasd-ov-cmp-dropzone'),
        )
        await dropReference(o, '.rasd-ov-cmp-dropzone')
        await o.until('مرجع معروض', () => {
          const l = globalThis.__rasdShot.host.layer
          return (
            !!globalThis.__rasdShot.compare.state.reference.value &&
            !!l.querySelector('[data-rasd-ov="compare-reference"]') &&
            !!l.querySelector('[data-rasd-ov="compare-panel"]')
          )
        })
        await o.shoot('compare / split-reference', hasReference)
      }),
  },
  {
    // المعرض يُفتح من زرّ المقاس الحالي؛ وتُملأ بطاقاته الأربع بالإفلات كما يفعل المستخدم.
    id: 'compare-viewports',
    run: async (ctx, rig, mode) => {
      await clearReferences(rig)
      return scene(ctx, rig, mode, RTL, null, async (o) => {
        await loadReference(ctx, o)
        await o.mode('compare')
        await o.until(
          'منطقة الإفلات',
          () => !!globalThis.__rasdShot.host.layer.querySelector('.rasd-ov-cmp-dropzone'),
        )
        await dropReference(o, '.rasd-ov-cmp-dropzone')
        await o.until(
          'لوحة المقارنة',
          () => !!globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="compare-panel"]'),
        )
        await o.press(
          'زرّ المقاس الحالي',
          '.rasd-ov-cmp-vp-btn',
          '',
          () =>
            !!globalThis.__rasdShot.host.layer.querySelector('[data-rasd-ov="viewport-gallery"]'),
        )
        const cards = () =>
          o.ev(() => {
            const all = [
              ...globalThis.__rasdShot.host.layer.querySelectorAll(
                '[data-rasd-ov="viewport-card"]',
              ),
            ]
            return { total: all.length, filled: all.filter((c) => c.querySelector('img')).length }
          })
        await o.until(
          'معرض بأربع بطاقات',
          () =>
            globalThis.__rasdShot.host.layer.querySelectorAll('[data-rasd-ov="viewport-card"]')
              .length === 4,
        )
        for (let i = 0; i < 4; i++) {
          const { filled } = await cards()
          if (filled === 4) break
          await dropReference(o, '.rasd-ov-vpg-thumb-empty')
          await o.until(
            'بطاقة امتلأت',
            (n) =>
              [
                ...globalThis.__rasdShot.host.layer.querySelectorAll(
                  '[data-rasd-ov="viewport-card"]',
                ),
              ].filter((c) => c.querySelector('img')).length > n,
            [filled],
          )
        }
        await o.shoot('compare / viewports', galleryFull)
      })
    },
  },
]

export default async function overlay(ctx, mode) {
  const rig = await getRig(ctx, mode)
  let n = 0
  const failed = []
  // مرجع محفوظ لصفحة يستأنف المقارنة وحده عند فتحها (`compare/resume`) فيسرق الوضع من مشهد آخر.
  await clearReferences(rig)
  try {
    for (const s of SCENES) {
      if (only.length && !only.includes(s.id)) continue
      try {
        n += await s.run(ctx, rig, mode)
      } catch (e) {
        failed.push(`${s.id}: ${e.message}`)
      }
    }
  } finally {
    await clearReferences(rig).catch(() => undefined)
    // آخر الوضعين: تُغلق صفحة المشغِّل كي لا تبقى مفتوحة أمام مجموعات تليها.
    if (mode === 'light') {
      await rig.close().catch(() => undefined)
      rigPromise = null
    }
  }
  if (failed.length) throw new Error(`${n} لقطة، وسقط ${failed.length}: ${failed.join(' | ')}`)
  return n
}
