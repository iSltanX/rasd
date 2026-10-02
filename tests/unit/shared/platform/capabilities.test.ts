import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dataConsentSupported,
  downloadUrl,
  openShortcutSettings,
  privateBrowsingModel,
} from '@/shared/platform/capabilities'

/**
 * نقاط الفرق (`Docs/Browsers/Architecture.md` §4.5): **لكل قدرة حالتا الحضور والغياب**، فالدالّة تُقاس على الواجهة
 * لا على اسم متصفّح. واختبار الحضور وحده كان سيمرّ على شيفرةٍ تفترض Firefox دائمًا، والغياب وحده على شيفرةٍ تفترض
 * Chromium.
 */

const realCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const realRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
const set = (key: 'createObjectURL' | 'revokeObjectURL', value: unknown) =>
  Object.defineProperty(URL, key, { value, configurable: true, writable: true })

afterEach(() => {
  if (realCreate) Object.defineProperty(URL, 'createObjectURL', realCreate)
  if (realRevoke) Object.defineProperty(URL, 'revokeObjectURL', realRevoke)
  vi.unstubAllEnvs()
  vi.resetModules()
})

function bytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) out[i] = (i * 7 + 13) % 256
  return out
}

describe('downloadUrl', () => {
  it('createObjectURL حاضرة ⟵ blob: وعنوانٌ يُحرَّر مرّةً واحدة مهما تكرّر النداء', async () => {
    const revoke = vi.fn()
    set('createObjectURL', () => 'blob:x/1')
    set('revokeObjectURL', revoke)

    const handle = await downloadUrl(new Blob([bytes(4)], { type: 'image/png' }))

    expect(handle.kind).toBe('blob')
    expect(handle.url).toBe('blob:x/1')
    handle.release()
    handle.release()
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:x/1')
  })

  it('createObjectURL غائبة ⟵ data: بالبايتات نفسها ونوع الـblob، و«التحرير» لا يفعل شيئًا', async () => {
    const revoke = vi.fn()
    set('createObjectURL', undefined)
    set('revokeObjectURL', revoke)
    const png = bytes(100_000) // فوق حدّ القطعة 0x8000: قطعة واحدة كانت ستُسقط المكدّس

    const handle = await downloadUrl(new Blob([png], { type: 'image/png' }))

    expect(handle.kind).toBe('data')
    const match = /^data:image\/png;base64,(.*)$/s.exec(handle.url)
    expect(match).not.toBeNull()
    const binary = atob(match?.[1] ?? '')
    expect(binary.length).toBe(png.length)
    expect(Array.from(binary, (c) => c.charCodeAt(0))).toEqual(Array.from(png))
    handle.release()
    expect(revoke).not.toHaveBeenCalled()
  })

  it('الغياب مع نوعٍ فارغ ⟵ application/octet-stream لا نوعٌ مخمَّن', async () => {
    set('createObjectURL', undefined)

    const handle = await downloadUrl(new Blob([bytes(3)]))

    expect(handle.url.startsWith('data:application/octet-stream;base64,')).toBe(true)
  })

  it('الكشف عند النداء لا عند التحميل: القدرة تتبدّل في السياق نفسه', async () => {
    set('createObjectURL', undefined)
    expect((await downloadUrl(new Blob([bytes(2)], { type: 'image/png' }))).kind).toBe('data')
    set('createObjectURL', () => 'blob:x/2')
    expect((await downloadUrl(new Blob([bytes(2)], { type: 'image/png' }))).kind).toBe('blob')
  })
})

describe('openShortcutSettings', () => {
  let create: ReturnType<typeof vi.fn>

  beforeEach(() => {
    create = vi.fn().mockResolvedValue({ id: 1 })
    Object.assign(globalThis.chrome, { tabs: { create } })
  })

  it('openShortcutSettings حاضرة ⟵ تُنادى هي ولا يُفتح تبويب', async () => {
    const native = vi.fn().mockResolvedValue(undefined)
    Object.assign(globalThis.chrome, { commands: { openShortcutSettings: native } })

    await expect(openShortcutSettings()).resolves.toBe(true)

    expect(native).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
  })

  it('غائبة ⟵ tabs.create لصفحة الاختصارات', async () => {
    Object.assign(globalThis.chrome, { commands: { getAll: vi.fn() } })

    await expect(openShortcutSettings()).resolves.toBe(true)

    expect(create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' })
  })

  it('غائبة وواجهة commands كلّها غائبة ⟵ المسار نفسه', async () => {
    Object.assign(globalThis.chrome, { commands: undefined })

    await expect(openShortcutSettings()).resolves.toBe(true)

    expect(create).toHaveBeenCalledTimes(1)
  })

  it('tabs.create يرفض ⟵ false بلا رمي', async () => {
    Object.assign(globalThis.chrome, { commands: {} })
    create.mockRejectedValue(new Error('Cannot open internal page'))

    await expect(openShortcutSettings()).resolves.toBe(false)
  })

  it('الأصلية ترمي ⟵ false بلا رمي ولا تبويب بديل', async () => {
    const native = vi.fn().mockRejectedValue(new Error('boom'))
    Object.assign(globalThis.chrome, { commands: { openShortcutSettings: native } })

    await expect(openShortcutSettings()).resolves.toBe(false)

    expect(create).not.toHaveBeenCalled()
  })
})

describe('privateBrowsingModel — الهدف وحده', () => {
  async function modelFor(target: string | undefined) {
    vi.resetModules()
    vi.stubEnv('VITE_RASD_TARGET', target ?? '')
    return (await import('@/shared/platform/capabilities')).privateBrowsingModel()
  }

  it('chromium (والغياب) ⟵ split', async () => {
    expect(await modelFor('chromium')).toBe('split')
    expect(await modelFor(undefined)).toBe('split')
  })

  it('firefox ⟵ not_allowed', async () => {
    expect(await modelFor('firefox')).toBe('not_allowed')
  })

  it('في الاختبارات بلا تحديد ⟵ split', () => {
    expect(privateBrowsingModel()).toBe('split')
  })
})

describe('dataConsentSupported', () => {
  it('data_collection في ردّ getAll ⟵ نعم (ولو فارغة)', async () => {
    Object.assign(globalThis.chrome, {
      permissions: {
        getAll: vi.fn().mockResolvedValue({ permissions: [], origins: [], data_collection: [] }),
      },
    })
    await expect(dataConsentSupported()).resolves.toBe(true)
  })

  it('الحقل غائب ⟵ لا', async () => {
    Object.assign(globalThis.chrome, {
      permissions: { getAll: vi.fn().mockResolvedValue({ permissions: [], origins: [] }) },
    })
    await expect(dataConsentSupported()).resolves.toBe(false)
  })

  it('getAll ترفض ⟵ لا بلا رمي', async () => {
    Object.assign(globalThis.chrome, {
      permissions: { getAll: vi.fn().mockRejectedValue(new Error('boom')) },
    })
    await expect(dataConsentSupported()).resolves.toBe(false)
  })
})
