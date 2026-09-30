import { describe, expect, it } from 'vitest'

import {
  hrefFor,
  searchFor,
  viewFromSearch,
  viewId,
  type LibraryView,
} from '@/pages/shell/library-views'
import { PAGE_PATHS } from '@/shared/page-paths'

describe('عروض المكتبة — الرابط', () => {
  it('«المشكلات» تُحمَل في ?view=issues وتُقرأ منها', () => {
    expect(searchFor({ kind: 'issues' })).toBe('?view=issues')
    expect(viewFromSearch('?view=issues')).toEqual({ kind: 'issues' })
  })

  it('تفصيل المشكلة يُحمَل في ?issue=<id> وتُقرأ منه', () => {
    expect(searchFor({ kind: 'issue', id: 'i-1' })).toBe('?issue=i-1')
    expect(viewFromSearch('?issue=i-1')).toEqual({ kind: 'issue', id: 'i-1' })
  })

  it('المعرّف يُرمَّز ويعود سليمًا بعد الفكّ', () => {
    const view: LibraryView = { kind: 'issue', id: 'a b&c=d/é' }
    const search = searchFor(view)
    expect(search).toBe(`?issue=${encodeURIComponent('a b&c=d/é')}`)
    expect(viewFromSearch(search)).toEqual(view)
  })

  it('كل عرضٍ يعود إلى نفسه عبر searchFor ثم viewFromSearch', () => {
    const views: LibraryView[] = [
      { kind: 'all' },
      { kind: 'favorites' },
      { kind: 'recent' },
      { kind: 'projects' },
      { kind: 'project', id: 'p1' },
      { kind: 'palettes' },
      { kind: 'references' },
      { kind: 'guides' },
      { kind: 'colors' },
      { kind: 'issues' },
      { kind: 'issue', id: 'i-1' },
    ]
    for (const view of views) expect(viewFromSearch(searchFor(view))).toEqual(view)
  })

  it('hrefFor يحمل الاستعلام على مسار المكتبة', () => {
    expect(hrefFor({ kind: 'issues' })).toBe(`/${PAGE_PATHS.library}?view=issues`)
    expect(hrefFor({ kind: 'issue', id: 'i-1' })).toBe(`/${PAGE_PATHS.library}?issue=i-1`)
  })

  it('?issue= فارغ لا يفتح تفصيلًا، والمجهول من ?view= يعود إلى «كل اللقطات»', () => {
    expect(viewFromSearch('?issue=')).toEqual({ kind: 'all' })
    expect(viewFromSearch('?view=nope')).toEqual({ kind: 'all' })
    expect(viewFromSearch('')).toEqual({ kind: 'all' })
  })

  it('رابطٌ يحمل مشكلةً ومشروعًا يفتح المشكلة — الأخصّ يسبق', () => {
    expect(viewFromSearch('?project=p1&issue=i-1')).toEqual({ kind: 'issue', id: 'i-1' })
    expect(viewFromSearch('?project=p1')).toEqual({ kind: 'project', id: 'p1' })
  })

  it('التفصيل يُضيء «المشكلات» في الشريط الجانبي لا عنصرًا غير موجود', () => {
    expect(viewId({ kind: 'issues' })).toBe('issues')
    expect(viewId({ kind: 'issue', id: 'i-1' })).toBe('issues')
    expect(viewId({ kind: 'project', id: 'p1' })).toBe('project:p1')
    expect(viewId({ kind: 'guides' })).toBe('guides')
  })
})
