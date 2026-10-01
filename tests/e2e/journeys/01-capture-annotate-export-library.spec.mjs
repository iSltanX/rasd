/**
 * المسار الأوّل — التقاط ← تعليق ← تصدير ← مكتبة (`STAGES/18`).
 *
 * يمشيه مستخدمٌ بإيماءاته: يسحب منطقةً ويضغط `↵`، ويفتح اللقطة في المحرّر فيرسم مستطيلًا ويتراجع ويعيد،
 * ويصدّرها PNG فينزل ملفّ حقيقي، ثمّ يجد اللقطة في المكتبة ويفتحها فيجد تعليقه محفوظًا.
 *
 * **ما يُحكم عليه أثرًا لا ادّعاءً:** سجلّ `captures` (الأبعاد بالكثافة)، وبايتات الملفّ المنزَّل مفكوكةً في
 * كروم ومقارَنةً بالأصل (التعليق مخبوز فيها وفي مستطيله وحده)، وسجلّ `annotations` (التعليق محفوظ)، وبطاقة
 * المكتبة. **والتنزيل مسار المرساة** لا مسار `chrome.downloads`: الثاني يفتح حوار «حفظ باسم» لا تجيبه
 * الأتمتة، وطلب صلاحية `downloads` يحتاج إيماءة موثوقة — فيُمهَّد رفضها (`export.downloadsRefused`) كما يفعل
 * `verify-export.mjs`، وهو مسار المستخدم الذي رفض الصلاحية وليس مسارًا مفتعلًا.
 */
import { expect, test } from '../support/rasd.mjs'
import { captureArea } from '../support/steps.mjs'

test('التقاط ← تعليق ← تصدير ← مكتبة', async ({ rasd }) => {
  const dpr = rasd.dpr
  const page = await rasd.openPage(`${rasd.fixtures}/rtl-ar/`)
  expect(await rasd.dprOf(page), 'كثافة المتصفّح هي المطلوبة').toBe(dpr)

  // ── 1) التقاط ────────────────────────────────────────────────
  const W = 400
  const H = 240
  const capture = await captureArea(rasd, page, { x1: 100, y1: 80, x2: 100 + W, y2: 80 + H })
  expect(capture, 'سجلّ اللقطة').toMatchObject({
    kind: 'area',
    status: 'ready',
    devicePixelRatio: dpr,
    width: W * dpr,
    height: H * dpr,
    url: `${rasd.fixtures}/rtl-ar/`,
  })
  const originalPng = await rasd.db.blobBase64(capture.id)
  expect(originalPng, 'بايتات اللقطة محفوظة').not.toBeNull()

  // ── 2) تعليق ────────────────────────────────────────────────
  await rasd.sw.evaluate(() => chrome.storage.session.set({ 'export.downloadsRefused': true }))
  await rasd.send('page/open', { page: 'editor', params: { capture: capture.id } })
  let editor
  await expect
    .poll(
      () => (editor = rasd.context.pages().find((p) => p.url().includes('/src/pages/editor/'))),
      { message: 'تبويب المحرّر' },
    )
    .toBeTruthy()
  await editor.bringToFront()
  await editor.locator('[data-editor-state="annotating"]').waitFor()
  const nodes = editor.locator('[data-editor-nodes]')
  await expect(nodes).toHaveText('0')

  await editor.locator('[data-tool="rect"]').click()
  const stage = await editor.locator('[data-editor-stage]').boundingBox()
  const cx = Math.round(stage.x + stage.width / 2)
  const cy = Math.round(stage.y + stage.height / 2)
  await editor.mouse.move(cx - 80, cy - 60)
  await editor.mouse.down()
  await editor.mouse.move(cx, cy, { steps: 4 })
  await editor.mouse.move(cx + 80, cy + 60, { steps: 4 })
  await editor.mouse.up()
  await expect(nodes, 'السحبة أنشأت عقدة').toHaveText('1')

  await editor.keyboard.press('Control+z')
  await expect(nodes, 'التراجع').toHaveText('0')
  await editor.keyboard.press('Control+Shift+z')
  await expect(nodes, 'الإعادة').toHaveText('1')

  // الحفظ التلقائي كتب المشهد في `annotations` — لا يضيع بإغلاق التبويب.
  await expect
    .poll(async () => (await rasd.db.get('annotations', capture.id))?.scene?.nodes?.length ?? 0, {
      message: 'التعليق محفوظ في annotations',
    })
    .toBe(1)

  // ── 3) تصدير ────────────────────────────────────────────────
  await editor.locator('[data-export-open]').click()
  await editor.locator('[data-export-modal]').waitFor()
  await editor.locator('select[data-export-scale-select]').selectOption('1')
  const download = editor.waitForEvent('download')
  await editor.getByRole('button', { name: 'تنزيل' }).click()
  const file = await download
  expect(file.suggestedFilename(), 'اسم الملفّ من عنوان اللقطة').toMatch(/\.png$/)
  await editor.locator('[data-export-result]').waitFor()
  expect(await editor.locator('[data-export-result]').getAttribute('data-export-kind')).toBe('png')

  const { readFile } = await import('node:fs/promises')
  const exportedPng = (await readFile(await file.path())).toString('base64')
  const diff = await rasd.diffPng(page, originalPng, exportedPng)
  expect(diff.sameSize, `الملفّ المصدَّر بمقاس اللقطة (1×) — ${JSON.stringify(diff)}`).toBe(true)
  expect(diff.w).toBe(W * dpr)
  expect(diff.h).toBe(H * dpr)
  expect(diff.differing, 'التعليق مخبوز في الملفّ').toBeGreaterThan(0)
  // لا يتغيّر إلا موضع المستطيل: الزوايا كلّها كالأصل.
  expect(diff.bbox.x0, 'المستطيل لا يلمس الحافة اليسرى').toBeGreaterThan(0)
  expect(diff.bbox.y0, 'ولا العليا').toBeGreaterThan(0)
  expect(diff.bbox.x1, 'ولا اليمنى').toBeLessThan(diff.w - 1)
  expect(diff.bbox.y1, 'ولا السفلى').toBeLessThan(diff.h - 1)
  expect(diff.differing, 'ولا يغطّي الصورة كلّها').toBeLessThan(diff.w * diff.h * 0.5)

  // ── 4) مكتبة ────────────────────────────────────────────────
  const library = await rasd.openPage(`${rasd.origin}/src/pages/library/index.html`)
  const card = library.locator(`[data-capture-id="${capture.id}"]`)
  await expect(card, 'بطاقة اللقطة في المكتبة').toBeVisible()
  await expect(card).toContainText('مجلة الطيف')
  await expect(card, 'نوع اللقطة على البطاقة').toContainText('منطقة')

  const editorsBefore = rasd.context.pages().filter((p) => p.url().includes('/src/pages/editor/')).length
  await card.click()
  await expect
    .poll(() => rasd.context.pages().filter((p) => p.url().includes('/src/pages/editor/')).length)
    .toBe(editorsBefore + 1)
  const reopened = rasd.context.pages().filter((p) => p.url().includes('/src/pages/editor/')).at(-1)
  await reopened.locator('[data-editor-state="annotating"]').waitFor()
  await expect(reopened.locator('[data-editor-nodes]'), 'التعليق عاد من المكتبة').toHaveText('1')

  // ── الحكم العامّ ─────────────────────────────────────────────
  expect(rasd.unexpectedErrors(), 'لا أخطاء صفحات').toEqual([])
  expect(rasd.externalRequests(), 'لا طلب خارجي').toEqual([])
})
