import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBoundary, EXTENSION_ORIGIN, type Boundary } from './harness/boundary'
import { decodeBlob, installCanvas } from './harness/canvas'
import { layoutPage, type Page } from './harness/page'
import { pixelOf, type Pixels } from './harness/png'

import type * as Lifecycle from '@/background/lifecycle'
import type * as Content from '@/content'
import type * as Commands from '@/modules/editor/commands'
import type { AnnotationColor, RedactNode } from '@/modules/editor/scene'
import type * as SceneOps from '@/modules/editor/scene-ops'
import type * as EditorContext from '@/pages/editor/context'
import type * as EditorExport from '@/pages/editor/export'
import type * as WorkerClient from '@/pages/editor/worker-client'
import type * as Geometry from '@/shared/geometry'
import type * as Db from '@/shared/storage/db'

/**
 * الدورة الأولى: **التقاط ← تخزين ← تحرير ← تصدير**، عبر الحدّ الفعلي (`harness/boundary.ts`).
 *
 * ثلاثة سياقات بثلاثة رسوم وحدات: سكربت المحتوى في تبويب الصفحة (`startOverlay` الحقيقي)، والخلفية
 * (`registerLifecycle` الحقيقي)، وصفحة المحرّر في تبويبها. لا يستدعي أحدها دالّة من الآخر: المحتوى
 * يطلب الالتقاط برسالة، والخلفية تُخفي طبقته برسالة إلى تبويبه، وتقصّ وتخزّن، والمحرّر يُفتح بعنوانٍ
 * تكتبه الخلفية ويقرأ اللقطة من IndexedDB لا من ذاكرة مشتركة.
 *
 * **والسؤال الذي تُجيب عنه الدورة هو وعد المنتج:** سرٌّ مرسوم في الصفحة، يُلتقط ويُخزَّن ويُحجب في
 * المحرّر، **لا يبقى منه بكسل واحد في الملفّ المُصدَّر** — وما حوله يصل بايتًا ببايت كما رسمته الصفحة.
 */

const URL_PAGE = 'https://example.com/pricing?plan=pro'

const BACKGROUND = [241, 245, 249] as const
const CARD = [37, 99, 235] as const
/** لون السرّ لا يشبه غيره في الصفحة ولا لون الحجب — عدّه في الملفّ هو الحكم. */
const SECRET = [250, 204, 21] as const

const STYLE = {
  palette: {
    'tool/annotate/solid': '#f9a03f',
    'tool/capture/solid': '#3b82f6',
    'tool/inspect/solid': '#22c55e',
    'tool/measure/solid': '#a855f7',
    'tool/compare/solid': '#eab308',
    'status/danger/solid': '#dc2626',
    'status/success/solid': '#16a34a',
  } satisfies Record<AnnotationColor, string>,
  selectionHex: '#00e3c9',
  handleHex: '#ffffff',
  redactOutlineHex: '#00e3c9',
  textFamily: 'Cairo',
  monoFamily: 'Geist Mono',
}

const LAYOUT = {
  get: () => ({ lines: [], width: 0, height: 0, direction: 'rtl' as const, overflow: false }),
  metrics: () => ({ ascent: 10, descent: 3, lineHeight: 16 }),
  invalidate: () => undefined,
  size: 0,
}

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

async function until<T>(
  read: () => T | null | undefined | Promise<T | null | undefined>,
  what: string,
  ms = 5000,
): Promise<T> {
  const deadline = Date.now() + ms
  for (;;) {
    const value = await read()
    if (value !== null && value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`لم يحدث: ${what}`)
    await settle()
  }
}

const count = (img: Pixels, rgb: readonly number[]) => {
  let n = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] === rgb[0] && img.data[i + 1] === rgb[1] && img.data[i + 2] === rgb[2]) n++
  }
  return n
}

const pointer = (x: number, y: number) =>
  ({
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: x,
    clientY: y,
    currentTarget: { setPointerCapture: () => undefined, releasePointerCapture: () => undefined },
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }) as unknown as PointerEvent

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
      { id: 'card', x: 40, y: 30, width: 200, height: 120, rgb: CARD },
      { id: 'secret', x: 80, y: 60, width: 60, height: 20, rgb: SECRET },
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
  indexedDB.deleteDatabase('rasd')
})

describe('دورة التقاط ← تخزين ← تحرير ← تصدير', () => {
  it('السرّ المحجوب لا يصل إلى الملفّ، وما حوله يصل كما رسمته الصفحة', async () => {
    const tab = await fakeBrowser.tabs.create({ url: URL_PAGE, active: true })

    // ── الخلفية ──────────────────────────────────────────────────
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

    // ── سكربت المحتوى في تبويب الصفحة ─────────────────────────────
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
    teardown.push(async () => {
      content.run(() => session.teardown())
      await settle()
    })
    await settle(60)

    // ── ١. التقاط: سحب منطقة في الصفحة ثمّ تأكيدها ──────────────────
    content.run(() => {
      session.modes.set('area')
      session.area.handlers.onPointerDown(pointer(20, 20))
      session.area.handlers.onPointerMove(pointer(140, 90))
      session.area.handlers.onPointerUp(pointer(140, 90))
      session.area.commit()
    })
    const saved = await until(() => session.lastCapture(), 'اكتمال الالتقاط')

    // مستطيل CSS ‏120×70 بكثافة 2 ← 240×140 بكسل جهاز.
    expect({ width: saved.width, height: saved.height }).toEqual({ width: 240, height: 140 })

    // الطبقة أُخفيت قبل اللقطة وأُظهرت بعدها — برسالتين من الخلفية إلى تبويب الصفحة.
    const order = boundary.crossings.map((c) => `${c.from}→${c.to}:${c.type}`)
    const at = (entry: string) => order.indexOf(entry)
    expect(at('content→worker:capture/run')).toBeGreaterThanOrEqual(0)
    expect(at('worker→content:capture/hide-overlay')).toBeGreaterThan(
      at('content→worker:capture/run'),
    )
    expect(at('worker→content:capture/show-overlay')).toBeGreaterThan(
      at('worker→content:capture/hide-overlay'),
    )

    // ── ٢. فتح المحرّر: زرّ الإشعار في الطبقة ← الخلفية تفتح تبويبًا بعنوانٍ تكتبه هي ──
    const openInEditor = await until(
      () => session.host.layer.querySelector<HTMLButtonElement>('.rasd-ov-toast-action'),
      'زرّ فتح المحرّر في إشعار الالتقاط',
    )
    content.run(() => openInEditor.click())
    await until(() => boundary.crossingsOf('page/open')[0], 'رسالة فتح المحرّر')
    const editorTab = await until(async () => {
      const all = await fakeBrowser.tabs.query({})
      return all.find((t) => t.url?.startsWith(`${EXTENSION_ORIGIN}/`))
    }, 'تبويب المحرّر تفتحه الخلفية')

    // ── ٣. تخزين ثمّ تحرير: صفحة المحرّر تقرأ من IndexedDB بعنوان تبويبها ─────
    const editor = await boundary.context({
      name: 'editor',
      kind: 'page',
      tabId: editorTab.id!,
      url: editorTab.url!,
      load: {
        context: () => import('@/pages/editor/context'),
        exporter: () => import('@/pages/editor/export'),
        client: () => import('@/pages/editor/worker-client'),
        ops: () => import('@/modules/editor/scene-ops'),
        commands: () => import('@/modules/editor/commands'),
        geometry: () => import('@/shared/geometry'),
        db: () => import('@/shared/storage/db'),
      },
    })
    teardown.push(() => editor.run(() => (editor.modules['db'] as typeof Db).closeDatabase()))
    const ctx = editor.modules['context'] as typeof EditorContext
    const urls = { create: () => 'blob:editor/0', revoke: () => undefined }

    const captureId = ctx.captureIdFromLocation(editorTab.url!)
    expect(captureId).toBe(saved.id)
    const loaded = await editor.run(() => ctx.loadEditorContext(captureId!, urls))
    if (!loaded.ok) throw new Error(loaded.error.message)

    // العنوان والأصل من التبويب الذي أرسل — لا من حمولةٍ لم تحملهما أصلًا.
    expect(loaded.value.capture).toMatchObject({
      kind: 'area',
      url: URL_PAGE,
      origin: 'https://example.com',
      devicePixelRatio: 2,
      width: 240,
      height: 140,
    })

    // البايتات المخزَّنة هي الصفحة مقصوصةً بدقّة الجهاز: الخلفية في الركن، والبطاقة، والسرّ.
    const stored = await decodeBlob(loaded.value.sourceBlob)
    expect({ w: stored.width, h: stored.height }).toEqual({ w: 240, h: 140 })
    expect(pixelOf(stored, 10, 10)).toEqual([...BACKGROUND, 255])
    expect(pixelOf(stored, 60, 40)).toEqual([...CARD, 255])
    // السرّ في CSS ‏(80..140, 60..80) ← نسبةً إلى أصل القصّ (20, 20) وبكثافة 2: (120..240, 80..120).
    expect(pixelOf(stored, 130, 90)).toEqual([...SECRET, 255])
    expect(count(stored, SECRET)).toBe(120 * 40)

    const geometry = editor.modules['geometry'] as typeof Geometry
    const redact: RedactNode = {
      kind: 'redact',
      id: 'r1' as RedactNode['id'],
      locked: false,
      rotation: 0,
      stroke: { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 0.9 },
      rect: geometry.deviceRect(120, 80, 120, 40),
      mode: 'cover',
      strength: 0,
      coverToken: 'tool/inspect/solid',
    }
    const ops = editor.modules['ops'] as typeof SceneOps
    const commands = editor.modules['commands'] as typeof Commands
    const added = ops.addNode(loaded.value.scene, redact)
    expect(added.refusal).toBeNull()
    const edited = commands.applyPatches(loaded.value.scene, added.patches)
    const written = await editor.run(() => ctx.saveScene(edited, loaded.value.baseUpdatedAt))
    expect(written.kind).toBe('saved')

    // إعادة الفتح تقرأ المشهد المحفوظ لا الذي في الذاكرة.
    const reopened = await editor.run(() => ctx.loadEditorContext(captureId!, urls))
    if (!reopened.ok) throw new Error(reopened.error.message)
    expect(reopened.value.scene.nodes.map((n) => n.kind)).toEqual(['redact'])

    // ── ٤. تصدير: الخبز الحقيقي على القماش، والحجب في المسار الاحتياطي للعامل ──
    const exporter = editor.modules['exporter'] as typeof EditorExport
    const client = (editor.modules['client'] as typeof WorkerClient).createBlurClient({
      spawn: () => null,
    })
    const run = editor.run(() =>
      exporter.startExport({
        scene: reopened.value.scene,
        sourceBlob: reopened.value.sourceBlob,
        scale: 1,
        format: 'png',
        style: STYLE,
        layout: LAYOUT,
        client,
      }),
    )
    const done = await run.done
    if (!done.ok) throw new Error(done.error.message)
    expect(done.value.blob.type).toBe('image/png')

    const file = await decodeBlob(done.value.blob)
    expect({ w: file.width, h: file.height }).toEqual({ w: 240, h: 140 })
    expect(count(file, SECRET)).toBe(0)
    // الحجب لونٌ واحد يملأ المستطيل كلّه، وما خارجه لم يُمسّ.
    const cover = pixelOf(file, 120, 80)
    expect(cover).not.toEqual([...SECRET, 255])
    for (const [x, y] of [
      [120, 80],
      [239, 119],
      [180, 100],
    ] as const) {
      expect(pixelOf(file, x, y)).toEqual(cover)
    }
    for (let y = 0; y < 140; y += 7) {
      for (let x = 0; x < 240; x += 7) {
        const inRedact = x >= 120 && y >= 80 && y < 120
        if (!inRedact)
          expect(pixelOf(file, x, y), `${String(x)},${String(y)}`).toEqual(pixelOf(stored, x, y))
      }
    }

    // المحتوى لم يعبر إلّا بالرسائل — والخلفية لم تُسأل عن شيءٍ قرأه المحرّر من المخزن.
    const types = new Set(boundary.crossings.map((c) => c.type))
    expect(types.has('capture/blob')).toBe(false)
    expect(boundary.crossings.every((c) => c.from !== c.to)).toBe(true)
  })
})
