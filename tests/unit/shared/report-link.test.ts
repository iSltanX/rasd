import { describe, expect, it } from 'vitest'

import { readReportRequest, reportParams } from '@/shared/report-link'

/**
 * «أبلغ عن المشكلة» من رسالة خطأ — الرابط يحمل الأداة والرمز بشكلٍ تقنيّ ضيّق، فرابطٌ مصنوع لا يملأ النموذج بعنوان
 * صفحة ولا برابط (ADR 0050 §7).
 */

describe('رابط البلاغ', () => {
  it('الأداة والرمز الصالحان يعبران، وقسم «عن رصد» مفتوحًا', () => {
    expect(reportParams({ tool: 'full-page', code: 'CAPTURE_STITCH_TIMEOUT' })).toEqual({
      section: 'about',
      report: '1',
      tool: 'full-page',
      code: 'CAPTURE_STITCH_TIMEOUT',
    })
  })

  it('رابطٌ أو نصٌّ حرّ في الأداة أو الرمز يسقط في الاتّجاهين', () => {
    expect(reportParams({ tool: 'https://shop.example/x', code: 'عنوان الصفحة' })).toEqual({
      section: 'about',
      report: '1',
    })
    const search = new URLSearchParams({
      section: 'about',
      report: '1',
      tool: 'Full Page',
      code: 'https://shop.example/?q=1',
    }).toString()
    expect(readReportRequest(`?${search}`)).toEqual({ tool: null, code: null })
  })

  it('بلا `report=1` لا طلب', () => {
    expect(readReportRequest('?section=about')).toBeNull()
    expect(readReportRequest('?section=about&report=1&tool=data&code=erase-vault')).toEqual({
      tool: 'data',
      code: 'erase-vault',
    })
  })
})
