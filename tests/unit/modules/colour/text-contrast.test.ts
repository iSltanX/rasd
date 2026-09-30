import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { floorRatio } from '@/modules/colour/audit'
import {
  collectTextElements,
  createContrastProbe,
  flatParent,
  measureTextContrast,
  visibleBox,
} from '@/modules/colour/text-contrast'

/**
 * القارئ على شجرةٍ حيّة: الطبقات الشفّافة وشفافية المجموعات من DOM، و«تعذّر الحساب» لنصٍّ فوق صورة.
 *
 * happy-dom بلا محرّك أنماط كامل، فالأنماط المحسوبة تُحقن بالشكل الذي تسلّمه المتصفّحات (نمط
 * `observe.test.ts`)، والمختبَر قراءة الشجرة وحكمها. والرسم الحقيقي يثبته `verify:colour`.
 */

type Styles = Record<string, string>
const styles = new Map<Element, Styles>()
let reads = 0

beforeEach(() => {
  styles.clear()
  reads = 0
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    reads += 1
    const own = styles.get(el) ?? {}
    return {
      getPropertyValue: (name: string) => own[name] ?? '',
      color: own.color ?? 'rgb(0, 0, 0)',
      display: own.display ?? 'block',
      opacity: own.opacity ?? '1',
      fontSize: own['font-size'] ?? '16px',
      fontWeight: own['font-weight'] ?? '400',
      backgroundColor: own['background-color'] ?? 'rgba(0, 0, 0, 0)',
      backgroundImage: own['background-image'] ?? 'none',
    } as unknown as CSSStyleDeclaration
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const $ = (selector: string, root: ParentNode = document): Element => {
  const el = root.querySelector(selector)
  if (!el) throw new Error(`لا عنصر ${selector}`)
  return el
}

/** جسمٌ أبيض معتم وداخله `html` — كل حالة تبني فوقه. */
function page(html: string): void {
  document.body.innerHTML = html
  styles.set(document.body, { 'background-color': 'rgb(255, 255, 255)' })
}

const ratioOf = (el: Element): string | null => {
  const read = createContrastProbe().measure(el)
  return read ? floorRatio(read.ratio) : null
}

describe('measure — التراكب الشفّاف من الشجرة', () => {
  it('طبقة سوداء بنصف شفافية بين الجسم والنصّ الأبيض: الخلفية 128 والنسبة 3.94', () => {
    page('<div id="veil"><span id="t">نصّ</span></div>')
    styles.set($('#veil'), { 'background-color': 'rgba(0, 0, 0, 0.5)' })
    styles.set($('#t'), { color: 'rgb(255, 255, 255)' })

    const read = createContrastProbe().measure($('#t'))
    expect(read?.bg).toEqual({ r: 128, g: 128, b: 128 })
    expect(read?.fg).toEqual({ r: 255, g: 255, b: 255 })
    expect(floorRatio(read?.ratio ?? 0)).toBe('3.94')
    expect(read?.unknown).toBeNull()
  })

  it('`opacity: 0.5` على حاويةٍ سوداء معتمة تُظهر الجسم الأبيض تحتها', () => {
    page('<div id="card"><p id="t">نصّ</p></div>')
    styles.set($('#card'), { 'background-color': 'rgb(0, 0, 0)', opacity: '0.5' })
    styles.set($('#t'), { color: 'rgb(255, 255, 255)' })

    const read = createContrastProbe().measure($('#t'))
    expect(read?.bg).toEqual({ r: 128, g: 128, b: 128 })
    expect(read?.fg).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('لون النصّ بألفاه: أسود بنصف شفافية على الأبيض يُرسم 128', () => {
    page('<p id="t">نصّ</p>')
    styles.set($('#t'), { color: 'rgba(0, 0, 0, 0.5)' })

    expect(createContrastProbe().measure($('#t'))?.fg).toEqual({ r: 128, g: 128, b: 128 })
  })

  it('`-webkit-text-fill-color` هو المرسوم ولو خالف `color`', () => {
    page('<p id="t">نصّ</p>')
    styles.set($('#t'), {
      color: 'rgb(0, 0, 0)',
      '-webkit-text-fill-color': 'rgb(255, 255, 255)',
    })

    expect(ratioOf($('#t'))).toBe('1.00')
  })

  it('`display: contents` لا صندوق له فلا تُرسم خلفيته', () => {
    page('<div id="ghost"><p id="t">نصّ</p></div>')
    styles.set($('#ghost'), { display: 'contents', 'background-color': 'rgb(0, 0, 0)' })

    expect(ratioOf($('#t'))).toBe('21.00')
  })

  it('صفحةٌ بلا خلفية أصلًا: الأبيض تحتها', () => {
    document.body.innerHTML = '<p id="t">نصّ</p>'
    expect(createContrastProbe().measure($('#t'))?.bg).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('النصّ الكبير يُقرأ من الخطّ ووزنه', () => {
    page('<h2 id="big">عنوان</h2><b id="bold">عريض</b><p id="small">عادي</p>')
    styles.set($('#big'), { 'font-size': '24px' })
    styles.set($('#bold'), { 'font-size': '18.6667px', 'font-weight': '700' })

    const probe = createContrastProbe()
    expect(probe.measure($('#big'))?.large).toBe(true)
    expect(probe.measure($('#bold'))?.large).toBe(true)
    expect(probe.measure($('#small'))?.large).toBe(false)
  })

  it('الذاكرة: خلفية كل عنصر تُقرأ مرّة في الجولة ولو قيس تحتها مئة نصّ', () => {
    page(`<main id="m">${'<p>نصّ</p>'.repeat(100)}</main>`)
    const probe = createContrastProbe()
    for (const p of document.querySelectorAll('#m p')) probe.measure(p)
    // مئة فقرة: قراءة للنصّ وقراءة للخلفية لكلٍّ، ثمّ `main` و`body` و`html` مرّة لكلٍّ.
    expect(reads).toBe(203)
  })
})

describe('measure — «تعذّر الحساب» بلا رقم مختلَق', () => {
  it('نصٌّ فوق صورة خلفية ⟵ image', () => {
    page('<section id="hero"><h1 id="t">عنوان</h1></section>')
    styles.set($('#hero'), { 'background-image': 'url("hero.jpg")' })

    expect(createContrastProbe().measure($('#t'))?.unknown).toBe('image')
  })

  it('نصٌّ فوق تدرّج ⟵ gradient', () => {
    page('<a id="cta"><span id="t">زرّ</span></a>')
    styles.set($('#cta'), { 'background-image': 'linear-gradient(red, blue)' })

    expect(createContrastProbe().measure($('#t'))?.unknown).toBe('gradient')
  })

  it('صورةٌ على العنصر نفسه تُرسم فوق لون خلفيته المعتم فتبقى ظاهرة', () => {
    page('<p id="t">نصّ</p>')
    styles.set($('#t'), {
      'background-color': 'rgb(255, 255, 255)',
      'background-image': 'url(x.png)',
    })

    expect(createContrastProbe().measure($('#t'))?.unknown).toBe('image')
  })

  it('صورةٌ يحجبها أبٌ معتم أقرب إلى النصّ لا تُسقط الحساب', () => {
    page('<section id="hero"><div id="card"><p id="t">نصّ</p></div></section>')
    styles.set($('#hero'), { 'background-image': 'url(hero.jpg)' })
    styles.set($('#card'), { 'background-color': 'rgb(255, 255, 255)' })

    const read = createContrastProbe().measure($('#t'))
    expect(read?.unknown).toBeNull()
    expect(floorRatio(read?.ratio ?? 0)).toBe('21.00')
  })

  it('…إلا أن يكون الأب المعتم نصف شفّاف بـ`opacity`: الصورة تُرى من خلاله', () => {
    page('<section id="hero"><div id="card"><p id="t">نصّ</p></div></section>')
    styles.set($('#hero'), { 'background-image': 'url(hero.jpg)' })
    styles.set($('#card'), { 'background-color': 'rgb(255, 255, 255)', opacity: '0.9' })

    expect(createContrastProbe().measure($('#t'))?.unknown).toBe('image')
  })

  it('نصٌّ مقصوص على تدرّج (`background-clip: text`) ⟵ gradient', () => {
    page('<h1 id="t">عنوان</h1>')
    styles.set($('#t'), {
      '-webkit-text-fill-color': 'rgba(0, 0, 0, 0)',
      '-webkit-background-clip': 'text',
      'background-image': 'linear-gradient(red, blue)',
    })

    expect(createContrastProbe().measure($('#t'))?.unknown).toBe('gradient')
  })

  it('لونٌ شفّاف بلا قصّ لا نصّ يُرسم ⟵ null لا نتيجة', () => {
    page('<p id="t">نصّ</p>')
    styles.set($('#t'), { color: 'rgba(0, 0, 0, 0)' })

    expect(createContrastProbe().measure($('#t'))).toBeNull()
  })

  it('خطٌّ أصغر من بكسل ⟵ null', () => {
    page('<p id="t">نصّ</p>')
    styles.set($('#t'), { 'font-size': '0px' })

    expect(createContrastProbe().measure($('#t'))).toBeNull()
  })

  it('لونٌ لا يُقرأ ⟵ unreadable', () => {
    page('<p id="t">نصّ</p>')
    styles.set($('#t'), { color: 'ليس لونًا' })

    expect(createContrastProbe().measure($('#t'))?.unknown).toBe('unreadable')
  })
})

describe('measure — عنصرٌ ليس من الآباء مرسومٌ تحت النصّ', () => {
  /** نصٌّ مموضع فوق صورة أخته — نمط «البطل» الشائع. */
  function hero(): { t: Element; img: Element; box: DOMRect } {
    page('<div id="wrap"><img id="img" alt=""><h1 id="t">عنوان</h1></div>')
    return { t: $('#t'), img: $('#img'), box: new DOMRect(10, 10, 200, 40) }
  }

  it('صورةٌ أختٌ تحت النصّ في مكدّس الإصابة ⟵ overlap', () => {
    const { t, img, box } = hero()
    const hit = vi.fn(() => [t, img, $('#wrap'), document.body, document.documentElement])
    document.elementsFromPoint = hit

    expect(createContrastProbe().measure(t, box)?.unknown).toBe('overlap')
    expect(hit).toHaveBeenCalledWith(110, 30)
  })

  it('طبقةٌ ملوّنة مموضعة ليست من الآباء ⟵ overlap', () => {
    page('<div id="layer"></div><p id="t">نصّ</p>')
    styles.set($('#layer'), { 'background-color': 'rgb(20, 20, 20)' })
    document.elementsFromPoint = vi.fn(() => [$('#t'), $('#layer'), document.body])

    expect(createContrastProbe().measure($('#t'), new DOMRect(0, 0, 50, 20))?.unknown).toBe(
      'overlap',
    )
  })

  it('الآباء وحدهم تحت النصّ ⟵ لا تداخل', () => {
    const { t, box } = hero()
    document.elementsFromPoint = vi.fn(() => [
      t,
      $('#wrap'),
      document.body,
      document.documentElement,
    ])

    expect(createContrastProbe().measure(t, box)?.unknown).toBeNull()
  })

  it('صورةٌ تحت أبٍ معتم لا تُرى من تحت النصّ ⟵ لا تداخل', () => {
    page('<img id="img" alt=""><div id="card"><p id="t">نصّ</p></div>')
    styles.set($('#card'), { 'background-color': 'rgb(255, 255, 255)' })
    document.elementsFromPoint = vi.fn(() => [$('#t'), $('#card'), $('#img'), document.body])

    expect(createContrastProbe().measure($('#t'), new DOMRect(0, 0, 50, 20))?.unknown).toBeNull()
  })

  it('نصٌّ خارج النافذة لا يُختبر بالإصابة — يُقرأ من آبائه', () => {
    const { t } = hero()
    const hit = vi.fn(() => [])
    document.elementsFromPoint = hit

    createContrastProbe().measure(t, new DOMRect(10, 5000, 200, 40))
    expect(hit).not.toHaveBeenCalled()
  })

  it('`measureTextContrast` يمرّر مستطيل العنصر نفسه', () => {
    const { t, img } = hero()
    vi.spyOn(t, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20))
    document.elementsFromPoint = vi.fn(() => [t, img, document.body])

    expect(measureTextContrast(t)?.unknown).toBe('overlap')
  })
})

describe('flatParent — الشجرة المرسومة', () => {
  /**
   * مضيفٌ بجذر ظلّ فيه إطارٌ وفتحة، وعنصرٌ من المستند مُسندٌ إليها. happy-dom لا يُسند العناصر إلى الفتحات،
   * فيُعطى `assignedSlot` كما يعطيه المتصفّح — والمختبَر أن القارئ يصعد منه لا من الأب في المستند.
   */
  function slotted(): { host: Element; light: Element; frame: Element; slot: Element } {
    page('<div id="host"><span id="light">نصّ</span></div>')
    const host = $('#host')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<div id="frame"><slot></slot></div>'
    const slot = $('slot', shadow)
    const light = $('#light')
    Object.defineProperty(light, 'assignedSlot', { value: slot })
    return { host, light, frame: $('#frame', shadow), slot }
  }

  it('العنصر المسند إلى فتحة يصعد إلى الفتحة، وجذر الظلّ إلى مضيفه', () => {
    const { host, light, frame, slot } = slotted()

    expect(flatParent(light)).toBe(slot)
    expect(flatParent(frame)).toBe(host)
  })

  it('خلفية داخل جذر الظلّ تُرى تحت نصٍّ مُسند إلى فتحتها — لا خلفية الجسم', () => {
    const { light, frame } = slotted()
    styles.set(frame, { 'background-color': 'rgb(0, 0, 0)' })
    styles.set(light, { color: 'rgb(255, 255, 255)' })

    // أبيض على الإطار الأسود 21؛ ولو صعد من الأب في المستند لقرأ أبيض على الجسم الأبيض 1.
    expect(ratioOf(light)).toBe('21.00')
  })
})

describe('collectTextElements', () => {
  it('عنصرٌ لكل نصٍّ غير فارغ بترتيب المستند، مرّة لكلٍّ', () => {
    page('<h1>أ</h1><p>ب<b>ج</b>د</p><div>   </div><p>هـ</p>')
    expect(collectTextElements(document).map((e) => e.textContent)).toEqual(['أ', 'بجد', 'ج', 'هـ'])
  })

  it('لا نصّ من `script` و`style` و`svg` و`textarea` ولا من مضيف الطبقة', () => {
    page(
      '<script>x</script><style>p{}</style><svg><text>s</text></svg>' +
        '<textarea>t</textarea><div id="rasd"><p>طبقتنا</p></div><p id="ok">نصّ</p>',
    )
    expect(collectTextElements(document, $('#rasd'))).toEqual([$('#ok')])
  })

  it('يعبر جذور الظلّ المفتوحة', () => {
    page('<div id="host"></div><p id="after">بعد</p>')
    const shadow = $('#host').attachShadow({ mode: 'open' })
    shadow.innerHTML = '<p id="inner">داخل</p>'

    expect(collectTextElements(document)).toEqual([$('#inner', shadow), $('#after')])
  })
})

describe('visibleBox', () => {
  const rect = (x: number, y: number, w: number, h: number) => new DOMRect(x, y, w, h)

  it('نصٌّ ظاهر يُرجع مستطيله', () => {
    page('<p id="t">نصّ</p>')
    vi.spyOn($('#t'), 'getBoundingClientRect').mockReturnValue(rect(0, 0, 80, 20))
    expect(visibleBox($('#t'))?.width).toBe(80)
  })

  it('مخفيٌّ بحكم المتصفّح ⟵ null', () => {
    page('<p id="t">نصّ</p>')
    Object.assign($('#t'), { checkVisibility: () => false })
    vi.spyOn($('#t'), 'getBoundingClientRect').mockReturnValue(rect(0, 0, 80, 20))
    expect(visibleBox($('#t'))).toBeNull()
  })

  it('صندوقٌ بكسلٌ في بكسل (نمط قارئ الشاشة) ⟵ null', () => {
    page('<p id="t">نصّ</p>')
    vi.spyOn($('#t'), 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1, 1))
    expect(visibleBox($('#t'))).toBeNull()
  })

  it('مدفوعٌ قبل بداية الصفحة (`left: -9999px`) ⟵ null', () => {
    page('<p id="t">نصّ</p>')
    vi.spyOn($('#t'), 'getBoundingClientRect').mockReturnValue(rect(-9999, 0, 80, 20))
    expect(visibleBox($('#t'))).toBeNull()
  })
})
