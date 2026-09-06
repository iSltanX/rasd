import { describe, expect, it } from 'vitest'

import { oklabOf, type Oklab } from '@/modules/colour/distance'
import { readColour } from '@/modules/colour/formats'
import {
  USAGE_DELTA,
  USAGE_PROPS,
  collectDeclaredColours,
  coloursInValue,
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
