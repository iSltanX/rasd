import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBoundary, EXTENSION_ORIGIN, type Boundary } from './harness/boundary'
import { installCanvas } from './harness/canvas'
import { layoutPage, type Page } from './harness/page'

import type * as Lifecycle from '@/background/lifecycle'
import type * as Content from '@/content'
import type { ColourPaletteTool } from '@/content/tools/colour-palette'
import type { EyedropperTool } from '@/content/tools/eyedropper'
import type { InspectTool } from '@/content/tools/inspect'
import type * as Rpc from '@/shared/messaging/rpc'
import type * as Db from '@/shared/storage/db'
import type * as Repository from '@/shared/storage/repository'

/**
 * الدورة الثانية: **فحص ← لون ← لوحة ← تصدير**، عبر الحدّ الفعلي (`harness/boundary.ts`).
 *
 * سكربت المحتوى (`startOverlay` الحقيقي) يفحص عنصرًا ويأخذ لونه من لقطة الشاشة ويستخرج لوحة
 * الصفحة، والخلفية وحدها تلتقط وتحسب وتكتب، وصفحتا الإضافة (النافذة والمكتبة) تقرآن ما كُتب — كلٌّ
 * في رسم وحداته. والحفظ والتصدير بأزرار الطبقة نفسها لا بنداء دوالّها.
 *
 * **ما تثبته:** اللون الذي رسمته الصفحة يصل كما هو إلى كل محطّة — عيّنة البكسل، وسجلّ المكتبة، واللوحة،
 * والملفّ المُنزَّل — وما يعرفه المتصفّح عن المُرسِل (التبويب وعنوانه) يأتي من المتصفّح لا من الحمولة.
 */

const URL_PAGE = 'https://shop.example/checkout'

const BACKGROUND = [248, 250, 252] as const
const PANEL = [15, 23, 42] as const
const CTA = [22, 163, 74] as const

const hex = (rgb: readonly number[]) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

async function until<T>(
  read: () => T | null | undefined | Promise<T | null | undefined>,
  what: string,
  ms = 5000,
): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const value = await read()
    if (value !== null && value !== undefined && value !== false) return value
    if (Date.now() > deadline) throw new Error(`لم يحدث: ${what}`)
    await settle()
  }
}

const pointer = (x: number, y: number) =>
  ({
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    altKey: false,
    currentTarget: { setPointerCapture: () => undefined, releasePointerCapture: () => undefined },
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }) as unknown as PointerEvent

/** زرٌّ في الطبقة بنصّه أو عنوانه — ما يراه المستخدم لا اسم دالّته. */
const button = (root: Element, scope: string, label: string) =>
  [...root.querySelectorAll<HTMLButtonElement>(`${scope} button`)].find(
    (b) => b.textContent?.trim() === label || b.title === label,
  ) ?? null

/** ما تكشفه الجلسة الحيّة لحرّاس كروم — أدواتها بأسمائها. */
interface LiveTools {
  readonly inspect: InspectTool
  readonly colour: EyedropperTool
  readonly colourPalette: ColourPaletteTool
}

let boundary: Boundary
let page: Page
let teardown: (() => Promise<void>)[] = []

beforeEach(() => {
  installCanvas()
  page = layoutPage({
    url: URL_PAGE,
    width: 320,
    height: 200,
    dpr: 2,
    background: BACKGROUND,
    boxes: [
      { id: 'panel', x: 0, y: 0, width: 320, height: 60, rgb: PANEL },
      { id: 'cta', x: 100, y: 110, width: 120, height: 40, rgb: CTA },
    ],
  })
  boundary = createBoundary()
  boundary.onCapture(() => Promise.resolve(page.screenshotDataUrl()))
  teardown = []
})

afterEach(async () => {
  for (const fn of teardown.reverse()) await fn()
  boundary.dispose()
  page.dispose()
  vi.restoreAllMocks()
  indexedDB.deleteDatabase('rasd')
})

describe('دورة فحص ← لون ← لوحة ← تصدير', () => {
  it('اللون الذي رسمته الصفحة يصل كما هو إلى العيّنة والمكتبة واللوحة والملفّ', async () => {
    const tab = await fakeBrowser.tabs.create({ url: URL_PAGE, active: true })
    const other = await fakeBrowser.tabs.create({ url: 'https://other.example/', active: false })

    const worker = await boundary.context({
      name: 'worker',
      kind: 'worker',
      url: `${EXTENSION_ORIGIN}/service-worker.js`,
      load: {
        lifecycle: () => import('@/background/lifecycle'),
        db: () => import('@/shared/storage/db'),
      },
    })
    worker.run(() => (worker.modules['lifecycle'] as typeof Lifecycle).registerLifecycle())
    teardown.push(() => worker.run(() => (worker.modules['db'] as typeof Db).closeDatabase()))

    const content = await boundary.context({
      name: 'content',
      kind: 'content',
      tabId: tab.id!,
      url: URL_PAGE,
      load: { overlay: () => import('@/content') },
    })
    const started = await content.run(() =>
      (content.modules['overlay'] as typeof Content).startOverlay(),
    )
    if (!started.ok) throw new Error(started.error.message)
    const session = started.value
    const tools = session as unknown as LiveTools
    teardown.push(async () => {
      content.run(() => session.teardown())
      await settle()
    })
    await settle(60)

    // النافذة والمكتبة: صفحتا إضافة تقرآن ما كتبته الخلفية.
    const library = await boundary.context({
      name: 'library',
      kind: 'page',
      tabId: 90,
      url: `${EXTENSION_ORIGIN}/src/pages/library/index.html`,
      load: {
        rpc: () => import('@/shared/messaging/rpc'),
        repository: () => import('@/shared/storage/repository'),
        db: () => import('@/shared/storage/db'),
      },
    })
    teardown.push(() => library.run(() => (library.modules['db'] as typeof Db).closeDatabase()))
    const rpc = library.modules['rpc'] as typeof Rpc
    const repository = library.modules['repository'] as typeof Repository

    // ── ١. فحص: المؤشِّر فوق الزرّ، والتثبيت يبلّغ الخلفية ─────────────
    content.run(() => {
      session.modes.set('inspect')
      tools.inspect.onPointerMove(pointer(160, 130))
    })
    await until(() => tools.inspect.state.rect.value, 'استهداف العنصر تحت المؤشِّر')
    content.run(() => tools.inspect.onPointerUp(pointer(160, 130)))
    await until(() => boundary.crossingsOf('inspect/report')[0], 'تقرير الفحص')

    const snapshot = await until(async () => {
      const r = await library.run(() => rpc.send('inspect/get', { tabId: tab.id! }))
      return r.ok ? r.value.snapshot : null
    }, 'لقطة الفحص في الخلفية')
    expect(snapshot).toMatchObject({
      tag: 'div',
      selector: '#cta',
      rect: { x: 100, y: 110, width: 120, height: 40 },
    })
    expect(Object.keys(snapshot.styles)).toContain('background-color')
    // الخلفية تحفظ التقرير بتبويب المُرسِل: تبويبٌ آخر لا يرى شيئًا.
    const elsewhere = await library.run(() => rpc.send('inspect/get', { tabId: other.id! }))
    expect(elsewhere.ok && elsewhere.value.snapshot).toBeNull()

    // ── ٢. لون: القطّارة تطلب لقطة من الخلفية، ثمّ تُثبَّت عيّنة فوق الزرّ ───────
    content.run(() => session.modes.set('colour'))
    await until(() => boundary.crossingsOf('colour/frame')[0], 'طلب لقطة العيّنة')
    await until(() => !tools.colour.state.loading.value, 'فكّ لقطة العيّنة في المحتوى')
    expect(tools.colour.state.error.value).toBeNull()
    content.run(() => {
      tools.colour.onPointerMove(pointer(160, 130))
      tools.colour.onPointerUp(pointer(160, 130))
    })
    const pinned = await until(() => tools.colour.state.pinned.value, 'تثبيت العيّنة')
    expect(pinned.source).toBe('pixel')
    expect(pinned.formats.hex).toBe(hex(CTA))
    expect(pinned.selector?.selector).toBe('#cta')
    expect(pinned.mismatch).toBe(false)

    // «حفظ» في لوحة اللون ← الخلفية تكتب السجلّ بعنوان التبويب لا بعنوانٍ في الحمولة.
    const save = await until(
      () => button(session.host.layer, '[data-rasd-ov="colour-panel"]', 'حفظ'),
      'زرّ حفظ اللون',
    )
    content.run(() => save.click())
    const colours = await until(async () => {
      const all = await library.run(() => repository.colors.getAll())
      return all.ok && all.value.length > 0 ? all.value : null
    }, 'سجلّ اللون في المكتبة')
    expect(colours).toEqual([
      expect.objectContaining({ hex: hex(CTA), source: 'pixel', sourceUrl: URL_PAGE }),
    ])

    // ── ٣. لوحة: الاستخراج في الخلفية من لقطة ثانية، ثمّ الحفظ بزرّ اللوحة ─────
    content.run(() => tools.colourPalette.open())
    const swatches = await until(() => {
      const list = tools.colourPalette.state.swatches.value
      return list.length > 0 ? list : null
    }, 'ألوان اللوحة')
    const hexes = swatches.map((s) => s.hex)
    expect(new Set(hexes)).toEqual(new Set([hex(BACKGROUND), hex(PANEL), hex(CTA)]))
    // الحصص من البكسلات: الخلفية أكبر المساحات، والزرّ أصغرها.
    const share = Object.fromEntries(swatches.map((s) => [s.hex, s.share]))
    expect(share[hex(CTA)]).toBeCloseTo((120 * 40) / (320 * 200), 3)
    expect(boundary.crossingsOf('palette/extract')).toEqual([
      { from: 'content', to: 'worker', via: 'runtime', type: 'palette/extract' },
    ])

    const savePalette = await until(
      () => button(session.host.layer, '[data-rasd-ov="palette-panel"]', 'احفظ اللوحة'),
      'زرّ حفظ اللوحة',
    )
    content.run(() => savePalette.click())
    const stored = await until(async () => {
      const all = await library.run(() => repository.palettes.getAll())
      return all.ok && all.value.length > 0 ? all.value : null
    }, 'اللوحة في المكتبة')
    expect(stored).toHaveLength(1)
    expect(stored[0]!.name).toBe('لوحة shop.example')
    expect(stored[0]!.colors.map((c) => c.toLowerCase())).toEqual(hexes)

    // ── ٤. تصدير: زرّ CSS يُنزّل ملفًّا نصّه اللوحة نفسها ───────────────────
    const downloads: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloads.push(blob as Blob)
      return `blob:${URL_PAGE}/${String(downloads.length)}`
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const exportCss = await until(
      () => button(session.host.layer, '[data-rasd-ov="palette-panel"]', 'تنزيل ملفّ CSS'),
      'زرّ تصدير CSS',
    )
    content.run(() => exportCss.click())
    const file = await until(() => downloads[0], 'ملفّ CSS المُنزَّل')
    expect(file.type).toBe('text/css')
    const css = await file.text()
    for (const h of hexes) expect(css.toLowerCase()).toContain(h)
    expect(css.match(/--[\w-]+:\s*#[0-9a-f]{6}/giu)).toHaveLength(hexes.length)

    // الالتقاط للخلفية وحدها، وكل لقطة سبقها إخفاء الطبقة ولحقها إظهارها.
    const shots = boundary.crossings.filter((c) => c.type.startsWith('capture/'))
    const hides = shots.filter((c) => c.type === 'capture/hide-overlay')
    const shows = shots.filter((c) => c.type === 'capture/show-overlay')
    expect(hides.length).toBe(2)
    expect(shows.length).toBe(2)
    expect(hides.every((c) => c.from === 'worker' && c.to === 'content' && c.via === 'tabs')).toBe(
      true,
    )
  })
})
