import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createContrastAudit, LIMIT_MS, SLICE_MS } from '@/content/tools/contrast-audit'

/**
 * ناقل التدقيق: الشرائح والتقدّم، والحدّ الزمني بنتائجه الجزئية، والإلغاء بين شريحتين، والقفز إلى العنصر.
 *
 * الأنماط والمستطيلات تُحقن كما في `text-contrast.test.ts`؛ والساعة وترك الخيط يُمرَّران للأداة فلا يُنتظر
 * زمنٌ حقيقي.
 */

type Styles = Record<string, string>
const styles = new Map<Element, Styles>()
const hidden = new Set<Element>()
const scroll = vi.fn()

beforeEach(() => {
  styles.clear()
  hidden.clear()
  scroll.mockClear()
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const own = styles.get(el) ?? {}
    if (own.throw) throw new Error(own.throw)
    return {
      getPropertyValue: (name: string) => own[name] ?? '',
      color: own.color ?? 'rgb(0, 0, 0)',
      display: 'block',
      opacity: '1',
      fontSize: own['font-size'] ?? '16px',
      fontWeight: own['font-weight'] ?? '400',
      backgroundColor: own['background-color'] ?? 'rgba(0, 0, 0, 0)',
      backgroundImage: own['background-image'] ?? 'none',
    } as unknown as CSSStyleDeclaration
  })
  // happy-dom بلا تخطيط: كل عنصر مرئيّ بمستطيلٍ ثابت خارج النافذة (فلا اختبار إصابة) إلا المخفيّ.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return hidden.has(this) ? new DOMRect(0, 0, 0, 0) : new DOMRect(0, 5000, 100, 20)
  })
  Element.prototype.scrollIntoView = scroll
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const $ = (selector: string): Element => {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`لا عنصر ${selector}`)
  return el
}

/**
 * صفحةٌ بيضاء فيها: رماديّ فاتح (2.32) · رماديّ متوسّط (4.48) · عنوان كبير بـ3.4 يمرّ بحدّه · نصّ فوق صورة ·
 * نصّ أسود سليم · نصّ مخفيّ · وطبقتنا.
 */
function page(): void {
  document.body.innerHTML = `
    <p id="faint">نصّ التذييل</p>
    <p id="mid" class="card-desc">وصف البطاقة</p>
    <h2 id="big">عنوان القسم</h2>
    <section id="hero"><h1 id="over">العنوان فوق الصورة</h1></section>
    <p id="ok">نصّ سليم</p>
    <p id="gone">مخفيّ</p>
    <div id="rasd"><p>طبقتنا</p></div>`
  styles.set(document.body, { 'background-color': 'rgb(255, 255, 255)' })
  styles.set($('#faint'), { color: 'rgb(170, 170, 170)' })
  styles.set($('#mid'), { color: 'rgb(119, 119, 119)' })
  styles.set($('#big'), { color: 'rgb(137, 137, 137)', 'font-size': '24px' })
  styles.set($('#hero'), { 'background-image': 'url(hero.jpg)' })
  hidden.add($('#gone'))
}

/** ساعةٌ تتقدّم مللي ثانية مع كل قراءة — الشريحة تنتهي بعد عددٍ معروف من القراءات. */
function tickingClock(): () => number {
  let t = 0
  return () => (t += 1)
}

describe('start — المسح والحكم', () => {
  it('يعدّ الظاهر وحده ويرتّب ما دون الحدّ بالخطورة، و«تعذّر الحساب» آخرًا بلا رقم', async () => {
    page()
    const audit = createContrastAudit({ doc: document, skip: $('#rasd') })
    await audit.start()

    const { state } = audit
    expect(state.phase.value).toBe('done')
    // ستّة عناصر نصّ خارج طبقتنا، والمخفيّ لا يُقاس.
    expect(state.total.value).toBe(6)
    expect(state.done.value).toBe(6)
    expect(state.texts.value).toBe(5)
    expect(
      state.findings.value.map((f) => [f.severity, f.label, f.text, f.ratio?.toFixed(2)]),
    ).toEqual([
      ['below-3', '#faint', 'نصّ التذييل', '2.32'],
      ['below-4.5', '#mid', 'وصف البطاقة', '4.48'],
      ['unknown', '#over', 'العنوان فوق الصورة', undefined],
    ])
    expect(state.findings.value[2]?.unknown).toBe('image')
    expect(state.elapsed.value).not.toBeNull()
  })

  it('صفحةٌ كل نصّها سليم ⟵ لا نتائج والعدّ قائم', async () => {
    document.body.innerHTML = '<p>أ</p><p>ب</p>'
    const audit = createContrastAudit({ doc: document })
    await audit.start()

    expect(audit.state.phase.value).toBe('done')
    expect(audit.state.texts.value).toBe(2)
    expect(audit.state.findings.value).toEqual([])
  })

  it('صفحةٌ بلا نصّ ظاهر ⟵ صفر نصوص لا خطأ', async () => {
    document.body.innerHTML = '<div>   </div><p id="x">مخفيّ</p>'
    hidden.add($('#x'))
    const audit = createContrastAudit({ doc: document })
    await audit.start()

    expect(audit.state.phase.value).toBe('done')
    expect(audit.state.texts.value).toBe(0)
  })

  it('قراءةٌ ترمي ⟵ حالة الخطأ برسالتها لا حلقةٌ عالقة', async () => {
    document.body.innerHTML = '<p id="bad">نصّ</p>'
    styles.set($('#bad'), { throw: 'blocked' })
    const audit = createContrastAudit({ doc: document })
    await audit.start()

    expect(audit.state.phase.value).toBe('error')
    expect(audit.state.error.value).toBe('blocked')
  })

  it('جولةٌ ثانية أثناء الأولى لا تبدأ', async () => {
    page()
    // الانتظار الأوّل معلَّقٌ حتى يُطلق، وما بعده فوري — فتكتمل الأولى بعد الإطلاق.
    let release: () => void = () => undefined
    let gated = true
    const audit = createContrastAudit({
      doc: document,
      now: tickingClock(),
      sliceMs: 1,
      yieldToPage: () =>
        gated
          ? new Promise<void>((r) => {
              release = () => {
                gated = false
                r()
              }
            })
          : Promise.resolve(),
    })
    const first = audit.start()
    await audit.start()
    expect(audit.state.done.value).toBeLessThan(audit.state.total.value)
    release()
    await first
  })
})

describe('الشرائح والحدّ الزمني', () => {
  it('يترك الخيط للصفحة بين الشرائح ويكتب التقدّم في كلٍّ', async () => {
    page()
    const progress: number[] = []
    const audit = createContrastAudit({
      doc: document,
      now: tickingClock(),
      sliceMs: 3,
      yieldToPage: () => {
        progress.push(audit.state.done.peek())
        return Promise.resolve()
      },
    })
    await audit.start()

    expect(progress.length).toBeGreaterThan(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
    expect(audit.state.phase.value).toBe('done')
  })

  it('بلوغ الحدّ يوقف المسح بنتائجه الجزئية معلَنة، و«اعرض النتائج» يكشفها', async () => {
    page()
    const audit = createContrastAudit({
      doc: document,
      now: tickingClock(),
      sliceMs: 1,
      limitMs: 4,
      yieldToPage: () => Promise.resolve(),
    })
    await audit.start()

    const { state } = audit
    expect(state.phase.value).toBe('timeout')
    expect(state.done.value).toBeGreaterThan(0)
    expect(state.done.value).toBeLessThan(state.total.value)
    expect(state.findings.value.length).toBeGreaterThan(0)
    expect(state.partialShown.value).toBe(false)
    audit.showPartial()
    expect(state.partialShown.value).toBe(true)
  })

  it('الثوابت كما في الإطار والمواصفة: شريحة 12ms وحدٌّ خمس ثوانٍ', () => {
    expect(SLICE_MS).toBe(12)
    expect(LIMIT_MS).toBe(5000)
  })
})

describe('cancel — فوري بين شريحتين', () => {
  it('الإلغاء أثناء الانتظار يُسقط النتائج، والشريحة العائدة لا تكتب شيئًا', async () => {
    page()
    let release: () => void = () => undefined
    const audit = createContrastAudit({
      doc: document,
      now: tickingClock(),
      sliceMs: 1,
      yieldToPage: () => new Promise<void>((r) => (release = r)),
    })
    const run = audit.start()
    expect(audit.state.phase.value).toBe('scanning')

    audit.cancel()
    expect(audit.state.phase.value).toBe('cancelled')
    expect(audit.state.findings.value).toEqual([])

    release()
    await run
    expect(audit.state.phase.value).toBe('cancelled')
    expect(audit.state.findings.value).toEqual([])
    expect(audit.state.done.value).toBe(0)
  })

  it('الإغلاق أثناء المسح يُطفئ اللوحة ويوقف الجولة', async () => {
    page()
    let release: () => void = () => undefined
    const audit = createContrastAudit({
      doc: document,
      now: tickingClock(),
      sliceMs: 1,
      yieldToPage: () => new Promise<void>((r) => (release = r)),
    })
    const run = audit.start()
    audit.close()
    release()
    await run

    expect(audit.state.open.value).toBe(false)
    expect(audit.state.phase.value).toBe('idle')
    expect(audit.state.findings.value).toEqual([])
  })

  it('الإلغاء بلا جولة جارية لا يغيّر شيئًا', async () => {
    page()
    const audit = createContrastAudit({ doc: document })
    await audit.start()
    audit.cancel()
    expect(audit.state.phase.value).toBe('done')
  })
})

describe('select — القفز إلى العنصر وإبرازه', () => {
  it('يمرّر العنصر إلى الوسط ويضع إطاره ويسلّمه لـ«سجّلها مشكلة»', async () => {
    page()
    const audit = createContrastAudit({ doc: document })
    await audit.start()
    const first = audit.state.findings.value[0]
    if (!first) throw new Error('لا نتيجة')

    audit.select(first.id)
    expect(scroll.mock.contexts).toEqual([$('#faint')])
    expect(scroll).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
      behavior: 'instant',
    })
    expect(audit.state.selected.value).toBe(first.id)
    expect(audit.state.box.value).toMatchObject({ y: 5000, width: 100, height: 20 })
    expect(audit.selection()).toEqual({ el: $('#faint'), finding: first })
  })

  it('عنصرٌ أُزيل من الصفحة بعد المسح ⟵ لا إطار ولا تسجيل', async () => {
    page()
    const audit = createContrastAudit({ doc: document })
    await audit.start()
    const first = audit.state.findings.value[0]
    if (!first) throw new Error('لا نتيجة')
    audit.select(first.id)

    $('#faint').remove()
    audit.frame()
    expect(audit.state.box.value).toBeNull()
    expect(audit.selection()).toBeNull()
  })

  it('نتيجةٌ أزالت الصفحةُ عنصرها قبل النقر ⟵ إشعارٌ لا اختيارٌ صامت', async () => {
    page()
    const notify = vi.fn()
    const audit = createContrastAudit({ doc: document, notify })
    await audit.start()
    const first = audit.state.findings.value[0]
    if (!first) throw new Error('لا نتيجة')

    $('#faint').remove()
    audit.select(first.id)
    expect(audit.state.selected.value).toBeNull()
    expect(audit.selection()).toBeNull()
    expect(scroll).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'danger', title: 'لم يعد هذا النصّ في الصفحة' }),
    )
  })

  it('عنصرٌ أزالته الصفحة بعد اختياره ⟵ «سجّلها مشكلة» يُعلم ولا يصمت (المراجعة المستقلّة)', async () => {
    page()
    const notify = vi.fn()
    const audit = createContrastAudit({ doc: document, notify })
    await audit.start()
    const first = audit.state.findings.value[0]
    if (!first) throw new Error('لا نتيجة')
    audit.select(first.id)

    $('#faint').remove()
    expect(audit.selection()).toBeNull()
    expect(audit.state.selected.value).toBeNull()
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'danger', title: 'لم يعد هذا النصّ في الصفحة' }),
    )
  })

  it('معرّفٌ لا نتيجة له لا يغيّر الاختيار', async () => {
    page()
    const audit = createContrastAudit({ doc: document })
    await audit.start()
    audit.select(999)
    expect(audit.state.selected.value).toBeNull()
  })
})

describe('copyReport', () => {
  it('ينسخ التقرير بشرائحه ويُعلم بالنجاح', async () => {
    page()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const notify = vi.fn()
    const audit = createContrastAudit({ doc: document, skip: $('#rasd'), notify })
    await audit.start()
    await audit.copyReport()

    const text = String((writeText.mock.calls[0] as unknown[] | undefined)?.[0])
    expect(text).toContain('تدقيق التباين — ')
    expect(text).toContain('٥ نصوص · ٢ دون الحدّ · نصّ واحد بلا رقم')
    expect(text).toContain('لا تدقيق إتاحة كامل')
    expect(text).toContain('• 2.32 : 1 — #faint — «نصّ التذييل» — نصّ عادي الحجم')
    expect(text).toContain('• بلا رقم — #over — «العنوان فوق الصورة» — الخلفية صورة')
    expect(notify).toHaveBeenCalledWith({ tone: 'success', title: 'نُسخ التقرير' })
  })

  it('حافظةٌ ترفض ⟵ إشعار الفشل لا صمت', async () => {
    page()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    })
    const notify = vi.fn()
    const audit = createContrastAudit({ doc: document, notify })
    await audit.start()
    await audit.copyReport()

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'danger', title: 'تعذّر نسخ التقرير' }),
    )
  })
})
