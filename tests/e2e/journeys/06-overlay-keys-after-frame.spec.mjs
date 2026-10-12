/**
 * المسار السادس — مفاتيح الطبقة بعد نقرةٍ في إطارٍ فرعي (تدقيق R4: R4-02 ثمّ R4-03).
 *
 * مستخدمٌ نقر زرًّا في إطار (محرّر، تضمين، نموذج دفع) فصار تركيزه فيه، ثمّ استعمل رصد بلوحة المفاتيح. مستمع المفاتيح
 * على النافذة العليا، فما دام التركيز في الإطار لا يصلها `Esc` ولا `↵`:
 *
 * - **R4-02:** بعد النقرة، تفعيل «منطقة» ثمّ `Esc` **قبل أي ضغطة على الطبقة** يُخرج من الأداة. كان يبقيها 10/10.
 * - **R4-03:** إطارٌ داخل جذر ظلّ **مغلق**: النقرة فيه، ثمّ سحب منطقة، ثمّ `↵` يحفظها. كان لا يحفظ 10/10.
 *
 * ولكلٍّ ضابطه: بلا نقرة في الإطار، والإطار في جذرٍ عادي. والكثافتان لأن الحفظ يمرّ من الالتقاط.
 */
import { expect, test } from '../support/rasd.mjs'
import { activate, modeOf } from '../support/steps.mjs'

/** صفحةٌ فيها إطارٌ بزرّ عند (620, 470) — في جذرٍ عادي، أو داخل مكوّن ويب بجذر ظلٍّ مغلق. */
async function framePage(rasd, closedShadow) {
  const page = await rasd.openPage(`${rasd.fixtures}/short/`)
  await page.evaluate((closed) => {
    document.body.replaceChildren()
    const frame = document.createElement('iframe')
    frame.style.cssText = 'width:260px;height:160px;border:0'
    frame.srcdoc = '<button style="margin:12px">btn</button>'
    const box = document.createElement('div')
    box.style.cssText = 'position:absolute;left:600px;top:450px'
    if (closed) box.attachShadow({ mode: 'closed' }).append(frame)
    else box.append(frame)
    document.body.append(box)
  }, closedShadow)
  return page
}

for (const clickFrame of [true, false]) {
  test(`Esc يُخرج من «منطقة» قبل أي ضغطة على الطبقة${clickFrame ? ' بعد نقرةٍ في إطار' : ' — ضابط بلا نقرة'}`, async ({
    rasd,
  }) => {
    const page = await framePage(rasd, false)
    if (clickFrame) {
      await page.mouse.click(620, 470)
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME')
    }

    const tabId = await activate(rasd, page, 'area')
    await expect.poll(() => modeOf(rasd, tabId)).toBe('area')
    await page.keyboard.press('Escape')

    await expect.poll(() => modeOf(rasd, tabId), { message: '`Esc` يُخرج من الأداة' }).toBeNull()
    expect(rasd.unexpectedErrors()).toEqual([])
  })
}

for (const closed of [true, false]) {
  test(`↵ يحفظ المنطقة بعد نقرةٍ في إطار ${closed ? 'داخل جذر ظلٍّ مغلق' : 'في جذرٍ عادي — ضابط'}`, async ({
    rasd,
  }) => {
    const page = await framePage(rasd, closed)
    await page.mouse.click(620, 470)
    const tabId = await activate(rasd, page, 'area')

    // السحب يُعاد حتى تصير المنطقة جاهزة: أوّل ضغطة بعد الإقلاع قد تُسقط (README: «فخاخ مقيسة»).
    let phase = null
    for (let i = 0; i < 5 && phase !== 'ready'; i++) {
      await page.mouse.move(100, 100)
      await page.mouse.down()
      await page.mouse.move(250, 200, { steps: 5 })
      await page.mouse.move(400, 300, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(150)
      phase = await rasd.session(tabId, (s) => s.area.state.phase.value)
      if (phase !== 'ready' && i > 0) rasd.noteRetry(`سحب المنطقة #${String(i + 1)}`)
    }
    expect(phase, 'المنطقة جاهزة').toBe('ready')
    await page.keyboard.press('Enter')

    await expect
      .poll(async () => (await rasd.db.all('captures')).length, {
        message: '`↵` يحفظ المنطقة الجاهزة',
        timeout: 10_000,
      })
      .toBe(1)
    expect(rasd.unexpectedErrors()).toEqual([])
    expect(rasd.externalRequests()).toEqual([])
  })
}
