/**
 * المكتبة والمشاريع — كل حالة تُبلَغ من الصفحة الحيّة لا من معاينة (`Docs/Design.md §5`).
 *
 * كل مشهد يبدأ بزرع مخزن `rasd` من صفحة الإضافة نفسها (الأصل واحد) بعد مسح مخازنه كلّها، فلا
 * يتسرّب مشهد إلى تاليه ولا يهمّ ترتيبهما. والحالات العابرة تُثبَّت بحقن عطل قبل سكربتات الصفحة:
 *   تحميل المكتبة   ← `navigator.storage.estimate` لا يردّ لنداء `loadQuota` وحده
 *   تحميل المشاريع  ← طلب `getAll` الصادر من `loadProjectOverview` لا يعود
 *   الخطأ           ← `indexedDB.open` يرمي
 *   فشل إنشاء مشروع ← حصّة تخزين مضغوطة عبر CDP، فيُرفض الحفظ برسالة المنتج نفسها
 * والحصّة تُعاد إلى أصلها بإغلاق الصفحة التي ضغطتها. و`RASD_SCENES="library / grid,projects / new"`
 * يقصر التشغيل على مشاهد بعينها (مطابقة جزئية لاسم الإطار) عند التكرار.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const LIBRARY = (query = '') => `/src/pages/library/index.html${query}`

// ── بيانات المشاهد ─────────────────────────────────────────────────

const PROJECTS = [
  { id: 'proj-mizan', name: 'تطبيق ميزان', color: '#0090FF', age: 40 * DAY },
  { id: 'proj-najm', name: 'موقع نجم', color: '#8E4EC6', age: 25 * DAY },
  { id: 'proj-hayat', name: 'متجر حياة', color: '#30A46C', age: 12 * DAY },
]

// [العنوان، الأصل، النوع، المشروع، الوسوم، مفضّلة، العمر]
const LIVE = [
  [
    'لوحة التحكم — نظرة عامّة',
    'app.mizan.sa',
    'area',
    'proj-mizan',
    ['واجهة', 'مراجعة'],
    true,
    25 * MIN,
  ],
  [
    'صفحة الهبوط — القسم الرئيسي',
    'www.najm.dev',
    'full-page',
    'proj-najm',
    ['تصميم'],
    false,
    3 * HOUR,
  ],
  [
    'نموذج تسجيل الدخول',
    'accounts.shafaf.com',
    'element',
    'proj-mizan',
    ['واجهة'],
    false,
    5 * HOUR,
  ],
  [
    'صفحة المنتج — جدول المقاسات',
    'shop.hayat.store',
    'viewport',
    'proj-hayat',
    ['تصميم', 'مراجعة'],
    false,
    1 * DAY,
  ],
  ['قائمة التنقّل الرئيسية', 'docs.rasmiyat.org', 'element', null, [], false, 1 * DAY + 4 * HOUR],
  ['جدول الفواتير', 'billing.tijara.io', 'area', 'proj-mizan', ['واجهة'], false, 2 * DAY],
  [
    'مدوّنة — مقال عن الخطوط العربية',
    'blog.khat.co',
    'full-page',
    'proj-najm',
    ['خطوط'],
    false,
    3 * DAY,
  ],
  ['صفحة الأسعار', 'www.najm.dev', 'viewport', 'proj-najm', ['تسعير', 'تصميم'], true, 4 * DAY],
  ['لوحة الإحصاءات', 'analytics.mizan.sa', 'area', 'proj-mizan', [], false, 6 * DAY],
  ['نافذة الإعدادات', 'app.mizan.sa', 'element', null, ['واجهة'], false, 9 * DAY],
  ['صفحة الخطأ ٤٠٤', 'www.najm.dev', 'viewport', 'proj-hayat', [], false, 12 * DAY],
  [
    'بطاقة المنتج — الحالة الخاملة',
    'shop.hayat.store',
    'area',
    'proj-hayat',
    ['تصميم'],
    false,
    15 * DAY,
  ],
]

const TRASHED = [
  ['مسودّة الصفحة الرئيسية', 'www.najm.dev', 'full-page', 2 * DAY],
  ['نافذة الدفع — نسخة قديمة', 'shop.hayat.store', 'viewport', 3 * DAY],
  ['شريط الإشعارات', 'app.mizan.sa', 'element', 5 * DAY],
  ['لقطة تجريبية', 'docs.rasmiyat.org', 'area', 8 * DAY],
]

const ARCHIVED = [
  ['تقرير الربع الأول', 'analytics.mizan.sa', 'full-page', 60 * DAY],
  ['هوية المتجر القديمة', 'shop.hayat.store', 'viewport', 75 * DAY],
]

const COLORS = [
  ['#0090FF', 'أزرق الواجهة', 'pixel'],
  ['#8E4EC6', 'بنفسجي العلامة', 'pixel'],
  ['#30A46C', 'أخضر النجاح', 'css'],
  ['#E5484D', 'أحمر الخطأ', 'css'],
  ['#FFB224', 'كهرماني التنبيه', 'manual'],
  ['#12A594', 'تركواز ثانوي', 'pixel'],
  ['#1C2024', 'رمادي النص', 'css'],
  ['#F0F0F3', 'رمادي الخلفية', 'css'],
]

const PALETTES = [
  [
    'ألوان تطبيق ميزان',
    ['#0090FF', '#0B3D91', '#E6F4FE', '#30A46C', '#E5484D', '#1C2024'],
    'proj-mizan',
  ],
  ['هوية موقع نجم', ['#8E4EC6', '#5B2A86', '#F1E7FA', '#FFB224', '#1C2024'], 'proj-najm'],
  ['لوحة المتجر', ['#30A46C', '#12A594', '#E6F6EB', '#F76B15', '#1C2024', '#FFFFFF'], 'proj-hayat'],
  ['ألوان الحالات', ['#30A46C', '#FFB224', '#E5484D', '#0090FF'], null],
]

const REFERENCES = [
  ['https://www.figma.com', '/design/mizan/dashboard', 'desktop', 'proj-mizan', 2 * HOUR],
  ['https://www.figma.com', '/design/najm/landing', 'desktop', 'proj-najm', 1 * DAY],
  ['https://www.figma.com', '/design/hayat/product-mobile', 'phone', 'proj-hayat', 3 * DAY],
  ['https://www.figma.com', '/design/mizan/tablet-layout', 'tablet', null, 6 * DAY],
]

const GUIDES = [
  ['تسجيل الدخول خطوةً بخطوة', 'proj-mizan', ['cap-0', 'cap-2', 'cap-5'], 1 * DAY],
  ['شراء منتج من المتجر', 'proj-hayat', ['cap-3', 'cap-11'], 4 * DAY],
  ['تعديل الإعدادات الأساسية', null, ['cap-9', 'cap-4'], 10 * DAY],
]

/** يبني حمولة الزرع. `projects`/`guides` يُسقطان نوعهما، و`everything: false` يفرغ المكتبة كلّها. */
function buildData(now, { projects = true, guides = true, everything = true } = {}) {
  if (!everything)
    return {
      now,
      captures: [],
      projects: [],
      colors: [],
      palettes: [],
      references: [],
      guides: [],
      tags: [],
      thumbs: [],
    }
  const keep = (id) => (projects ? id : null)
  const base = { devicePixelRatio: 2, status: 'ready', archived: false, trashedAt: null }
  const size = (kind) =>
    kind === 'full-page' ? [1280, 3400] : kind === 'element' ? [480, 320] : [1280, 720]
  const captures = []
  const thumbs = []
  LIVE.forEach(([title, host, kind, project, tags, favorite, age], i) => {
    const [width, height] = size(kind)
    captures.push({
      ...base,
      id: `cap-${i}`,
      createdAt: now - age,
      origin: `https://${host}`,
      url: `https://${host}/${i}`,
      title,
      kind,
      projectId: keep(project),
      tags,
      width,
      height,
      favorite,
    })
    thumbs.push({ id: `cap-${i}`, seed: i })
  })
  TRASHED.forEach(([title, host, kind, age], i) => {
    const [width, height] = size(kind)
    captures.push({
      ...base,
      id: `trash-${i}`,
      createdAt: now - 20 * DAY,
      origin: `https://${host}`,
      url: `https://${host}/t${i}`,
      title,
      kind,
      projectId: null,
      tags: [],
      width,
      height,
      favorite: false,
      trashedAt: now - age,
    })
    thumbs.push({ id: `trash-${i}`, seed: 20 + i })
  })
  ARCHIVED.forEach(([title, host, kind, age], i) => {
    const [width, height] = size(kind)
    captures.push({
      ...base,
      id: `arch-${i}`,
      createdAt: now - age,
      origin: `https://${host}`,
      url: `https://${host}/a${i}`,
      title,
      kind,
      projectId: null,
      tags: [],
      width,
      height,
      favorite: false,
      archived: true,
    })
    thumbs.push({ id: `arch-${i}`, seed: 30 + i })
  })

  const counts = new Map()
  for (const c of captures) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1)

  return {
    now,
    captures,
    thumbs,
    projects: projects
      ? PROJECTS.map((p, i) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          createdAt: now - p.age,
          updatedAt: now - i * DAY,
        }))
      : [],
    colors: COLORS.map(([hex, name, source], i) => ({
      id: `col-${i}`,
      hex,
      name,
      note: '',
      source,
      projectId: keep(i < 3 ? 'proj-mizan' : null),
      sourceUrl: null,
      createdAt: now - (i + 1) * 5 * HOUR,
    })),
    palettes: PALETTES.map(([name, cols, project], i) => ({
      id: `pal-${i}`,
      name,
      colors: cols,
      projectId: keep(project),
      createdAt: now - (i + 1) * 2 * DAY,
    })),
    references: REFERENCES.map(([origin, path, viewport, project, age], i) => ({
      id: `ref-${i}`,
      projectId: keep(project),
      origin,
      path,
      viewport,
      blobId: 'none',
      createdAt: now - age,
    })),
    guides: guides
      ? GUIDES.map(([title, project, ids, age], i) => ({
          id: `gd-${i}`,
          title,
          projectId: keep(project),
          captureIds: ids,
          createdAt: now - age,
        }))
      : [],
    tags: [...counts].map(([name, count]) => ({ name, count })),
  }
}

// ── الزرع من صفحة الإضافة ──────────────────────────────────────────

/**
 * يمسح المخازن العشرة ويكتب الحمولة في معاملة واحدة. المصغّرات صور مرسومة على قماش (صفحة مُحاكاة
 * بترويسة وبطاقات وأسطر) تُخزَّن في `thumbnails` بمفتاح اللقطة، فتقرؤها البطاقات كما في الاستعمال.
 */
const seedExpr = (data) => `(async (data) => {
  const STORES = ['captures','blobs','projects','colors','palettes','references','annotations','guides','tags','thumbnails']
  const db = await (async () => {
    for (let i = 0; i < 80; i++) {
      const list = await indexedDB.databases()
      if (list.some(d => d.name === 'rasd')) {
        const opened = await new Promise((res, rej) => {
          const r = indexedDB.open('rasd')
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
        })
        if (STORES.every(n => opened.objectStoreNames.contains(n))) return opened
        opened.close()
      }
      await new Promise(r => setTimeout(r, 150))
    }
    throw new Error('قاعدة rasd لم تجهز بمخازنها')
  })()

  const draw = (seed) => new Promise((res) => {
    let s = seed * 7919 + 13
    const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
    const c = document.createElement('canvas'); c.width = 550; c.height = 296
    const g = c.getContext('2d')
    const dark = seed % 3 === 0
    const hue = (seed * 47) % 360
    g.fillStyle = dark ? '#15171B' : '#F3F4F7'; g.fillRect(0, 0, 550, 296)
    g.fillStyle = 'hsl(' + hue + ',62%,46%)'; g.fillRect(0, 0, 550, 46)
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(500, 14, 30, 18)
    for (let i = 0; i < 4; i++) g.fillRect(340 - i * 62, 19, 44, 8)
    g.fillStyle = dark ? 'hsl(' + hue + ',40%,24%)' : 'hsl(' + hue + ',70%,90%)'
    g.fillRect(190, 70, 340, 92)
    g.fillStyle = dark ? '#E7E9EE' : '#1C2024'; g.fillRect(340, 84, 170, 12)
    g.fillStyle = dark ? '#8B90A0' : '#8B8D98'; g.fillRect(290, 108, 220, 7); g.fillRect(320, 122, 190, 7)
    g.fillStyle = 'hsl(' + hue + ',62%,46%)'; g.fillRect(430, 140, 80, 14)
    g.fillStyle = dark ? '#262A31' : '#FFFFFF'
    for (let i = 0; i < 3; i++) g.fillRect(20 + i * 0 + (2 - i) * 176, 182, 156, 88)
    g.fillStyle = dark ? '#3A3F49' : '#E0E1E6'
    for (let i = 0; i < 3; i++) {
      const x = 20 + (2 - i) * 176
      g.fillRect(x + 12, 194, 132, 40); g.fillRect(x + 12, 244, 100 + rnd() * 30, 7); g.fillRect(x + 12, 256, 70 + rnd() * 30, 7)
    }
    c.toBlob(res, 'image/png')
  })
  const blobs = new Map()
  for (const t of data.thumbs) blobs.set(t.id, await draw(t.seed))

  const tx = db.transaction(STORES, 'readwrite')
  for (const name of STORES) tx.objectStore(name).clear()
  for (const [store, rows] of [['captures', data.captures], ['projects', data.projects], ['colors', data.colors], ['palettes', data.palettes], ['references', data.references], ['guides', data.guides], ['tags', data.tags]]) {
    for (const row of rows) tx.objectStore(store).put(row)
  }
  for (const [id, blob] of blobs) tx.objectStore('thumbnails').put({ id, blob, width: 550, height: 296 })
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
  await new Promise(r => setTimeout(r, 200))
  const est = await navigator.storage.estimate()
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
})(${JSON.stringify(data)})`

// ── أعطال تُحقَن قبل سكربتات الصفحة ────────────────────────────────

/** تحميل المكتبة: تقدير الحصّة لا يردّ لنداء `loadQuota` وحده، فتبقى `reload()` معلَّقة والشريط الجانبي يحمَّل. */
const HOLD_LIBRARY = `(() => {
  Error.stackTraceLimit = 60
  const real = navigator.storage.estimate.bind(navigator.storage)
  navigator.storage.estimate = () =>
    new Error().stack.includes('loadQuota') ? new Promise(() => {}) : real()
})()`

/** تحميل المشاريع: طلب القراءة الصادر من `loadProjectOverview` يبقى بلا ردّ (يُبتلع حدث نجاحه). */
const HOLD_OVERVIEW = `(() => {
  Error.stackTraceLimit = 60
  const real = IDBObjectStore.prototype.getAll
  IDBObjectStore.prototype.getAll = function (...args) {
    const req = real.apply(this, args)
    if (new Error().stack.includes('loadProjectOverview')) {
      for (const type of ['success', 'error']) req.addEventListener(type, (e) => e.stopImmediatePropagation())
    }
    return req
  }
})()`

/** الخطأ: التخزين لا يفتح، فتسقط كل قراءة بنتيجة فاشلة. */
const FAIL_OPEN = `(() => {
  indexedDB.open = () => { throw new DOMException('التخزين لا يستجيب', 'UnknownError') }
})()`

// ── مساعدات الصفحة ─────────────────────────────────────────────────

const CARDS = `document.querySelectorAll('[data-capture-id]')`
/** بطاقات اللقطات مرسومة بمصغّراتها كلّها، مكتملة التحميل. */
const cardsReady = (n) => `(() => {
  const cards = [...${CARDS}]
  return cards.length >= ${n} && cards.every((c) => { const i = c.querySelector('img'); return i && i.complete && i.naturalWidth > 0 })
})()`
const text = (s) => `document.body.innerText.includes(${JSON.stringify(s)})`

/** ينقر عنصرًا بمحدِّد، أو بنصّ زرّه؛ يرمي إن غاب فلا تُلتقَط حالة خاطئة بصمت. */
const click = (page, selector) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) throw new Error('لا عنصر: ' + ${JSON.stringify(selector)})
    el.click(); return true
  })()`)
const clickText = (page, label) =>
  page.evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})
    if (!el) throw new Error('لا زرّ: ' + ${JSON.stringify(label)})
    el.click(); return true
  })()`)

/** يحدّد أوّل `n` بطاقات (مربّع الاختيار الأصلي في كل بطاقة). */
const selectCards = (page, n, attr = 'data-capture-id') =>
  page.evaluate(`(() => {
    const cards = [...document.querySelectorAll('[${attr}]')].slice(0, ${n})
    if (cards.length < ${n}) throw new Error('بطاقات أقل من ${n}')
    for (const card of cards) card.querySelector('input[type="checkbox"]').click()
    return cards.length
  })()`)

/** يكتب في حقل Preact: قيمة أصلية ثم حدث `input` يصعد. */
const typeInto = (page, selector, value) =>
  page.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) throw new Error('لا حقل: ' + ${JSON.stringify(selector)})
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true })); return true
  })()`)

const pickSwatch = (page, label) => click(page, `[role="radio"][aria-label="${label}"]`)

// ── المشاهد ────────────────────────────────────────────────────────

export default async function library(ctx, mode) {
  let shots = 0
  const only = (process.env.RASD_SCENES ?? '').split(',').filter(Boolean)

  /**
   * يزرع من صفحة أصل الإضافة؛ التقييم الواقع في مستند ابتدائي يُعاد. تُغلَق الصفحة إلا إن طُلب
   * إبقاؤها: تجاوز الحصّة عبر CDP يعيش بعمر جلسة الصفحة التي طلبته، وطلبه من نقطة المتصفّح يفشل
   * («Internal error») لأن نطاق التخزين لا يُعرَف إلا من جلسة صفحة.
   */
  async function seed(data, { keep = false } = {}) {
    const page = await ctx.openPage(`${ctx.ORIGIN}${LIBRARY()}`, mode)
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const estimate = await page.evaluate(seedExpr(data))
          return { estimate, page: keep ? page : null }
        } catch (e) {
          if (attempt >= 4) throw e
          await new Promise((r) => setTimeout(r, 300))
        }
      }
    } finally {
      if (!keep) await page.close()
    }
  }

  /**
   * مشهد واحد: زرع ← فتح ← انتظار الجاهزية ← فعل اختياري ← لقطة. `ratio` يضغط حصّة الأصل حتى
   * تبلغ نسبة الاستخدام ذلك الحدّ طوال المشهد.
   */
  async function scene(frame, spec) {
    if (only.length && !only.some((o) => frame.includes(o))) return
    const seeded = await seed(spec.data ?? buildData(Date.now()), { keep: !!spec.ratio })
    const holder = seeded.page
    if (holder) {
      await ctx.send(
        'Storage.overrideQuotaForOrigin',
        { origin: ctx.ORIGIN, quotaSize: Math.ceil(seeded.estimate.usage / spec.ratio) },
        holder.sessionId,
      )
    }
    const page = await ctx.openPage(`${ctx.ORIGIN}${LIBRARY(spec.query ?? '')}`, mode, {
      beforeLoad: spec.beforeLoad,
    })
    try {
      await page.waitFor(spec.ready, 15_000)
      if (spec.act) await spec.act(page)
      if (spec.after) await spec.after(page)
      await page.settle()
      await ctx.shot(page, frame, mode)
      shots++
      if (spec.next) {
        await spec.next(page)
        await page.settle()
        await ctx.shot(page, spec.nextFrame, mode)
        shots++
      }
    } finally {
      await page.close()
      if (holder) await holder.close()
    }
  }

  const full = () => buildData(Date.now())
  const gridReady = cardsReady(8)
  const overviewReady = `document.querySelectorAll('[data-overview-project]').length === 3 && [...document.querySelectorAll('[data-overview-project] img')].every((i) => i.complete && i.naturalWidth > 0) && document.querySelectorAll('[data-overview-project] img').length > 0`

  // ── المكتبة ─────────────────────────────────────────────────────
  await scene('library / grid', { data: full(), ready: gridReady })

  await scene('library / empty', {
    data: buildData(Date.now(), { everything: false }),
    ready: text('لا توجد لقطات بعد'),
  })

  await scene('library / loading', {
    data: full(),
    beforeLoad: HOLD_LIBRARY,
    ready: `!!document.querySelector('[aria-label="جارٍ تحميل المكتبة"]')`,
    after: () => new Promise((r) => setTimeout(r, 600)),
  })

  await scene('library / selection', {
    data: full(),
    ready: gridReady,
    act: async (page) => {
      await selectCards(page, 3)
      await page.waitFor(
        `!!document.querySelector('[role="toolbar"][aria-label="إجراءات التحديد"]')`,
      )
    },
  })

  await scene('library / palettes', {
    data: full(),
    query: '?view=palettes',
    ready: `document.querySelectorAll('[data-palette-id]').length === ${PALETTES.length}`,
  })

  await scene('library / references', {
    data: full(),
    query: '?view=references',
    ready: `document.querySelectorAll('[data-reference-id]').length === ${REFERENCES.length}`,
  })

  await scene('library / tags', {
    data: full(),
    ready: gridReady,
    act: async (page) => {
      await click(page, '[aria-label="فتح لوحة الوسوم"]')
      await page.waitFor(`document.querySelectorAll('[data-tag-name]').length >= 4`)
    },
  })

  /** المهملات: تُختار ثلاث لقطات وتُطلب حذفًا نهائيًا فيفتح الحوار. */
  const toTrashAndConfirm = async (page) => {
    await clickText(page, 'المهملات')
    await page.waitFor(
      `(() => { const ids = [...${CARDS}].map((c) => c.dataset.captureId); return ids.length === ${TRASHED.length} && ids.every((id) => id.startsWith('trash-')) })()`,
    )
    await selectCards(page, 3)
    await click(page, '[aria-label="حذف المحدَّد نهائيًا"]')
    await page.waitFor(`!!document.querySelector('[data-rasd-dialog="delete-confirm"]')`)
  }

  await scene('library / delete-confirm', {
    data: full(),
    ready: gridReady,
    act: toTrashAndConfirm,
    after: () => new Promise((r) => setTimeout(r, 300)),
  })

  await scene('library / deleted', {
    data: full(),
    ready: gridReady,
    act: async (page) => {
      await toTrashAndConfirm(page)
      await click(page, '[data-rasd-confirm="delete"]')
      // الإشعار يزول بعد أربع ثوانٍ — تُلتقط لقطته فور ظهوره.
      await page.waitFor(text('حُذف نهائيًا'))
    },
  })

  await scene('library / storage-warning', {
    data: full(),
    ratio: 0.87,
    ready: `${gridReady} && ${text('المساحة تكاد تمتلئ')}`,
  })

  await scene('library / error', {
    data: full(),
    beforeLoad: FAIL_OPEN,
    ready: text('تعذّرت قراءة المكتبة'),
  })

  await scene('guide / empty', {
    data: buildData(Date.now(), { guides: false }),
    query: '?view=guides',
    ready: text('لا أدلّة خطوات بعد'),
  })

  // ── المشاريع ────────────────────────────────────────────────────
  await scene('projects / overview', {
    data: full(),
    query: '?view=projects',
    ready: overviewReady,
  })

  await scene('projects / empty', {
    data: buildData(Date.now(), { projects: false }),
    query: '?view=projects',
    ready: text('لا مشاريع بعد'),
  })

  await scene('projects / loading', {
    data: full(),
    query: '?view=projects',
    beforeLoad: HOLD_OVERVIEW,
    ready: `!!document.querySelector('[aria-label="جارٍ تحميل المشاريع"]')`,
    after: () => new Promise((r) => setTimeout(r, 600)),
  })

  // لا حالة خطأ للمشاريع في الصفحة: فشل القراءة يُرسَم فراغًا. اللقطة توثّق الفعلي لا إطار Figma.
  await scene('projects / error-actual', {
    data: full(),
    query: '?view=projects',
    beforeLoad: FAIL_OPEN,
    ready: text('لا مشاريع بعد'),
  })

  const openPanel = async (page) => {
    await page.waitFor(overviewReady)
    await click(page, '[aria-label="فتح لوحة المشاريع"]')
    await page.waitFor(`!!document.querySelector('aside[aria-label="المشاريع"]')`)
  }

  await scene('projects / new', {
    data: full(),
    query: '?view=projects',
    ready: overviewReady,
    act: async (page) => {
      await openPanel(page)
      await typeInto(page, '[aria-label="اسم المشروع الجديد"]', 'تطبيق سنَد')
      await pickSwatch(page, 'برتقالي')
      await page.waitFor(
        `document.querySelector('[aria-label="اسم المشروع الجديد"]').value === 'تطبيق سنَد'`,
      )
    },
    next: async (page) => {
      await typeInto(page, '[aria-label="اسم المشروع الجديد"]', '')
      await pickSwatch(page, 'أزرق')
    },
    nextFrame: 'projects / new-empty',
  })

  await scene('projects / new-error', {
    data: full(),
    query: '?view=projects',
    ratio: 0.97,
    ready: overviewReady,
    act: async (page) => {
      await openPanel(page)
      await typeInto(page, '[aria-label="اسم المشروع الجديد"]', 'تطبيق سنَد')
      await clickText(page, 'إنشاء')
      await page.waitFor(text('تعذّر إنشاء المشروع'))
    },
  })

  await scene('projects / delete-confirm', {
    data: full(),
    query: '?view=projects',
    ready: overviewReady,
    act: async (page) => {
      await openPanel(page)
      await click(page, '[aria-label="حذف مشروع موقع نجم"]')
      await page.waitFor(
        `!!document.querySelector('[role="group"][aria-label="تأكيد حذف موقع نجم"]')`,
      )
    },
  })

  await scene('projects / created', {
    data: full(),
    query: '?view=projects',
    ready: overviewReady,
    act: async (page) => {
      await openPanel(page)
      await typeInto(page, '[aria-label="اسم المشروع الجديد"]', 'تطبيق سنَد')
      await pickSwatch(page, 'برتقالي')
      await clickText(page, 'إنشاء')
      await page.waitFor(
        `document.querySelectorAll('[data-project-id]').length === ${PROJECTS.length + 1} && document.querySelectorAll('[data-overview-project]').length === ${PROJECTS.length + 1}`,
      )
    },
  })

  return shots
}
