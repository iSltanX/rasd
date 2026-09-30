/** النافذة — الحالات الاثنتا عشرة من `popup-preview` (`13 — Extension Popup`). */

const POPUP_FRAMES = [
  'default',
  'no-recent',
  'capturing',
  'inspect-active',
  'colors',
  'success',
  'error',
  'cancelled',
  'first-run',
  'permission',
  'offline',
  'restricted',
]

export default async function popup(ctx, mode) {
  const page = await ctx.openPage(
    `${ctx.ORIGIN}/src/pages/popup-preview/index.html?theme=${mode}`,
    mode,
  )
  await page.waitFor(`document.querySelectorAll('.frame').length === ${POPUP_FRAMES.length}`)
  await page.settle()
  const rects = await page.evaluate(
    `[...document.querySelectorAll('.frame > [data-popup-state]')].map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height } })`,
  )
  for (const [i, name] of POPUP_FRAMES.entries()) {
    await ctx.shot(page, `popup / ${name}`, mode, rects[i])
  }
  await page.close()
  return POPUP_FRAMES.length
}
