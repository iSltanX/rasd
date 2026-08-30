import { describe, expect, it } from 'vitest'

import { bake, planExport, type BakeRequest } from '@/modules/editor/bake'
import { bytesEqual } from '@/modules/editor/pixel-ops'
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
import { deviceRect, devicePoint } from '@/shared/geometry'

import { createFakeSurface, image, sliceOf, type FakeImage } from '../../../helpers/fake-surface'

import type { RenderStyle } from '@/modules/editor/renderer'
import type { TextLayoutCache } from '@/modules/editor/text-layout'

/**
 * **الاختبار الأمني — تفاضلي لا فحصَ تباين.**
 *
 * صورتان تختلفان **داخل مستطيل الحجب وحده**؛ ومخرَجا الخبز يجب أن يكونا
 * متطابقين بايتًا بايت في الصورة **كاملة**.
 *
 * وهو أقوى من `regionVariance === 0` لأن فحص التباين **دائري**: يقرأ
 * المستطيل الذي رسمه هو، فيمرّ على غطاء وقع في مكان خاطئ — اقتصاصٌ غير
 * مطروح، أو مقياس غير مضروب، أو إزاحة شريحة. والتفاضلي **لا يعرف أين وقع
 * الغطاء ولا يحتاج أن يعرف**: أي فرق ناجٍ في أي موضع يُسقطه.
 *
 * **والشاهدان السالبان إلزاميّان.** النمط نفسه بـ`blur` وبـ`pixelate` يجب
 * أن **يفشل** — وإلّا كان الاختبار يقيس غير ما يدّعيه، ولَما بقي في الشيفرة
 * ما يقول إن الطمس ليس حجبًا.
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

/** نمطٌ معلوم الإنتروبيا. */
const patterned = (): FakeImage =>
  image(W, H, (x, y) => [(x * 7) % 256, (y * 11) % 256, (x * y) % 256, 255])

/** النمط نفسه، مختلفًا **داخل المستطيل وحده**. */
const patternedWithSecret = (r: { x: number; y: number; w: number; h: number }): FakeImage =>
  image(W, H, (x, y) => {
    const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
    if (!inside) return [(x * 7) % 256, (y * 11) % 256, (x * y) % 256, 255]
    // ضوضاء مبذورة — مختلفة تمامًا، وحتمية.
    const n = (x * 2654435761 + y * 40503) >>> 0
    return [n & 255, (n >> 8) & 255, (n >> 16) & 255, 255]
  })

const REDACT_RECT = { x: 16, y: 12, w: 24, h: 16 }

const redactNode = (mode: ObscureMode, strength = 0): RedactNode => ({
  kind: 'redact',
  id: asNodeId('r1'),
  locked: false,
  rotation: 0,
  stroke: { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 0.9 },
  rect: deviceRect(REDACT_RECT.x, REDACT_RECT.y, REDACT_RECT.w, REDACT_RECT.h),
  mode,
  strength,
  coverToken: 'status/danger/solid',
})

const sceneWith = (...nodes: readonly SceneNode[]): Scene => ({
  ...emptyScene({ captureId: 'c', width: W, height: H, dpr: 1 }),
  nodes,
})

/** يشغّل الخبز على صورة معلومة، ويُعيد بايتات السطح. */
async function bakeOn(
  src: FakeImage,
  scene: Scene,
  over: Partial<BakeRequest> = {},
): Promise<{
  bytes: Uint8ClampedArray
  surface: ReturnType<typeof createFakeSurface>
  report: unknown
}> {
  const decision = planExport(scene, over.scale ?? 1)
  const surface = createFakeSurface(decision.width, decision.height)

  const result = await bake({
    scene,
    scale: 1,
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
    ...over,
  })

  if (!result.ok) throw new Error(`الخبز فشل: ${result.error.message}`)
  return { bytes: surface.pixels, surface, report: result.value.report }
}

const asBuffer = (b: Uint8ClampedArray, w: number, h: number) => ({ data: b, width: w, height: h })

describe('**الاختبار التفاضلي — الصيغة الحاسمة**', () => {
  it('**التغطية: مخرَجان متطابقان بايتًا بايت رغم اختلاف المصدرين**', async () => {
    const scene = sceneWith(redactNode('cover'))
    const a = await bakeOn(patterned(), scene)
    const b = await bakeOn(patternedWithSecret(REDACT_RECT), scene)

    expect(bytesEqual(asBuffer(a.bytes, W, H), asBuffer(b.bytes, W, H))).toBe(true)
  })

  it('**والشاهد السالب: الضباب يفشل — كما يجب**', async () => {
    const scene = sceneWith(redactNode('blur', 6))
    const a = await bakeOn(patterned(), scene)
    const b = await bakeOn(patternedWithSecret(REDACT_RECT), scene)

    // لو مرّ هذا لكان الاختبار يقيس غير ما يدّعيه، ولَما بقي في الشيفرة
    // ما يقول إن الطمس ليس حجبًا.
    expect(bytesEqual(asBuffer(a.bytes, W, H), asBuffer(b.bytes, W, H))).toBe(false)
  })

  it('**والبكسلة تفشل كذلك**', async () => {
    const scene = sceneWith(redactNode('pixelate', 8))
    const a = await bakeOn(patterned(), scene)
    const b = await bakeOn(patternedWithSecret(REDACT_RECT), scene)
    expect(bytesEqual(asBuffer(a.bytes, W, H), asBuffer(b.bytes, W, H))).toBe(false)
  })

  it('وشاهدٌ سالب ثالث: بلا عقدة حجب أصلًا، الفرق ينجو', async () => {
    const scene = sceneWith()
    const a = await bakeOn(patterned(), scene)
    const b = await bakeOn(patternedWithSecret(REDACT_RECT), scene)
    expect(bytesEqual(asBuffer(a.bytes, W, H), asBuffer(b.bytes, W, H))).toBe(false)
  })

  it('**ويبقى متطابقًا بعد الاقتصاص** — الإزاحة تُطرح مرّةً واحدة', async () => {
    const crop = deviceRect(8, 4, 48, 40)
    const scene: Scene = {
      ...sceneWith(redactNode('cover')),
      meta: { ...emptyScene({ captureId: 'c', width: W, height: H, dpr: 1 }).meta, crop },
    }
    const a = await bakeOn(patterned(), scene)
    const b = await bakeOn(patternedWithSecret(REDACT_RECT), scene)

    expect(a.bytes.length).toBe(48 * 40 * 4)
    expect(bytesEqual(asBuffer(a.bytes, 48, 40), asBuffer(b.bytes, 48, 40))).toBe(true)
  })
})

describe('**ترتيب الطبقات — التسريب الذي لا يراه فحص المصدر**', () => {
  /** ملاحظةٌ تحمل سرًّا، بمستطيل داخل منطقة الحجب. */
  const secretNote = (): SceneNode => ({
    kind: 'rect',
    id: asNodeId('secret'),
    locked: false,
    rotation: 0,
    hidden: false,
    stroke: { colorToken: 'status/success/solid', widthPx: 1, dash: [], opacity: 1 },
    rect: deviceRect(REDACT_RECT.x + 2, REDACT_RECT.y + 2, 8, 6),
    radiusPx: 0,
    fill: 'solid',
  })

  it('**عقدةٌ تحت الحجب في الترتيب تُدمَّر معه**', async () => {
    // الترتيب: السرّ عند 0، والحجب عند 1 — أي فوقه.
    const scene = sceneWith(secretNote(), redactNode('cover'))
    const withSecret = await bakeOn(patterned(), scene)
    const withoutSecret = await bakeOn(patterned(), sceneWith(redactNode('cover')))

    /*
     * نصّ الملاحظة ليس بكسلًا من المصدر، فلا يمسكه أي فحص يقارن بالمصدر.
     * والتفاضلي يمسكه لأن العقدة تُرسم قبل التدمير في التشغيلين وتُدمَّر
     * في كليهما — فالمخرَجان يتطابقان رغم وجودها في أحدهما.
     */
    expect(bytesEqual(asBuffer(withSecret.bytes, W, H), asBuffer(withoutSecret.bytes, W, H))).toBe(
      true,
    )
  })

  it('**والشاهد السالب: ترتيبٌ معكوس يُظهر السرّ**', async () => {
    // الحجب عند 0، والسرّ فوقه عند 1.
    const scene = sceneWith(redactNode('cover'), secretNote())
    const withSecret = await bakeOn(patterned(), scene)
    const withoutSecret = await bakeOn(patterned(), sceneWith(redactNode('cover')))

    expect(bytesEqual(asBuffer(withSecret.bytes, W, H), asBuffer(withoutSecret.bytes, W, H))).toBe(
      false,
    )
  })

  it('والمخفيّ لا يُصدَّر', async () => {
    const hidden = { ...secretNote(), hidden: true } as SceneNode
    const a = await bakeOn(patterned(), sceneWith(hidden))
    const b = await bakeOn(patterned(), sceneWith())
    expect(bytesEqual(asBuffer(a.bytes, W, H), asBuffer(b.bytes, W, H))).toBe(true)
  })
})

describe('تقرير الخبز', () => {
  it('**البرهان يُقاس على البايتات المكتوبة** — لا يُشتقّ من النمط', async () => {
    const { report } = await bakeOn(patterned(), sceneWith(redactNode('cover')))
    const r = report as {
      obscured: { guaranteed: boolean; variance: number; rect: { w: number } }[]
    }
    expect(r.obscured).toHaveLength(1)
    expect(r.obscured[0]!.variance).toBe(0)
    expect(r.obscured[0]!.guaranteed).toBe(true)
    expect(r.obscured[0]!.rect.w).toBe(REDACT_RECT.w)
  })

  it('**والطمس لا يُعلَن مضمونًا مهما كان تباينه**', async () => {
    const { report } = await bakeOn(patterned(), sceneWith(redactNode('blur', 6)))
    const r = report as { obscured: { guaranteed: boolean }[] }
    expect(r.obscured[0]!.guaranteed).toBe(false)
  })

  it('وإعادة الترميز معلَنة باللوحة المثبَّتة', async () => {
    const { report } = await bakeOn(patterned(), sceneWith())
    const r = report as { reencoded: boolean; paletteMode: string }
    expect(r.reencoded).toBe(true)
    expect(r.paletteMode).toBe('dark')
  })

  it('**ومنطقةٌ خارج نافذة التصدير تُعلَن ولا تُعَدّ برهانًا**', async () => {
    const far = { ...redactNode('cover'), rect: deviceRect(500, 500, 10, 10) }
    const { report } = await bakeOn(patterned(), sceneWith(far))
    const r = report as { obscured: unknown[]; warnings: string[] }
    expect(r.obscured).toHaveLength(0)
    expect(r.warnings.join(' ')).toContain('خارج نافذة التصدير')
  })

  it('وعقدة القياس تُعلَن حدًّا ولا تُبتلَع', async () => {
    const measure: SceneNode = {
      kind: 'measure',
      id: asNodeId('m'),
      locked: false,
      rotation: 0,
      hidden: false,
      stroke: { colorToken: 'tool/measure/solid', widthPx: 1, dash: [], opacity: 1 },
      a: deviceRect(2, 2, 5, 5),
      b: null,
      show: 'size',
    }
    const { report } = await bakeOn(patterned(), sceneWith(measure))
    expect((report as { warnings: string[] }).warnings.join(' ')).toContain('القياس')
  })
})

describe('دورة الحياة', () => {
  it('**الإلغاء لا يُنتج بايتات قطّ**', async () => {
    const scene = sceneWith(redactNode('cover'))
    const decision = planExport(scene, 1)
    const surface = createFakeSurface(decision.width, decision.height)

    const result = await bake({
      scene,
      scale: 1,
      surface: { create: () => surface },
      style: STYLE,
      paletteMode: 'dark',
      layout: LAYOUT,
      signal: { aborted: true },
      sliceSource: (r) => Promise.resolve(sliceOf(patterned(), r.x, r.y, r.width, r.height)),
      runPixels: (b) => Promise.resolve(b),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('cancelled')
    expect(surface.encoded).toBe(0)
    // **والسطح يُحرَّر رغم الإلغاء** — وإلّا تسرّب قماشٌ بمئات الميغابايت
    // مع كل ضغطة على ⎋.
    expect(surface.disposed).toBe(1)
  })

  it('**والترميز يقع قبل التحرير** — لا العكس', async () => {
    const { surface } = await bakeOn(patterned(), sceneWith())
    expect(surface.encoded).toBe(1)
    expect(surface.disposed).toBe(1)
  })

  it('وسطحٌ ميّت يُرفَض بسبب معروض', async () => {
    const dead = { ...createFakeSurface(4, 4), alive: () => false }
    const result = await bake({
      scene: sceneWith(),
      scale: 1,
      surface: { create: () => dead },
      style: STYLE,
      paletteMode: 'dark',
      layout: LAYOUT,
      sliceSource: (r) => Promise.resolve(sliceOf(patterned(), r.x, r.y, r.width, r.height)),
      runPixels: (b) => Promise.resolve(b),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('تخصيص')
  })

  it('**وكل شريحة تُغلَق فور رسمها** — الذروة سطحٌ وشريحة لا سطحٌ وكلّها', async () => {
    let open = 0
    let peak = 0
    await bakeOn(patterned(), sceneWith(), {
      sliceSource: (r) => {
        const s = sliceOf(patterned(), r.x, r.y, r.width, r.height)
        open++
        peak = Math.max(peak, open)
        return Promise.resolve({
          ...s,
          close: () => {
            open--
          },
        })
      },
    })
    expect(peak).toBe(1)
    expect(open).toBe(0)
  })
})

describe('حدود التصدير', () => {
  const bigScene = (w: number, h: number): Scene =>
    emptyScene({ captureId: 'c', width: w, height: h, dpr: 1 })

  it('**الحالة القصوى عند 2× تُرفَض بسببٍ معروض**', () => {
    const plan = planExport(bigScene(2560, 28_672), 2)
    expect(plan.ok).toBe(false)
    expect(plan.bound).toBe('area')
    expect(plan.reason).toContain('‎1×‎')
  })

  it('وعند 1× تمرّ', () => {
    expect(planExport(bigScene(2560, 28_672), 1).ok).toBe(true)
  })

  it('**والاقتصاص نافذة تصدير** — لقطةٌ ضخمة اقتُصّ منها ألفٌ في ألف تمرّ عند 2×', () => {
    const scene = bigScene(2560, 28_672)
    const cropped: Scene = { ...scene, meta: { ...scene.meta, crop: deviceRect(0, 0, 1000, 1000) } }
    const plan = planExport(cropped, 2)
    expect(plan.ok).toBe(true)
    expect(plan.width).toBe(2000)
  })

  it('واقتصاصٌ مسحوب إلى الأعلى واليسار يُسوّى ولا يُرفَض', () => {
    const scene = bigScene(2560, 28_672)
    const flipped: Scene = {
      ...scene,
      meta: { ...scene.meta, crop: deviceRect(1000, 1000, -400, -400) },
    }
    const plan = planExport(flipped, 2)
    expect(plan.ok).toBe(true)
    expect(plan.width).toBe(800)
  })

  it('ورفضٌ بلا سبب معروض ليس رفضًا', () => {
    expect(planExport(bigScene(2560, 28_672), 2).reason.length).toBeGreaterThan(10)
    expect(planExport(bigScene(100, 100), 1).reason).toBe('')
  })
})

/** يُستعمل في اختبار الترتيب — نقطة صريحة كي لا يُحذَف الاستيراد. */
export const originPoint = devicePoint(0, 0)
