/**
 * نسخة التنزيلات — «احفظ نسخة في مجلّد التنزيلات» تنفّذ ما تعِد به.
 *
 * العقد الذي يحرسه هذا الملفّ ثلاثة:
 * ١. **`saveLocation` يغيّر الوجهة فعلًا**: `library-and-downloads` مع الصلاحية ⟵ نداء
 *    `chrome.downloads.download` واحد بحمولة هي بايتات اللقطة نفسها.
 * ٢. **الصلاحية المفقودة لا تُفشل شيئًا**: `no-permission` ولا نداء تنزيل.
 * ٣. **لا رمي أبدًا**: كل عطل ⟵ `failed`، لأن الوعد يُطلَق بلا انتظار من خدمة الالتقاط
 *    ورفضٌ غير ملتقَط فيه عطلٌ يُسجَّل في الخلفية بلا من يعالجه.
 */
import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mirrorToDownloads } from '@/background/capture-mirror'
import { defaultSettings, patchSettings, resetSettingsCache } from '@/shared/settings'

import type { CaptureRecord } from '@/shared/storage/schema'

/** الآن بتوقيت الجهاز المحلّي — اسم الملفّ يُختم به لا بـUTC. */
const CREATED_AT = new Date(2026, 8, 30, 14, 5, 9).getTime()

function record(over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id: 'cap-1',
    createdAt: CREATED_AT,
    origin: 'https://example.com',
    url: 'https://example.com/page',
    title: 'صفحة المثال',
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 800,
    height: 600,
    devicePixelRatio: 1,
    favorite: false,
    archived: false,
    trashedAt: null,
    ...over,
  }
}

/** بايتات غير نصّية تتجاوز `0x8000` — قطعةٌ واحدة في `fromCharCode` كانت ستُسقط المكدّس. */
function bytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) out[i] = (i * 7 + 13) % 256
  return out
}

async function setLocation(saveLocation: 'library' | 'library-and-downloads') {
  const settings = defaultSettings()
  const written = await patchSettings({ capture: { ...settings.capture, saveLocation } })
  expect(written.ok).toBe(true)
}

/** يفكّ `data:<mime>;base64,<...>` إلى مقطعيه. */
function decodeDataUrl(url: string): { mime: string; data: Uint8Array } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url)
  if (!match) throw new Error(`ليس عنوان بيانات base64: ${url.slice(0, 40)}`)
  const binary = atob(match[2] ?? '')
  const data = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) data[i] = binary.charCodeAt(i)
  return { mime: match[1] ?? '', data }
}

let download: ReturnType<typeof vi.fn>
let contains: ReturnType<typeof vi.fn>

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
  vi.restoreAllMocks()
  download = vi.fn().mockResolvedValue(1)
  contains = vi.fn().mockResolvedValue(true)
  Object.assign(globalThis.chrome, {
    downloads: { download },
    permissions: { contains },
  })
})

describe('mirrorToDownloads — الوجهة', () => {
  it('library-and-downloads مع الصلاحية ⟵ تنزيل واحد بحمولة هي بايتات اللقطة', async () => {
    await setLocation('library-and-downloads')
    const png = bytes(100_000)

    const outcome = await mirrorToDownloads(record(), new Blob([png], { type: 'image/png' }))

    expect(outcome).toBe('downloaded')
    expect(contains).toHaveBeenCalledWith({ permissions: ['downloads'] })
    expect(download).toHaveBeenCalledTimes(1)
    const call = download.mock.calls[0]?.[0] as {
      url: string
      filename: string
      saveAs: boolean
      conflictAction: string
    }
    expect(call.filename).toBe('رصد/صفحة-المثال-20260930-140509.png')
    expect(call.saveAs).toBe(false)
    expect(call.conflictAction).toBe('uniquify')
    expect(call.url.startsWith('data:image/png;base64,')).toBe(true)
    const decoded = decodeDataUrl(call.url)
    expect(decoded.mime).toBe('image/png')
    // البايتات متطابقة بايتًا ببايت — لا قطع ولا تشويه عند حدود القطع.
    expect(decoded.data.length).toBe(png.length)
    expect(Array.from(decoded.data)).toEqual(Array.from(png))
  })

  it('لقطة WebP ⟵ امتداد webp ونوع image/webp في العنوان', async () => {
    await setLocation('library-and-downloads')

    const outcome = await mirrorToDownloads(record(), new Blob([bytes(64)], { type: 'image/webp' }))

    expect(outcome).toBe('downloaded')
    const call = download.mock.calls[0]?.[0] as { url: string; filename: string }
    expect(call.filename.endsWith('.webp')).toBe(true)
    expect(call.url.startsWith('data:image/webp;base64,')).toBe(true)
  })

  it('نوع غير معروف أو فارغ ⟵ png لا امتداد مخمَّن', async () => {
    await setLocation('library-and-downloads')

    await mirrorToDownloads(record(), new Blob([bytes(8)], { type: '' }))

    const call = download.mock.calls[0]?.[0] as { url: string; filename: string }
    expect(call.filename.endsWith('.png')).toBe(true)
    expect(call.url.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('library (الافتراضي) ⟵ off ولا نداء تنزيل ولا سؤال عن الصلاحية', async () => {
    await setLocation('library')

    const outcome = await mirrorToDownloads(record(), new Blob([bytes(8)], { type: 'image/png' }))

    expect(outcome).toBe('off')
    expect(download).not.toHaveBeenCalled()
    expect(contains).not.toHaveBeenCalled()
  })

  it('إعدادات لم تُكتب قطّ ⟵ الافتراضي library ⟵ off', async () => {
    const outcome = await mirrorToDownloads(record(), new Blob([bytes(8)], { type: 'image/png' }))

    expect(outcome).toBe('off')
    expect(download).not.toHaveBeenCalled()
  })
})

describe('mirrorToDownloads — لا يُفشل الالتقاط أبدًا', () => {
  it('الصلاحية مفقودة ⟵ no-permission ولا نداء تنزيل', async () => {
    await setLocation('library-and-downloads')
    contains.mockResolvedValue(false)

    const outcome = await mirrorToDownloads(record(), new Blob([bytes(8)], { type: 'image/png' }))

    expect(outcome).toBe('no-permission')
    expect(download).not.toHaveBeenCalled()
  })

  it('سؤال الصلاحية نفسه يرمي ⟵ يُعامَل مفقودة لا عطلًا', async () => {
    await setLocation('library-and-downloads')
    contains.mockRejectedValue(new Error('boom'))

    const outcome = await mirrorToDownloads(record(), new Blob([bytes(8)], { type: 'image/png' }))

    expect(outcome).toBe('no-permission')
    expect(download).not.toHaveBeenCalled()
  })

  it('التنزيل يرفض بوعدٍ مرفوض ⟵ failed بلا رمي', async () => {
    await setLocation('library-and-downloads')
    download.mockRejectedValue(new Error('Download canceled by the user'))

    await expect(
      mirrorToDownloads(record(), new Blob([bytes(8)], { type: 'image/png' })),
    ).resolves.toBe('failed')
  })

  it('التنزيل يرمي متزامنًا ⟵ failed بلا رمي', async () => {
    await setLocation('library-and-downloads')
    download.mockImplementation(() => {
      throw new Error('Invalid filename')
    })

    await expect(
      mirrorToDownloads(record(), new Blob([bytes(8)], { type: 'image/png' })),
    ).resolves.toBe('failed')
  })

  it('فشل قراءة الإعدادات ⟵ off، ولا كتابة إعدادات، ولا تنزيل', async () => {
    const set = vi.spyOn(chrome.storage.local, 'set')
    vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('storage unavailable'))

    const outcome = await mirrorToDownloads(record(), new Blob([bytes(8)], { type: 'image/png' }))

    expect(outcome).toBe('off')
    expect(download).not.toHaveBeenCalled()
    // جهلٌ بالإعداد لا يُكتب افتراضيًّا فوق قرار المستخدم.
    expect(set).not.toHaveBeenCalled()
  })

  it('قراءة البايتات تفشل ⟵ failed بلا رمي', async () => {
    await setLocation('library-and-downloads')
    const blob = new Blob([bytes(8)], { type: 'image/png' })
    vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('read failed'))

    await expect(mirrorToDownloads(record(), blob)).resolves.toBe('failed')
    expect(download).not.toHaveBeenCalled()
  })
})
