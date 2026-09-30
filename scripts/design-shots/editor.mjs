/**
 * المحرّر وصفحة المقارنة والتصدير — كل حالة منفَّذة كما يرسمها Chrome (`15 — Annotation Editor` ·
 * `19 — Compare` · `22 — Export`).
 *
 * تُزرع اللقطات من صفحة الإضافة نفسها (أصل واحد ⇒ قاعدة واحدة)، فلا مسار خاصّ بالمشاهد: الصفحات
 * تُفتح برابطها الحقيقي وتُقاد بنقرات حقيقية. والحالات التي لا تُبلغ بلا عطل تُحقَن قبل تحميل
 * الصفحة (`installHooks`) لا بتعديل الشيفرة: تعليق الترميز لتبقى شاشة التقدّم، وفشله لشاشة الخطأ،
 * وتعليق فحص الحصّة لتبقى «جارٍ الحفظ»، وفشل معاملة الكتابة لإشعار تعذّر الحفظ.
 */

const W = 1280
const H = 800
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── ما يُنفَّذ داخل الصفحة ─────────────────────────────────────────
// الدوالّ الثلاث تُحوَّل إلى نصّ وتُقيَّم هناك؛ فلا تستعمل شيئًا من خارجها، والعالمي عبر `globalThis`.

/** يُقيَّم قبل سكربتات الصفحة: أعلام تتحكّم بها اللقطة لاحقًا، وما لا يجوز أن يحدث فعلًا. */
function installHooks() {
  const g = globalThis
  const flags = { bake: null, saveHold: false, saveFail: false }
  g.__rasd = flags

  // الترميز: تعليق (شاشة التقدّم) أو فشل (شاشة الخطأ). لا أثر ما لم يُرفع العلم.
  const encode = g.OffscreenCanvas.prototype.convertToBlob
  g.OffscreenCanvas.prototype.convertToBlob = function (...args) {
    if (flags.bake === 'hold') return new Promise(() => {})
    if (flags.bake === 'fail') return Promise.reject(new Error('محاكاة فشل الترميز'))
    return encode.apply(this, args)
  }

  // الحفظ: فحص الحصّة يسبق كل كتابة، فتعليقه يُبقي النتيجة «جارٍ الحفظ».
  const storage = g.navigator.storage
  const estimate = storage.estimate.bind(storage)
  storage.estimate = () => (flags.saveHold ? new Promise(() => {}) : estimate())

  // الكتابة الفاشلة: معاملة `annotations` تلقائيًّا ترمي، فيرجع `failed` من الحفظ التلقائي.
  const transaction = g.IDBDatabase.prototype.transaction
  g.IDBDatabase.prototype.transaction = function (names, mode, ...rest) {
    if (flags.saveFail && mode === 'readwrite' && [].concat(names).includes('annotations')) {
      throw new g.DOMException('محاكاة فشل الكتابة', 'UnknownError')
    }
    return transaction.call(this, names, mode, ...rest)
  }

  // لا ملفّ يُنزَّل فعلًا على مسار المرساة، ولا حافظة حقيقية في جلسة بلا تركيز.
  const click = g.HTMLAnchorElement.prototype.click
  g.HTMLAnchorElement.prototype.click = function () {
    return this.hasAttribute('download') ? undefined : click.call(this)
  }
  try {
    g.navigator.clipboard.write = () => new Promise(() => {})
  } catch {
    /* غير قابلة للكتابة — يبقى النداء الأصلي */
  }
}

/** صلاحية التنزيل: ممنوحة (مسار مُدار)، أو تُطلَب فيُجاب برفض (مسار المرساة مع الملاحظة). */
function installPermissionStubs(cfg) {
  const g = globalThis
  const perms = g.chrome.permissions
  const contains = perms.contains.bind(perms)
  perms.contains = (query, ...rest) =>
    cfg.granted && query?.permissions?.includes('downloads')
      ? Promise.resolve(true)
      : contains(query, ...rest)
  if (cfg.request) perms.request = () => Promise.resolve(cfg.request === 'allow')
  if (cfg.granted && !g.chrome.downloads) {
    g.chrome.downloads = { download: () => Promise.resolve(7), show: () => undefined }
  }
}

/** يزرع اللقطات: صورة صفحة وهمية لكل سجلّ، ومشهد التعليق حيث يلزم. */
async function seedInPage(spec) {
  const g = globalThis
  const font = (weight, size) => `${weight} ${size}px system-ui, sans-serif`

  /** صفحة موقع وهمية بالعربية: رأس وبطل وثلاث بطاقات. `b` نسخة تختلف قليلًا، و`h` أطول من 800 تزيد شريطًا. */
  async function drawPage(w, h, b) {
    const cv = new g.OffscreenCanvas(w, h)
    const c = cv.getContext('2d')
    const box = (x, y, bw, bh, fill, r = 0, edge = null) => {
      c.fillStyle = fill
      c.beginPath()
      c.roundRect(x, y, bw, bh, r)
      c.fill()
      if (edge) {
        c.strokeStyle = edge
        c.lineWidth = 1.5
        c.stroke()
      }
    }
    const text = (s, x, y, size, weight, color, align = 'right') => {
      // العربي يُرسم يمين-يسار، واللاتيني والأرقام الغربية يسار-يمين — وإلا انعكس ترتيب المقاطع.
      c.direction = /[\u0600-\u06FF]/.test(s) ? 'rtl' : 'ltr'
      c.font = font(weight, size)
      c.fillStyle = color
      c.textAlign = align
      c.textBaseline = 'alphabetic'
      c.fillText(s, x, y)
    }

    box(0, 0, w, h, '#f4f6fa')
    // الرأس
    box(0, 0, w, 72, '#ffffff')
    box(0, 72, w, 1, '#e3e7ee')
    box(1196, 20, 32, 32, '#2563eb', 10)
    text('Northwind', 1184, 44, 22, 700, '#0f172a')
    ;[
      ['المنتجات', 1000],
      ['الأسعار', 900],
      ['الدعم', 810],
      ['المدوّنة', 730],
    ].forEach(([label, x]) => text(label, x, 42, 16, 500, '#475569'))
    text('sara.otaibi@northwind.com', 40, 42, 15, 500, '#334155', 'left')

    // البطل
    box(40, 104, 560, 220, '#e0e7ff', 20)
    c.fillStyle = '#c7d2fe'
    c.beginPath()
    c.arc(500, 170, 46, 0, Math.PI * 2)
    c.fill()
    box(60, 236, 320, 70, '#ffffff', 14)
    text('تواصل معنا', 360, 260, 14, 500, '#64748b')
    text('+966 50 123 4567', 80, 292, 20, 600, '#0f172a', 'left')

    box(1000, 112, 240, 30, '#dbeafe', 15)
    text(b ? 'جديد · مزايا التتبّع' : 'جديد · الإصدار ٢٫٠', 1120, 133, 14, 600, '#1d4ed8', 'center')
    text(
      b ? 'أسرع وأوفر طريقة لشحن طلباتك' : 'أسرع طريقة لشحن طلباتك',
      1240,
      196,
      44,
      700,
      '#0f172a',
    )
    text('تابع كل شحنة من لحظة الطلب حتى باب العميل،', 1240, 244, 20, 400, '#475569')
    text('بأسعار واضحة وبلا رسوم خفيّة.', 1240, 276, 20, 400, '#475569')
    box(1000, 300, 240, 52, b ? '#16a34a' : '#2563eb', 12)
    text('ابدأ مجانًا', 1120, 333, 18, 600, '#ffffff', 'center')
    box(760, 300, 220, 52, '#ffffff', 12, '#cbd5e1')
    text('تحدّث إلى المبيعات', 870, 333, 17, 500, '#0f172a', 'center')

    // البطاقات الثلاث
    const cards = [
      { x: 870, name: 'الأساسية', price: '٤٩', hot: false },
      { x: 450, name: 'الاحترافية', price: b ? '١٠٩' : '٩٩', hot: true },
      { x: 30, name: 'المؤسسات', price: '٢٤٩', hot: false },
    ]
    for (const card of cards) {
      box(card.x, 400, 380, 340, '#ffffff', 20, card.hot ? '#2563eb' : '#e3e7ee')
      const right = card.x + 352
      text(card.name, right, 448, 22, 700, '#0f172a')
      text(`${card.price} ر.س / شهريًا`, right, 506, 34, 700, '#0f172a')
      ;['٥٠٠ شحنة شهريًا', 'تتبّع لحظي للشحنات'].forEach((line, i) =>
        text(`• ${line}`, right, 552 + i * 36, 17, 400, '#475569'),
      )
      if (card.hot) {
        box(card.x + 24, 424, 110, 28, '#2563eb', 14)
        text('الأكثر طلبًا', card.x + 79, 443, 13, 600, '#ffffff', 'center')
      }
    }

    // الذيل
    text('IBAN: SA03 8000 0000 6080 1016 7519', 40, 784, 14, 500, '#334155', 'left')
    text('© ٢٠٢٦ Northwind — جميع الحقوق محفوظة', w / 2, 782, 14, 400, '#64748b', 'center')
    if (h > 800) {
      box(0, 800, w, h - 800, '#0f172a')
      text(
        'شروط الخدمة · الخصوصية · الدعم',
        w / 2,
        800 + (h - 800) / 2 + 6,
        16,
        500,
        '#cbd5e1',
        'center',
      )
    }
    return cv.convertToBlob({ type: 'image/png' })
  }

  // ── بنّاءات المشهد ──
  const AMBER = 'tool/annotate/solid'
  const VIOLET = 'tool/inspect/solid'
  const PINK = 'tool/measure/solid'
  const DANGER = 'status/danger/solid'
  const pt = (x, y) => ({ space: 'device', x, y })
  const rc = (x, y, width, height) => ({ space: 'device', x, y, width, height })
  const base = (id, token, width = 4) => ({
    id,
    locked: false,
    rotation: 0,
    stroke: { colorToken: token, widthPx: width, dash: [], opacity: 1 },
  })
  const hideable = (id, token, width) => ({ ...base(id, token, width), hidden: false })
  const fontSpec = (sizePx) => ({ family: 'ui', sizePx, weight: 400, letterSpacingPx: 0 })

  /** تعليقات القراءة: مستطيل وشكل بيضاوي وسهم ونصّ ودبّوسان بملاحظتيهما وملاحظة حرّة. */
  const annotated = () => [
    {
      ...hideable('n-cta', AMBER),
      kind: 'rect',
      rect: rc(990, 290, 260, 72),
      radiusPx: 14,
      fill: 'none',
    },
    { ...hideable('n-badge', VIOLET), kind: 'ellipse', rect: rc(985, 100, 270, 54), fill: 'none' },
    {
      ...hideable('n-arrow', PINK),
      kind: 'arrow',
      a: pt(560, 372),
      b: pt(668, 476),
      head: 'end',
      headSizePx: 18,
    },
    {
      ...hideable('n-text', AMBER),
      kind: 'text',
      at: pt(1000, 374),
      text: 'الزرّ أصغر من المطلوب',
      font: fontSpec(20),
      maxWidthPx: 0,
      align: 'start',
      dir: 'auto',
    },
    {
      ...hideable('n-note1', AMBER),
      kind: 'note',
      at: pt(250, 128),
      widthPx: 300,
      title: 'حجم العنوان',
      body: 'العنوان ٤٤ بكسل والتصميم ٥٢، فيبدو أصغر من المطلوب.',
      tag: 'type',
      font: fontSpec(16),
      paddingPx: 12,
      pinId: 'n-pin1',
    },
    {
      ...hideable('n-note2', AMBER),
      kind: 'note',
      at: pt(50, 606),
      widthPx: 330,
      title: 'الفجوة بين البطاقات',
      body: 'الفجوة ٤٠ بكسل، والمعتمد في النظام ٢٤.',
      tag: 'spacing',
      font: fontSpec(16),
      paddingPx: 12,
      pinId: 'n-pin2',
    },
    {
      ...hideable('n-note3', AMBER),
      kind: 'note',
      at: pt(890, 606),
      widthPx: 330,
      title: 'لون الزرّ',
      body: 'لا يطابق رمز اللون الأساسي.',
      tag: 'token',
      font: fontSpec(16),
      paddingPx: 12,
      pinId: null,
    },
    {
      ...hideable('n-pin1', AMBER),
      kind: 'pin',
      at: pt(664, 172),
      shape: 'circle',
      ordinal: 1,
      noteId: 'n-note1',
      radiusPx: 13,
    },
    {
      ...hideable('n-pin2', AMBER),
      kind: 'pin',
      at: pt(846, 470),
      shape: 'circle',
      ordinal: 2,
      noteId: 'n-note2',
      radiusPx: 13,
    },
  ]

  /** مناطق الحجب الثلاث: تغطية للبريد، وبكسلة للـIBAN، وضبابي للهاتف. */
  const redacts = () => [
    {
      ...base('r-cover', DANGER),
      kind: 'redact',
      rect: rc(30, 22, 290, 34),
      mode: 'cover',
      strength: 0,
      coverToken: DANGER,
    },
    {
      ...base('r-pixel', DANGER),
      kind: 'redact',
      rect: rc(34, 766, 300, 26),
      mode: 'pixelate',
      strength: 8,
      coverToken: DANGER,
    },
    {
      ...base('r-blur', DANGER),
      kind: 'redact',
      rect: rc(70, 266, 190, 36),
      mode: 'blur',
      strength: 6,
      coverToken: DANGER,
    },
  ]

  const sceneOf = (id, nodes, crop = null) => ({
    schemaVersion: 1,
    captureId: id,
    source: { width: 1280, height: 800, dpr: 1 },
    meta: { crop, pinStart: 1, pinShape: 'circle' },
    nodes,
    revision: 0,
  })

  // ── الصور ──
  const pageA = await drawPage(1280, 800, false)
  const pageB = await drawPage(1280, 800, true)
  const pageTall = await drawPage(1280, 960, false)

  const now = Date.now()
  const captures = [
    ...spec.editorIds.map((id) => ({ id, title: 'صفحة الأسعار — Northwind', blob: pageA })),
    { id: 'cmp-a', title: 'الرئيسية — قبل التعديل', blob: pageA },
    { id: 'cmp-b', title: 'الرئيسية — بعد التعديل', blob: pageB },
    { id: 'cmp-same', title: 'الرئيسية — نسخة مطابقة', blob: pageA },
    { id: 'cmp-tall', title: 'الرئيسية — نسخة أطول', blob: pageTall, height: 960 },
  ]
  /** مشهد كل لقطة محرّر — الغائب يعني «لا تعليقات». */
  const scenes = {
    'ed-redact': () => [
      {
        ...hideable('n-cta', AMBER),
        kind: 'rect',
        rect: rc(990, 290, 260, 72),
        radiusPx: 14,
        fill: 'none',
      },
      ...redacts(),
    ],
    'ed-crop': () => annotated(),
  }
  for (const id of spec.editorIds) {
    if (id === 'ed-empty') continue
    if (!scenes[id]) scenes[id] = annotated
  }
  const crops = { 'ed-crop': rc(160, 100, 960, 540) }

  // ── القاعدة: تُنتظَر ولا تُنشأ هنا (فتحها بنسخة 1 على قاعدة غير مهيّأة يُنشئها فارغة) ──
  const need = ['captures', 'blobs', 'annotations']
  const db = await (async () => {
    for (let i = 0; i < 80; i++) {
      const list = await g.indexedDB.databases()
      if (list.some((d) => d.name === 'rasd')) {
        const opened = await new Promise((res, rej) => {
          const r = g.indexedDB.open('rasd')
          r.onsuccess = () => res(r.result)
          r.onerror = () => rej(r.error)
        })
        if (need.every((n) => opened.objectStoreNames.contains(n))) return opened
        opened.close()
      }
      await new Promise((r) => setTimeout(r, 150))
    }
    throw new Error('قاعدة rasd لم تجهز بمخازنها')
  })()

  const tx = db.transaction(need, 'readwrite')
  for (const cap of captures) {
    const height = cap.height ?? 800
    tx.objectStore('captures').put({
      id: cap.id,
      createdAt: now - 3 * 60 * 1000,
      origin: 'https://northwind.com',
      url: 'https://northwind.com/pricing',
      title: cap.title,
      kind: 'viewport',
      status: 'ready',
      projectId: null,
      tags: [],
      width: 1280,
      height,
      devicePixelRatio: 1,
      favorite: false,
      trashedAt: null,
      archived: false,
    })
    tx.objectStore('blobs').put({
      id: cap.id,
      blob: cap.blob,
      mime: 'image/png',
      bytes: cap.blob.size,
    })
    const build = scenes[cap.id]
    if (build) {
      const nodes = build()
      const redacted = nodes.filter((n) => n.kind === 'redact')
      tx.objectStore('annotations').put({
        captureId: cap.id,
        scene: sceneOf(cap.id, nodes, crops[cap.id] ?? null),
        updatedAt: now - 2 * 60 * 1000,
        schemaVersion: 1,
        redaction: {
          total: redacted.length,
          irreversible: redacted.filter((n) => n.mode === 'cover').length,
        },
      })
    } else {
      tx.objectStore('annotations').delete(cap.id)
    }
  }
  await new Promise((res, rej) => {
    tx.oncomplete = res
    tx.onerror = () => rej(tx.error)
  })
  db.close()
  return captures.length
}

const HOOKS = `(${installHooks})()`

// ── أدوات القيادة ──────────────────────────────────────────────────

/** جاهزية المحرّر: القماشان مبنيان بمقاس مسنَد (لا 300×150 الافتراضي) والصورة مرسومة فعلًا. */
const EDITOR_READY = `(() => {
  const s = document.querySelector('[data-editor-state]')
  const b = document.querySelector('[data-stage-layer="base"]')
  const a = document.querySelector('[data-stage-layer="annotations"]')
  if (!s || !b || !a || (b.width === 300 && b.height === 150)) return false
  if (b.width !== a.width || b.height !== a.height) return false
  return b.getContext('2d').getImageData(b.width >> 1, b.height >> 1, 1, 1).data[3] > 0
})()`

const mouse = (ctx, page, type, x, y) =>
  ctx.send(
    'Input.dispatchMouseEvent',
    {
      type,
      x,
      y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mousePressed' ? 1 : 0,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      pointerType: 'mouse',
    },
    page.sessionId,
  )

/** نقرة مؤشّر حقيقية على عنصر (تُكسب الصفحة إيماءة مستخدم كما في الاستعمال الفعلي). */
async function click(ctx, page, selector) {
  const at = await page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (!at) throw new Error(`لا عنصر: ${selector}`)
  await mouse(ctx, page, 'mouseMoved', at.x, at.y)
  await mouse(ctx, page, 'mousePressed', at.x, at.y)
  await mouse(ctx, page, 'mouseReleased', at.x, at.y)
}

/** نقرة برمجية — لتغيير حالة لا يُراد أثرها البصري (تمرير اللوحة، وتركيز الزرّ). */
const softClick = (page, selector) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) throw new Error('لا عنصر: ' + ${JSON.stringify(selector)})
    el.click()
  })()`)

/** سحبة بالمؤشّر بين نقطتين من إحداثيات الصفحة. */
async function drag(ctx, page, from, to) {
  await mouse(ctx, page, 'mouseMoved', from.x, from.y)
  await mouse(ctx, page, 'mousePressed', from.x, from.y)
  await mouse(ctx, page, 'mouseMoved', (from.x + to.x) / 2, (from.y + to.y) / 2)
  await mouse(ctx, page, 'mouseMoved', to.x, to.y)
  await mouse(ctx, page, 'mouseReleased', to.x, to.y)
}

/** يبعد المؤشّر عن كل عنصر كي لا تظهر حالة التمرير في اللقطة. */
const park = (ctx, page) => mouse(ctx, page, 'mouseMoved', 2, 2)

/** من إحداثيات الصورة إلى الصفحة — الملاءمة نفسها التي يحسبها المسرح (هامش 24). */
async function stageMap(page) {
  const g = await page.rectOf('[data-editor-stage]')
  const zoom = Math.min((g.width - 48) / W, (g.height - 48) / H)
  return (ix, iy) => ({
    x: g.x + (g.width - W * zoom) / 2 + ix * zoom,
    y: g.y + (g.height - H * zoom) / 2 + iy * zoom,
  })
}

async function ready(page) {
  await page.waitFor(EDITOR_READY, 15000)
  await page.settle()
  // الخطّ يُحمَّل عند أوّل رسم على القماش، فيُمهَل رسمَه الثاني.
  await sleep(400)
  await page.settle()
}

/** يفتح المحرّر على لقطة، ويشغّل الجسم، ويغلق الصفحة أيًّا كانت النتيجة. */
async function withEditor(ctx, mode, id, body) {
  const page = await ctx.openPage(`${ctx.ORIGIN}/src/pages/editor/index.html?capture=${id}`, mode, {
    beforeLoad: HOOKS,
  })
  try {
    await ready(page)
    await body(page)
  } finally {
    await page.close()
  }
}

/** تعديلٌ يُحفَظ: شكل الدبّوس ثمّ عودته — علامتان تُكتبان كتابة واحدة بعد التهدئة. */
async function edit(page) {
  await softClick(page, '[data-pin-shape="square"]')
  await sleep(120)
  await softClick(page, '[data-pin-shape="circle"]')
}

const setFlag = (page, flags) => page.evaluate(`Object.assign(__rasd, ${JSON.stringify(flags)}), 1`)

const stubPermissions = (page, cfg) =>
  page.evaluate(`(${installPermissionStubs})(${JSON.stringify(cfg)}), 1`)

async function openExport(ctx, page) {
  await click(ctx, page, '[data-export-open]')
  await page.waitFor(`document.querySelector('[data-export-modal]')`)
  await page.settle()
}

/** زرّ «تنزيل» في تذييل النافذة — لا وسم له، فيُعرف بنصّه. */
async function download(ctx, page) {
  const at = await page.evaluate(`(() => {
    const btn = [...document.querySelectorAll('[data-export-modal] footer button')].find((b) =>
      b.textContent.includes('تنزيل'),
    )
    if (!btn) return null
    const r = btn.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (!at) throw new Error('لا زرّ تنزيل')
  await mouse(ctx, page, 'mouseMoved', at.x, at.y)
  await mouse(ctx, page, 'mousePressed', at.x, at.y)
  await mouse(ctx, page, 'mouseReleased', at.x, at.y)
}

/** شاشة التقدّم عند نصف الطريق (المصدر مرسوم، والترميز معلَّق). */
const PROGRESS_AT_HALF = `(() => {
  const p = document.querySelector('[data-export-percent]')
  return !!document.querySelector('[data-export-progress]') && !!p && /50|٥٠/.test(p.textContent)
})()`

// ── الحالات ────────────────────────────────────────────────────────

const EDITOR_IDS = [
  'ed-main',
  'ed-text',
  'ed-saved',
  'ed-save-error',
  'ed-leave',
  'ed-redact',
  'ed-crop',
  'ed-empty',
]

export default async function editor(ctx, mode) {
  let n = 0
  const failed = []
  /** حالة واحدة: فشلها لا يمنع ما بعدها، ويُذكر باسمه. */
  const frame = async (name, run) => {
    try {
      await run()
      n++
    } catch (e) {
      failed.push(name)
      console.log(`    ! ${name} (${mode}) — ${e.message}`)
    }
  }
  const shoot = async (page, name) => {
    await park(ctx, page)
    await page.settle()
    await ctx.shot(page, name, mode)
  }

  // ── لقطة غير موجودة، وهي صفحة الزرع أيضًا (فتحُها يهيّئ القاعدة) ──
  await frame('editor / not-found', async () => {
    const page = await ctx.openPage(
      `${ctx.ORIGIN}/src/pages/editor/index.html?capture=missing`,
      mode,
      { beforeLoad: HOOKS },
    )
    try {
      await page.waitFor(`document.querySelector('[data-editor-state="not-found"]')`)
      await page.settle()
      await shoot(page, 'editor / not-found')
      await page.evaluate(`(${seedInPage})(${JSON.stringify({ editorIds: EDITOR_IDS })})`)
    } finally {
      await page.close()
    }
  })

  // ── المحرّر ──
  await frame('editor / annotating', () =>
    withEditor(ctx, mode, 'ed-main', (p) => shoot(p, 'editor / annotating')),
  )

  await frame('editor / exporting', () =>
    withEditor(ctx, mode, 'ed-main', async (p) => {
      await setFlag(p, { bake: 'hold' })
      await click(ctx, p, '[data-export-scale="1"]')
      await p.waitFor(PROGRESS_AT_HALF)
      await shoot(p, 'editor / exporting')
    }),
  )

  await frame('editor / redact', () =>
    withEditor(ctx, mode, 'ed-redact', async (p) => {
      // المنطقة المختارة تظهر في اللوحة، والتحديد يبقى بعد تبديل الأداة.
      await softClick(p, '[data-layer="r-cover"] [data-layer-select]')
      await click(ctx, p, '[data-tool="redact"]')
      await p.waitFor(`document.querySelector('[data-redact-panel]')`)
      await shoot(p, 'editor / redact')
    }),
  )

  await frame('editor / crop', () =>
    withEditor(ctx, mode, 'ed-crop', async (p) => {
      await click(ctx, p, '[data-tool="crop"]')
      await p.waitFor(`document.querySelector('[data-crop-bar]')`)
      await click(ctx, p, '[data-crop-preset="16:9"]')
      await sleep(200)
      await shoot(p, 'editor / crop')
    }),
  )

  await frame('editor / text', () =>
    withEditor(ctx, mode, 'ed-text', async (p) => {
      await click(ctx, p, '[data-tool="text"]')
      // سحبةٌ في الفراغ بين البطل والبطاقات تحدّد عرض اللفّ، ثمّ كتابة حيّة.
      const at = await stageMap(p)
      await drag(ctx, p, at(690, 366), at(940, 392))
      await p.waitFor(`document.querySelector('textarea')`)
      await sleep(150)
      await ctx.send('Input.insertText', { text: 'الشحن مجّاني فوق ٢٠٠ ر.س' }, p.sessionId)
      await sleep(250)
      await shoot(p, 'editor / text')
    }),
  )

  await frame('editor / empty', () =>
    withEditor(ctx, mode, 'ed-empty', async (p) => {
      await p.waitFor(`document.querySelector('[data-note-empty]')`)
      await shoot(p, 'editor / empty')
    }),
  )

  await frame('editor / saved', () =>
    withEditor(ctx, mode, 'ed-saved', async (p) => {
      await edit(p)
      await p.waitFor(`document.querySelector('[data-save-status="saved"]')`, 6000)
      await shoot(p, 'editor / saved')
    }),
  )

  await frame('editor / save-error', () =>
    withEditor(ctx, mode, 'ed-save-error', async (p) => {
      await setFlag(p, { saveFail: true })
      await edit(p)
      await p.waitFor(`document.querySelector('[data-save-banner]')`, 6000)
      await shoot(p, 'editor / save-error')
    }),
  )

  await frame('editor / leave-unsaved', () =>
    withEditor(ctx, mode, 'ed-leave', async (p) => {
      // الحصّة معلَّقة: الكتابة لا تنتهي، فالمشهد «غير محفوظ» ويسأل زرّ العودة قبل المغادرة.
      await setFlag(p, { saveHold: true })
      await edit(p)
      await p.waitFor(`document.querySelector('[data-save-status="saving"]')`, 6000)
      await click(ctx, p, '[aria-label="عودة إلى المكتبة"]')
      await p.waitFor(`document.querySelector('[role="alertdialog"]')`)
      await sleep(150)
      await shoot(p, 'editor / leave-unsaved')
    }),
  )

  // ── التصدير ──
  await frame('export / modal', () =>
    withEditor(ctx, mode, 'ed-main', async (p) => {
      await stubPermissions(p, { granted: true })
      await openExport(ctx, p)
      await shoot(p, 'export / modal')
    }),
  )

  await frame('export / loading', () =>
    withEditor(ctx, mode, 'ed-main', async (p) => {
      await stubPermissions(p, { granted: true })
      await setFlag(p, { bake: 'hold' })
      await openExport(ctx, p)
      await download(ctx, p)
      await p.waitFor(PROGRESS_AT_HALF)
      await shoot(p, 'export / loading')
    }),
  )

  await frame('export / cancelled', () =>
    withEditor(ctx, mode, 'ed-main', async (p) => {
      await stubPermissions(p, { granted: true })
      await setFlag(p, { bake: 'hold' })
      await openExport(ctx, p)
      await download(ctx, p)
      await p.waitFor(PROGRESS_AT_HALF)
      // ⎋ يُلغي الخبز فيعود المستخدم إلى النافذة نفسها.
      await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), 1`)
      await p.waitFor(
        `!document.querySelector('[data-export-progress]') && !!document.querySelector('[data-export-modal]')`,
      )
      await shoot(p, 'export / cancelled')
    }),
  )

  await frame('export / error', () =>
    withEditor(ctx, mode, 'ed-main', async (p) => {
      await stubPermissions(p, { granted: true })
      await setFlag(p, { bake: 'fail' })
      await openExport(ctx, p)
      await download(ctx, p)
      await p.waitFor(`document.querySelector('[data-export-modal] [data-export-error]')`, 15000)
      await shoot(p, 'export / error')
    }),
  )

  await frame('export / done', () =>
    withEditor(ctx, mode, 'ed-main', async (p) => {
      await stubPermissions(p, { granted: true })
      await openExport(ctx, p)
      await download(ctx, p)
      await p.waitFor(`document.querySelector('[data-export-result]')`, 15000)
      await shoot(p, 'export / done')
    }),
  )

  await frame('export / permission-denied', () =>
    withEditor(ctx, mode, 'ed-main', async (p) => {
      // الصلاحية غير ممنوحة والطلب يُرفض: يُسلك مسار المرساة وتُعلَن الخسارة.
      await stubPermissions(p, { granted: false, request: 'deny' })
      await openExport(ctx, p)
      try {
        await download(ctx, p)
        await p.waitFor(`document.querySelector('[data-export-result]')`, 15000)
        await shoot(p, 'export / permission-denied')
      } finally {
        // الرفض يُسجَّل للجلسة كلّها — يُمحى كي لا يتسرّب إلى ما بعده.
        await p.evaluate(`chrome.storage.session.remove('export.downloadsRefused').then(() => 1)`)
      }
    }),
  )

  // ── المقارنة ──
  const compare = async (name, query, opts = {}) => {
    const page = await ctx.openPage(
      `${ctx.ORIGIN}/src/pages/compare/index.html?${query}`,
      mode,
      opts,
    )
    try {
      await page.waitFor(opts.waitFor)
      await page.settle()
      await sleep(400)
      await shoot(page, name)
    } finally {
      await page.close()
    }
  }
  /** الحساب انتهى حين يكون مقام «من N» موجبًا — البطاقة تُركَّب بقيمة ابتدائية قبله. */
  const DIFFED = `(() => {
    const d = document.querySelector('[class*="ratioDetail"]')?.textContent ?? ''
    const m = d.match(/[\\d٠-٩]+/g)
    return !!m && m.some((x) => Number(x.replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 1632)) > 0)
  })()`

  await frame('compare / two-captures', () =>
    compare('compare / two-captures', 'a=cmp-a&b=cmp-b', { waitFor: DIFFED }),
  )
  await frame('compare / identical', () =>
    compare('compare / identical', 'a=cmp-a&b=cmp-same', { waitFor: DIFFED }),
  )
  await frame('compare / size-mismatch', () =>
    compare('compare / size-mismatch', 'a=cmp-a&b=cmp-tall', { waitFor: DIFFED }),
  )
  await frame('compare / error', () =>
    compare('compare / error', 'a=cmp-a&b=cmp-missing', {
      waitFor: `document.querySelector('[role="alert"]')`,
    }),
  )
  // فكّ الصورة معلَّق فتبقى الصفحة على شاشة التحميل.
  await frame('compare / loading', () =>
    compare('compare / loading', 'a=cmp-a&b=cmp-b', {
      beforeLoad: 'globalThis.createImageBitmap = () => new Promise(() => {})',
      waitFor: `document.querySelector('[aria-busy="true"]')`,
    }),
  )

  if (failed.length)
    console.log(`    ! سقطت ${failed.length} حالة (${mode}): ${failed.join(' · ')}`)
  return n
}
