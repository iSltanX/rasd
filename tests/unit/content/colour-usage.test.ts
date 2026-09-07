/**
 * أداة «العناصر التي تستخدم اللون» والاستبدال — سلكُ المرحلة 14 الحيّ.
 *
 * ما يُحرَس هنا ليس المسح ولا الاستبدال — لكلٍّ اختباراته في
 * `modules/colour/` — بل **الوصل** بينهما وبين الصفحة: أن مسحًا أُجهض لا
 * يكتب فوق خلَفه، وأن استبدالًا ثانيًا لا يتراكم فوق أوّل، وأن الخاصية
 * المُستبدَلة هي التي طابقت لا خاصيةٌ مفترَضة، وأن التخلّص لا يترك أثرًا.
 */
import { describe, expect, it, vi } from 'vitest'

import { createColourUsage, ROW_LIMIT } from '@/content/tools/colour-usage'
import { readColour } from '@/modules/colour/formats'

const TARGET = '#7c3aed'
const target = readColour(TARGET)!
const sync = (run: () => void): void => {
  run()
}

function page(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

describe('createColourUsage — المسح', () => {
  it('يجد المستعمِلين ويبني صفوفًا بمحدِّد وخاصية', async () => {
    const root = page(`<p id="a" style="color: ${TARGET}">س</p>`)
    const tool = createColourUsage({ schedule: sync })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))

    expect(tool.state.hits.value.length).toBeGreaterThan(0)
    const row = tool.state.rows.value[0]
    expect(row?.selector).toContain('a')
    expect(row?.property).toBe('color')
    tool.dispose()
    root.remove()
  })

  /*
   * الإطار المرجعي يعرض ثلاثة صفوف لأربعة عشر عنصرًا: القائمة عيّنة
   * والعدّاد هو الحقيقة. والقصّ هنا لا في المكوّن.
   */
  it('يقصّ الصفوف عند الحدّ ويُبقي العدّ كاملًا', async () => {
    const root = page(`<p style="color:${TARGET}">س</p>`.repeat(8))
    const tool = createColourUsage({ schedule: sync })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))

    expect(tool.state.hits.value).toHaveLength(8)
    expect(tool.state.rows.value).toHaveLength(ROW_LIMIT)
    tool.dispose()
    root.remove()
  })

  it('يُبلِّغ التقدّم بمقام معلوم', async () => {
    const root = page('<i></i>'.repeat(4))
    const seen: number[] = []
    const tool = createColourUsage({
      schedule: sync,
      onInvalidate: () => seen.push(tool.state.progress.peek()),
    })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))
    expect(tool.state.progress.value).toBe(1)
    expect(seen.length).toBeGreaterThan(1)
    tool.dispose()
    root.remove()
  })

  /*
   * مسحٌ ثانٍ يبدأ قبل أن ينتهي الأول: نتيجة القديم يجب أن **تُهمَل**
   * لا أن تكتب فوق الجديد. بلا حارس الجيل يظهر ناتج لونٍ سابق تحت لونٍ
   * حاليّ — وهو كذبٌ صامت لا خطأ يُرى.
   */
  it('مسحٌ أُجهض لا يكتب فوق خلَفه', async () => {
    const root = page(`<p style="color:${TARGET}">س</p>`)
    const queue: (() => void)[] = []
    const tool = createColourUsage({ schedule: (run) => queue.push(run) })

    tool.scan(target)
    const first = queue.shift()
    tool.scan(readColour('#ff0000')!) // ثانٍ يبدأ قبل أن يخطو الأول
    first?.()
    while (queue.length > 0) queue.shift()?.()

    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))
    // الناتج المعروض يخصّ الأحمر (لا مطابق) لا البنفسجي.
    expect(tool.state.hits.value).toHaveLength(0)
    tool.dispose()
    root.remove()
  })
})

describe('createColourUsage — الإبراز', () => {
  it('يقيس مستطيلات المطابقين، ويمحوها', async () => {
    const root = page(`<p style="color:${TARGET}">س</p>`)
    const tool = createColourUsage({ schedule: sync })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))

    tool.highlightAll()
    expect(tool.state.highlights.value).toHaveLength(tool.state.hits.value.length)
    tool.clearHighlights()
    expect(tool.state.highlights.value).toHaveLength(0)
    tool.dispose()
    root.remove()
  })

  it('`frame` لا يعمل شيئًا بلا إبراز قائم — لا قياس بلا سبب', () => {
    const tool = createColourUsage({ schedule: sync })
    const onInvalidate = vi.fn()
    tool.frame()
    expect(onInvalidate).not.toHaveBeenCalled()
    tool.dispose()
  })
})

describe('createColourUsage — الاستبدال المؤقّت', () => {
  it('يستبدل ثمّ يتراجع بلا أثر متبقٍّ', async () => {
    const root = page(`<p id="t" style="color: ${TARGET}">س</p>`)
    const el = root.querySelector('#t')!
    const before = el.getAttribute('style')

    const tool = createColourUsage({ schedule: sync })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))

    tool.replace('#0ea5a3')
    expect(el.getAttribute('style')).toContain('0ea5a3')
    expect(tool.state.replaced.value).not.toBeNull()

    tool.revert()
    expect(el.getAttribute('style')).toBe(before)
    expect(tool.state.replaced.value).toBeNull()
    tool.dispose()
    root.remove()
  })

  /*
   * **الخاصية من الإصابة نفسها لا افتراضًا.** عنصرٌ يستعمل اللون نصًّا
   * يجب أن يُستبدَل نصُّه؛ وقائمةٌ واحدة بخاصية واحدة كانت ستطلي خلفياتٍ
   * على عناصر لم تكن ملوّنة أصلًا.
   */
  it('يستبدل كل خاصية في موضعها — نصًّا للنصّ وخلفيةً للخلفية', async () => {
    const root = page(
      `<p id="txt" style="color: ${TARGET}">س</p><div id="bg" style="background-color: ${TARGET}">ص</div>`,
    )
    const tool = createColourUsage({ schedule: sync })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))

    tool.replace('#0ea5a3')
    expect(root.querySelector('#txt')?.getAttribute('style')).toContain('color:#0ea5a3')
    expect(root.querySelector('#bg')?.getAttribute('style')).toContain('background-color:#0ea5a3')
    tool.dispose()
    root.remove()
  })

  it('استبدالٌ ثانٍ يتراجع عن الأول — لا طبقتان تُخفي إحداهما الأصل', async () => {
    const root = page(`<p id="t" style="color: ${TARGET}">س</p>`)
    const el = root.querySelector('#t')!
    const before = el.getAttribute('style')

    const tool = createColourUsage({ schedule: sync })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))

    tool.replace('#0ea5a3')
    tool.replace('#ff0000')
    expect(el.getAttribute('style')).toContain('ff0000')
    expect(el.getAttribute('style')).not.toContain('0ea5a3')

    tool.revert()
    expect(el.getAttribute('style')).toBe(before)
    tool.dispose()
    root.remove()
  })

  it('استبدال متغيّر CSS كامل يحقن ورقة ويزيلها', () => {
    const tool = createColourUsage({ schedule: sync })
    tool.replace('#0ea5a3', { variable: '--color-primary' })
    expect(document.querySelector('style[data-rasd-colour-replace-variable]')).not.toBeNull()
    tool.revert()
    expect(document.querySelector('style[data-rasd-colour-replace-variable]')).toBeNull()
    tool.dispose()
  })

  it('لا يستبدل بلا مسح سابق — لا قائمة يُطلى عليها', () => {
    const tool = createColourUsage({ schedule: sync })
    tool.replace('#0ea5a3')
    expect(tool.state.replaced.value).toBeNull()
    tool.dispose()
  })

  /*
   * الأداة تترك أثرًا في صفحة المستخدم. مغادرةُ الوضع بلا تراجع تترك
   * صفحته مطليّة بلا سبيل إلى فهم لماذا — فالتراجع عند التخلّص إلزامي.
   */
  it('`dispose` يتراجع عن أي استبدال حيّ', async () => {
    const root = page(`<p id="t" style="color: ${TARGET}">س</p>`)
    const el = root.querySelector('#t')!
    const before = el.getAttribute('style')

    const tool = createColourUsage({ schedule: sync })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))
    tool.replace('#0ea5a3')
    tool.dispose()

    expect(el.getAttribute('style')).toBe(before)
    root.remove()
  })

  it('`reset` يمحو النتائج والإبراز ويتراجع معًا', async () => {
    const root = page(`<p id="t" style="color: ${TARGET}">س</p>`)
    const el = root.querySelector('#t')!
    const before = el.getAttribute('style')

    const tool = createColourUsage({ schedule: sync })
    tool.scan(target)
    await vi.waitFor(() => expect(tool.state.scanning.value).toBe(false))
    tool.highlightAll()
    tool.replace('#0ea5a3')

    tool.reset()
    expect(tool.state.hits.value).toHaveLength(0)
    expect(tool.state.rows.value).toHaveLength(0)
    expect(tool.state.highlights.value).toHaveLength(0)
    expect(tool.state.replaced.value).toBeNull()
    expect(el.getAttribute('style')).toBe(before)
    tool.dispose()
    root.remove()
  })
})
