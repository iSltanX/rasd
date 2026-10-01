/**
 * المسار الرابع — مرجع ← مقارنة ← مشاركة (`STAGES/18`).
 *
 * مستخدمٌ على صفحة: يلتقط مرجعًا (لقطة الصفحة الظاهرة كما هي)، ويفتح وضع المقارنة بـ`⌥⇧D` فيتّخذ آخر لقطة
 * مرجعًا، ويقيس الفرق بين المرجع والصفحة الحيّة — صفرًا والصفحة كما التُقطت، ثمّ نسبةً مقارِبةً لمساحة
 * ما غيّره في الصفحة — وتعود المقارنة بمرجعها بعد إعادة تحميل الصفحة. ثمّ يبحث عن «المشاركة».
 *
 * **الفرق بين المرجع والصفحة لا بين المرجع ومرجعٍ محرَّك.** تحريك المرجع (أسهم · عجلة · سحب) يغيّر عرضه
 * وحده؛ والفرق الحيّ يقارن صورة المرجع المحفوظة بلقطةٍ جديدة للصفحة. فالتغيير يُحدَث في الصفحة نفسها،
 * ومساحته معلومة (`400×300` في إطار بمقاس النافذة) فتُقارَن النسبة بالحساب لا بعددٍ مكتوب.
 *
 * **«مشاركة» غير مبنيّة بعد** — نافذتها في `STAGES/10`، وزرّها اليوم «مشاركة · قريبًا» معطَّلٌ بسببٍ
 * يقرؤه المستخدم. فالخطوة الثالثة **تتبع ما في الحزمة**: معطَّلًا تُثبِت أنه كذلك ولا يُخفي ما لا يعمل؛
 * ومفعَّلًا تنقر وتتوقّع نافذة وصفر طلب خارجي. فلا يُنتج دمجُ 10 مسارًا أخضر يُخفي أن خطوته الأخيرة لم
 * تُجرَّب، ولا مسارًا أحمر بلا رسالة: فشلها بعد الدمج يعني «اكتب الخطوة الثالثة بنافذتها الحقيقية».
 */
import { expect, test } from '../support/rasd.mjs'
import { activate, diagnose, modeOf, settle, until } from '../support/steps.mjs'

/** نسبة الفرق كما تعرضها اللوحة (`formatPercent` — أرقام غربية) أو `null` قبل أوّل قياس. */
const percentOf = (text) => {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(text ?? '')
  return m ? Number(m[1]) : null
}

test('مرجع ← مقارنة ← مشاركة', async ({ rasd }) => {
  const dpr = rasd.dpr
  const page = await rasd.openPage(`${rasd.fixtures}/rtl-ar/`)
  expect(await rasd.dprOf(page)).toBe(dpr)

  // ── 1) مرجع: لقطة الصفحة الظاهرة ───────────────────────────
  const tabId = await activate(rasd, page, 'viewport')
  let captures = []
  try {
    await expect
      .poll(async () => (captures = await rasd.db.all('captures')).length, {
        message: 'لقطة المرجع محفوظة',
        timeout: 20_000,
      })
      .toBe(1)
  } catch (e) {
    // سببُ فشل الالتقاط يظهر إشعارًا في الطبقة — يُلحَق بالسقوط لا يُترك لإعادة التشغيل.
    throw new Error(`${e.message}\n${await diagnose(rasd, tabId)}`, { cause: e })
  }
  const [shot] = captures
  const inner = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }))
  expect(shot, 'لقطة الصفحة الظاهرة بمقاس النافذة وكثافتها').toMatchObject({
    kind: 'viewport',
    devicePixelRatio: dpr,
    width: inner.w * dpr,
    height: inner.h * dpr,
  })

  // ── 2) مقارنة ──────────────────────────────────────────────
  await page.keyboard.press('Alt+Shift+KeyD')
  await expect.poll(() => modeOf(rasd, tabId), { message: '⌥⇧D يفتح المقارنة' }).toBe('compare')
  // المرجع محفوظ في قاعدة الإضافة (لا قاعدة الموقع) بمفتاح الأصل والمسار والمقاس.
  let refs = []
  await until(
    rasd,
    () => rasd.clickOverlay(page, tabId, '.rasd-ov-cmp-btn', 'استخدم آخر لقطة'),
    async () => (refs = await rasd.db.all('references')).length === 1,
    { what: 'اتّخاذ آخر لقطة مرجعًا' },
  )
  // تصنيف المقاس من عرض **المحتوى** (`clientWidth`) لا عرض النافذة الخام — وهو ما تقيسه استعلامات CSS (الصفّ 88).
  const client = await page.evaluate(() => ({
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  }))
  const viewport =
    client.w <= 767
      ? 'phone'
      : client.w <= 1279
        ? 'tablet'
        : client.w <= 1599
          ? 'desktop'
          : 'custom'
  expect(refs[0]).toMatchObject({ origin: rasd.fixtures, path: '/rtl-ar/', viewport })
  // الحالة المعروضة تلحق بالقاعدة ولا تسبقها — تُنتظر ولا تُقرأ دفعةً واحدة.
  let shown = null
  await expect
    .poll(
      async () => {
        shown = await rasd.session(tabId, (s) => ({
          reference: !!s.compare.state.reference.value,
          src:
            s.host.layer.querySelector('[data-rasd-ov="compare-reference"]')?.getAttribute('src') ??
            '',
          panel: !!s.host.layer.querySelector('[data-rasd-ov="compare-panel"]'),
        }))
        return shown.reference && shown.panel
      },
      { message: 'المرجع معروضٌ في لوحة المقارنة', timeout: 20_000 },
    )
    .toBe(true)
  expect(shown.src, 'المرجع يُعرض صورةً من blob').toMatch(/^blob:/)

  // ── سياسة الأرقام في اللوحة الحيّة (§3.5، الصفّ 88): القياس غربي، والعدّ البشري هندي ──
  const bidi = /[\u200e\u200f\u2066-\u2069]/g
  const labels = await rasd.session(tabId, (s) => ({
    dimension: s.host.layer.querySelector('.rasd-ov-cmp-vp-dim')?.textContent ?? '',
    sliders: [...s.host.layer.querySelectorAll('.rasd-ov-cmp-slider-value')].map(
      (e) => e.textContent,
    ),
  }))
  expect(labels.dimension.replace(bidi, ''), 'المقاس الحالي = عرض المحتوى × ارتفاعه').toBe(
    `${String(client.w)} × ${String(client.h)}`,
  )
  expect(labels.sliders, 'قيمتا الشفافية والفاصل').toHaveLength(2)
  for (const text of labels.sliders) expect(text.replace(bidi, '')).toMatch(/^\d+%$/)

  // معرض المقاسات: أربع بطاقات، المملوءة منها مقاسُ الصفحة الحيّ وحده.
  await until(
    rasd,
    () => rasd.clickOverlay(page, tabId, '.rasd-ov-cmp-vp-btn'),
    async () => (await rasd.overlayCentre(tabId, '[data-rasd-ov="viewport-gallery"]')) !== null,
    { what: 'فتح معرض المقاسات' },
  )
  const gallery = await rasd.session(tabId, (s) => {
    const cards = [...s.host.layer.querySelectorAll('[data-rasd-ov="viewport-card"]')]
    return {
      count: cards.length,
      filled: cards
        .filter((c) => !c.querySelector('.rasd-ov-vpg-thumb-empty'))
        .map((c) => c.getAttribute('aria-label')),
    }
  })
  expect(gallery.count, 'أربع بطاقات: هاتف · لوحي · سطح المكتب · مخصّص').toBe(4)
  expect(gallery.filled, 'المملوءة مقاسُ هذه الصفحة').toEqual([
    { phone: 'هاتف', tablet: 'لوحي', desktop: 'سطح المكتب', custom: 'مخصّص' }[viewport],
  ])
  await until(
    rasd,
    () =>
      rasd.clickOverlay(
        page,
        tabId,
        '[data-rasd-ov="viewport-gallery"] button[aria-label="إغلاق"]',
      ),
    async () => (await rasd.overlayCentre(tabId, '[data-rasd-ov="viewport-gallery"]')) === null,
    { what: 'إغلاق معرض المقاسات' },
  )

  const readDiff = () =>
    rasd.session(tabId, (s) => {
      const panel = s.host.layer.querySelector('[data-rasd-ov="compare-panel"]')
      const d = s.host.layer.querySelector('[data-rasd-ov="compare-diff"]')
      // `aria-busy` على زرّ القياس نفسه — ونصّه يتبدّل إلى «جارٍ القياس…» أثناءه.
      const button = [...(panel?.querySelectorAll('button') ?? [])].find((b) =>
        /^(التقط الفرق|جارٍ القياس…)$/.test(b.textContent.trim()),
      )
      return {
        busy: button?.getAttribute('aria-busy') ?? null,
        value: d?.querySelector('.rasd-ov-cmp-diff-value')?.textContent ?? null,
        text: d?.textContent ?? '',
      }
    })
  /**
   * قياسٌ جديد: يُنتظَر أن **يبدأ** (`aria-busy`) ثمّ **ينتهي** — فنتيجةُ القياس السابق تبقى معروضةً حتى
   * يُستبدل بها، وقراءتها قبل بدء الجديد تُعيد القديمة وتُقرأ نجاحًا لم يقع.
   */
  const measure = async () => {
    await until(
      rasd,
      () => rasd.clickOverlay(page, tabId, '[data-rasd-ov="compare-panel"] button', 'التقط الفرق'),
      async () => (await readDiff()).busy === 'true',
      { what: 'بدء قياس الفرق', waitMs: 4_000 },
    )
    let last = null
    await expect
      .poll(
        async () => {
          last = await readDiff()
          return last.busy === 'true' ? null : percentOf(last.value)
        },
        { message: 'نتيجة الفرق', timeout: 20_000 },
      )
      .not.toBeNull()
    return last
  }

  // الصفحة كما التُقطت: لا فرق.
  const same = await measure()
  expect(percentOf(same.value), 'مرجعٌ هو الصفحة نفسها').toBe(0)

  // غيّر الصفحة: كتلةٌ صمّاء بمساحة معلومة في إطار النافذة.
  const BLOCK = { w: 400, h: 300 }
  await page.evaluate(({ w, h }) => {
    const el = document.createElement('div')
    el.id = 'e2e-injected'
    el.style.cssText = `position:fixed;top:200px;left:300px;width:${w}px;height:${h}px;background:#c00`
    document.body.append(el)
  }, BLOCK)
  await settle(page)
  const changed = await measure()
  const expectedPct = ((BLOCK.w * BLOCK.h) / (inner.w * inner.h)) * 100
  const got = percentOf(changed.value)
  expect(
    got,
    `نسبة الفرق (${changed.value}) قرب مساحة الكتلة (${expectedPct.toFixed(1)}%)`,
  ).toBeGreaterThan(expectedPct * 0.6)
  expect(got).toBeLessThan(expectedPct * 1.4)
  // عدد العناصر المتحرّكة عدٌّ بشري: أرقام هندية، ولا يقلّ عن واحد.
  expect(changed.text, 'عدّ العناصر المتحرّكة بالأرقام الهندية').toMatch(/[١-٩][٠-٩]*عناصر تحرّكت/)

  // المقارنة تعود بمرجعها بعد إعادة التحميل — لا يُطلب المرجع ثانيةً.
  await page.reload({ waitUntil: 'load' })
  await expect
    .poll(() => modeOf(rasd, tabId), { message: 'المقارنة تُستأنف بعد التحميل', timeout: 20_000 })
    .toBe('compare')
  await expect
    .poll(() => rasd.session(tabId, (s) => !!s.compare.state.reference.value), {
      message: 'والمرجع معها',
    })
    .toBe(true)

  // ── 3) مشاركة ───────────────────────────────────────────────
  await rasd.send('page/open', { page: 'editor', params: { capture: shot.id } })
  let editor
  await expect
    .poll(() => (editor = rasd.context.pages().find((p) => p.url().includes('/src/pages/editor/'))))
    .toBeTruthy()
  await editor.bringToFront()
  await editor.locator('[data-editor-state="annotating"]').waitFor()
  const share = editor.getByRole('button', { name: /مشاركة/ })
  await expect(share, 'عنصر المشاركة في المحرّر').toHaveCount(1)
  if (await share.isDisabled()) {
    // اليوم: معطَّل بسببٍ يقرؤه المستخدم في نصّه — لا زرّ صامت ولا مخفيّ.
    await expect(share).toContainText('قريبًا')
    test.info().annotations.push({
      type: 'share-step',
      description: 'المشاركة معطَّلة (قريبًا) — تُجرَّب نافذتها حين تُبنى',
    })
  } else {
    await share.click()
    await expect(editor.getByRole('dialog'), 'نافذة المشاركة').toBeVisible()
  }

  expect(rasd.unexpectedErrors(), 'لا أخطاء صفحات').toEqual([])
  expect(rasd.externalRequests(), 'لا طلب خارجي').toEqual([])
})
