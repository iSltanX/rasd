/**
 * قفل المكتبة — `lock / *` و`library / locked` (`26 — Privacy` · `20 — Library`، `STAGES/08`).
 *
 * المسار كما يسلكه المستخدم في جلسة واحدة: المفتاح ← التفعيل (والرمزان مختلفان أوّلًا) ← «المكتبة محمية» ←
 * نافذة الإيقاف ← «اقفل الآن» ← المكتبة المقفلة ← رمزٌ خاطئ ← «نسيت الرمز». والتفعيل يقيس الدورات حقًّا على
 * هذا الجهاز — لا رقم مزروع.
 */

const CODE = 'رمز-المكتبة-٢٠٢٦'

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

const dialog = (id, phase) =>
  `document.querySelector('[data-data-dialog="${id}"]${phase ? `[data-phase="${phase}"]` : ''}')`

export default async function lock(ctx, mode) {
  let n = 0
  const settings = `${ctx.ORIGIN}/src/pages/settings/index.html?section=privacy`

  const page = await ctx.openPage(settings, mode)
  // بداية نظيفة لكل وضع: بلا قفلٍ ولا عدّاد محاولات تركه الوضع السابق.
  await page.evaluate(
    `Promise.all([chrome.storage.local.remove(['rasd:lock', 'rasd:lock-attempts']), chrome.storage.session.clear()]).then(() => true)`,
  )
  await page.evaluate('location.reload()')
  await page.waitFor(`document.querySelector('[data-lock-mode="off"]')`)

  await page.evaluate(`document.querySelector('[aria-label="قفل المكتبة"]').click()`)
  await page.waitFor(dialog('lock-setup', 'form'))
  await page.settle()
  await ctx.shot(page, 'lock / setup', mode)
  n++

  await page.evaluate(typeInto('#lock-new-code', CODE))
  await page.evaluate(typeInto('#lock-new-code-again', 'رمز-آخر'))
  await page.waitFor(dialog('lock-setup', 'mismatch'))
  await page.settle()
  await ctx.shot(page, 'lock / setup-mismatch', mode)
  n++

  await page.evaluate(typeInto('#lock-new-code-again', CODE))
  await page.settle()
  await page.evaluate(clickText('فعّل القفل'))
  await page.waitFor(dialog('lock-setup', 'enabled'), 15000)
  await page.settle()
  await ctx.shot(page, 'lock / enabled', mode)
  n++

  await page.evaluate(clickText('تمّ'))
  await page.waitFor(`document.querySelector('[data-lock-mode="unlocked"]')`)
  await page.evaluate(`document.querySelector('[aria-label="قفل المكتبة"]').click()`)
  await page.waitFor(dialog('lock-disable'))
  await page.settle()
  await ctx.shot(page, 'lock / disable', mode)
  n++

  await page.evaluate(clickText('ألغِ'))
  await page.evaluate(clickText('اقفل الآن'))
  await page.waitFor(`document.querySelector('[data-lock-mode="locked"]')`)
  await page.close()

  const library = await ctx.openPage(`${ctx.ORIGIN}/src/pages/library/index.html`, mode)
  await library.waitFor(dialog('lock-unlock', 'unlock'))
  await library.settle()
  await ctx.shot(library, 'library / locked', mode)
  n++

  await library.evaluate(typeInto('#lock-code', 'رمز-خاطئ-تمامًا'))
  await library.settle()
  await library.evaluate(clickText('افتح'))
  await library.waitFor(dialog('lock-unlock', 'wrong'), 15000)
  await library.settle()
  await ctx.shot(library, 'lock / unlock-wrong', mode)
  n++

  await library.evaluate(clickText('نسيت الرمز'))
  await library.waitFor(dialog('lock-forgot', 'forgot'))
  await library.evaluate(typeInto('#lock-forgot-word', 'احذف'))
  await library.settle()
  await ctx.shot(library, 'lock / forgot', mode)
  n++
  await library.close()

  return n
}
