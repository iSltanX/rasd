/**
 * جمع أوراق الأنماط — من ثلاثة مصادر، وبإعلان ما تعذّر.
 *
 * happy-dom لا يملأ `href` ولا `ownerNode` ولا `parentStyleSheet` في أوراقه،
 * ولا يجعل `document instanceof Document` صادقًا، ولا يعرف `@import` ولا الورقة
 * المحجوبة بأصل آخر. فما يعتمد على تلك الحقول يُختبَر بأوراق وجذور **مزيَّفة بشكل
 * CSSOM الحقيقي** — والمنطق المختبَر هو تفريع القراءة لا المحرّك. وصدق الأرقام
 * على متصفّح حقيقي مقياسه `scripts/verify-inspect.mjs`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  collectSheets,
  readRules,
  sheetApplies,
  sheetsFingerprint,
  type SheetEntry,
} from '@/modules/computed-style/sheets'

/** ورقة مزيَّفة: لا عنوان ولا عقدة ولا أب، فارغة القواعد، بلا وسائط. */
function fakeSheet(over: Record<string, unknown> = {}): CSSStyleSheet {
  return {
    cssRules: [],
    href: null,
    ownerNode: null,
    parentStyleSheet: null,
    disabled: false,
    media: { mediaText: '' },
    ...over,
  } as unknown as CSSStyleSheet
}

/** ورقة تُرمى قراءة `cssRules` منها كما تفعل ورقة من أصل آخر. */
function blockedSheet(over: Record<string, unknown> = {}, thrown: unknown = null): CSSStyleSheet {
  const err = thrown ?? Object.assign(new Error('Cannot access rules'), { name: 'SecurityError' })
  const sheet = fakeSheet(over)
  Object.defineProperty(sheet, 'cssRules', {
    get() {
      throw err as Error
    },
  })
  return sheet
}

/** جذر مستند مزيَّف — يمرّ عليه `instanceof Document` فيُعدّ مستندًا. */
function fakeDocument(
  sheets: readonly (CSSStyleSheet | undefined)[],
  adopted?: readonly CSSStyleSheet[],
): Document {
  return Object.create(Document.prototype, {
    styleSheets: { value: sheets },
    adoptedStyleSheets: { value: adopted },
  }) as Document
}

/** جذر ظلّ مزيَّف — ليس مستندًا فتُوسَم متبنّاته `shadow`. */
function fakeShadow(
  sheets: readonly (CSSStyleSheet | undefined)[],
  adopted?: readonly CSSStyleSheet[],
): ShadowRoot {
  return { styleSheets: sheets, adoptedStyleSheets: adopted } as unknown as ShadowRoot
}

/** عقدة `<style>` حقيقية بسمات معطاة. */
function styleNode(attrs: Record<string, string> = {}): HTMLStyleElement {
  const el = document.createElement('style')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

const entry = (over: Partial<SheetEntry> = {}): SheetEntry => ({
  sheet: fakeSheet(),
  source: { kind: 'style', label: '<style> #0' },
  disabled: false,
  media: '',
  ...over,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readRules — قواعد أو سبب صريح للتعذّر', () => {
  it('ورقة قابلة للقراءة تُرجع قواعدها مصفوفةً', () => {
    const el = document.createElement('style')
    el.textContent = '.a { color: red } .b { color: blue }'
    document.head.append(el)

    const read = readRules(el.sheet as CSSStyleSheet)

    expect(read.state).toBe('readable')
    if (read.state !== 'readable') return
    expect(Array.isArray(read.rules)).toBe(true)
    expect(read.rules.map((r) => (r as CSSStyleRule).selectorText)).toEqual(['.a', '.b'])
    el.remove()
  })

  it('«صفر قاعدة» حالة قراءة ناجحة لا تعذّر', () => {
    // الخلط بينهما هو ما يجعل الفاحص يكذب: الفارغة مقروءة، المحجوبة لا.
    expect(readRules(fakeSheet())).toEqual({ state: 'readable', rules: [] })
  })

  it('الحجب يُعلَن بأصل الورقة واسم الاستثناء', () => {
    const read = readRules(blockedSheet({ href: 'https://cdn.example.com/lib/site.css?v=3' }))

    expect(read).toEqual({
      state: 'blocked',
      origin: 'https://cdn.example.com',
      detail: 'SecurityError',
    })
  })

  it('ورقة محجوبة بلا عنوان تُعلَن بأصل فارغ', () => {
    expect(readRules(blockedSheet({ href: null }))).toMatchObject({ state: 'blocked', origin: '' })
  })

  it('عنوان لا يُحلَّل يبقى كما هو أصلًا بدل أن يضيع', () => {
    // `new URL` يرمي عليه؛ الأصل الفارغ سيخفي أن للورقة عنوانًا أصلًا.
    expect(readRules(blockedSheet({ href: 'not a url' }))).toMatchObject({
      state: 'blocked',
      origin: 'not a url',
    })
  })

  it('مرمى بلا اسم يُعرَض نصّه بدل أن يسقط الفحص', () => {
    expect(readRules(blockedSheet({}, 'boom'))).toMatchObject({ detail: 'boom' })
    expect(readRules(blockedSheet({}, {}))).toMatchObject({ detail: '[object Object]' })
  })

  it('مرمى `null` لا يكسر القراءة نفسها', () => {
    // `throw null` يبلغ `catch` بلا خاصّية `name` يُقرَأ منها.
    const sheet = fakeSheet()
    Object.defineProperty(sheet, 'cssRules', {
      get() {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw null
      },
    })
    expect(readRules(sheet)).toMatchObject({ state: 'blocked', detail: 'null' })
  })
})

describe('collectSheets — ثلاثة مصادر', () => {
  it('ورقة `<link>` بعنوانها', () => {
    const sheet = fakeSheet({ href: 'https://example.com/app.css' })

    const [only] = collectSheets(fakeDocument([sheet]))

    expect(only?.sheet).toBe(sheet)
    expect(only?.source).toEqual({ kind: 'link', href: 'https://example.com/app.css' })
  })

  it('ورقة `@import` مصدرها ورقة أبيها لا عقدة', () => {
    // الفحص يسبق العنوان: المستورَدة لها `href` أيضًا لكنها ليست `link`.
    const sheet = fakeSheet({
      href: 'https://example.com/part.css',
      parentStyleSheet: fakeSheet({ href: 'https://example.com/main.css' }),
    })

    expect(collectSheets(fakeDocument([sheet]))[0]?.source).toEqual({
      kind: 'imported',
      href: 'https://example.com/part.css',
      viaHref: 'https://example.com/main.css',
    })
  })

  it('مستورَدة بلا عناوين تُملأ بنصّ فارغ لا `null`', () => {
    // أبوها ورقة `<style>` (بلا `href`) وهي نفسها بلا `href`.
    const sheet = fakeSheet({ parentStyleSheet: fakeSheet() })

    expect(collectSheets(fakeDocument([sheet]))[0]?.source).toEqual({
      kind: 'imported',
      href: '',
      viaHref: '',
    })
  })

  it('`<style>` بمعرّف يُوصَف بمعرّفه', () => {
    const sheet = fakeSheet({ ownerNode: styleNode({ id: 'theme', class: 'x' }) })

    expect(collectSheets(fakeDocument([sheet]))[0]?.source).toEqual({
      kind: 'style',
      label: '<style id="theme">',
    })
  })

  it('`<style>` بلا معرّف يُوصَف بأوّل صنف فيه', () => {
    const sheet = fakeSheet({ ownerNode: styleNode({ class: 'critical inline' }) })

    expect(collectSheets(fakeDocument([sheet]))[0]?.source).toEqual({
      kind: 'style',
      label: '<style class="critical">',
    })
  })

  it('معرّف فارغ لا يحجب الصنف', () => {
    const sheet = fakeSheet({ ownerNode: styleNode({ id: '', class: 'base' }) })

    expect(collectSheets(fakeDocument([sheet]))[0]?.source).toEqual({
      kind: 'style',
      label: '<style class="base">',
    })
  })

  it('`<style>` بلا معرّف ولا صنف يُوصَف بترتيبه بين الأوراق', () => {
    // الفهرس فهرسها في القائمة لا في مصفوفة الناتج.
    const first = fakeSheet({ href: 'https://example.com/a.css' })
    const second = fakeSheet({ ownerNode: styleNode() })

    const out = collectSheets(fakeDocument([first, second]))

    expect(out[1]?.source).toEqual({ kind: 'style', label: '<style> #1' })
  })

  it('ورقة بلا عنوان ولا عقدة مُنشأة برمجيًّا', () => {
    expect(collectSheets(fakeDocument([fakeSheet()]))[0]?.source).toEqual({
      kind: 'constructed',
      on: 'document',
    })
  })

  it('المتبنّاة تأتي بعد أوراق الجذر — لأنها تغلبها عند التعارض', () => {
    const listed = fakeSheet({ href: 'https://example.com/a.css' })
    const adopted = fakeSheet()

    const out = collectSheets(fakeDocument([listed], [adopted]))

    expect(out.map((e) => e.sheet)).toEqual([listed, adopted])
    expect(out[1]?.source).toEqual({ kind: 'constructed', on: 'document' })
  })

  it('المتبنّاة في جذر ظلّ تُوسَم `shadow`', () => {
    const adopted = fakeSheet()

    const out = collectSheets(fakeShadow([], [adopted]))

    expect(out).toHaveLength(1)
    expect(out[0]?.source).toEqual({ kind: 'constructed', on: 'shadow' })
  })

  it('جذر بلا `adoptedStyleSheets` لا يكسر الجمع', () => {
    // متصفّحات قديمة وجذور مزيَّفة لا تعرّف الخاصّية أصلًا.
    const sheet = fakeSheet({ href: 'https://example.com/a.css' })

    expect(collectSheets(fakeShadow([sheet], undefined))).toHaveLength(1)
  })

  it('ورقة في القائمة وفي المتبنّاة معًا تُحصى مرّة واحدة', () => {
    const shared = fakeSheet({ href: 'https://example.com/a.css' })

    const out = collectSheets(fakeDocument([shared, shared], [shared]))

    expect(out).toHaveLength(1)
    // المصدر الأوّل يبقى: `link` لا `constructed`.
    expect(out[0]?.source.kind).toBe('link')
  })

  it('خانة فارغة في القائمة تُتخطّى', () => {
    const sheet = fakeSheet({ href: 'https://example.com/a.css' })

    const out = collectSheets(fakeDocument([undefined, sheet]))

    expect(out).toHaveLength(1)
    expect(out[0]?.sheet).toBe(sheet)
  })

  it('`disabled` و`media` تُلتقط في المدخل', () => {
    const sheet = fakeSheet({
      href: 'https://example.com/print.css',
      disabled: true,
      media: { mediaText: 'print' },
    })

    const [only] = collectSheets(fakeDocument([sheet]))

    expect(only?.disabled).toBe(true)
    expect(only?.media).toBe('print')
  })

  it('ورقة بلا كائن `media` تُقرأ بوسائط فارغة', () => {
    const [only] = collectSheets(fakeDocument([fakeSheet({ media: undefined })]))

    expect(only?.media).toBe('')
  })

  it('جذر بلا أوراق يُرجع قائمة فارغة', () => {
    expect(collectSheets(fakeDocument([], []))).toEqual([])
  })
})

describe('sheetApplies — بوّابتا `disabled` و`media`', () => {
  /** نافذة مزيَّفة يُسجَّل فيها ما استُعلم عنه من وسائط. */
  const mediaWin = (matches: boolean | 'throws') => {
    const matchMedia = vi.fn((q: string) => {
      if (matches === 'throws') throw new SyntaxError(`bad query ${q}`)
      return { matches }
    })
    return { win: { matchMedia } as unknown as Window, matchMedia }
  }

  it('المعطَّلة لا تُطبَّق ولو لم تحمل وسائط', () => {
    const { win, matchMedia } = mediaWin(true)
    expect(sheetApplies(entry({ disabled: true }), win)).toBe(false)
    // لا حاجة لاستعلام الوسائط أصلًا.
    expect(matchMedia).not.toHaveBeenCalled()
  })

  it('بلا وسائط تُطبَّق دائمًا دون استعلام', () => {
    const { win, matchMedia } = mediaWin(false)
    expect(sheetApplies(entry({ media: '' }), win)).toBe(true)
    expect(matchMedia).not.toHaveBeenCalled()
  })

  it('الوسائط المطابقة تُطبَّق', () => {
    const { win, matchMedia } = mediaWin(true)
    expect(sheetApplies(entry({ media: 'screen' }), win)).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('screen')
  })

  it('الوسائط غير المطابقة لا تُطبَّق', () => {
    expect(sheetApplies(entry({ media: 'print' }), mediaWin(false).win)).toBe(false)
  })

  it('استعلام غير قابل للتقييم يُفترَض مطابقًا لا مُسقِطًا للورقة', () => {
    // إسقاط ورقة كاملة بسبب استعلام فسد أسوأ من إدخال قواعدها.
    expect(sheetApplies(entry({ media: '(((' }), mediaWin('throws').win)).toBe(true)
  })

  it('النافذة الافتراضية هي `window`', () => {
    const spy = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)

    expect(sheetApplies(entry({ media: 'print' }))).toBe(false)
    expect(spy).toHaveBeenCalledWith('print')
  })
})

describe('sheetsFingerprint — بصمة تكشف التقادم', () => {
  it('كل ورقة تُبصَم بعدد قواعدها وتعطيلها ووسائطها', () => {
    const a = fakeSheet({
      href: 'https://example.com/a.css',
      cssRules: [{}, {}, {}],
      disabled: true,
      media: { mediaText: 'print' },
    })
    const b = fakeSheet({ href: 'https://example.com/b.css', cssRules: [{}] })

    expect(sheetsFingerprint(fakeDocument([a, b]))).toBe('3:1:print|1:0:')
  })

  it('الورقة المحجوبة تُبصَم بـ-1 لا بصفر', () => {
    const blocked = blockedSheet({ href: 'https://other.example/x.css' })
    const empty = fakeSheet({ href: 'https://example.com/e.css' })

    expect(sheetsFingerprint(fakeDocument([blocked, empty]))).toBe('-1:0:|0:0:')
  })

  it('المتبنّاة تدخل البصمة بعد أوراق الجذر', () => {
    const listed = fakeSheet({ href: 'https://example.com/a.css', cssRules: [{}] })
    const adopted = fakeSheet({ cssRules: [{}, {}] })

    expect(sheetsFingerprint(fakeShadow([listed], [adopted]))).toBe('1:0:|2:0:')
  })

  it('تعطيل ورقة يغيّر البصمة وعدد قواعدها ثابت', () => {
    // هذا سبب ضمّ `disabled`: بصمة العدد وحدها لا تنتبه فيبقى الفهرس قديمًا.
    const sheet = fakeSheet({ href: 'https://example.com/a.css', cssRules: [{}, {}] })
    const root = fakeDocument([sheet])
    const before = sheetsFingerprint(root)

    Object.assign(sheet, { disabled: true })

    expect(sheetsFingerprint(root)).not.toBe(before)
  })

  it('تغيّر الوسائط يغيّر البصمة وعدد القواعد ثابت', () => {
    const sheet = fakeSheet({ href: 'https://example.com/a.css', cssRules: [{}] })
    const root = fakeDocument([sheet])
    const before = sheetsFingerprint(root)

    Object.assign(sheet, { media: { mediaText: 'print' } })

    expect(sheetsFingerprint(root)).not.toBe(before)
  })

  it('جذر بلا أوراق يعطي بصمة فارغة', () => {
    expect(sheetsFingerprint(fakeDocument([]))).toBe('')
  })
})
