/**
 * خطواتٌ تتكرّر في أكثر من مسار — كلٌّ منها **إيماءة مستخدم حقيقية** لا نداءٌ برمجي، وتعيد ما حُفظ فعلًا
 * في قاعدة `rasd` لا ما ادّعاه ردّ. الأحكام في ملفّات المسارات (`expect`)؛ وما هنا يفشل بصوتٍ عالٍ إن لم تتمّ
 * الخطوة أصلًا، فلا يُقرأ مسارٌ أخضر وقد سقطت مقدّمته.
 */
import { expect } from '@playwright/test'

/** ينتظر إطارين متتاليين — الأدوات تعيد التوجيه في الإطار المتزامن (`verify-measure.mjs`). */
export const settle = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/**
 * إيماءةٌ تُعاد **حتى يظهر أثرها** — لا حتى «تنتهي». علّة هذا موثَّقة في الحرّاس: أوّل ضغطة على نقطةٍ لم
 * تصلها الفأرة بعد تُسقَط (`verify-compare.mjs`)، وأوّل حركة بعد تبديل الوضع قد تُفقَد (`verify-measure.mjs`) —
 * فالمستخدم الحقيقي ينقر ثانيةً حين لا يرى أثرًا. **والإعادة مشروطة بغياب الأثر لا بالزمن**: الإيماءة لا
 * تُكرَّر إن كان أثرها قد ظهر، فلا يتضاعف حفظٌ ولا تُثبَّت عقدةٌ مرّتين.
 *
 * **ولا تُخفي التقطّع**: كل إعادةٍ تُسجَّل (`rasd.noteRetry`) فتظهر في تقرير المسار وفي خلاصة `--runs`؛
 * ومسارٌ يحتاج إعادةً في كل تشغيل يُقرأ منها قبل أن يُقرأ أخضر.
 *
 * @param {() => Promise<unknown>} gesture الإيماءة نفسها.
 * @param {() => Promise<unknown>} probe يعيد حقيقيًّا حين يظهر الأثر.
 */
export async function until(rasd, gesture, probe, { what, attempts = 3, waitMs = 3_000 }) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await gesture()
    const deadline = Date.now() + waitMs
    for (;;) {
      if (await probe()) {
        if (attempt > 1) rasd.noteRetry(`${what} — المحاولة ${String(attempt)}`)
        return
      }
      if (Date.now() > deadline) break
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error(`لم يظهر أثر الإيماءة بعد ${String(attempts)} محاولات: ${what}`)
}

/** أدوات لا تترك وضعًا قائمًا: تلتقط فور تفعيلها فيعود `mode: null`. */
const ONE_SHOT = new Set(['viewport', 'full-page'])

/** تفعيل أداة كما تفعل النافذة: `tool/activate` من صفحة إضافة، ويُتحقَّق أن الجلسة بدأت. */
export async function activate(rasd, page, tool) {
  const tabId = await rasd.tabIdOf(page.url())
  expect(tabId, 'تبويب الهدف').not.toBeNull()
  const reply = await rasd.send('tool/activate', { tool, tabId })
  expect(reply, `تفعيل «${tool}»`).toMatchObject({
    ok: true,
    value: { started: true, mode: ONE_SHOT.has(tool) ? null : tool },
  })
  return tabId
}

/**
 * تصوير منطقة بسحبٍ حقيقي ثمّ `↵`: يعيد سجلّ اللقطة من `captures`.
 * `rect` بالبكسل المنطقي وبأعداد صحيحة — فتبقى `round(x·dpr)` دقيقة ولا يُزاح الناتج بكسلًا. و`activate: false`
 * لمن بدّل الوضع بنفسه (شريط الأدوات مثلًا) ويريد السحب وحده.
 */
export async function captureArea(
  rasd,
  page,
  { x1, y1, x2, y2 },
  { activate: doActivate = true } = {},
) {
  const before = new Set((await rasd.db.all('captures')).map((c) => c.id))
  if (doActivate) await activate(rasd, page, 'area')
  const tabId = await rasd.tabIdOf(page.url())
  // السحب يُعاد حتى يصير التحديد «جاهزًا» (`phase`) — أوّل حركة بعد تبديل الوضع قد تُفقَد.
  await until(
    rasd,
    async () => {
      await page.mouse.move(x1, y1)
      await settle(page)
      await page.mouse.down()
      await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2, { steps: 5 })
      await page.mouse.move(x2, y2, { steps: 5 })
      await page.mouse.up()
      await settle(page)
    },
    async () => (await rasd.session(tabId, (s) => s.area.state.phase.value)) === 'ready',
    { what: 'تحديد منطقة' },
  )
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
export async function hoverUntil(rasd, page, tabId, at, probe, what, { waitMs = 20_000 } = {}) {
  const deadline = Date.now() + waitMs
  for (let i = 0; Date.now() < deadline; i++) {
    await page.mouse.move(at.x + (i % 2), at.y)
    await settle(page)
    const value = await rasd.session(tabId, probe)
    if (value) return value
    await page.waitForTimeout(100)
  }
  throw new Error(
    `لم تستجب الأداة فوق (${String(at.x)}, ${String(at.y)}): ${what} — ${await diagnose(rasd, tabId)}`,
  )
}

/**
 * ما تقوله الصفحة عن حالها لحظة السقوط: الوضع، والإشعار المعروض (سببُ فشل الالتقاط يظهر هناك)، والعناصر المرسومة.
 * يُلحَق برسالة كل سقوطٍ في انتظار — فيُقرأ السبب من التقرير لا بإعادة التشغيل.
 */
export async function diagnose(rasd, tabId) {
  try {
    const state = await rasd.session(tabId, (s) => ({
      mode: s.modes.mode.value,
      notice: s.host.layer.querySelector('[data-rasd-ov="notice"]')?.textContent ?? null,
      hidden: s.host.layer.hasAttribute('data-rasd-hidden'),
      drawn: [...s.host.layer.querySelectorAll('[data-rasd-ov]')].map((e) => e.dataset.rasdOv),
    }))
    return `حال الطبقة: ${JSON.stringify(state)}`
  } catch (e) {
    return `تعذّر قراءة حال الطبقة: ${String(e.message).split('\n')[0]}`
  }
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
    async (id) =>
      (await chrome.storage.session.get('rasd:session'))['rasd:session']?.modes?.[id] ?? null,
    tabId,
  )

/** مركز عنصرٍ في الصفحة بالبكسل المنطقي — من التخطيط الحيّ لا من أرقامٍ مكتوبة. */
export async function centreOf(page, selector) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`لا صندوق لـ${selector}`)
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), box }
}
