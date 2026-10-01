/**
 * المسار الثالث — لون ← لوحة ← درجات (`STAGES/18`).
 *
 * مستخدمٌ على صفحة: يفعّل وضع اللون ويثبّت بكسلًا بنقرة فيحفظه، ثمّ يضغط `⌘K`/`Ctrl+K` فتُستخرج لوحة
 * الصفحة ويحفظها، ثمّ يعود إلى لونه المثبَّت فيولّد درجاته ويحفظها وينزّلها — وفي آخره يجد الثلاثة في المكتبة.
 *
 * **الدرجات في الطبقة وحدها** — لا شاشة تفاصيل للون محفوظ في المكتبة (بطاقته تنسخ سداسيّه) — فمسار «درجات»
 * هو توليدها من اللون المثبَّت ثمّ حفظها لوحةً أو تنزيلها ملفًّا.
 *
 * **الحكم على الأثر:** سجلّات `colors` و`palettes` في القاعدة (لا ردّ الرسالة)، ولون البكسل المقروء من
 * اللقطة الحيّة للصفحة، والملفّ المنزَّل مفكوكًا، وبطاقات المكتبة. والعدّ في الإشعارات بأرقام هندية
 * (عدٌّ بشري) وسداسيّات الألوان بحروفها اللاتينية (قيمة تقنية) — سياسة الأرقام في الواجهة.
 */
import { readFile } from 'node:fs/promises'

import { expect, test } from '../support/rasd.mjs'
import { activate, centreOf, click, hoverUntil, modeOf, until } from '../support/steps.mjs'

const HEX = /^#[0-9a-f]{6}$/

test('لون ← لوحة ← درجات', async ({ rasd }) => {
  const page = await rasd.openPage(`${rasd.fixtures}/colour/`)
  expect(await rasd.dprOf(page)).toBe(rasd.dpr)
  const tabId = await activate(rasd, page, 'colour')

  // ── 1) لون: بكسلٌ حقيقي يُثبَّت ويُحفَظ ───────────────────
  const solid = await centreOf(page, '#solid')
  const pixel = await hoverUntil(
    rasd,
    page,
    tabId,
    solid,
    (s) => s.colour.state.live.value?.pixel ?? null,
    'عيّنة البكسل',
  )
  // `#solid` أحمر صرف — والبكسل المقروء من لقطة الشاشة بكثافتها، فتبقى القيمة واحدة عند 1 و2.
  expect(pixel).toMatchObject({ r: 255, g: 0, b: 0 })
  await until(
    rasd,
    () => click(page),
    () => rasd.session(tabId, (s) => !!s.colour.state.pinned.value),
    { what: 'تثبيت اللون' },
  )
  const pinned = await rasd.session(tabId, (s) => {
    const p = s.colour.state.pinned.value
    return p && { hex: p.formats.hex, source: p.source, mismatch: p.mismatch }
  })
  expect(pinned, 'لونٌ مثبَّت').toMatchObject({ hex: '#ff0000', source: 'pixel' })

  let colours = []
  await until(
    rasd,
    () => rasd.clickOverlay(page, tabId, '.rasd-ov-cp-btn', 'حفظ'),
    async () => (colours = await rasd.db.all('colors')).length === 1,
    { what: 'حفظ اللون' },
  )
  expect(colours[0]).toMatchObject({
    hex: '#ff0000',
    source: 'pixel',
    sourceUrl: `${rasd.fixtures}/colour/`,
  })

  // ── 2) لوحة: ⌘K يستخرج ألوان الصفحة ───────────────────────
  await page.keyboard.press('Control+KeyK')
  const swatches = await expect
    .poll(
      () =>
        rasd.session(tabId, (s) => {
          const st = s.colourPalette.state
          return st.open.value && !st.extracting.value ? st.swatches.value.map((x) => x.hex) : []
        }),
      { message: 'لوحة مستخرَجة', timeout: 20_000 },
    )
    .not.toHaveLength(0)
    .then(() => rasd.session(tabId, (s) => s.colourPalette.state.swatches.value.map((x) => x.hex)))
  expect(await modeOf(rasd, tabId), '⌘K فعّل وضع اللون').toBe('colour')
  for (const hex of swatches) expect(hex).toMatch(HEX)

  let palettes = []
  await until(
    rasd,
    () => rasd.clickOverlay(page, tabId, '.rasd-ov-pal-btn', 'احفظ اللوحة'),
    async () => (palettes = await rasd.db.all('palettes')).length === 1,
    { what: 'حفظ لوحة الصفحة' },
  )
  expect(palettes[0].colors, 'ألوان اللوحة المحفوظة هي المعروضة').toEqual(swatches)
  const notice = await rasd.session(
    tabId,
    (s) => s.host.layer.querySelector('[data-rasd-ov="notice"]')?.textContent ?? '',
  )
  expect(notice, 'الإشعار بأرقام هندية — عدٌّ بشري').toContain('حُفظت اللوحة')
  expect(notice).toMatch(/[٠-٩]+ ألوان/)

  // ── 3) درجات: من اللون المثبَّت ────────────────────────────
  await until(
    rasd,
    () =>
      rasd.clickOverlay(page, tabId, '[data-rasd-ov="palette-panel"] button[aria-label="إغلاق"]'),
    async () => !(await rasd.session(tabId, (s) => s.colourPalette.state.open.value)),
    { what: 'إغلاق لوحة الصفحة' },
  )
  // إغلاق اللوحة يُعيد لوحة اللون ولونها المثبَّت — لا حاجة إلى تثبيتٍ ثانٍ.
  await until(
    rasd,
    () => rasd.clickOverlay(page, tabId, '.rasd-ov-cp-btn', 'توليد الدرجات'),
    () => rasd.session(tabId, (s) => s.colourScale.state.open.value),
    { what: 'توليد الدرجات' },
  )
  const scale = await rasd.session(tabId, (s) => ({
    open: s.colourScale.state.open.value,
    stops: s.colourScale.state.stops.value.length,
    sample: s.colourScale.sampleRows().map((r) => r.step),
  }))
  expect(scale).toEqual({ open: true, stops: 11, sample: [300, 500, 700, 900] })

  // تنزيلها ملفًّا: مرساةٌ حقيقية فيصل حدثُ تنزيل.
  const jsonDownload = page.waitForEvent('download')
  await rasd.clickOverlay(page, tabId, '.rasd-ov-scl-btn[title="تنزيل ملفّ JSON"]')
  const file = await jsonDownload
  expect(file.suggestedFilename()).toBe('rasd-scale.json')
  const exported = JSON.parse(await readFile(await file.path(), 'utf8'))
  expect(JSON.stringify(exported), 'الملفّ يحمل لون الأساس').toContain('#ff0000')

  // وحفظها لوحةً في المكتبة.
  await until(
    rasd,
    () => rasd.clickOverlay(page, tabId, '.rasd-ov-scl-btn[data-primary="true"]'),
    async () => (palettes = await rasd.db.all('palettes')).length === 2,
    { what: 'حفظ لوحة الدرجات' },
  )
  const scaleSet = palettes.find((p) => p.name === 'درجات #ff0000')
  expect(scaleSet, 'لوحةٌ باسم لونها').toBeDefined()
  expect(scaleSet.colors).toHaveLength(11)
  for (const hex of scaleSet.colors) expect(hex).toMatch(HEX)

  // ── 4) مكتبة: الثلاثة ظاهرة ─────────────────────────────────
  const library = await rasd.openPage(`${rasd.origin}/src/pages/library/index.html`)
  await library.getByRole('tab', { name: 'الألوان' }).click()
  await expect(
    library.locator(`[data-color-id="${colours[0].id}"]`),
    'بطاقة اللون المحفوظ',
  ).toBeVisible()
  await library.getByRole('tab', { name: 'اللوحات' }).click()
  await expect(library.locator('[data-palette-id]'), 'لوحتان: الصفحة والدرجات').toHaveCount(2)

  expect(rasd.unexpectedErrors(), 'لا أخطاء صفحات').toEqual([])
  expect(rasd.externalRequests(), 'لا طلب خارجي').toEqual([])
})
