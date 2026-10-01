/**
 * خطواتٌ تتكرّر في أكثر من مسار — كلٌّ منها **إيماءة مستخدم حقيقية** لا نداءٌ برمجي، وتعيد ما حُفظ فعلًا
 * في قاعدة `rasd` لا ما ادّعاه ردّ. الأحكام في ملفّات المسارات (`expect`)؛ وما هنا يفشل بصوتٍ عالٍ إن لم تتمّ
 * الخطوة أصلًا، فلا يُقرأ مسارٌ أخضر وقد سقطت مقدّمته.
 */
import { expect } from '@playwright/test'

/** ينتظر إطارين متتاليين — الأدوات تعيد التوجيه في الإطار المتزامن (`verify-measure.mjs`). */
export const settle = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/** تفعيل أداة كما تفعل النافذة: `tool/activate` من صفحة إضافة، ويُتحقَّق أن الجلسة بدأت. */
export async function activate(rasd, page, tool) {
  const tabId = await rasd.tabIdOf(page.url())
  expect(tabId, 'تبويب الهدف').not.toBeNull()
  const reply = await rasd.send('tool/activate', { tool, tabId })
  expect(reply, `تفعيل «${tool}»`).toMatchObject({ ok: true, value: { started: true, mode: tool } })
  return tabId
}

/**
 * تصوير منطقة بسحبٍ حقيقي ثمّ `↵`: يعيد سجلّ اللقطة من `captures`.
 * `rect` بالبكسل المنطقي وبأعداد صحيحة — فتبقى `round(x·dpr)` دقيقة ولا يُزاح الناتج بكسلًا. و`activate: false`
 * لمن بدّل الوضع بنفسه (شريط الأدوات مثلًا) ويريد السحب وحده.
 */
export async function captureArea(rasd, page, { x1, y1, x2, y2 }, { activate: doActivate = true } = {}) {
  const before = new Set((await rasd.db.all('captures')).map((c) => c.id))
  if (doActivate) await activate(rasd, page, 'area')
  // أوّل حركة بعد تبديل الوضع قد تُفقَد — تُنتظر الطبقة ثمّ يبدأ السحب.
  await page.mouse.move(x1, y1)
  await settle(page)
  await page.mouse.down()
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 5 })
  await page.mouse.move(x2, y2, { steps: 5 })
  await page.mouse.up()
  await settle(page)
  await page.keyboard.press('Enter')
  let created = null
  await expect
    .poll(
      async () => {
        created = (await rasd.db.all('captures')).find((c) => !before.has(c.id)) ?? null
        return created?.status
      },
      { message: 'لقطة جديدة محفوظة', timeout: 20_000 },
    )
    .toBe('ready')
  return created
}

/**
 * يحرّك الفأرة فوق نقطةٍ حتى تستجيب الأداة: أوّل حركة بعد تبديل الوضع قد تُفقَد، والتوجيه يجري في الإطار
 * المتزامن (`verify-measure.mjs`: «لا `setTimeout` أعمى»). فتُهزّ النقطة بكسلًا وتُستطلَع الجلسة بالمحكّ
 * المسمّى — لا زمنٍ مقدَّر. يعيد ما أرجعه `probe` حين يصير حقيقيًّا، ويرمي إن لم يصر.
 */
export async function hoverUntil(rasd, page, tabId, at, probe, what) {
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(at.x + (i % 2), at.y)
    await settle(page)
    const value = await rasd.session(tabId, probe)
    if (value) return value
    await page.waitForTimeout(100)
  }
  throw new Error(`لم تستجب الأداة فوق (${String(at.x)}, ${String(at.y)}): ${what}`)
}

/** نقرةٌ حقيقية في الموضع الحاليّ للفأرة — الأدوات تثبّت عند `pointerup`. */
export async function click(page) {
  await page.mouse.down()
  await page.mouse.up()
  await settle(page)
}

/** الوضع النشط في تبويب كما تعرفه الخلفية (`chrome.storage.session` — مصدر الحقيقة لأيقونة الشريط). */
export const modeOf = (rasd, tabId) =>
  rasd.sw.evaluate(
    async (id) => (await chrome.storage.session.get('rasd:session'))['rasd:session']?.modes?.[id] ?? null,
    tabId,
  )

/** مركز عنصرٍ في الصفحة بالبكسل المنطقي — من التخطيط الحيّ لا من أرقامٍ مكتوبة. */
export async function centreOf(page, selector) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`لا صندوق لـ${selector}`)
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), box }
}
