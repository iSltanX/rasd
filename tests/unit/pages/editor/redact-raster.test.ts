import { describe, expect, it, vi } from 'vitest'

import { applyOps } from '@/modules/editor/redact'
import { asNodeId, type AnnotationColor, type RedactNode } from '@/modules/editor/scene'
import { createRedactRaster, type Scratch } from '@/pages/editor/redact-raster'
import { deviceRect } from '@/shared/geometry'

import type { ObscureOp } from '@/modules/editor/blur-protocol'
import type { BaseSource, Ctx2D, RenderStyle } from '@/modules/editor/renderer'
import type { BlurClient, BlurOutcome } from '@/pages/editor/worker-client'

/**
 * مسار بناء الرقعة — **بلا قماش**.
 *
 * `getContext('2d')` تُعيد `null` في بيئة الاختبار، فالسطح يُحقن. والذي
 * يُختبَر هنا ما لا يراه اختبار آخر: أن العملية المُرسَلة إلى محرّك البكسل
 * مبنيّة على **وجهة الرقعة وشدّتها المضروبة بالمقياس** لا على إحداثيات
 * المشهد. وخطأ سطر واحد هناك يضع الغطاء في مكان غير الذي رآه المستخدم —
 * تسريبٌ لا يراه فحص تباين، لأنه يقرأ المستطيل الذي رسمه هو.
 */

const PALETTE = {
  'tool/annotate/solid': '#f9a03f',
  'tool/capture/solid': '#3b82f6',
  'tool/inspect/solid': '#22c55e',
  'tool/measure/solid': '#a855f7',
  'tool/compare/solid': '#eab308',
  'status/danger/solid': '#dc2626',
  'status/success/solid': '#16a34a',
} as const satisfies Readonly<Record<AnnotationColor, string>>

const STYLE = {
  palette: PALETTE,
  selectionHex: '#00e3c9',
  handleHex: '#ffffff',
  redactOutlineHex: '#00e3c9',
  textFamily: 'Cairo',
  monoFamily: 'Geist Mono',
} as unknown as RenderStyle

const SOURCE: BaseSource = { bitmap: {} as CanvasImageSource, width: 400, height: 300 }

const redact = (over: Partial<RedactNode> = {}): RedactNode => ({
  kind: 'redact',
  id: asNodeId('r1'),
  locked: false,
  rotation: 0,
  stroke: { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 0.9 },
  rect: deviceRect(100, 60, 80, 40),
  mode: 'blur',
  strength: 12,
  coverToken: 'status/danger/solid',
  ...over,
})

/** سطحٌ مزيّف يسجّل ما رُسم عليه ويحمل بكسلات حقيقية. */
function fakeSurface(): {
  make: (w: number, h: number) => Scratch
  calls: { drawImage: unknown[][]; disposed: number }
} {
  const calls = { drawImage: [] as unknown[][], disposed: 0 }

  const make = (w: number, h: number): Scratch => {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (i * 3) % 256
      data[i + 1] = (i * 7) % 256
      data[i + 2] = (i * 11) % 256
      data[i + 3] = 255
    }
    const ctx = {
      drawImage: (...args: unknown[]) => calls.drawImage.push(args),
      save: () => undefined,
      restore: () => undefined,
      scale: () => undefined,
      translate: () => undefined,
    } as unknown as Ctx2D

    return {
      ctx,
      image: {} as CanvasImageSource,
      getImageData: () => new ImageData(new Uint8ClampedArray(data), w, h),
      putImageData: () => undefined,
      dispose: () => {
        calls.disposed++
      },
    }
  }
  return { make, calls }
}

/** عميلٌ مزيّف ينفّذ العمليات نفسها ويكشف ما استُقبل. */
function fakeClient(): { client: BlurClient; ops: ObscureOp[][] } {
  const ops: ObscureOp[][] = []
  const client: BlurClient = {
    lastPath: 'main',
    dispose: () => undefined,
    run: (buffer, width, height, list): Promise<BlurOutcome> => {
      ops.push([...list])
      const data = new Uint8ClampedArray(buffer)
      applyOps({ data, width, height }, list)
      return Promise.resolve({ buffer: data.buffer, path: 'main', reason: null, ms: 1 })
    },
  }
  return { client, ops }
}

const build = (over: Partial<Parameters<typeof createRedactRaster>[0]> = {}) => {
  const surface = fakeSurface()
  const { client, ops } = fakeClient()
  const onReady = vi.fn()
  const raster = createRedactRaster({
    source: SOURCE,
    style: STYLE,
    client,
    onReady,
    surface: surface.make,
    ...over,
  })
  return { raster, surface, ops, onReady }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

describe('**بناء رقعة الطمس**', () => {
  it('الإطار الأوّل يُعيد `null` — تغطية ريثما تجهز، لا بكسلات خامًا', () => {
    const { raster } = build()
    expect(raster.patchFor(redact(), 1, '0')).toBeNull()
  })

  it('**والعملية تُبنى بوجهة الرقعة لا بإحداثيات المشهد**', async () => {
    const { raster, ops } = build()
    raster.patchFor(redact(), 1, '0')
    await flush()

    expect(ops).toHaveLength(1)
    const op = ops[0]![0]!
    // العقدة عند (100,60) في المشهد؛ وفي الرقعة عند الهامش لا عندها.
    expect(op.rect.x).not.toBe(100)
    // الهامش نصف قطر النواة عند σ=12، وهو 33 لا 24 (d=23 فردي ⇒ 3×11).
    expect(op.rect).toEqual({ x: 33, y: 33, w: 80, h: 40 })
    expect(op.mode).toBe('blur')
  })

  it('**والشدّة تُضرب بالمقياس** — وإلّا اختلفت المعاينة عن مقياسها', async () => {
    const { raster, ops } = build()
    raster.patchFor(redact({ strength: 16 }), 0.5, '0')
    await flush()
    expect(ops[0]![0]!.strength).toBe(8)
  })

  it('والألفا 255 في العملية رغم أن العقدة تحمل شفافية 0.9', async () => {
    const { raster, ops } = build()
    raster.patchFor(redact({ mode: 'pixelate', strength: 8 }), 1, '0')
    await flush()
    expect(ops[0]![0]!.cover.a).toBe(255)
  })

  it('**ويُقرأ من المصدر بمستطيل العيّنة وحده** — لا اللقطة كاملة', async () => {
    const { raster, surface } = build()
    raster.patchFor(redact(), 1, '0')
    await flush()

    expect(surface.calls.drawImage).toHaveLength(1)
    const [bitmap, sx, sy, sw, sh] = surface.calls.drawImage[0]!
    expect(bitmap).toBe(SOURCE.bitmap)
    expect(sx).toBe(100 - 33)
    expect(sy).toBe(60 - 33)
    expect(sw).toBe(80 + 66)
    expect(sh).toBe(40 + 66)
  })

  it('**ويُعاد رسم ما تحت الحجب داخل الرقعة**', async () => {
    const paintUnderlay = vi.fn()
    const { raster, surface } = build({ paintUnderlay })
    raster.patchFor(redact(), 1, '0')
    await flush()
    expect(paintUnderlay).toHaveBeenCalledTimes(1)
    expect(surface.calls.drawImage).toHaveLength(1)
  })

  it('وتُخزَّن فتُعاد بلا إعادة بناء', async () => {
    const { raster, ops, onReady } = build()
    const node = redact()
    raster.patchFor(node, 1, '0')
    await flush()
    expect(onReady).toHaveBeenCalledTimes(1)

    expect(raster.patchFor(node, 1, '0')).not.toBeNull()
    await flush()
    expect(ops).toHaveLength(1)
  })

  it('**وتغيّر ما تحتها يُبطلها** — البصمة جزء من المفتاح', async () => {
    const { raster, ops } = build()
    const node = redact()
    raster.patchFor(node, 1, '1,2,')
    await flush()
    expect(raster.patchFor(node, 1, '1,3,')).toBeNull()
    await flush()
    expect(ops).toHaveLength(2)
  })

  it('والتغطية لا تُنشئ رقعة أصلًا', async () => {
    const { raster, ops, surface } = build()
    expect(raster.patchFor(redact({ mode: 'cover' }), 1, '0')).toBeNull()
    await flush()
    expect(ops).toHaveLength(0)
    expect(surface.calls.drawImage).toHaveLength(0)
  })

  it('**وبيئةٌ بلا سطح تبقى على التغطية ولا ترمي**', async () => {
    const diag: string[] = []
    const { raster, ops } = build({ surface: () => null, onDiag: (s) => diag.push(s) })
    expect(raster.patchFor(redact(), 1, '0')).toBeNull()
    await flush()
    expect(ops).toHaveLength(0)
    expect(diag).toContain('no-surface')
  })

  it('و`dispose` يحرّر كل ما بُني', async () => {
    const { raster, surface } = build()
    raster.patchFor(redact(), 1, '0')
    await flush()
    expect(raster.size).toBe(1)
    raster.dispose()
    expect(raster.size).toBe(0)
    expect(surface.calls.disposed).toBeGreaterThan(0)
  })
})
