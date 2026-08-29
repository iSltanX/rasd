import { describe, expect, it } from 'vitest'

import {
  attempt,
  err,
  errWith,
  ok,
  rasdError,
  toRasdError,
  unwrapOr,
  type RasdErrorCode,
} from '@/shared/result'

const ALL_CODES: RasdErrorCode[] = [
  'timeout',
  'no-receiver',
  'disconnected',
  'handler-failed',
  'not-injectable',
  'permission-denied',
  'quota-exceeded',
  'incognito-blocked',
  'not-found',
  'invalid-data',
  'migration-failed',
  'cancelled',
  'unknown',
]

describe('Result', () => {
  it('يميّز النجاح من الفشل', () => {
    expect(ok(5)).toEqual({ ok: true, value: 5 })
    expect(err('x')).toEqual({ ok: false, error: 'x' })
  })

  it('unwrapOr يعيد البديل عند الفشل', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1)
    expect(unwrapOr(errWith('timeout'), 9)).toBe(9)
  })

  it('attempt يغلّف الرمي بدل تسريبه', async () => {
    const good = await attempt(() => 42)
    expect(good).toEqual({ ok: true, value: 42 })

    const bad = await attempt(() => {
      throw new Error('boom')
    })
    expect(bad.ok).toBe(false)
    expect(bad.ok === false && bad.error.detail).toBe('boom')
  })
})

describe('رسائل الأخطاء', () => {
  it.each(ALL_CODES)('للرمز %s رسالة عربية', (code) => {
    const error = rasdError(code)
    expect(error.code).toBe(code)
    expect(error.message).toMatch(/[؀-ۿ]/)
    expect(error.message.length).toBeGreaterThan(8)
  })

  it('لا يضيف detail عندما لا يُمرَّر — exactOptionalPropertyTypes', () => {
    expect('detail' in rasdError('timeout')).toBe(false)
    expect(rasdError('timeout', 'x').detail).toBe('x')
  })
})

describe('toRasdError يترجم أخطاء Chrome النصّية', () => {
  it.each([
    ['Could not establish connection. Receiving end does not exist.', 'no-receiver'],
    ['Attempting to use a disconnected port object: the message port closed', 'disconnected'],
    ['QuotaExceededError: not enough room', 'quota-exceeded'],
    ['something else entirely', 'unknown'],
  ])('%s → %s', (message, expected) => {
    expect(toRasdError(new Error(message)).code).toBe(expected)
  })

  it('يتعرّف على QuotaExceededError بالاسم', () => {
    const error = new Error('full')
    error.name = 'QuotaExceededError'
    expect(toRasdError(error).code).toBe('quota-exceeded')
  })

  it('يتعامل مع قيمة مرمية ليست Error', () => {
    expect(toRasdError('نص').code).toBe('unknown')
    expect(toRasdError('نص').detail).toBe('نص')
  })
})
