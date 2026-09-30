import { describe, expect, it, vi } from 'vitest'

import { oklabOf, type Oklab } from '@/modules/colour/distance'
import { formatColour, readColour } from '@/modules/colour/formats'
import {
  CHUNK_SIZE,
  IDLE_TIMEOUT_MS,
  USAGE_DELTA,
  USAGE_PROPS,
  collectDeclaredColours,
  coloursInValue,
  idleScheduler,
  matchDeclarations,
  scanColourUsage,
  type UsageSite,
} from '@/modules/colour/usage'

const lab = (css: string): Oklab => {
  const r = readColour(css)
  if (!r) throw new Error(`تعذّرت قراءة ${css}`)
  return oklabOf(r)
}

const TARGET = '#2b7fff'
const targetLab = lab(TARGET)

/** يبني خريطة تصريحات بكل خصائص الاستعمال فارغةً إلّا ما يُمرَّر. */
function decls(overrides: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {}
  for (const p of USAGE_PROPS) base[p] = ''
  return { ...base, ...overrides }
}

describe('matchDeclarations — المواضع الخمسة التي يفرضها §6.10', () => {
  const cases: readonly (readonly [UsageSite, string, string])[] = [
    ['text', 'color', TARGET],
    ['background', 'background-color', TARGET],
    ['border', 'border-top-color', TARGET],
    ['icon', 'fill', TARGET],
    ['shadow', 'box-shadow', `0 1px 2px ${TARGET}`],
  ]

  for (const [site, property, value] of cases) {
    it(`يجد الاستعمال في «${site}» عبر \`${property}\``, () => {
      const matches = matchDeclarations(decls({ [property]: value }), targetLab)
      expect(matches).toHaveLength(1)
      expect(matches[0]?.site).toBe(site)
      expect(matches[0]?.property).toBe(property)
    })
  }

  it('يجد المواضع الخمسة معًا على عنصر واحد', () => {
    const matches = matchDeclarations(
      decls({
        color: TARGET,
        'background-color': TARGET,
        'border-left-color': TARGET,
        stroke: TARGET,
        'text-shadow': `0 0 3px ${TARGET}`,
      }),
      targetLab,
    )
    const sites = new Set(matches.map((m) => m.site))
    expect(sites).toEqual(new Set(['text', 'background', 'border', 'icon', 'shadow']))
  })

  it('**الحدود الأربعة كلّها مقروءة** — لا الاثنان المنطقيان فقط', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const matches = matchDeclarations(decls({ [`border-${side}-color`]: TARGET }), targetLab)
      expect(matches, `border-${side}-color يجب أن يُطابَق`).toHaveLength(1)
    }
  })
})

describe('matchDeclarations — الرفض', () => {
  it('لونٌ مختلف لا يُطابَق', () => {
    expect(matchDeclarations(decls({ color: '#ff0000' }), targetLab)).toEqual([])
  })

  it('**الشفّاف تمامًا ليس استعمالًا** — وإلّا لطابق كلُّ عنصر بلا حدّ', () => {
    // كروم يحسب `border-*-color` لعنصر بلا حدّ `rgba(0, 0, 0, 0)`.
    const black = oklabOf(readColour('#000000')!)
    expect(matchDeclarations(decls({ 'border-top-color': 'rgba(0, 0, 0, 0)' }), black)).toEqual([])
  })

  it('القيمة الفارغة تُتجاوَز بلا رمي', () => {
    expect(matchDeclarations(decls({}), targetLab)).toEqual([])
  })

  it('`none`/`currentcolor` لا تُقرأ لونًا فلا تُطابَق', () => {
    expect(matchDeclarations(decls({ fill: 'none' }), targetLab)).toEqual([])
    expect(matchDeclarations(decls({ color: 'currentcolor' }), targetLab)).toEqual([])
  })
})

describe('matchDeclarations — العتبة', () => {
  it('لونٌ مطابق بايتًا يُطابَق رغم ضجيج التقريب', () => {
    const matches = matchDeclarations(decls({ color: 'rgb(43 127 255)' }), targetLab)
    expect(matches).toHaveLength(1)
    expect(matches[0]?.deltaE).toBeLessThan(USAGE_DELTA)
  })

  it('العتبة تُضبَط: لونٌ قريب يُرفَض عند الافتراضي ويُقبَل عند عتبة أوسع', () => {
    const near = decls({ color: '#3b82f6' }) // blue-500 في Tailwind v3
    expect(matchDeclarations(near, targetLab)).toEqual([])
    expect(matchDeclarations(near, targetLab, 0.05)).toHaveLength(1)
  })

  it('العتبة الافتراضية 0.01 — فوق ضجيج التقريب ودون أضيق فجوة تصميمية', () => {
    expect(USAGE_DELTA).toBe(0.01)
    expect(USAGE_DELTA).toBeGreaterThan(0.00097) // أرضية ضجيج البايت المقيسة
    expect(USAGE_DELTA).toBeLessThan(0.0149) // أضيق فجوة بين درجتين متجاورتين
  })
})

describe('coloursInValue — الظلال المركّبة', () => {
  it('يستخرج لون طبقة واحدة', () => {
    expect(coloursInValue('0 1px 2px rgb(43 127 255)')).toHaveLength(1)
  })

  it('يستخرج ألوان طبقات متعدّدة', () => {
    const found = coloursInValue('0 1px 2px #2b7fff, inset 0 0 0 1px #ffffff')
    expect(found.length).toBeGreaterThanOrEqual(2)
  })

  it('يتجاهل الأطوال والكلمات غير اللونية', () => {
    // `inset` ليست لونًا، والأطوال ليست ألوانًا.
    const found = coloursInValue('inset 0 0 0 1px #2b7fff')
    expect(found).toHaveLength(1)
  })

  it('`none` لا تُنتج لونًا', () => {
    expect(coloursInValue('none')).toEqual([])
  })

  it('يجد اللون في طبقة ثانية حتى لو خلت الأولى منه', () => {
    const matches = matchDeclarations(
      decls({ 'box-shadow': `0 0 0 1px rgb(0 0 0 / 0.05), 0 4px 8px ${TARGET}` }),
      targetLab,
    )
    expect(matches).toHaveLength(1)
  })
})

describe('scanColourUsage — المسح المُجزَّأ', () => {
  /** مُجدوِل متزامن — يجعل المسح حتميًّا في الاختبار بلا مؤقّتات. */
  const sync = (run: () => void): void => {
    run()
  }

  function page(html: string): { root: HTMLElement; win: Window } {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.appendChild(root)
    return { root, win: window }
  }

  it('يجد العناصر المستعمِلة ويتجاهل غيرها', async () => {
    const { root, win } = page(`
      <p style="color: ${TARGET}">مطابق</p>
      <p style="color: #ff0000">غير مطابق</p>
      <span style="background-color: ${TARGET}">مطابق أيضًا</span>
    `)
    const hits = await scanColourUsage(readColour(TARGET)!, { root, win, schedule: sync }).done
    expect(hits).toHaveLength(2)
    root.remove()
  })

  it('يُبلِّغ عن التقدّم بمقام معلوم', async () => {
    const { root, win } = page('<i></i><i></i><i></i><i></i>')
    const seen: [number, number][] = []
    await scanColourUsage(readColour(TARGET)!, {
      root,
      win,
      schedule: sync,
      chunkSize: 2,
      onProgress: (scanned, total) => seen.push([scanned, total]),
    }).done
    expect(seen.at(-1)).toEqual([4, 4])
    // شريحتان بحجم 2 — تقدّمان لا واحد.
    expect(seen.length).toBeGreaterThan(1)
    root.remove()
  })

  it('`skip` يستبعد العنصر وذرّيّته — فلا نجد طبقتنا نحن', async () => {
    const { root, win } = page(`
      <div id="ours"><b style="color: ${TARGET}">لوحتنا</b></div>
      <b style="color: ${TARGET}">الصفحة</b>
    `)
    const ours = root.querySelector('#ours')
    const hits = await scanColourUsage(readColour(TARGET)!, {
      root,
      win,
      schedule: sync,
      skip: ours,
    }).done
    expect(hits).toHaveLength(1)
    expect(hits[0]?.element.textContent).toBe('الصفحة')
    root.remove()
  })

  it('`cancel` يوقف المسح ويسلّم ما وُجد لا يهدره', async () => {
    const { root, win } = page(
      Array.from({ length: 20 }, () => `<i style="color: ${TARGET}"></i>`).join(''),
    )
    /*
     * مُجدوِل يدويّ لا متزامن — والفرق جوهريّ هنا: المُجدوِل المتزامن يُنهي
     * المسح كلّه **قبل** أن تعود `scanColourUsage` بمقبضها أصلًا، فلا لحظة
     * يمكن فيها الإلغاء. وهذا سلوك صحيح لا عيب (مُجدوِل بلا تأجيل لا يُجزِّئ
     * شيئًا)، لكنه يجعل اختبار الإلغاء به مستحيلًا — فتُضخّ الشرائح هنا يدويًّا.
     */
    const queue: (() => void)[] = []
    const h = scanColourUsage(readColour(TARGET)!, {
      root,
      win,
      schedule: (run) => queue.push(run),
      chunkSize: 5,
    })

    queue.shift()?.() // الشريحة الأولى: خمسة عناصر
    h.cancel()
    queue.shift()?.() // الشريحة التالية ترى الإلغاء فتُسلِّم ما وُجد

    const hits = await h.done
    expect(hits).toHaveLength(5)
    root.remove()
  })

  it('عنصر يستعمل اللون في موضعين يُعَدّ مرّة واحدة بموضعين', async () => {
    const { root, win } = page(`<div style="color: ${TARGET}; border-top-color: ${TARGET}"></div>`)
    const hits = await scanColourUsage(readColour(TARGET)!, { root, win, schedule: sync }).done
    expect(hits).toHaveLength(1)
    expect(new Set(hits[0]?.sites)).toEqual(new Set(['text', 'border']))
    root.remove()
  })

  it('شجرة فارغة تعطي نتيجة فارغة بلا رمي', async () => {
    const { root, win } = page('')
    const hits = await scanColourUsage(readColour(TARGET)!, { root, win, schedule: sync }).done
    expect(hits).toEqual([])
    root.remove()
  })
})

describe('collectDeclaredColours — أساس تصنيف §6.5', () => {
  const sync = (run: () => void): void => {
    run()
  }
  function page(html: string): { root: HTMLElement; win: Window } {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.appendChild(root)
    return { root, win: window }
  }

  it('يجمع الألوان المصرَّحة بمواضعها', async () => {
    const { root, win } = page(`
      <p style="color: #7c3aed">نصّ</p>
      <div style="background-color: #111827">خلفية</div>
      <span style="border-top-color: #e7eaf0; border-top-style: solid">حدّ</span>
    `)
    const found = await collectDeclaredColours({ root, win, schedule: sync }).done
    const sites = new Set(found.map((d) => d.site))
    expect(sites.has('text')).toBe(true)
    expect(sites.has('background')).toBe(true)
    expect(sites.has('border')).toBe(true)
    root.remove()
  })

  /*
   * التفريد هو ما يمنع القائمة من التضخّم بعدد **العناصر** بدل عدد
   * **الألوان** — وبدونه تصير المقاطعة في `classifyPaletteSources` تربيعية.
   */
  it('يفرّد: مئة عنصر باللون نفسه تعطي مدخلًا واحدًا لذلك الموضع', async () => {
    const rows = Array.from({ length: 100 }, () => '<p style="color: #7c3aed">س</p>').join('')
    const { root, win } = page(rows)
    const found = await collectDeclaredColours({ root, win, schedule: sync }).done
    expect(found.filter((d) => d.site === 'text')).toHaveLength(1)
    // القائمة تنمو بعدد **الألوان** لا بعدد العناصر — وهذا بيت القصيد.
    expect(found.length).toBeLessThan(10)
    root.remove()
  })

  it('يفصل الموضعين للّون نفسه — نصًّا وخلفيةً مدخلان لا واحد', async () => {
    const { root, win } = page(
      `<p style="color: #7c3aed">س</p><div style="background-color: #7c3aed">ص</div>`,
    )
    const found = await collectDeclaredColours({ root, win, schedule: sync }).done
    const sites = found.map((d) => d.site).filter((s) => s === 'text' || s === 'background')
    expect(new Set(sites).size).toBe(2)
    root.remove()
  })

  /*
   * `transparent` تُقرأ `rgba(0,0,0,0)`، فلو مرّت لصُنِّف كل عنصر شفّاف
   * الخلفية «يصرّح بالأسود» — وأسودُ اللوحة كان سيُنسَب خلفيةً كاذبًا.
   */
  it('يُسقط الشفّاف تمامًا — غيابُ لون لا لونٌ أسود', async () => {
    const { root, win } = page('<div style="background-color: transparent">س</div>')
    const found = await collectDeclaredColours({ root, win, schedule: sync }).done
    expect(found.some((d) => d.site === 'background')).toBe(false)
    root.remove()
  })

  it('يُلغى فيسلّم ما وُجد لا يُهدره', async () => {
    const { root, win } = page('<i style="color:#7c3aed"></i>'.repeat(10))
    const queue: (() => void)[] = []
    const handle = collectDeclaredColours({
      root,
      win,
      chunkSize: 2,
      schedule: (run) => queue.push(run),
    })
    queue.shift()?.()
    handle.cancel()
    queue.shift()?.()
    await expect(handle.done).resolves.toBeDefined()
    root.remove()
  })
})

describe('coloursInValue — ما لا يحمل لونًا', () => {
  it('نصّ بلا أي رمز مرشَّح يعطي قائمة فارغة لا رمي', () => {
    // لا أحرف ولا `#` ولا دالّة: `match` يُرجع `null` لا مصفوفة فارغة.
    expect(coloursInValue('')).toEqual([])
    expect(coloursInValue('0 0 0')).toEqual([])
  })

  it('الأطوال وحدها لا تُقرأ ألوانًا', () => {
    // `px` رمز مرشَّح حرفيّ، لكن المحلِّل هو الحَكَم فيردّه.
    expect(coloursInValue('0 1px 2px 3px')).toEqual([])
  })

  it('اسم اللون الصريح يُقرأ كما يُقرأ في أي موضع', () => {
    const found = coloursInValue('0 0 4px red')
    expect(found).toHaveLength(1)
    expect(found[0]?.rgb).toEqual({ r: 255, g: 0, b: 0 })
  })
})

describe('matchDeclarations — الطبقات والمواضع', () => {
  it('الإطار الخارجي يُحسَب حدًّا لا موضعًا مستقلًّا', () => {
    const matches = matchDeclarations(decls({ 'outline-color': TARGET }), targetLab)
    expect(matches.map((m) => [m.site, m.property])).toEqual([['border', 'outline-color']])
  })

  it('المطابقات بترتيب المواضع: نصّ ثم خلفية ثم حدّ ثم أيقونة ثم ظلّ', () => {
    const matches = matchDeclarations(
      decls({
        'text-shadow': `0 0 3px ${TARGET}`,
        stroke: TARGET,
        'border-left-color': TARGET,
        'background-color': TARGET,
        color: TARGET,
      }),
      targetLab,
    )
    expect(matches.map((m) => m.site)).toEqual(['text', 'background', 'border', 'icon', 'shadow'])
  })

  it('القيمة المُبلَّغ عنها تُعرض كما قرأها المتصفّح لا مُعاد تنسيقها', () => {
    const value = 'rgb(43, 127, 255)'
    expect(matchDeclarations(decls({ color: value }), targetLab)[0]?.value).toBe(value)
  })

  it('ظلّ بطبقتين مطابقتين يُبلِّغ أقربهما لا أوّلهما — أيًّا كان الترتيب', () => {
    // #2c7fff يبعد بايتًا واحدًا (داخل العتبة)، و#2b7fff هو الهدف نفسه (مسافة صفر).
    const off = matchDeclarations(decls({ 'box-shadow': '0 0 0 1px #2c7fff' }), targetLab)
    expect(off[0]?.deltaE).toBeGreaterThan(0)
    expect(off[0]?.deltaE).toBeLessThan(USAGE_DELTA)

    const offFirst = matchDeclarations(
      decls({ 'box-shadow': '0 0 0 1px #2c7fff, 0 0 0 2px #2b7fff' }),
      targetLab,
    )
    const exactFirst = matchDeclarations(
      decls({ 'box-shadow': '0 0 0 2px #2b7fff, 0 0 0 1px #2c7fff' }),
      targetLab,
    )
    expect(offFirst).toHaveLength(1)
    expect(exactFirst).toHaveLength(1)
    expect(offFirst[0]?.deltaE).toBeCloseTo(0, 10)
    expect(exactFirst[0]?.deltaE).toBeCloseTo(0, 10)
  })

  it('طبقة شفّافة تمامًا في الظلّ لا تطابق حتى لو وافق لونُها الهدف', () => {
    const black = oklabOf(readColour('#000000')!)
    const shadow = decls({ 'box-shadow': '0 0 0 1px rgba(0, 0, 0, 0)' })
    expect(matchDeclarations(shadow, black)).toEqual([])
    // والطبقة المعتمة بعدها تُطابَق كالمعتاد.
    const both = decls({ 'box-shadow': '0 0 0 1px rgba(0, 0, 0, 0), 0 2px 4px #000000' })
    expect(matchDeclarations(both, black)).toHaveLength(1)
  })

  it('ظلّ بطبقات غير مطابقة كلّها لا يُنتج مطابقة', () => {
    const shadow = decls({ 'box-shadow': '0 0 0 1px #ff0000, 0 4px 8px #00ff00' })
    expect(matchDeclarations(shadow, targetLab)).toEqual([])
  })
})

describe('idleScheduler — مُجدوِل الإنتاج', () => {
  it('حيث لا requestIdleCallback يسقط إلى setTimeout بصفر لا إلى «لا يعمل»', () => {
    const timers: { fn: () => void; ms: number }[] = []
    const win = {
      setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
    } as unknown as Window
    const run = vi.fn()

    idleScheduler(win)(run)

    expect(run).not.toHaveBeenCalled() // مؤجَّل لا متزامن
    expect(timers).toHaveLength(1)
    expect(timers[0]?.ms).toBe(0)
    timers[0]?.fn()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('مع requestIdleCallback تُمرَّر المهلة القصوى — بلا مهلة قد لا يبدأ المسح أبدًا', () => {
    const seen: { self: unknown; options: unknown }[] = []
    let queued: (() => void) | null = null
    const win = {
      requestIdleCallback(this: unknown, cb: () => void, options?: object) {
        seen.push({ self: this, options })
        queued = cb
        return 1
      },
      setTimeout: vi.fn(),
    }
    const run = vi.fn()

    idleScheduler(win as unknown as Window)(run)

    expect(IDLE_TIMEOUT_MS).toBe(500)
    expect(seen).toHaveLength(1)
    // تُستدعى على النافذة نفسها: فصلها عن مالكها يرمي «Illegal invocation» في كروم.
    expect(seen[0]?.self).toBe(win)
    expect(seen[0]?.options).toEqual({ timeout: IDLE_TIMEOUT_MS })
    expect(win.setTimeout).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
    queued!()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('خاصّية requestIdleCallback غير الدالّة تُعامَل غيابًا', () => {
    const timers: number[] = []
    const win = {
      requestIdleCallback: 'not-a-function',
      setTimeout: (_fn: () => void, ms: number) => timers.push(ms),
    } as unknown as Window
    idleScheduler(win)(() => undefined)
    expect(timers).toEqual([0])
  })
})

describe('scanColourUsage — الافتراضات', () => {
  function page(html: string): { root: HTMLElement; win: Window } {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.appendChild(root)
    return { root, win: window }
  }

  it('بلا مُجدوِل يجري متزامنًا ويحلّ الوعد بالنتيجة الكاملة', async () => {
    const { root, win } = page(`<p style="color: ${TARGET}">س</p><p style="color: #ff0000">ص</p>`)
    const handle = scanColourUsage(readColour(TARGET)!, { root, win })
    const hits = await handle.done
    expect(hits).toHaveLength(1)
    expect(hits[0]?.matches[0]?.property).toBe('color')
    root.remove()
  })

  it('الشريحة الافتراضية مئتا عنصر — التقدّم يُبلَّغ بها', async () => {
    expect(CHUNK_SIZE).toBe(200)
    const { root, win } = page('<i></i>'.repeat(250))
    const seen: [number, number][] = []
    await scanColourUsage(readColour(TARGET)!, {
      root,
      win,
      onProgress: (scanned, total) => seen.push([scanned, total]),
    }).done
    expect(seen).toEqual([
      [200, 250],
      [250, 250],
    ])
    root.remove()
  })

  it('`skip` يستبعد العنصر نفسه لا ذرّيّته وحدها', async () => {
    const { root, win } = page(`<b id="ours" style="color: ${TARGET}">نحن</b>`)
    const hits = await scanColourUsage(readColour(TARGET)!, {
      root,
      win,
      skip: root.querySelector('#ours'),
    }).done
    expect(hits).toEqual([])
    root.remove()
  })

  it('الإلغاء قبل الشريحة الأولى يسلّم قائمة فارغة', async () => {
    const { root, win } = page(`<b style="color: ${TARGET}">س</b>`)
    const queue: (() => void)[] = []
    const handle = scanColourUsage(readColour(TARGET)!, {
      root,
      win,
      schedule: (run) => queue.push(run),
    })
    handle.cancel()
    queue.shift()?.()
    expect(await handle.done).toEqual([])
    root.remove()
  })
})

describe('collectDeclaredColours — الظلال والاستبعاد والتقدّم', () => {
  function page(html: string): { root: HTMLElement; win: Window } {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.appendChild(root)
    return { root, win: window }
  }
  const hexOf = (d: { colour: Parameters<typeof formatColour>[0] }): string =>
    formatColour(d.colour).hex

  it('الظلّ المركَّب يُفكَّك إلى ألوان طبقاته كلٍّ بموضع shadow', async () => {
    const { root, win } = page(
      '<div style="box-shadow: 0 1px 2px #2b7fff, inset 0 0 0 1px #ffffff, 0 0 0 1px rgba(0, 0, 0, 0)">س</div>',
    )
    const found = await collectDeclaredColours({ root, win }).done
    const shadows = found.filter((d) => d.site === 'shadow').map(hexOf)
    // الطبقة الشفّافة تمامًا لا تُحسب لونًا مصرَّحًا.
    expect(shadows).toEqual(['#2b7fff', '#ffffff'])
    root.remove()
  })

  it('لون الظلّ نفسه على عنصرين يُفرَّد مرّة واحدة', async () => {
    const { root, win } = page(
      '<div style="box-shadow: 0 1px 2px #2b7fff">س</div><p style="text-shadow: 0 0 2px #2b7fff">ص</p>',
    )
    const found = await collectDeclaredColours({ root, win }).done
    // `box-shadow` و`text-shadow` كلاهما موضع «shadow» — فالمفتاح واحد.
    expect(found.filter((d) => d.site === 'shadow')).toHaveLength(1)
    root.remove()
  })

  it('قيمة ليست لونًا (`none`) لا تدخل القائمة', async () => {
    const { root, win } = page('<svg style="fill: none; stroke: none"></svg>')
    const found = await collectDeclaredColours({ root, win }).done
    expect(found.filter((d) => d.site === 'icon')).toEqual([])
    root.remove()
  })

  it('`skip` يستبعد العنصر وذرّيّته فلا تُحسب ألوان طبقتنا', async () => {
    const { root, win } = page(`
      <div id="ours"><b style="color: #7c3aed">لوحتنا</b></div>
      <b style="color: #0ea5e9">الصفحة</b>
    `)
    const found = await collectDeclaredColours({ root, win, skip: root.querySelector('#ours') })
      .done
    const text = found.filter((d) => d.site === 'text').map(hexOf)
    expect(text).toContain('#0ea5e9')
    expect(text).not.toContain('#7c3aed')
    root.remove()
  })

  it('التقدّم يُبلَّغ بمقام معلوم وبحجم الشريحة الممرَّر', async () => {
    const { root, win } = page('<i style="color:#7c3aed"></i>'.repeat(5))
    const seen: [number, number][] = []
    await collectDeclaredColours({
      root,
      win,
      chunkSize: 2,
      onProgress: (scanned, total) => seen.push([scanned, total]),
    }).done
    expect(seen).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ])
    root.remove()
  })

  it('الإلغاء قبل الشريحة الأولى يسلّم قائمة فارغة', async () => {
    const { root, win } = page('<i style="color:#7c3aed"></i>')
    const queue: (() => void)[] = []
    const handle = collectDeclaredColours({ root, win, schedule: (run) => queue.push(run) })
    handle.cancel()
    queue.shift()?.()
    expect(await handle.done).toEqual([])
    root.remove()
  })
})
