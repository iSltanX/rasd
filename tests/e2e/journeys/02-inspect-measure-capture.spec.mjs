/**
 * المسار الثاني — فحص ← قياس ← التقاط (`STAGES/18`).
 *
 * مستخدمٌ على صفحة: يفعّل الفحص من النافذة ويثبّت عنصرًا بنقرة فيقرأ مواصفاته، ثمّ يبدّل إلى القياس
 * باختصار الصفحة (`⌥⇧M`) فيقيس الفجوة بين عنصرين، ثمّ ينقر «تصوير منطقة» من شريط الأدوات في الصفحة نفسه
 * ويسحب منطقةً ويضغط `↵` فتُحفظ لقطة.
 *
 * **كل قيمة تُقارَن بالتخطيط الحيّ لا بعددٍ مكتوب**: مستطيل العنصر المثبَّت من `getBoundingClientRect`،
 * والفجوة من الفرق الفعلي بين حدَّي عنصرين. وكلاهما بالبكسل المنطقي فلا يتغيّر بالكثافة — وهذا بالضبط ما
 * يُراد من تشغيله عند 1 و2: أن تبقى القيم المعروضة للمستخدم واحدة فيما تتضاعف بكسلات اللقطة.
 *
 * **والنقاط مختارة من خارج بطاقة الفحص** (`inspect-dock` تغطّي x≤430 وy 64–378 عند الإقلاع): عنصرٌ تحتها
 * لا يصله المؤشّر. و`#deep-child` يمتدّ إلى x=490، فنقطته (470, 325) حرّة.
 */
import { expect, test } from '../support/rasd.mjs'
import { activate, captureArea, centreOf, click, hoverUntil, modeOf } from '../support/steps.mjs'

test('فحص ← قياس ← التقاط', async ({ rasd }) => {
  const dpr = rasd.dpr
  const page = await rasd.openPage(`${rasd.fixtures}/picker/`)
  expect(await rasd.dprOf(page)).toBe(dpr)

  // ── 1) فحص ──────────────────────────────────────────────────
  const tabId = await activate(rasd, page, 'inspect')
  expect(await modeOf(rasd, tabId), 'الخلفية تعرف الوضع').toBe('inspect')
  const deep = await page.locator('#deep-child').boundingBox()
  const at = { x: 470, y: 325 }
  expect(at.x, 'النقطة داخل العنصر').toBeLessThan(deep.x + deep.width)
  await hoverUntil(
    rasd,
    page,
    tabId,
    at,
    (s) => !!s.host.layer.querySelector('[data-rasd-ov="inspect-highlight"]'),
    'إبراز الفحص',
  )
  await click(page)
  await expect
    .poll(() => rasd.session(tabId, (s) => !!s.inspect.pinnedElement()), { message: 'عنصرٌ مثبَّت' })
    .toBe(true)
  expect(
    await rasd.overlayCentre(tabId, '[data-rasd-ov="inspect-panel"]'),
    'لوحة فحص العنصر مرسومة',
  ).not.toBeNull()

  // اللقطة المحفوظة في الخلفية — ما يراه سائر الأجزاء — لا ما في الصفحة وحدها.
  let snapshot = null
  await expect
    .poll(
      async () => {
        snapshot = (await rasd.send('inspect/get', { tabId })).value?.snapshot ?? null
        return snapshot?.selector
      },
      { message: 'inspect/get يعيد لقطة العنصر المثبَّت' },
    )
    .toBe('#deep-child')
  expect(snapshot).toMatchObject({ tag: 'div', unique: true, inShadow: false })
  expect(snapshot.rect, 'المستطيل بالبكسل المنطقي كالتخطيط الحيّ').toMatchObject({
    x: deep.x,
    y: deep.y,
    width: deep.width,
    height: deep.height,
  })

  // ── 2) قياس ─────────────────────────────────────────────────
  await page.keyboard.press('Alt+Shift+KeyM')
  await expect.poll(() => modeOf(rasd, tabId), { message: '⌥⇧M يبدّل إلى القياس' }).toBe('measure')

  const plain = await centreOf(page, '#plain')
  const scaled = await centreOf(page, '#scaled')
  await hoverUntil(rasd, page, tabId, plain, (s) => !!s.measure.state.hover.value, 'مرجع القياس')
  await click(page)
  await expect
    .poll(() => rasd.session(tabId, (s) => !!s.measure.state.reference.value), {
      message: 'مرجعٌ مثبَّت',
    })
    .toBe(true)
  await hoverUntil(
    rasd,
    page,
    tabId,
    scaled,
    (s) => !!s.measure.state.comparison.value,
    'العنصر المقارَن',
  )

  // الفجوة الحقيقية: `#scaled` تحت `#plain` تمامًا، فأقربها السفلية = الفرق بين الحدّين.
  const expectedGap = Math.round(scaled.box.y - (plain.box.y + plain.box.height))
  const gap = await rasd.session(tabId, (s) => ({
    nearest: s.measure.state.comparison.value.gap.nearest,
    value: s.measure.state.comparison.value.gap.nearestValue,
    shown: [...s.host.layer.querySelectorAll('[data-rasd-ov="measure-gap"]')].map((e) => ({
      text: e.querySelector('.rasd-ov-gap-value')?.textContent ?? '',
      emphasis: e.getAttribute('data-emphasis'),
    })),
  }))
  expect(gap.nearest).toBe('bottom')
  expect(Math.abs(gap.value - expectedGap), `الفجوة ${String(gap.value)} ≈ ${String(expectedGap)}`).toBeLessThanOrEqual(2)
  // الرقم المعروض بأرقام غربية وبوحدته — قياسٌ تقني لا عدٌّ بشري.
  expect(gap.shown, 'قيمة الفجوة المعروضة').toEqual([
    { text: `${String(gap.value)}px`, emphasis: 'true' },
  ])

  // ── 3) التقاط من شريط الأدوات ──────────────────────────────
  await rasd.clickOverlay(page, tabId, '[role="toolbar"] button[aria-label="تصوير منطقة"]')
  await expect.poll(() => modeOf(rasd, tabId), { message: 'الشريط يبدّل إلى تصوير منطقة' }).toBe('area')

  const W = 300
  const H = 220
  const before = (await rasd.db.all('captures')).length
  const capture = await captureArea(rasd, page, { x1: 30, y1: 30, x2: 30 + W, y2: 30 + H }, { activate: false })
  expect((await rasd.db.all('captures')).length).toBe(before + 1)
  expect(capture).toMatchObject({
    kind: 'area',
    status: 'ready',
    devicePixelRatio: dpr,
    width: W * dpr,
    height: H * dpr,
    url: `${rasd.fixtures}/picker/`,
  })

  expect(rasd.unexpectedErrors(), 'لا أخطاء صفحات').toEqual([])
  expect(rasd.externalRequests(), 'لا طلب خارجي').toEqual([])
})
