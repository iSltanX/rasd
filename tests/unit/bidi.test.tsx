import { render } from 'preact'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  hasIsolates,
  isolate,
  LRI,
  mixed,
  NEVER_MIRROR,
  PDI,
  shouldMirror,
  stripIsolates,
} from '@/shared/bidi'
import { KeyCap, TechnicalValue } from '@/ui/TechnicalValue'

/**
 * عزل المقاطع التقنية.
 *
 * الخطر ليس جماليًا: سطر عربي يجاور محدِّدًا أو قيمة سداسية قد يُعرض بترتيب
 * مقلوب، فتصل القيمة المنسوخة إلى محرّر المطوّر خطأً.
 */

let host: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  host.setAttribute('dir', 'rtl')
  document.body.appendChild(host)
})

describe('محارف العزل', () => {
  it('يحيط النصّ بـLRI و PDI', () => {
    const out = isolate('.cta-btn')
    expect(out).toBe(`${LRI}.cta-btn${PDI}`)
    expect(out.codePointAt(0)).toBe(0x2066)
    expect(out.codePointAt(out.length - 1)).toBe(0x2069)
  })

  it('يكشف العزل ويزيله', () => {
    const wrapped = isolate('#3B82F6')
    expect(hasIsolates(wrapped)).toBe(true)
    expect(stripIsolates(wrapped)).toBe('#3B82F6')
    expect(hasIsolates(stripIsolates(wrapped))).toBe(false)
  })

  it('mixed يعزل كل قيمة ويترك العربية كما هي', () => {
    const line = mixed`الحشوة ${'14px 24px'} واللون ${'#3B82F6'}`
    expect(stripIsolates(line)).toBe('الحشوة 14px 24px واللون #3B82F6')
    // كل قيمة معزولة على حدة، لا السطر كلّه.
    expect(line.split(LRI).length - 1).toBe(2)
    expect(line.split(PDI).length - 1).toBe(2)
  })

  it('النصّ المعزول يحفظ ترتيبه المنطقي للنسخ', () => {
    const line = mixed`المتغيّر ${'--color-primary'} قيمته ${'#3B82F6'}`
    const plain = stripIsolates(line)
    expect(plain.indexOf('--color-primary')).toBeLessThan(plain.indexOf('#3B82F6'))
  })
})

describe('<TechnicalValue>', () => {
  it('يُخرج bdi باتجاه ltr وسمة العزل', () => {
    render(<TechnicalValue kind="selector">.cta-btn</TechnicalValue>, host)
    const el = host.querySelector('bdi')!
    expect(el).toBeTruthy()
    expect(el.getAttribute('dir')).toBe('ltr')
    expect(el.hasAttribute('data-technical')).toBe(true)
    expect(el.getAttribute('data-kind')).toBe('selector')
    expect(el.textContent).toBe('.cta-btn')
  })

  it('لا يحقن محارف غير مرئية — النسخ يعطي النصّ نظيفًا', () => {
    render(<TechnicalValue>#3B82F6</TechnicalValue>, host)
    const text = host.textContent ?? ''
    expect(text).toBe('#3B82F6')
    expect(hasIsolates(text)).toBe(false)
  })

  it('يحمل فئة نمط أحادي المسافة افتراضيًا', () => {
    render(<TechnicalValue>padding: 24px</TechnicalValue>, host)
    expect(host.querySelector('bdi')!.getAttribute('class')).toContain('t-mono-s')
  })

  it('نصّ عربي يحيط بقيمة تقنية: الترتيب المنطقي محفوظ', () => {
    render(
      <p>
        الحشوة <TechnicalValue kind="declaration">padding: 24px</TechnicalValue> واللون{' '}
        <TechnicalValue kind="color">#3B82F6</TechnicalValue>
      </p>,
      host,
    )
    const text = host.textContent ?? ''
    expect(text.indexOf('الحشوة')).toBeLessThan(text.indexOf('padding: 24px'))
    expect(text.indexOf('padding: 24px')).toBeLessThan(text.indexOf('واللون'))
    expect(text.indexOf('واللون')).toBeLessThan(text.indexOf('#3B82F6'))
  })

  it.each([
    ['selector', '.cta-btn'],
    ['property', 'background-color'],
    ['variable', '--color-primary'],
    ['color', '#3B82F6'],
    ['dimension', '1440 × 900'],
    ['declaration', 'padding: 24px'],
    ['path', 'src/shared/bidi'],
    ['url', 'https://example.com/a?b=1'],
    ['key', '⇧⌘F'],
    ['format', 'OKLCH'],
  ] as const)('يعزل %s', (kind, value) => {
    render(<TechnicalValue kind={kind}>{value}</TechnicalValue>, host)
    const el = host.querySelector('bdi')!
    expect(el.getAttribute('data-kind')).toBe(kind)
    expect(el.textContent).toBe(value)
    expect(el.getAttribute('dir')).toBe('ltr')
  })

  it('KeyCap يُخرج kbd يحوي bdi', () => {
    render(<KeyCap>Esc</KeyCap>, host)
    expect(host.querySelector('kbd bdi')?.textContent).toBe('Esc')
  })
})

describe('عكس الأيقونات', () => {
  it.each(['arrow-left', 'chevron-right', 'back', 'forward', 'undo', 'redo', 'dimension-h'])(
    'يعكس %s',
    (name) => {
      expect(shouldMirror(name)).toBe(true)
    },
  )

  it.each(['logo', 'check', 'close', 'play', 'eye', 'palette', 'star', 'mock-page'])(
    'لا يعكس %s',
    (name) => {
      expect(shouldMirror(name)).toBe(false)
    },
  )

  it('الشعار وعلامة الصحّ في قائمة المنع الصريحة', () => {
    expect(NEVER_MIRROR.has('logo')).toBe(true)
    expect(NEVER_MIRROR.has('check')).toBe(true)
  })

  it('يقبل الاسم مع سابقة icon/', () => {
    expect(shouldMirror('icon/arrow-left')).toBe(true)
    expect(shouldMirror('icon/logo')).toBe(false)
  })
})
