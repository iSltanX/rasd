import { describe, expect, it } from 'vitest'

import { parseCompareQuery } from '@/pages/compare/query'

describe('parseCompareQuery', () => {
  it('يقرأ a وb من سلسلة استعلام صالحة', () => {
    expect(parseCompareQuery('?a=cap-1&b=cap-2')).toEqual({ a: 'cap-1', b: 'cap-2' })
  })

  it('يقبل سلسلة بلا علامة استفهام بادئة', () => {
    expect(parseCompareQuery('a=x&b=y')).toEqual({ a: 'x', b: 'y' })
  })

  it('يُرجع null للمعامل الغائب', () => {
    expect(parseCompareQuery('?a=cap-1')).toEqual({ a: 'cap-1', b: null })
    expect(parseCompareQuery('')).toEqual({ a: null, b: null })
  })
})
