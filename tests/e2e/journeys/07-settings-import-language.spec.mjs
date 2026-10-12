/**
 * المسار السابع — استيراد ملفّ إعدادات يحمل لغة واجهةٍ غير العربية (تدقيق R4: R4-04).
 *
 * رصد بالعربية وحدها (ADR 0022)، و`appearance.language` باقٍ في المخطّط بلا ضابط. ملفٌّ يحمل `en` كان يُقبل عبر
 * واجهة الاستيراد الحقيقية فيقلب الإعدادات والمكتبة إلى LTR ونصّها عربي، ولا ضابط يعيدها. الآن: الحوار يعرض
 * اللغة مُسقطةً بسببها، و«احفظ المقبول» يحفظ الباقي (السمة) والاتجاه باقٍ RTL في الإعدادات والمكتبة.
 *
 * لا يمسّ الالتقاط ولا الكثافة، فيجري في `dpr-1` وحده.
 */
import { expect, test } from '../support/rasd.mjs'

test('ملفّ إعداداتٍ بلغةٍ غير العربية: تُسقط بسببها والواجهة باقية RTL', async ({ rasd }) => {
  test.skip(rasd.dpr !== 1, 'لا التقاط ولا كثافة في هذا المسار')

  // القسم من الرابط كما تفتحه النافذة (`?section=…`، `Settings.tsx`).
  const settings = await rasd.openPage(`${rasd.origin}/src/pages/settings/index.html?section=data`)
  expect(await settings.evaluate(() => document.documentElement.dir)).toBe('rtl')

  const file = JSON.stringify({
    format: 'rasd.settings',
    version: 1,
    exportedAt: Date.now(),
    app: 'e2e',
    settings: { schemaVersion: 1, appearance: { language: 'en', theme: 'dark' } },
  })
  await settings.locator('[data-import-input]').setInputFiles({
    name: 'lang-en.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  })

  const dialog = settings.locator('[role="dialog"]')
  await expect(dialog, 'الحوار يقول لماذا أُسقطت اللغة').toContainText('رصد بالعربية وحدها')
  await settings.getByRole('button', { name: 'احفظ المقبول' }).click()
  await expect(dialog).toBeHidden()

  // المقبول حُفظ وطُبّق: السمة على المستند تعني أن `applyTheme` جرى بعد الاستيراد، فالاتجاه بعدها حكمٌ لا
  // قراءةٌ لـ`dir="rtl"` الثابت في HTML الصفحة (المراجعة المستقلّة).
  const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme ?? null)
  await expect.poll(() => theme(settings), { message: 'السمة المقبولة طُبّقت' }).toBe('dark')
  expect((await rasd.send('settings/get')).value.appearance.language, 'اللغة المخزَّنة').toBe('ar')
  expect(await settings.evaluate(() => document.documentElement.dir)).toBe('rtl')

  const library = await rasd.openPage(`${rasd.origin}/src/pages/library/index.html`)
  await expect.poll(() => theme(library)).toBe('dark')
  expect(await library.evaluate(() => document.documentElement.dir)).toBe('rtl')
  expect(rasd.unexpectedErrors()).toEqual([])
  expect(rasd.externalRequests()).toEqual([])
})
