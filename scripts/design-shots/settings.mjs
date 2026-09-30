/** الإعدادات والخصوصية — الأقسام والعروض عبر `?section=` و`?view=` (`25 — Settings` · `26 — Privacy`). */

const SECTIONS = [
  ['settings / capture', 'capture', ''],
  ['settings / annotation', 'annotation', ''],
  ['settings / colors', 'colors', ''],
  ['settings / appearance', 'appearance', ''],
  ['settings / shortcuts', 'shortcuts', ''],
  ['settings / data', 'data', ''],
  ['settings / about', 'about', ''],
  ['privacy / controls', 'privacy', ''],
  ['privacy / permissions', 'privacy', 'permissions'],
]

const SITES = [
  // لا `*.bank.com` بجوار `bank.com`: النمطان واحد بعد التطبيع (`site-match.ts`)، والقائمة تمنع التكرار.
  'bank.com',
  'mail.google.com',
  'accounts.google.com',
  '*.gov.sa',
  'health.example.org',
  'pay.example.com',
]

/** يكتب نصًّا في حقل Preact ويُطلق `input` — القيمة تمرّ من `onInput` كما من لوحة المفاتيح. */
const typeInto = (selector, text) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(text)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

const clickText = (text) => `(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)})
  b?.click()
  return !!b
})()`

export default async function settings(ctx, mode) {
  let n = 0
  const url = (q) => `${ctx.ORIGIN}/src/pages/settings/index.html?${q}`
  const ready = `document.querySelector('main, [role="main"]')`

  // بداية نظيفة لكل وضع: الإعدادات الافتراضية، بلا مواقع مستثناة كتبها الوضع السابق.
  const reset = await ctx.openPage(url('section=capture'), mode)
  await reset.evaluate(`chrome.storage.local.remove('rasd:settings').then(() => true)`)
  await reset.close()

  for (const [frame, section, view] of SECTIONS) {
    const page = await ctx.openPage(url(`section=${section}${view ? `&view=${view}` : ''}`), mode)
    await page.waitFor(ready)
    await page.settle()
    await ctx.shot(page, frame, mode)
    await page.close()
    n++
  }

  // ── المواقع المستثناة: فارغة ← نمط غير صالح ← استيراد تالف ← حُفظ ← القائمة ──
  const sites = await ctx.openPage(url('section=privacy&view=excluded-sites'), mode)
  await sites.waitFor(ready)
  await sites.settle()
  await ctx.shot(sites, 'privacy / excluded-sites · empty', mode)
  n++

  await sites.evaluate(typeInto('[aria-label="نمط موقع يُستثنى"]', 'ليس نمطًا'))
  await sites.settle()
  await sites.evaluate(clickText('أضف'))
  await sites.waitFor(`document.querySelector('[aria-invalid="true"], [role="alert"]')`)
  await sites.settle()
  await ctx.shot(sites, 'privacy / excluded-sites · invalid', mode)
  n++

  await sites.evaluate(`(() => {
    const input = document.querySelector('input[type="file"]')
    const dt = new DataTransfer()
    dt.items.add(new File(['{ليس JSON'], 'sites.json', { type: 'application/json' }))
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`)
  await sites.waitFor(
    `[...document.querySelectorAll('[role="status"], [role="alert"]')].some((e) => /تعذّر|ملفّ/.test(e.textContent))`,
  )
  await sites.settle()
  await ctx.shot(sites, 'privacy / excluded-sites · import-error', mode)
  n++

  for (const [i, site] of SITES.entries()) {
    await sites.evaluate(typeInto('[aria-label="نمط موقع يُستثنى"]', site))
    await sites.settle()
    await sites.evaluate(clickText('أضف'))
    await sites.waitFor(
      `document.querySelectorAll('[aria-label$="من المواقع المستثناة"]').length === ${i + 1}`,
    )
  }
  await sites.waitFor(
    `(document.querySelector('[role="status"]')?.textContent ?? '').includes('أُضيف الموقع')`,
  )
  await sites.settle()
  await ctx.shot(sites, 'privacy / excluded-sites · saved', mode)
  n++
  await sites.close()

  const list = await ctx.openPage(url('section=privacy&view=excluded-sites'), mode)
  await list.waitFor(
    `document.querySelectorAll('[aria-label$="من المواقع المستثناة"]').length === ${SITES.length}`,
  )
  await list.settle()
  await ctx.shot(list, 'privacy / excluded-sites', mode)
  await list.close()
  n++

  // ── حُفظ وتعذّر الحفظ: مفتاح حقيقي، والتعذّر بكتابة ترفض قبل سكربتات الصفحة ──
  const saved = await ctx.openPage(url('section=capture'), mode)
  await saved.waitFor(ready)
  await saved.evaluate(`(document.querySelector('[role="switch"]')?.click(), true)`)
  await saved.waitFor(`document.querySelector('[role="status"]')`)
  await saved.settle()
  await ctx.shot(saved, 'settings / saved', mode)
  await saved.evaluate(`(document.querySelector('[role="switch"]')?.click(), true)`)
  await saved.close()
  n++

  const failing = await ctx.openPage(url('section=capture'), mode, {
    beforeLoad: `chrome.storage.local.set = () => Promise.reject(new Error('تعذّرت الكتابة'))`,
  })
  await failing.waitFor(ready)
  await failing.evaluate(`(document.querySelector('[role="switch"]')?.click(), true)`)
  await failing.waitFor(
    `[...document.querySelectorAll('[role="status"], [role="alert"]')].some((e) => /تعذّر|أعد/.test(e.textContent))`,
  )
  await failing.settle()
  await ctx.shot(failing, 'settings / save-error', mode)
  await failing.close()
  n++

  // ── ورقة الاختصارات من «لقطة جديدة» في الشريط الجانبي (`Docs/Design.md §11`) ──
  const sheet = await ctx.openPage(url('section=capture'), mode)
  await sheet.waitFor(ready)
  await sheet.evaluate(clickText('لقطة جديدة'))
  await sheet.waitFor(`document.querySelector('[role="dialog"]')`)
  await sheet.settle()
  await ctx.shot(sheet, 'shortcuts / sheet', mode)
  await sheet.close()
  n++

  return n
}
