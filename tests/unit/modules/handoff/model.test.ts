import { describe, expect, it } from 'vitest'

import { buildHandoff, cropIn, pageUrl } from '@/modules/handoff/model'

import { KNOWN_ISSUE, META, OPTIONS } from './fixture'

/**
 * قرارات المحتوى في النموذج (ADR 0036 §1 و§5): الرابط كما يخرج، وموضع العنصر في الصورة المخبوزة.
 */

describe('pageUrl — الرابط كما يخرج في الحزمة', () => {
  it('بلا استعلام ولا جزء ولا معاملات مقاطع افتراضيًّا', () => {
    expect(pageUrl('https://northwind.com/pricing?plan=pro#top', false)).toBe(
      'https://northwind.com/pricing',
    )
    expect(pageUrl('https://intranet.example/app;jsessionid=ABC123/dash?x=1', false)).toBe(
      'https://intranet.example/app/dash',
    )
  })

  it('بيانات الدخول تُحذف دائمًا — ولو طُلبت المعاملات (المراجعة المستقلّة)', () => {
    const url = 'https://admin:hunter2@intranet.example/app;jsessionid=ABC/dash?x=1#h'
    expect(pageUrl(url, false)).toBe('https://intranet.example/app/dash')
    expect(pageUrl(url, true)).toBe('https://intranet.example/app;jsessionid=ABC/dash?x=1')
    expect(pageUrl(url, true)).not.toContain('hunter2')
  })

  it('رابطٌ لا يُفهم يُقصّ نصًّا بالقاعدة نفسها', () => {
    expect(pageUrl('not a url?x=1', false)).toBe('not a url')
    expect(pageUrl('weird://u:p@host/a;b?c#d', false)).toBe('weird://host/a')
    expect(pageUrl('%%bad://u:p@host/a?c#d', true)).toBe('%%bad://u:p@host/a?c')
  })
})

describe('cropIn — موضع العنصر في الصورة المخبوزة', () => {
  const crop = { x: 50, y: 40, width: 100, height: 30 }

  it('بلا اقتصاص: الموضع كما سُجّل', () => {
    expect(cropIn(crop, undefined)).toEqual(crop)
  })

  it('باقتصاص المحرّر: نسبةً إلى أصله، مقصوصًا إليه، و`null` حين يُخرجه كلّه', () => {
    expect(cropIn(crop, { x: 30, y: 20, width: 200, height: 100 })).toEqual({
      x: 20,
      y: 20,
      width: 100,
      height: 30,
    })
    expect(cropIn(crop, { x: 100, y: 0, width: 300, height: 300 })).toEqual({
      x: 0,
      y: 40,
      width: 50,
      height: 30,
    })
    expect(cropIn(crop, { x: 300, y: 0, width: 50, height: 50 })).toBeNull()
  })

  it('يمرّ إلى النموذج بنافذة لقطته', () => {
    const frames = new Map([
      [KNOWN_ISSUE.evidence.captureId, { x: 20, y: 20, width: 400, height: 100 }],
    ])
    const model = buildHandoff([KNOWN_ISSUE], OPTIONS, META, frames)
    expect(model.entries[0]?.image?.crop).toEqual({ x: 28, y: 28, width: 368, height: 72 })
  })
})
