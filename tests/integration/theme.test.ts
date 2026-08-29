import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultSettings } from '@/shared/settings'
import { applyTheme, effectiveTheme } from '@/ui/theme'

/**
 * السمة والاتجاه على الجذر.
 *
 * ثلاث حالات لا اثنتان: `system` لا تكتب سمة (فيحكم تفضيل النظام)، والصريحة
 * تكتبها فتتفوّق عليه. كتابة قيمة ثالثة تعني أن الاختيار الصريح لا يمكن التراجع عنه.
 */

let root: HTMLElement

beforeEach(() => {
  document.documentElement.innerHTML = ''
  root = document.createElement('html')
})

const withAppearance = (over: Record<string, unknown>) => {
  const base = defaultSettings()
  return { appearance: { ...base.appearance, ...over } } as Parameters<typeof applyTheme>[0]
}

describe('تطبيق السمة', () => {
  it('الوضع system لا يكتب سمة — تفضيل النظام هو الحاكم', () => {
    root.setAttribute('data-theme', 'dark')
    applyTheme(withAppearance({ theme: 'system' }), root)
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it.each(['dark', 'light'] as const)('الاختيار الصريح %s يُكتب على الجذر', (theme) => {
    applyTheme(withAppearance({ theme }), root)
    expect(root.getAttribute('data-theme')).toBe(theme)
  })

  it('العربية تعطي rtl والإنجليزية ltr', () => {
    applyTheme(withAppearance({ language: 'ar' }), root)
    expect(root.getAttribute('dir')).toBe('rtl')
    expect(root.getAttribute('lang')).toBe('ar')

    applyTheme(withAppearance({ language: 'en' }), root)
    expect(root.getAttribute('dir')).toBe('ltr')
    expect(root.getAttribute('lang')).toBe('en')
  })

  it('العربية هي الافتراضي — رصد عربي لا مترجَم', () => {
    const applied = applyTheme(defaultSettings(), root)
    expect(applied.language).toBe('ar')
    expect(applied.dir).toBe('rtl')
  })

  it('الكثافة تُكتب للتنسيق', () => {
    applyTheme(withAppearance({ density: 'compact' }), root)
    expect(root.getAttribute('data-density')).toBe('compact')
  })

  it('التبديل يغيّر الجذر وحده — لا مكوّن يتغيّر', () => {
    const before = root.outerHTML
    applyTheme(withAppearance({ theme: 'light' }), root)
    const after = root.outerHTML
    expect(after).not.toBe(before)
    // لا محتوى — التغيير في السمات فقط.
    expect(root.children).toHaveLength(0)
  })
})

describe('السمة الفعّالة', () => {
  /** يثبّت تفضيل النظام: نختبر منطقنا لا افتراضات بيئة الاختبار. */
  const systemPrefers = (theme: 'dark' | 'light') => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('light') && theme === 'light',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
  }

  it('الاختيار الصريح يتفوّق على تفضيل النظام', () => {
    systemPrefers('light')
    root.setAttribute('data-theme', 'dark')
    expect(effectiveTheme(root)).toBe('dark')
    systemPrefers('dark')
    root.setAttribute('data-theme', 'light')
    expect(effectiveTheme(root)).toBe('light')
    vi.unstubAllGlobals()
  })

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
  ] as const)('بلا سمة صريحة يحكم تفضيل النظام: %s', (system, expected) => {
    systemPrefers(system)
    root.removeAttribute('data-theme')
    expect(effectiveTheme(root)).toBe(expected)
    vi.unstubAllGlobals()
  })
})
