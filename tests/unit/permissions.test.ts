import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FORBIDDEN_PERMISSIONS,
  hasHostPermission,
  hasPermission,
  OPTIONAL_HOST_PERMISSIONS,
  OPTIONAL_PERMISSION_RATIONALE,
  OPTIONAL_PERMISSIONS,
  originPatternFor,
  REQUIRED_PERMISSION_RATIONALE,
  REQUIRED_PERMISSIONS,
  requestHostPermission,
  requestPermission,
  revokePermission,
} from '@/shared/permissions'

/**
 * طلب الصلاحيات لا يجوز أن يعلّق ولا أن يرمي.
 *
 * `chrome.permissions.request` يرجع `false` عند الرفض **وعند إغلاق الحوار**
 * معًا، ويرمي إذا استُدعي خارج إيماءة مستخدم. الثلاثة يجب أن تنتهي بنتيجة.
 */

type PermissionsApi = {
  request: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

function installPermissionsApi(): PermissionsApi {
  const api: PermissionsApi = { request: vi.fn(), contains: vi.fn(), remove: vi.fn() }
  Object.assign(globalThis.chrome, { permissions: api })
  return api
}

let api: PermissionsApi

beforeEach(() => {
  api = installPermissionsApi()
})

describe('requestHostPermission', () => {
  it('القبول → granted', async () => {
    api.request.mockResolvedValue(true)
    await expect(requestHostPermission(['https://example.com/*'])).resolves.toBe('granted')
  })

  it('الرفض → denied', async () => {
    api.request.mockResolvedValue(false)
    await expect(requestHostPermission(['https://example.com/*'])).resolves.toBe('denied')
  })

  it('إغلاق الحوار (false أيضًا) → denied ولا يعلّق', async () => {
    api.request.mockResolvedValue(false)
    await expect(requestHostPermission(['https://example.com/*'])).resolves.toBe('denied')
  })

  it('الرمي خارج إيماءة المستخدم → error لا استثناء', async () => {
    api.request.mockRejectedValue(new Error('must be called during a user gesture'))
    await expect(requestHostPermission(['https://example.com/*'])).resolves.toBe('error')
  })

  it('غياب واجهة الصلاحيات كليًا → error', async () => {
    Object.assign(globalThis.chrome, { permissions: undefined })
    await expect(requestHostPermission(['https://example.com/*'])).resolves.toBe('error')
  })

  it('يمرّر الأصول كما هي', async () => {
    api.request.mockResolvedValue(true)
    await requestHostPermission(['https://a.com/*', 'https://b.com/*'])
    expect(api.request).toHaveBeenCalledWith({ origins: ['https://a.com/*', 'https://b.com/*'] })
  })
})

describe('requestPermission · hasPermission · revokePermission', () => {
  it('يطلب صلاحية اختيارية', async () => {
    api.request.mockResolvedValue(true)
    await expect(requestPermission(['downloads'])).resolves.toBe('granted')
    expect(api.request).toHaveBeenCalledWith({ permissions: ['downloads'] })
  })

  it('يبتلع الأخطاء في الفحص ويرجع false', async () => {
    api.contains.mockRejectedValue(new Error('boom'))
    await expect(hasPermission(['tabs'])).resolves.toBe(false)
    await expect(hasHostPermission('https://x.com/*')).resolves.toBe(false)
  })

  it('يفحص الصلاحية الممنوحة', async () => {
    api.contains.mockResolvedValue(true)
    await expect(hasPermission(['tabs'])).resolves.toBe(true)
  })

  it('يسحب الصلاحية', async () => {
    api.remove.mockResolvedValue(true)
    await expect(revokePermission(['desktopCapture'])).resolves.toBe('granted')
  })
})

describe('originPatternFor', () => {
  it.each([
    ['https://example.com/a/b?c=1', 'https://example.com/*'],
    ['http://localhost:3000/x', 'http://localhost/*'],
  ])('%s → %s', (url, expected) => {
    expect(originPatternFor(url)).toBe(expected)
  })

  it.each(['chrome://settings', 'file:///a.html', 'not-a-url', ''])('يرفض %s', (url) => {
    expect(originPatternFor(url)).toBeNull()
  })
})

describe('سياسة الصلاحيات', () => {
  it('لا تقاطع بين الدائمة والاختيارية', () => {
    const overlap = REQUIRED_PERMISSIONS.filter((p) =>
      (OPTIONAL_PERMISSIONS as readonly string[]).includes(p),
    )
    expect(overlap).toEqual([])
  })

  it('لا صلاحية محظورة في أي قائمة معلَنة', () => {
    const declared = [...REQUIRED_PERMISSIONS, ...OPTIONAL_PERMISSIONS] as readonly string[]
    const leaked = FORBIDDEN_PERMISSIONS.filter((p) => declared.includes(p))
    expect(leaked).toEqual([])
  })

  it('صلاحيات المضيف اختيارية فقط', () => {
    expect(OPTIONAL_HOST_PERMISSIONS).toContain('<all_urls>')
  })

  it('لكل صلاحية دائمة سبب مكتوب بالعربية', () => {
    for (const p of REQUIRED_PERMISSIONS) {
      const reason = REQUIRED_PERMISSION_RATIONALE[p]
      expect(reason, `الصلاحية ${p} بلا سبب`).toBeTruthy()
      expect(reason).toMatch(/[؀-ۿ]/)
    }
  })

  it('لكل صلاحية اختيارية سبب مكتوب بالعربية', () => {
    for (const p of OPTIONAL_PERMISSIONS) {
      const reason = OPTIONAL_PERMISSION_RATIONALE[p]
      expect(reason, `الصلاحية ${p} بلا سبب`).toBeTruthy()
      expect(reason).toMatch(/[؀-ۿ]/)
    }
  })
})
