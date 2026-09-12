import { describe, expect, it } from 'vitest'

import { bake, planExport } from '@/modules/editor/bake'
import { applyOps } from '@/modules/editor/redact'
import {
  asNodeId,
  type AnnotationColor,
  type ObscureMode,
  type RedactNode,
  type Scene,
  type SceneNode,
} from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { EXPORT_FORMATS, mimeFor, type ExportFormat } from '@/modules/export/format'
import { deviceRect } from '@/shared/geometry'

import { createFakeSurface, image, sliceOf, type FakeImage } from '../../../helpers/fake-surface'

import type { RenderStyle } from '@/modules/editor/renderer'
import type { TextLayoutCache } from '@/modules/editor/text-layout'

/**
 * **الصيغة معاملٌ يعبر البوّابة — والضمانة تعبر معه.**
 *
 * ADR 0015 §8 يفرض اختبارًا تفاضليًّا: صورتان تختلفان **داخل منطقة الحجب
 * وحدها** ⇒ مخرَجان متطابقان بايتًا بايت، وشاهدٌ سالب بـ«طمس» يجب أن يفشل.
 * وADR 0021 يوسّعه: **يُشغَّل لكل قيمة في `ExportFormat`**، فصيغةٌ ثالثة
 * تُضاف لاحقًا لا تدخل بلا برهانها.
 *
 * ويُضاف هنا ما كشفه القياس ولم يكن في ADR 0015: مُرمِّج المتصفّح **لا يرمي**
 * على نوع غير مدعوم بل يتدهور صامتًا إلى PNG ويكذب في `blob.type`. فالبوّابة
 * تقارن المُنتَج بالمطلوب، وهذا الملفّ يُثبت أنها تمسكه.
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

const LAYOUT = {
  get: () => ({ lines: [], width: 0, height: 0, direction: 'rtl' as const, overflow: false }),
  metrics: () => ({ ascent: 10, descent: 3, lineHeight: 16 }),
  invalidate: () => undefined,
  size: 0,
} as unknown as TextLayoutCache

const W = 64
const H = 48
const RECT = { x: 16, y: 12, w: 24, h: 16 }

const patterned = (): FakeImage =>
  image(W, H, (x, y) => [(x * 7) % 256, (y * 11) % 256, (x * y) % 256, 255])

/** النمط نفسه، مختلفًا **داخل المستطيل وحده**. */
const withSecret = (): FakeImage =>
  image(W, H, (x, y) => {
    const inside = x >= RECT.x && x < RECT.x + RECT.w && y >= RECT.y && y < RECT.y + RECT.h
    if (!inside) return [(x * 7) % 256, (y * 11) % 256, (x * y) % 256, 255]
    const n = (x * 2654435761 + y * 40503) >>> 0
    return [n & 255, (n >> 8) & 255, (n >> 16) & 255, 255]
  })

const redactNode = (mode: ObscureMode, strength = 0): RedactNode => ({
  kind: 'redact',
  id: asNodeId('r1'),
  locked: false,
  rotation: 0,
  stroke: { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 0.9 },
  rect: deviceRect(RECT.x, RECT.y, RECT.w, RECT.h),
  mode,
  strength,
  coverToken: 'status/danger/solid',
})

const sceneWith = (...nodes: readonly SceneNode[]): Scene => ({
  ...emptyScene({ captureId: 'c', width: W, height: H, dpr: 1 }),
  nodes,
})

async function bakeOn(
  src: FakeImage,
  scene: Scene,
  format: ExportFormat,
  options: { readonly downgradeTo?: string; readonly quality?: number | null } = {},
): Promise<{ ok: boolean; bytes: Uint8ClampedArray; type: string; message: string }> {
  const decision = planExport(scene, 1)
  const surface = createFakeSurface(
    decision.width,
    decision.height,
    options.downgradeTo === undefined ? {} : { downgradeTo: options.downgradeTo },
  )

  const result = await bake({
    scene,
    scale: 1,
    format,
    ...(options.quality === undefined ? {} : { quality: options.quality }),
    surface: { create: () => surface },
    style: STYLE,
    paletteMode: 'dark',
    layout: LAYOUT,
    sliceSource: (r) => Promise.resolve(sliceOf(src, r.x, r.y, r.width, r.height)),
    runPixels: (buffer, width, height, ops) => {
      const data = new Uint8ClampedArray(buffer)
      applyOps({ data, width, height }, ops)
      return Promise.resolve(data.buffer)
    },
  })

  return {
    ok: result.ok,
    bytes: surface.pixels,
    type: result.ok ? result.value.report.format : '',
    message: result.ok ? '' : result.error.message,
  }
}

describe('البوّابة تقبل صيغةً وتبقى واحدة', () => {
  it('النوع المُمرَّر يصل إلى المُرمِّج، والتقرير يحمل المُنتَج', async () => {
    for (const format of EXPORT_FORMATS) {
      const out = await bakeOn(patterned(), sceneWith(), format)
      expect(out.ok).toBe(true)
      expect(out.type).toBe(format)
    }
  })

  /**
   * **الشاهد على العطل الذي كشفه القياس ولا يكشفه أي فحص نجاح.**
   *
   * كروم لا يرمي على نوع غير مدعوم — يُنتج PNG ويُعلن `image/png`. فبلا هذه
   * المقارنة يخرج ملفّ PNG باسم `.webp` ويُسجَّل في التقرير «WebP».
   */
  it('**والتدهور الصامت يُرَدّ عطلًا لا يُقبَل نجاحًا**', async () => {
    const out = await bakeOn(patterned(), sceneWith(), 'webp', {
      downgradeTo: mimeFor('png'),
    })
    expect(out.ok).toBe(false)
    expect(out.message).toContain('لا يدعم هذه الصيغة')
  })

  it('ونوعٌ خارج صيغنا بالكامل يُرَدّ كذلك', async () => {
    const out = await bakeOn(patterned(), sceneWith(), 'png', { downgradeTo: 'image/jpeg' })
    expect(out.ok).toBe(false)
  })
})

/**
 * **الاختبار التفاضلي لكل صيغة — لا للصيغة الأولى وحدها.**
 *
 * وهو معمَّم بحلقة على `EXPORT_FORMATS` قصدًا: صيغةٌ ثالثة تُضاف إلى المصفوفة
 * تدخل هذه الحلقة تلقائيًّا، فلا تُشحَن بلا برهانها.
 */
describe('عدم القابلية للعكس تسري على الصيغتين', () => {
  for (const format of EXPORT_FORMATS) {
    it(`تغطيةٌ بـ${format}: صورتان تختلفان داخل المستطيل ⇒ مخرَجان متطابقان`, async () => {
      const a = await bakeOn(patterned(), sceneWith(redactNode('cover')), format)
      const b = await bakeOn(withSecret(), sceneWith(redactNode('cover')), format)
      expect(a.ok && b.ok).toBe(true)
      expect(a.bytes).toEqual(b.bytes)
    })

    it(`**والشاهد السالب: «طمس» بـ${format} يجب أن يختلف**`, async () => {
      const a = await bakeOn(patterned(), sceneWith(redactNode('pixelate', 8)), format)
      const b = await bakeOn(withSecret(), sceneWith(redactNode('pixelate', 8)), format)
      expect(a.ok && b.ok).toBe(true)
      expect(a.bytes).not.toEqual(b.bytes)
    })
  }
})
