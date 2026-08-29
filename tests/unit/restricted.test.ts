import { describe, expect, it } from 'vitest'

import {
  checkInjectable,
  isInjectable,
  restrictionMessage,
  type RestrictionReason,
} from '@/shared/restricted'

/**
 * كاشف الصفحات المقيّدة.
 *
 * يُستدعى قبل كل محاولة حقن، فخطؤه يعني إما رسالة خطأ غامضة للمستخدم
 * (سلبية كاذبة) أو تعطيل الإضافة على صفحات سليمة (إيجابية كاذبة).
 */

const ALLOWED: readonly string[] = [
  'https://example.com/',
  'https://example.com/path?q=1#hash',
  'http://localhost:3000/',
  'https://ar.wikipedia.org/wiki/رصد',
  'https://google.com/search?q=test',
  // النطاق القديم للمتجر محميّ في مسار /webstore فقط
  'https://chrome.google.com/',
  'https://chrome.google.com/maps',
  // ملف بامتداد pdf في وسط المسار لا في نهايته
  'https://example.com/pdf/report.html',
]

const DENIED: readonly (readonly [string, RestrictionReason])[] = [
  ['chrome://settings', 'browser-internal'],
  ['chrome://extensions/shortcuts', 'browser-internal'],
  ['chrome-untrusted://print', 'browser-internal'],
  ['edge://settings', 'browser-internal'],
  ['brave://settings', 'browser-internal'],
  ['about:blank', 'browser-internal'],
  ['data:text/html,<h1>x</h1>', 'browser-internal'],
  ['chrome-extension://abcdefghijklmnop/popup.html', 'extension-page'],
  ['devtools://devtools/bundled/inspector.html', 'devtools'],
  ['view-source:https://example.com/', 'view-source'],
  ['file:///Users/me/page.html', 'local-file'],
  // المتجر — الجديد والقديم
  ['https://chromewebstore.google.com/', 'web-store'],
  ['https://chromewebstore.google.com/detail/abc', 'web-store'],
  ['https://chrome.google.com/webstore', 'web-store'],
  ['https://chrome.google.com/webstore/detail/abc', 'web-store'],
  // عارض PDF المدمج
  ['https://example.com/manual.pdf', 'pdf-viewer'],
  ['https://example.com/a/b/report.PDF', 'pdf-viewer'],
  // عناوين غير صالحة
  ['', 'invalid-url'],
  ['not-a-url', 'invalid-url'],
  ['ftp://example.com/file', 'browser-internal'],
]

describe('checkInjectable', () => {
  it.each([...ALLOWED])('يسمح بـ%s', (url) => {
    expect(checkInjectable(url)).toEqual({ injectable: true })
    expect(isInjectable(url)).toBe(true)
  })

  it.each([...DENIED])('يمنع %s بسبب %s', (url, reason) => {
    const result = checkInjectable(url)
    expect(result.injectable).toBe(false)
    expect(result.injectable === false && result.reason).toBe(reason)
    expect(isInjectable(url)).toBe(false)
  })

  it('يمنع العناوين الغائبة — الافتراض الآمن', () => {
    expect(isInjectable(undefined)).toBe(false)
    expect(isInjectable(null)).toBe(false)
  })

  it('يغطّي 20 عنوانًا على الأقل كما تشترط المرحلة 2', () => {
    expect(ALLOWED.length + DENIED.length).toBeGreaterThanOrEqual(20)
  })
})

describe('restrictionMessage', () => {
  const reasons: RestrictionReason[] = [
    'browser-internal',
    'extension-page',
    'web-store',
    'pdf-viewer',
    'view-source',
    'local-file',
    'devtools',
    'invalid-url',
  ]

  it.each(reasons)('يعطي نصًّا عربيًا لسبب %s', (reason) => {
    const message = restrictionMessage(reason)
    expect(message.length).toBeGreaterThan(10)
    expect(message).toMatch(/[؀-ۿ]/)
  })
})
