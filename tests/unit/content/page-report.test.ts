import { afterEach, describe, expect, it } from 'vitest'

import { reportAcrossPageLifecycle } from '@/content/page-report'

import type { Mode } from '@/shared/modes'

/**
 * مغادرة المستند تُبلِّغ الخمول — وإلا بقيت الجلسة (والأيقونة النشطة في شريط الأدوات) على
 * صفحةٍ لم تعد فيها طبقة، لأن التنقّل لا يمرّ بتفكيك الطبقة.
 */

let stop: (() => void) | null = null

afterEach(() => {
  stop?.()
  stop = null
})

function transition(type: 'pagehide' | 'pageshow', persisted: boolean) {
  const event = new Event(type)
  Object.defineProperty(event, 'persisted', { value: persisted })
  window.dispatchEvent(event)
}

describe('reportAcrossPageLifecycle', () => {
  it('المغادرة تُبلِّغ الخمول، والعودة من ذاكرة الرجوع تعيد الوضع الحيّ', () => {
    const reports: string[] = []
    let current: Mode = 'inspect'
    stop = reportAcrossPageLifecycle(
      window,
      (m) => reports.push(m),
      () => current,
    )

    transition('pagehide', true)
    expect(reports).toEqual(['idle'])

    current = 'measure'
    transition('pageshow', true)
    expect(reports).toEqual(['idle', 'measure'])
  })

  it('التحميل الأوّل (`pageshow` بلا `persisted`) لا يكرّر تقرير الإقلاع', () => {
    const reports: string[] = []
    stop = reportAcrossPageLifecycle(
      window,
      (m) => reports.push(m),
      () => 'inspect',
    )
    transition('pageshow', false)
    expect(reports).toEqual([])
  })

  it('بعد التفكيك لا تقرير — الطبقة المفكّكة لا تتكلّم باسم التبويب', () => {
    const reports: string[] = []
    reportAcrossPageLifecycle(
      window,
      (m) => reports.push(m),
      () => 'inspect',
    )()
    transition('pagehide', false)
    transition('pageshow', true)
    expect(reports).toEqual([])
  })
})
