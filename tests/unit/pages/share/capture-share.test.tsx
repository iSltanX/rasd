import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEGRADE_NOTE } from '@/modules/export/download'
import { err, ok } from '@/shared/result'

import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * مشاركة اللقطة — المحرّك فوق `ShareDialog`. الخبز والتسليم والحافظة مُحاكاة: ما يُختبر هنا أيّ مسارٍ يخبز
 * بماذا، وأن الحافظة تُكتب في نبضة النقرة، وما يُكتب في الصفحة بعد الحذف، والأطوار كلّها. والصفحة الحقيقية في
 * كروم وبلا شبكة يثبتها `verify:share`.
 */

interface Baked {
  format: string
  scale: number
  stripMetadata: boolean | undefined
}
const bakes: Baked[] = []
let bakeOutcome: (format: string) => Promise<unknown> = (format) =>
  Promise.resolve(
    ok({
      blob: new Blob([new Uint8Array([9, 8, 7])], { type: `image/${format}` }),
      report: { format, width: 320, height: 200, metadataStripped: true },
    }),
  )
let cancelled = 0
const copies: Promise<Blob>[] = []
let copyOutcome: () => Promise<unknown> = () => Promise.resolve(ok('copied'))

vi.mock('@/pages/editor/export', () => ({
  startExport: (o: { format: string; scale: number; stripMetadata?: boolean }) => {
    bakes.push({ format: o.format, scale: o.scale, stripMetadata: o.stripMetadata })
    const done = bakeOutcome(o.format)
    const bytes = done.then((r) => (r as { value: { blob: Blob } }).value.blob)
    bytes.catch(() => undefined)
    return { done, bytes, cancel: () => (cancelled += 1) }
  },
  copyBaked: (pending: Promise<Blob>) => {
    copies.push(pending)
    return copyOutcome()
  },
}))

interface DeliverCall {
  route: string
  url: string
  filename: string
}
const delivered: DeliverCall[] = []
vi.mock('@/pages/export/deliver', () => ({
  deliver: (input: DeliverCall) => {
    delivered.push(input)
    return Promise.resolve({
      route: input.route,
      downloadId: input.route === 'managed' ? 7 : null,
      shown: input.filename,
    })
  },
  revealDownload: () => undefined,
}))

let granted = false
let askOutcome: 'granted' | 'denied' = 'denied'
const asks: number[] = []
vi.mock('@/shared/permissions', () => ({
  hasPermission: () => Promise.resolve(granted),
  requestPermission: () => {
    asks.push(1)
    return Promise.resolve(askOutcome)
  },
}))

let forced = false
vi.mock('@/shared/settings', () => ({
  watchSettings: (cb: (s: unknown) => void) => {
    cb({ privacy: { stripMetadataOnExport: forced } })
    return () => undefined
  },
  getSettingsResult: () =>
    Promise.resolve({ ok: true, value: { privacy: { stripMetadataOnExport: forced } } }),
}))

vi.mock('@/pages/export/guide-export', () => {
  const c = {
    canvas: '#000',
    surface: '#111',
    text: '#fff',
    muted: '#aaa',
    border: '#222',
    accent: '#0f0',
    onAccent: '#000',
  }
  return { guidePalette: () => ({ light: c, dark: c }) }
})

let planOk = true
vi.mock('@/modules/editor/bake', () => ({
  planExport: () =>
    planOk
      ? { ok: true, width: 320, height: 200, bytes: 1, bound: 'none', reason: null }
      : { ok: false, width: 0, height: 0, bytes: 0, bound: 'area', reason: 'أكبر من حدود القماش.' },
}))

const { resetRefusalMemory } = await import('@/pages/export/permission-memory')
const { CaptureShare } = await import('@/pages/share/CaptureShare')

const CAPTURE = {
  id: 'c1',
  title: 'الواجهة — سطح المكتب',
  url: 'https://shop.example/checkout?session=SECRET',
  origin: 'https://shop.example',
  createdAt: Date.UTC(2026, 8, 30),
  width: 320,
  height: 200,
} as unknown as CaptureRecord

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('انتهت مهلة الانتظار')
    await flush()
  }
}

let container: HTMLDivElement
let closed = 0
const blobs = new Map<string, Blob>()

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  render(
    <CaptureShare
      scene={{} as never}
      sourceBlob={new Blob()}
      style={{} as never}
      layout={{} as never}
      client={{} as never}
      capture={CAPTURE}
      onClose={() => (closed += 1)}
    />,
    container,
  )
  // التأثيرات (استطلاع الصلاحية، والإعدادات الحيّة، ومستمع Escape) بعد الرسم لا معه.
  await flush()
  await flush()
}

const q = <T extends Element>(selector: string) => container.querySelector<T>(selector)
const phase = () => q('[data-share]')?.getAttribute('data-phase')
async function choose(path: string) {
  q<HTMLInputElement>(`input[data-share-path="${path}"]`)!.click()
  await flush()
}

async function pick(selector: string, value: string) {
  const select = q<HTMLSelectElement>(selector)!
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}
const run = () => q<HTMLButtonElement>('[data-share-run]')!.click()

/** نصّ الصفحة التي سُلِّمت أخيرًا. */
async function lastPage(): Promise<string> {
  const blob = blobs.get(delivered.at(-1)!.url)!
  return blob.text()
}

beforeEach(() => {
  bakes.length = 0
  delivered.length = 0
  copies.length = 0
  asks.length = 0
  blobs.clear()
  cancelled = 0
  closed = 0
  granted = false
  askOutcome = 'denied'
  forced = false
  planOk = true
  resetRefusalMemory()
  bakeOutcome = (format) =>
    Promise.resolve(
      ok({
        blob: new Blob([new Uint8Array([9, 8, 7])], { type: `image/${format}` }),
        report: { format, width: 320, height: 200, metadataStripped: true },
      }),
    )
  copyOutcome = () => Promise.resolve(ok('copied'))
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    const url = `blob:test/${(n += 1)}`
    blobs.set(url, blob as Blob)
    return url
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

afterEach(() => {
  render(null, container)
  container.remove()
  vi.restoreAllMocks()
})

describe('CaptureShare — النافذة', () => {
  it('ثلاثة مسارات تعمل ورابطٌ سحابي معطَّل بسببٍ مرئيّ', async () => {
    await mount()
    expect(phase()).toBe('choose')
    for (const path of ['page', 'clipboard', 'file']) {
      expect(q<HTMLInputElement>(`input[data-share-path="${path}"]`)?.disabled).toBe(false)
    }
    const cloud = q<HTMLInputElement>('input[data-share-cloud]')!
    expect(cloud.disabled).toBe(true)
    expect(cloud.closest('label')?.textContent).toContain('قريبًا')
    expect(q('[data-share-cloud-reason]')?.textContent).toContain('يحتاج خادمًا')
  })

  it('لافتة الوعد المحلّي ومفاتيح الحذف مع الصفحة، وخيارات الملفّ معه', async () => {
    await mount()
    expect(container.textContent).toContain('لا يرفع شيئًا إلى خادم')
    expect(q('[data-share-strip]')).not.toBeNull()
    await choose('file')
    expect(q('[data-share-strip]')).toBeNull()
    expect(q('[data-share-file]')?.textContent).toContain('لا تحمل رابط الصفحة')
  })

  it('Escape يغلق', async () => {
    await mount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closed).toBe(1)
  })

  it('لقطةٌ فوق حدود القماش تمنع التنفيذ بسببها', async () => {
    planOk = false
    await mount()
    expect(q('[data-share-blocked]')?.textContent).toContain('حدود القماش')
    expect(q<HTMLButtonElement>('[data-share-run]')?.disabled).toBe(true)
  })
})

describe('CaptureShare — صفحة ويب', () => {
  it('تُخبز WebP بدقّة 1× بلا مقاطع ثانوية، وتُسلَّم HTML بحذفها الافتراضي', async () => {
    await mount()
    run()
    await waitFor(() => phase() === 'done')
    expect(bakes).toEqual([{ format: 'webp', scale: 1, stripMetadata: true }])
    expect(delivered[0]!.filename).toBe('الواجهة-—-سطح-المكتب.html')
    const html = await lastPage()
    expect(html).toContain('data:image/webp;base64,CQgH')
    expect(html).not.toContain('SECRET')
    expect(html).toContain('الواجهة — سطح المكتب')
    expect(q('[data-share-done]')?.getAttribute('data-share-done')).toBe('page')
    expect(q('[data-share-done]')?.getAttribute('data-share-blob')).toBe(delivered[0]!.url)
    expect(container.textContent).toContain('العنوان في الصفحة')
  })

  it('مفتاح الرابط يُطفأ فيُكتب الرابط', async () => {
    await mount()
    const toggle = q<HTMLElement>('[data-share-strip-field="url"] [role="switch"]')!
    toggle.click()
    await flush()
    run()
    await waitFor(() => phase() === 'done')
    expect(await lastPage()).toContain('SECRET')
  })

  it('«احذف البيانات الوصفية» يفرض الحذف الكامل: المفاتيح معطَّلة، ولا عنوان في الصفحة ولا في اسمها', async () => {
    forced = true
    await mount()
    expect(container.textContent).toContain('مفعَّل في الخصوصية')
    run()
    await waitFor(() => phase() === 'done')
    const html = await lastPage()
    expect(html).not.toContain('الواجهة')
    expect(html).not.toContain('SECRET')
    expect(delivered[0]!.filename).toBe('لقطة-من-رصد.html')
    expect(container.textContent).toContain('محذوفة')
  })

  it('الرفض: الملفّ يُحفظ بالمرساة، ولافتةٌ صادقة، و«امنح الصلاحية» من نقرة', async () => {
    await mount()
    run()
    await waitFor(() => phase() === 'done')
    expect(delivered[0]!.route).toBe('anchor')
    expect(q('[data-share-degraded]')?.textContent).toContain('مجلّد التنزيلات الافتراضي')
    expect(DEGRADE_NOTE.length).toBeGreaterThan(0)
    askOutcome = 'granted'
    q<HTMLButtonElement>('[data-share-grant]')!.click()
    await waitFor(() => phase() === 'choose')
    expect(asks).toHaveLength(2)
  })

  it('المنح: طريقٌ مُدار، و«اعرض في المجلّد»', async () => {
    granted = true
    await mount()
    run()
    await waitFor(() => phase() === 'done')
    expect(delivered[0]!.route).toBe('managed')
    expect(asks).toHaveLength(0)
    expect(q('[data-share-reveal]')).not.toBeNull()
    expect(q('[data-share-degraded]')).toBeNull()
  })

  it('الإلغاء أثناء الخبز: لا تسليم، ثمّ «شارك من جديد» يعود إلى الخيارات', async () => {
    let release: (v: unknown) => void = () => undefined
    bakeOutcome = () => new Promise((r) => (release = r))
    await mount()
    run()
    await waitFor(() => phase() === 'running')
    q<HTMLButtonElement>('[data-share-cancel]')!.click()
    await flush()
    expect(phase()).toBe('cancelled')
    expect(cancelled).toBe(1)
    release(err({ code: 'cancelled', message: 'أُلغي' }))
    await flush()
    expect(delivered).toHaveLength(0)
    expect(phase()).toBe('cancelled')
    q<HTMLButtonElement>('[data-share-restart]')!.click()
    await flush()
    expect(phase()).toBe('choose')
  })

  it('فشل الخبز: طور الخطأ برسالته، و«أعد المحاولة» تعيد الخبز', async () => {
    bakeOutcome = () => Promise.resolve(err({ code: 'handler-failed', message: 'نفدت الذاكرة.' }))
    await mount()
    run()
    await waitFor(() => phase() === 'error')
    expect(q('[data-share-error]')?.textContent).toContain('تعذّر إنشاء الصفحة')
    expect(q('[data-share-error]')?.textContent).toContain('نفدت الذاكرة.')
    expect(q('[data-share-error]')?.textContent).toContain('اللقطة في المكتبة كما هي.')
    q<HTMLButtonElement>('[data-share-retry]')!.click()
    await waitFor(() => bakes.length === 2)
  })
})

describe('CaptureShare — الحافظة', () => {
  it('الكتابة في نبضة النقرة نفسها بوعد خبزة PNG بدقّة 1×', async () => {
    await mount()
    await choose('clipboard')
    run()
    // لا `await` بعد النقرة: الكتابة نُوديت قبل أي نبضة تالية.
    expect(copies).toHaveLength(1)
    expect(bakes).toEqual([{ format: 'png', scale: 1, stripMetadata: true }])
    await waitFor(() => phase() === 'copied')
    expect(q('[data-share-copied]')?.textContent).toContain('نُسخت الصورة')
    expect(delivered).toHaveLength(0)
    expect(asks).toHaveLength(0)
  })

  it('رفض الحافظة يُعرض خطأً برسالته', async () => {
    copyOutcome = () =>
      Promise.resolve(
        err({ code: 'permission-denied', message: 'تعذّر النسخ — انقر داخل الصفحة.' }),
      )
    await mount()
    await choose('clipboard')
    run()
    await waitFor(() => phase() === 'error')
    expect(q('[data-share-error]')?.textContent).toContain('تعذّر النسخ')
  })
})

describe('CaptureShare — ملفّ', () => {
  it('الصيغة والدقّة المختارتان، واسم الملفّ بلاحقته', async () => {
    await mount()
    await choose('file')
    await pick('select[data-share-format]', 'webp')
    await pick('select[data-share-scale]', '1')
    run()
    await waitFor(() => phase() === 'done')
    expect(bakes).toEqual([{ format: 'webp', scale: 1, stripMetadata: true }])
    expect(delivered[0]!.filename).toBe('الواجهة-—-سطح-المكتب.webp')
    expect(q('[data-share-done]')?.getAttribute('data-share-done')).toBe('file')
  })

  it('الافتراضي PNG بدقّة 2×', async () => {
    await mount()
    await choose('file')
    run()
    await waitFor(() => phase() === 'done')
    expect(bakes).toEqual([{ format: 'png', scale: 2, stripMetadata: true }])
    expect(delivered[0]!.filename).toBe('الواجهة-—-سطح-المكتب@2x.png')
  })
})
