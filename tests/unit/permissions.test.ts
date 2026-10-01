import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FORBIDDEN_PERMISSIONS,
  grantedOrigins,
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
  revokeHostPermission,
  revokePermission,
  watchPermissions,
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
  getAll: ReturnType<typeof vi.fn>
  onAdded: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> }
  onRemoved: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> }
}

function installPermissionsApi(): PermissionsApi {
  const api: PermissionsApi = {
    request: vi.fn(),
    contains: vi.fn(),
    remove: vi.fn(),
    getAll: vi.fn(),
    onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  }
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
    await expect(hasPermission(['downloads'])).resolves.toBe(false)
    await expect(hasHostPermission('https://x.com/*')).resolves.toBe(false)
  })

  it('يفحص الصلاحية الممنوحة', async () => {
    api.contains.mockResolvedValue(true)
    await expect(hasPermission(['downloads'])).resolves.toBe(true)
  })

  it('رفض الصلاحية الاختيارية → denied لا granted', async () => {
    api.request.mockResolvedValue(false)
    await expect(requestPermission(['downloads'])).resolves.toBe('denied')
  })

  it('الرمي خارج إيماءة المستخدم عند طلب صلاحية اختيارية → error لا استثناء', async () => {
    api.request.mockRejectedValue(new Error('must be called during a user gesture'))
    await expect(requestPermission(['downloads'])).resolves.toBe('error')
  })

  it('يفحص صلاحية المضيف بأصلها ويُرجع نتيجة الفحص كما هي', async () => {
    api.contains.mockResolvedValue(true)
    await expect(hasHostPermission('https://x.com/*')).resolves.toBe(true)
    expect(api.contains).toHaveBeenCalledWith({ origins: ['https://x.com/*'] })

    api.contains.mockResolvedValue(false)
    await expect(hasHostPermission('https://x.com/*')).resolves.toBe(false)
  })

  /*
   * النتيجة `'revoked'` لا `'granted'`: الدالّة كانت تُرجع `'granted'` عند
   * **نجاح** السحب — «نجحت العملية» تُقرأ «الصلاحية ممنوحة» (‏`§6` صفّ 124).
   */
  it('يسحب الصلاحية ويقول إنها سُحبت لا إنها ممنوحة', async () => {
    api.remove.mockResolvedValue(true)
    await expect(revokePermission(['downloads'])).resolves.toBe('revoked')
  })

  it('السحب الذي لم يقع يُقرأ «باقية» لا «مرفوضة»', async () => {
    api.remove.mockResolvedValue(false)
    await expect(revokePermission(['downloads'])).resolves.toBe('kept')
  })

  it('يسحب صلاحية المضيف كذلك', async () => {
    api.remove.mockResolvedValue(true)
    await expect(revokeHostPermission(['https://x.com/*'])).resolves.toBe('revoked')
    expect(api.remove).toHaveBeenCalledWith({ origins: ['https://x.com/*'] })
  })

  it('سحب المضيف الذي لم يقع يُقرأ «باقية» كذلك', async () => {
    api.remove.mockResolvedValue(false)
    await expect(revokeHostPermission(['https://x.com/*'])).resolves.toBe('kept')
  })

  it('رمي السحب يعود error في الصلاحية الاختيارية وصلاحية المضيف معًا', async () => {
    api.remove.mockRejectedValue(new Error('boom'))
    await expect(revokePermission(['downloads'])).resolves.toBe('error')
    await expect(revokeHostPermission(['https://x.com/*'])).resolves.toBe('error')
  })
})

describe('grantedOrigins — ما مُنح فعلًا لا ما يُسأل عنه', () => {
  it('يُرجع الأصول الممنوحة كما تبلّغ بها المتصفّح', async () => {
    // مستخدمٌ منح موقعًا واحدًا من النافذة: `<all_urls>` ليست ممنوحة لكنّ إذنًا قائم.
    api.getAll.mockResolvedValue({ origins: ['https://bank.com/*'], permissions: [] })

    await expect(grantedOrigins()).resolves.toEqual(['https://bank.com/*'])
  })

  it('لا أصول في الردّ (الحقل غائب) → قائمة فارغة لا undefined', async () => {
    api.getAll.mockResolvedValue({ permissions: ['downloads'] })

    await expect(grantedOrigins()).resolves.toEqual([])
  })

  it('رمي الاستعلام → قائمة فارغة لا استثناء', async () => {
    api.getAll.mockRejectedValue(new Error('boom'))

    await expect(grantedOrigins()).resolves.toEqual([])
  })
})

describe('watchPermissions', () => {
  it('يُستدعى فورًا مرّة واحدة ويشترك في الإضافة والسحب معًا', () => {
    const listener = vi.fn()

    watchPermissions(listener)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(api.onAdded.addListener).toHaveBeenCalledTimes(1)
    expect(api.onRemoved.addListener).toHaveBeenCalledTimes(1)
  })

  it('كل تغيّر خارجي — منحًا أو سحبًا — يستدعي المستمع بلا وسائط', () => {
    const listener = vi.fn()
    watchPermissions(listener)
    listener.mockClear()

    const onAdded = api.onAdded.addListener.mock.calls[0]![0] as (p: unknown) => void
    const onRemoved = api.onRemoved.addListener.mock.calls[0]![0] as (p: unknown) => void
    // المتصفّح يمرّر الصلاحيات المتغيّرة، والمستمع لا يهتمّ بها فيُعيد القراءة.
    onAdded({ permissions: ['downloads'] })
    onRemoved({ origins: ['https://x.com/*'] })

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1)
    expect(listener).toHaveBeenNthCalledWith(2)
  })

  it('إلغاء الاشتراك يزيل المعالج نفسه من الحدثين', () => {
    const off = watchPermissions(vi.fn())
    const added = api.onAdded.addListener.mock.calls[0]![0]
    const removed = api.onRemoved.addListener.mock.calls[0]![0]

    off()

    expect(api.onAdded.removeListener).toHaveBeenCalledWith(added)
    expect(api.onRemoved.removeListener).toHaveBeenCalledWith(removed)
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
