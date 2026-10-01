import { describe, expect, it } from 'vitest'

import { GUIDE_HTML_CSP } from '@/modules/export/guide'
import {
  ANONYMOUS_TITLE,
  capturePageFilename,
  DEFAULT_SHARE_STRIP,
  keptFields,
  keptLabel,
  renderCapturePage,
  STRIP_ALL,
  type CapturePageInput,
  type ShareStrip,
} from '@/pages/share/capture-page'
import { shareRequested, SHARE_PARAM } from '@/pages/share/param'

/**
 * صفحة اللقطة المستقلّة — الوعد الذي تقطعه للمستلم: لا طلب شبكة من أيّ نوع، ولا يُكتب ما حذفه المرسِل في
 * الصفحة ولا في عنوانها ولا في اسم ملفّها.
 */

const colors = {
  canvas: '#000',
  surface: '#111',
  text: '#fff',
  muted: '#aaa',
  border: '#222',
  accent: '#0f0',
  onAccent: '#000',
}

const URL_WITH_TOKEN = 'https://shop.example/checkout?session=SECRET-TOKEN'
const CREATED = Date.UTC(2026, 8, 30, 10, 15)

function input(strip: ShareStrip, title = 'الواجهة — سطح المكتب'): CapturePageInput {
  return {
    title,
    url: URL_WITH_TOKEN,
    createdAt: CREATED,
    image: { bytes: new Uint8Array([1, 2, 3, 4, 5]), mime: 'image/webp', width: 1440, height: 900 },
    strip,
    palette: { light: colors, dark: colors },
    version: '1.0.0',
  }
}

/** كل مرجعٍ يطلبه المتصفّح من الصفحة: `src` و`href` و`url()` و`@import` و`srcset`. */
function references(html: string): string[] {
  const refs: string[] = []
  for (const m of html.matchAll(/\b(?:src|href|srcset|poster|action|data)\s*=\s*"([^"]*)"/giu)) {
    refs.push(m[1]!)
  }
  for (const m of html.matchAll(/url\(([^)]*)\)/giu)) refs.push(m[1]!)
  for (const m of html.matchAll(/@import\s+([^;]+);/giu)) refs.push(m[1]!)
  return refs
}

describe('renderCapturePage — بلا شبكة', () => {
  it('سياسة `default-src none` في الرأس، ولا مرجع إلا `data:`', () => {
    const html = renderCapturePage(input(DEFAULT_SHARE_STRIP))
    expect(html).toContain(`content="${GUIDE_HTML_CSP}"`)
    const refs = references(html)
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatch(/^data:image\/webp;base64,/u)
    expect(html).not.toMatch(/<script|<link|<iframe|<object|<embed|<form/iu)
  })

  it('الصورة بأبعادها الصريحة وبايتاتها Base64', () => {
    const html = renderCapturePage(input(DEFAULT_SHARE_STRIP))
    expect(html).toContain('src="data:image/webp;base64,AQIDBAU="')
    expect(html).toContain('width="1440" height="900"')
  })

  it('عربية من اليمين، بوضعين', () => {
    const html = renderCapturePage(input(DEFAULT_SHARE_STRIP))
    expect(html).toContain('<html lang="ar" dir="rtl">')
    expect(html).toContain('prefers-color-scheme:dark')
  })

  it('الرابط نصٌّ لا رابطٌ قابل للنقر — النقرة طلب شبكة', () => {
    const html = renderCapturePage(input({ url: false, title: false, time: true }))
    expect(html).toContain('checkout?session=SECRET-TOKEN')
    expect(html).not.toMatch(/<a\b/iu)
  })
})

describe('renderCapturePage — الحذف قبل المشاركة', () => {
  it('الافتراضي: الرابط والوقت محذوفان والعنوان باقٍ', () => {
    const html = renderCapturePage(input(DEFAULT_SHARE_STRIP))
    expect(html).not.toContain('SECRET-TOKEN')
    expect(html).not.toContain('shop.example')
    expect(html).not.toContain('2026')
    expect(html).toContain('الواجهة — سطح المكتب')
  })

  it('الحذف الكامل: لا رابط ولا وقت ولا عنوان — في الجسم ولا في `<title>` ولا في البديل', () => {
    const html = renderCapturePage(input(STRIP_ALL))
    expect(html).not.toContain('SECRET-TOKEN')
    expect(html).not.toContain('الواجهة')
    expect(html).toContain(`<title>${ANONYMOUS_TITLE}</title>`)
    expect(html).toContain(`alt="${ANONYMOUS_TITLE}"`)
  })

  it('بلا حذف: الثلاثة مكتوبة', () => {
    const html = renderCapturePage(input({ url: false, title: false, time: false }))
    expect(html).toContain('SECRET-TOKEN')
    expect(html).toContain('2026')
    expect(html).toContain('الواجهة — سطح المكتب')
  })

  it('اسم الملفّ لا يُسرّب العنوان المحذوف', () => {
    expect(capturePageFilename('خطّة سرّية', DEFAULT_SHARE_STRIP)).toBe('خطّة-سرّية.html')
    expect(capturePageFilename('خطّة سرّية', STRIP_ALL)).toBe('لقطة-من-رصد.html')
    expect(capturePageFilename('   ', DEFAULT_SHARE_STRIP)).toBe('لقطة-من-رصد.html')
  })

  it('العنوان يُهرَّب، ومحارف قلب الاتجاه تُحذف', () => {
    const html = renderCapturePage(
      input(DEFAULT_SHARE_STRIP, '<img src=x onerror=alert(1)>\u202eabc'),
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;abc')
    expect(html).not.toContain('\u202e')
  })
})

describe('ما بقي في الصفحة', () => {
  it('يُقال كما هو', () => {
    expect(keptFields(DEFAULT_SHARE_STRIP)).toEqual(['title'])
    expect(keptLabel(DEFAULT_SHARE_STRIP)).toBe('العنوان في الصفحة')
    expect(keptLabel(STRIP_ALL)).toBe('محذوفة')
    expect(keptLabel({ url: false, title: false, time: true })).toBe('العنوان والرابط في الصفحة')
    expect(keptLabel({ url: false, title: false, time: false })).toBe(
      'العنوان والرابط والوقت في الصفحة',
    )
  })
})

describe('معامل المشاركة في عنوان المحرّر', () => {
  it('`share=1` وحده يفتح النافذة', () => {
    const base = 'chrome-extension://x/src/pages/editor/index.html?capture=a'
    expect(SHARE_PARAM).toBe('share')
    expect(shareRequested(`${base}&share=1`)).toBe(true)
    expect(shareRequested(base)).toBe(false)
    expect(shareRequested(`${base}&share=0`)).toBe(false)
    expect(shareRequested('لا عنوان')).toBe(false)
  })
})
