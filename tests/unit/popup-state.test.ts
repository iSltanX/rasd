import { describe, expect, it } from 'vitest'

import { selectPopupState, type PopupContext } from '@/shared/popup-state'

/**
 * منطق اختيار حالة النافذة — دالّة نقيّة، بلا `chrome.*`.
 *
 * عشرة مدخلات، كلّ واحد يثبت فرعًا مختلفًا من ترتيب الأولوية الموصوف في
 * `popup-state.ts`: مقيّد ← بلا اتصال ← الجولة الأولى ← إذن ← مهمّة جارية ←
 * وضع حيّ ← الافتراضي. الحالة العاشرة تثبت الأولوية نفسها لا فرعًا جديدًا —
 * تعطيل مزدوج (مقيّد وبلا اتصال معًا) يجب أن يحسمه `restricted` وحده.
 */

const BASE: PopupContext = {
  restriction: { injectable: true },
  online: true,
  firstRun: false,
  permissionNeeded: null,
  job: null,
  liveMode: null,
}

describe('selectPopupState', () => {
  it('صفحة مقيّدة → restricted', () => {
    const context: PopupContext = {
      ...BASE,
      restriction: { injectable: false, reason: 'browser-internal' },
    }
    expect(selectPopupState(context)).toBe('restricted')
  })

  it('بلا اتصال → offline', () => {
    const context: PopupContext = { ...BASE, online: false }
    expect(selectPopupState(context)).toBe('offline')
  })

  it('الجولة الأولى → first-run', () => {
    const context: PopupContext = { ...BASE, firstRun: true }
    expect(selectPopupState(context)).toBe('first-run')
  })

  it('إذن مطلوب → permission', () => {
    const context: PopupContext = {
      ...BASE,
      permissionNeeded: { origin: 'https://example.com/*' },
    }
    expect(selectPopupState(context)).toBe('permission')
  })

  it('مهمّة تجميع جارية → capturing', () => {
    const context: PopupContext = {
      ...BASE,
      job: { kind: 'full-page', done: 4, total: 6 },
    }
    expect(selectPopupState(context)).toBe('capturing')
  })

  it('وضع فحص حيّ → inspect-active', () => {
    const context: PopupContext = { ...BASE, liveMode: 'inspect' }
    expect(selectPopupState(context)).toBe('inspect-active')
  })

  it('وضع لون حيّ → colors', () => {
    const context: PopupContext = { ...BASE, liveMode: 'colour' }
    expect(selectPopupState(context)).toBe('colors')
  })

  it('لا شيء نشط → default', () => {
    expect(selectPopupState(BASE)).toBe('default')
  })

  it('وضع منطقة/عنصر حيّ لا يُنتج حالة مخصَّصة — يبقى default', () => {
    expect(selectPopupState({ ...BASE, liveMode: 'area' })).toBe('default')
    expect(selectPopupState({ ...BASE, liveMode: 'element' })).toBe('default')
  })

  it('تعطيل مزدوج (مقيّد + بلا اتصال) يحسمه الأكثر تعطيلًا: restricted', () => {
    const context: PopupContext = {
      ...BASE,
      restriction: { injectable: false, reason: 'web-store' },
      online: false,
      firstRun: true,
      permissionNeeded: { origin: 'https://example.com/*' },
      job: { kind: 'full-page', done: 1, total: 10 },
    }
    expect(selectPopupState(context)).toBe('restricted')
  })
})
