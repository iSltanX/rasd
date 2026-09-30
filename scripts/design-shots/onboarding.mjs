/**
 * جولة التعريف و«ما الجديد» (`27 — Onboarding` · `whats-new / card` في `25 — Settings`).
 *
 * الخطوات الأربع بالرابط (`?step=N`) وبمقاس بطاقتها 420 × 560 مقصوصةً من وسط الصفحة، و«ما الجديد»
 * بإطارها كاملًا 1440 × 900: الإعدادات ‹ عن رصد ثمّ «اعرض».
 */

const STEPS = [1, 2, 3, 4]

export default async function onboarding(ctx, mode) {
  let n = 0
  for (const step of STEPS) {
    const page = await ctx.openPage(
      `${ctx.ORIGIN}/src/pages/onboarding/index.html?step=${step}`,
      mode,
    )
    await page.waitFor(`document.querySelector('main h1')`)
    await page.settle()
    const card = await page.rectOf('main > div')
    await ctx.shot(page, `onboarding / step-${step}`, mode, card ?? undefined)
    await page.close()
    n++
  }

  const about = await ctx.openPage(
    `${ctx.ORIGIN}/src/pages/settings/index.html?section=about`,
    mode,
  )
  await about.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'اعرض')`,
  )
  await about.evaluate(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'اعرض').click()`,
  )
  await about.waitFor(`document.querySelector('[role="dialog"] li')`)
  await about.settle()
  await ctx.shot(about, 'whats-new / card', mode)
  await about.close()
  n++

  return n
}
