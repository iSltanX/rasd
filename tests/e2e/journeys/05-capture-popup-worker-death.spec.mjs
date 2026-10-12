/**
 * المسار الخامس — نافذة الإضافة المفتوحة على التقاطٍ كامل، ثمّ موت عامله (تدقيق R4: R4-07 ثمّ R4-01).
 *
 * مستخدمٌ بدأ التقاط صفحةٍ طويلة وفتح النافذة الحقيقية (`chrome.action.openPopup`) يتابعه، فمات العامل — إنهاء
 * MV3، أو انهيار، أو تحديث. يُحكم على ما تعرضه النافذة نفسها (`chrome.extension.getViews`):
 *
 * - **R4-07:** في أوّل خمس ثوانٍ، قبل أن تكتب المهمّة نبضها في الجلسة (`PROGRESS_PERSIST_MS`)، ترويسة «تجميع
 *   المقطع» وسطر الجسم بالعدد نفسه. كانت الترويسة تقرأ الجلسة فتعرض «٠ من ٠» فوق «المقطع ٣ من ٥٠».
 * - **R4-01:** بعد إيقاف العامل عبر CDP **بلا إيقاظٍ من خارج النافذة**، تقول «توقّف الالتقاط» ولا تبقى على
 *   «جارٍ الالتقاط»، والمهمّة ممسوحة والصفحة مستعادة. كانت تبقى على «المقطع ٣ من ٥٠ · إلغاء الالتقاط» 10/10.
 *
 * الكثافة لا تمسّ النافذة ولا العامل، فيجري في `dpr-1` وحده.
 */
import { expect, test } from '../support/rasd.mjs'

/** إصدارات عامل الإضافة كما يبثّها CDP — منها يُعرف الجاري ويُتحقَّق من توقّفه. */
async function workerVersions(rasd) {
  const client = await rasd.context.newCDPSession(await rasd.bridge())
  const versions = new Map()
  client.on('ServiceWorker.workerVersionUpdated', ({ versions: updated }) => {
    for (const v of updated) versions.set(v.versionId, v)
  })
  await client.send('ServiceWorker.enable')
  const mine = () => [...versions.values()].filter((v) => v.scriptURL?.startsWith(rasd.origin))
  return { client, mine }
}

/** يوقف العامل كما يوقفه المتصفّح، وينتظر أن يُبلَّغ متوقّفًا. */
async function stopWorker(rasd) {
  const { client, mine } = await workerVersions(rasd)
  await expect.poll(() => mine().some((v) => v.runningStatus === 'running')).toBe(true)
  const running = mine().find((v) => v.runningStatus === 'running')
  await client.send('ServiceWorker.stopWorker', { versionId: running.versionId })
  await expect
    .poll(() => mine().find((v) => v.versionId === running.versionId)?.runningStatus, {
      timeout: 10_000,
    })
    .toBe('stopped')
  return client
}

const sessionOf = (bridge) =>
  bridge.evaluate(async () => (await chrome.storage.session.get('rasd:session'))['rasd:session'])

/** نصّ النافذة المفتوحة — أو `null` إن لم تكن مفتوحة. */
const popupText = (bridge) =>
  bridge.evaluate(() => {
    const view = chrome.extension.getViews({ type: 'popup' })[0]
    return view ? view.document.body.innerText.replace(/\s+/g, ' ') : null
  })

/** كل «المقطع س من ص» في النافذة: الترويسة («تجميع المقطع …») والجسم. */
const tileCounts = (text) => [...(text ?? '').matchAll(/المقطع (\S+) من (\S+)/gu)].map((m) => m[0])

test('النافذة المفتوحة تتبع التقاطًا كاملًا ثمّ موت عامله', async ({ rasd }) => {
  test.skip(rasd.dpr !== 1, 'الكثافة لا تمسّ النافذة ولا العامل')
  test.setTimeout(120_000)

  const page = await rasd.openPage(`${rasd.fixtures}/short/`)
  await page.evaluate(() => {
    document.body.style.minHeight = '40000px'
    document.documentElement.style.scrollBehavior = 'auto'
  })
  const tabId = await rasd.tabIdOf(page.url())
  const bridge = await rasd.bridge()
  expect(
    (await rasd.send('settings/patch', { patch: { onboarding: { completed: true } } })).ok,
  ).toBe(true)

  const startedAt = Date.now()
  expect((await rasd.send('tool/activate', { tool: 'full-page', tabId })).ok).toBe(true)
  await expect.poll(async () => (await sessionOf(bridge))?.job?.kind ?? null).toBe('full-page')

  // ── R4-07: الترويسة والجسم بالعدد نفسه قبل نبض الجلسة الأوّل ─────────
  const opened = await bridge.evaluate(async (id) => {
    const tab = await chrome.tabs.get(id)
    await chrome.windows.update(tab.windowId, { focused: true })
    await chrome.action.openPopup({ windowId: tab.windowId })
    return true
  }, tabId)
  expect(opened).toBe(true)
  // سطر الجسم تجاوز الصفر: التقدّم الحيّ وصل النافذة.
  await expect
    .poll(async () => tileCounts(await popupText(bridge)).some((c) => !c.startsWith('المقطع ٠ ')))
    .toBe(true)
  const live = await popupText(bridge)
  const sampledAfterMs = Date.now() - startedAt
  expect(sampledAfterMs, 'العيّنة قبل نبض الجلسة الأوّل (5 s)، وإلا لا تحكم').toBeLessThan(5_000)
  const counts = tileCounts(live)
  // ناعمان: سقوطهما لا يمنع الحكم على R4-01 أدناه في الجولة نفسها.
  expect.soft(counts.length, `الترويسة والجسم: ${live}`).toBeGreaterThanOrEqual(2)
  expect.soft(new Set(counts).size, `عدّ الترويسة = عدّ الجسم: ${counts.join(' | ')}`).toBe(1)

  // ── R4-01: العامل يموت والنافذة مفتوحة ──────────────────────────────
  const client = await stopWorker(rasd)
  await expect
    .poll(async () => (await popupText(bridge)) ?? '', { timeout: 20_000 })
    .toContain('توقّف الالتقاط')
  const after = await popupText(bridge)
  expect(after, 'لا تبقى على «جارٍ الالتقاط»').not.toContain('تجميع المقطع')
  expect((await sessionOf(bridge))?.job ?? null, 'المهمّة اليتيمة مُسحت').toBeNull()
  await expect.poll(() => page.evaluate(() => scrollY), { message: 'الصفحة استُعيدت' }).toBe(0)
  expect(await rasd.db.all('captures'), 'لا لقطة من التقاطٍ لم يكتمل').toHaveLength(0)

  await client.detach()
  expect(rasd.unexpectedErrors()).toEqual([])
  expect(rasd.externalRequests()).toEqual([])
})
