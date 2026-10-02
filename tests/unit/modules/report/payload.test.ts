import { describe, expect, it } from 'vitest'

import {
  base64Length,
  buildPayload,
  composeDescription,
  copyText,
  formErrors,
  LIMITS,
  payloadProblems,
  reviewRows,
  serialise,
  type Diagnostics,
  type ReportForm,
} from '@/modules/report/payload'

/**
 * جسم البلاغ — `STAGES/13`: «التشخيص المرسَل يطابق المعروض حرفيًّا، ولا يحوي رابطًا ولا عنوان صفحة ولا اسم
 * مشروع»، والجسم بعقد النسخة 1 لقناة الاستقبال (`Docs/Support.md`).
 */

const diag: Diagnostics = {
  appVersion: '1.0.0',
  os: 'macos',
  osVersion: '15.3.0',
  arch: 'arm64',
  browser: 'Google Chrome',
  browserVersion: '153.0.7990.12',
  browserId: 'chrome',
  engine: 'Chromium 153.0.7990.12',
  buildTarget: 'chromium',
  installSource: 'chrome-web-store',
}

const form: ReportForm = {
  kind: 'bug',
  title: 'اللقطة الكاملة تتوقّف عند منتصف الصفحة',
  what: 'بدأ الالتقاط ثم توقّف الشريط عند ٦٠٪ ولم تُحفظ اللقطة.',
  steps: '١. فتحت صفحة طويلة.\n٢. ضغطت «صفحة كاملة».',
  expected: '',
  tool: 'full-page',
  errorCode: 'CAPTURE_STITCH_TIMEOUT',
}

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3, 4])

/** كل قيمةٍ ورقية في الجسم بمسارها — ما سيخرج في الطلب فعلًا. */
function leaves(value: unknown, path = ''): Record<string, string> {
  if (value === null || typeof value !== 'object') return { [path]: String(value) }
  const out: Record<string, string> = {}
  for (const [key, child] of Object.entries(value)) {
    Object.assign(out, leaves(child, path ? `${path}.${key}` : key))
  }
  return out
}

describe('الجسم بعقد النسخة 1', () => {
  it('الحقول بأسمائها حرفًا، والمنتَج `rasd`، والصورة base64 من بايتاتها', () => {
    const payload = buildPayload(form, diag, { type: 'image/png', bytes: png })
    expect(Object.keys(payload).sort()).toEqual(
      [
        'product',
        'app_version',
        'os',
        'os_version',
        'arch',
        'locale',
        'kind',
        'description',
        'diagnostics',
        'attachments',
      ].sort(),
    )
    expect(payload.product).toBe('rasd')
    expect(payload.attachments?.[0]?.type).toBe('image/png')
    expect(atob(payload.attachments?.[0]?.data ?? '')).toBe(String.fromCharCode(...png))
    expect(base64Length(payload.attachments?.[0]?.data ?? '')).toBe(png.length)
  })

  it('الوصف: العنوان سطرًا أوّل، ثمّ الأقسام غير الفارغة بعناوينها', () => {
    expect(composeDescription(form)).toBe(
      [
        'اللقطة الكاملة تتوقّف عند منتصف الصفحة',
        'ماذا حدث؟\nبدأ الالتقاط ثم توقّف الشريط عند ٦٠٪ ولم تُحفظ اللقطة.',
        'خطوات حدوثها\n١. فتحت صفحة طويلة.\n٢. ضغطت «صفحة كاملة».',
      ].join('\n\n'),
    )
  })

  it('`test` من البناء التجريبي وحده', () => {
    expect(buildPayload(form, diag, null).test).toBeUndefined()
    expect(buildPayload(form, diag, null, { test: true }).test).toBe(true)
  })
})

describe('ما يُعرض هو ما يُرسَل', () => {
  it('كل قيمةٍ في الجسم صفٌّ في «ما سيُرسَل» بقيمتها حرفًا — والمرفق نوعه وحجمه', () => {
    const payload = buildPayload(form, diag, { type: 'image/png', bytes: png }, { test: true })
    const sent = leaves(payload)
    const shown = Object.fromEntries(reviewRows(payload).map((r) => [r.key, r.value]))

    for (const [path, value] of Object.entries(sent)) {
      if (path.startsWith('attachments.')) continue
      expect(shown[path], path).toBe(value)
    }
    expect(shown['attachments.0']).toBe(`image/png · ${png.length}`)
    // ولا صفّ لا يقابله شيءٌ في الجسم.
    for (const key of Object.keys(shown)) {
      if (key.startsWith('attachments.')) continue
      expect(sent[key], key).toBeDefined()
    }
  })

  it('والتشخيص المرسَل هو المعروض: المتصفّح ومحرّكه وهدف البناء ومصدر التثبيت والأداة ورمز الخطأ، لا غيرها', () => {
    const payload = buildPayload(form, diag, null)
    expect(payload.diagnostics).toEqual({
      browser: 'Google Chrome',
      browser_version: '153.0.7990.12',
      browser_id: 'chrome',
      engine: 'Chromium 153.0.7990.12',
      build_target: 'chromium',
      install_source: 'chrome-web-store',
      tool: 'full-page',
      error_code: 'CAPTURE_STITCH_TIMEOUT',
    })
    const shown = reviewRows(payload).filter((r) => r.key.startsWith('diagnostics.'))
    expect(Object.fromEntries(shown.map((r) => [r.key.slice(12), r.value]))).toEqual(
      payload.diagnostics,
    )
  })
})

describe('لا رابط ولا عنوان صفحة ولا اسم مشروع', () => {
  it('أداةٌ أو رمز خطأ بشكلٍ غير تقني (رابط، عنوان) يسقطان ولا يُرسلان', () => {
    const hostile: ReportForm = {
      ...form,
      tool: 'https://shop.example/cart?token=1',
      errorCode: 'عنوان الصفحة: سلّة المشتريات — مشروع مِنصّة',
    }
    const body = serialise(buildPayload(hostile, diag, null))
    expect(body).not.toMatch(/https?:|shop\.example|سلّة|مِنصّة|token/u)
    expect(buildPayload(hostile, diag, null).diagnostics).toEqual({
      browser: 'Google Chrome',
      browser_version: '153.0.7990.12',
      browser_id: 'chrome',
      engine: 'Chromium 153.0.7990.12',
      build_target: 'chromium',
      install_source: 'chrome-web-store',
    })
  })

  it('لا حقل في الجسم يحمل رابطًا أو عنوانًا أو مشروعًا — المفاتيح معدودة', () => {
    const keys = Object.keys(leaves(buildPayload(form, diag, null)))
    expect(keys.filter((k) => /url|title|page|project|origin|href/iu.test(k))).toEqual([])
  })
})

describe('هوية المتصفّح مقصوصة كبقيّة التشخيص', () => {
  it('كل حقلٍ جديد يُقصّ لسقفه ولا يتجاوزه', () => {
    const long = 'x'.repeat(200)
    const d = buildPayload(
      form,
      { ...diag, browserId: long, engine: long, buildTarget: long, installSource: long },
      null,
    ).diagnostics
    expect(d.browser_id).toHaveLength(16)
    expect(d.engine).toHaveLength(48)
    expect(d.build_target).toHaveLength(16)
    expect(d.install_source).toHaveLength(24)
  })

  it('والحقول الأربعة حاضرة دائمًا ولو بـunknown — العقد يشترطها', () => {
    const unknown = 'unknown'
    const d = buildPayload(
      { ...form, tool: null, errorCode: null },
      {
        ...diag,
        browserId: unknown,
        engine: unknown,
        buildTarget: 'firefox',
        installSource: unknown,
      },
      null,
    ).diagnostics
    expect(d).toMatchObject({
      browser_id: unknown,
      engine: unknown,
      build_target: 'firefox',
      install_source: unknown,
    })
  })
})

describe('السقوف قبل الإرسال', () => {
  it('عنوانٌ أو «ماذا حدث؟» فارغ يمنع الخطوة التالية', () => {
    expect(formErrors({ ...form, title: '  ', what: '' })).toEqual(['title', 'what'])
    expect(formErrors(form)).toEqual([])
  })

  it('وصفٌ فوق ألفي حرف، أو صورةٌ فوق ثلاثة ميغابايت', () => {
    const long = { ...form, what: 'أ'.repeat(LIMITS.description) }
    expect(formErrors(long)).toContain('length')
    const payload = buildPayload(form, diag, null)
    expect(payloadProblems(payload, LIMITS.attachmentBytes + 1)).toEqual(['attachment'])
    expect(payloadProblems(payload, LIMITS.attachmentBytes)).toEqual([])
  })
})

describe('«انسخ البلاغ نصًّا»', () => {
  it('الجسم نفسه منسَّقًا، والمرفق `{ type, bytes }` بدل بياناته', () => {
    const payload = buildPayload(form, diag, { type: 'image/png', bytes: png })
    const parsed = JSON.parse(copyText(payload)) as Record<string, unknown>
    expect(parsed.attachments).toEqual([{ type: 'image/png', bytes: png.length }])
    expect(copyText(payload)).not.toContain(payload.attachments?.[0]?.data ?? '§')
    const { attachments: _a, ...rest } = payload
    const { attachments: _b, ...parsedRest } = parsed
    expect(parsedRest).toEqual(rest)
  })
})
