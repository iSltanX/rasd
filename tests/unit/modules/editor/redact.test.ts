import { describe, expect, it } from 'vitest'

import { blurRadius, type PixelBuffer } from '@/modules/editor/pixel-ops'
import {
  applyOp,
  applyOps,
  clampStrength,
  defaultStrength,
  IDENTITY_TRANSFORM,
  opForNode,
  redactOps,
  sampleRect,
  summariseRedaction,
  type RedactTransform,
} from '@/modules/editor/redact'
import {
  asNodeId,
  isIrreversible,
  OBSCURE_LABEL,
  type AnnotationColor,
  type ObscureMode,
  type RedactNode,
  type Scene,
} from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { deviceRect } from '@/shared/geometry'

const PALETTE = {
  'tool/annotate/solid': '#f9a03f',
  'tool/capture/solid': '#3b82f6',
  'tool/inspect/solid': '#22c55e',
  'tool/measure/solid': '#a855f7',
  'tool/compare/solid': '#eab308',
  'status/danger/solid': '#dc2626',
  'status/success/solid': '#16a34a',
} as const satisfies Readonly<Record<AnnotationColor, string>>

const redact = (over: Partial<RedactNode> = {}): RedactNode => ({
  kind: 'redact',
  id: asNodeId('r1'),
  locked: false,
  rotation: 0,
  stroke: { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 0.9 },
  rect: deviceRect(100, 60, 40, 20),
  mode: 'cover',
  strength: 0,
  coverToken: 'status/danger/solid',
  ...over,
})

const sceneWith = (...nodes: Scene['nodes']): Scene => ({
  ...emptyScene({ captureId: 'c', width: 400, height: 300, dpr: 1 }),
  nodes,
})

const buffer = (width: number, height: number): PixelBuffer => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
})

describe('**التحويل من فضاء المشهد إلى فضاء المخزن**', () => {
  it('بلا اقتصاص ولا مقياس يمرّ كما هو', () => {
    const op = opForNode(redact(), IDENTITY_TRANSFORM, PALETTE)
    expect(op.rect).toEqual({ x: 100, y: 60, w: 40, h: 20 })
  })

  it('**والاقتصاص يُطرَح** — بدونه يقع الغطاء بعيدًا عمّا رآه المستخدم', () => {
    const t: RedactTransform = { crop: deviceRect(80, 40, 200, 150), scale: 1 }
    const op = opForNode(redact(), t, PALETTE)
    expect(op.rect).toEqual({ x: 20, y: 20, w: 40, h: 20 })
  })

  it('**والمقياس يُضرب في الموضع والمقاس معًا**', () => {
    const op = opForNode(redact(), { crop: null, scale: 2 }, PALETTE)
    expect(op.rect).toEqual({ x: 200, y: 120, w: 80, h: 40 })
  })

  it('والاثنان معًا بالترتيب الصحيح: اطرح ثمّ اضرب', () => {
    const t: RedactTransform = { crop: deviceRect(80, 40, 200, 150), scale: 2 }
    const op = opForNode(redact(), t, PALETTE)
    // (100−80)×2 = 40، لا 100×2−80 = 120.
    expect(op.rect).toEqual({ x: 40, y: 40, w: 80, h: 40 })
  })

  it('**والشدّة تُضرب بالمقياس** — σ ثابتٌ يعطي نصف الضباب على تصدير 2×', () => {
    const node = redact({ mode: 'blur', strength: 12 })
    expect(opForNode(node, IDENTITY_TRANSFORM, PALETTE).strength).toBe(12)
    expect(opForNode(node, { crop: null, scale: 2 }, PALETTE).strength).toBe(24)
  })

  it('ولون التغطية يُحلّ من التوكن إلى قنوات معتمة', () => {
    const op = opForNode(redact({ coverToken: 'status/danger/solid' }), IDENTITY_TRANSFORM, PALETTE)
    expect(op.cover).toEqual({ r: 0xdc, g: 0x26, b: 0x26, a: 255 })
  })

  it('**والألفا 255 في العملية مهما كان `stroke.opacity`** — العقدة تحمل 0.9', () => {
    const op = opForNode(redact(), IDENTITY_TRANSFORM, PALETTE)
    expect(op.cover.a).toBe(255)
  })

  it('**والمستطيل السالب يُسوّى** — وإلّا رُسمت تغطية ولم يُدمَّر شيء', () => {
    // سحبةٌ من اليمين إلى اليسار: عرضٌ سالب. `drawRedact` تُسوّي فتُرسم
    // التغطية على الشاشة؛ ولو لم تُسوَّ هنا لأعادت `clampToBuffer` عدمًا.
    const flipped = redact({ rect: deviceRect(140, 80, -40, -20) })
    const op = opForNode(flipped, IDENTITY_TRANSFORM, PALETTE)
    expect(op.rect).toEqual({ x: 100, y: 60, w: 40, h: 20 })
    expect(sampleRect(op, 400, 300)).not.toBeNull()
  })

  it('واقتصاصٌ سالب يُسوّى كذلك', () => {
    const t: RedactTransform = { crop: deviceRect(280, 190, -200, -150), scale: 1 }
    expect(opForNode(redact(), t, PALETTE).rect).toEqual({ x: 20, y: 20, w: 40, h: 20 })
  })

  it('والترتيب محفوظ — ترتيب الرسم هو ترتيب التنفيذ', () => {
    const scene = sceneWith(
      redact({ id: asNodeId('a') }),
      redact({ id: asNodeId('b'), rect: deviceRect(0, 0, 10, 10) }),
    )
    const ops = redactOps(scene, IDENTITY_TRANSFORM, PALETTE)
    expect(ops).toHaveLength(2)
    expect(ops[1]!.rect.x).toBe(0)
  })
})

describe('مستطيل أخذ العيّنة', () => {
  it('التغطية لا تحتاج هامشًا — لا تقرأ شيئًا', () => {
    const op = opForNode(redact(), IDENTITY_TRANSFORM, PALETTE)
    expect(sampleRect(op, 400, 300)).toEqual({ x: 100, y: 60, w: 40, h: 20 })
  })

  it('والبكسلة كذلك — لا انتشار خارج الخليّة', () => {
    const op = opForNode(redact({ mode: 'pixelate', strength: 16 }), IDENTITY_TRANSFORM, PALETTE)
    expect(sampleRect(op, 400, 300)).toEqual({ x: 100, y: 60, w: 40, h: 20 })
  })

  it('**والضباب يوسّع بنصف قطر النواة كاملًا** لا بـ`ceil(2σ)`', () => {
    const op = opForNode(redact({ mode: 'blur', strength: 4 }), IDENTITY_TRANSFORM, PALETTE)
    const m = blurRadius(4)
    expect(m).toBe(11)
    expect(sampleRect(op, 400, 300)).toEqual({
      x: 100 - m,
      y: 60 - m,
      w: 40 + 2 * m,
      h: 20 + 2 * m,
    })
  })

  it('ويُقصّ على حدود الصورة', () => {
    const op = opForNode(
      redact({ mode: 'blur', strength: 8, rect: deviceRect(2, 2, 10, 10) }),
      IDENTITY_TRANSFORM,
      PALETTE,
    )
    const s = sampleRect(op, 400, 300)
    expect(s?.x).toBe(0)
    expect(s?.y).toBe(0)
  })

  it('و`null` حين تخرج المنطقة كلّها', () => {
    const op = opForNode(
      redact({ rect: deviceRect(900, 900, 10, 10) }),
      IDENTITY_TRANSFORM,
      PALETTE,
    )
    expect(sampleRect(op, 400, 300)).toBeNull()
  })
})

describe('**التنفيذ — دالّة واحدة للـworker وللخيط الرئيسي**', () => {
  const filled = (): PixelBuffer => {
    const b = buffer(20, 20)
    for (let i = 0; i < b.data.length; i += 4) {
      b.data[i] = (i * 7) % 256
      b.data[i + 1] = (i * 13) % 256
      b.data[i + 2] = (i * 29) % 256
      b.data[i + 3] = 255
    }
    return b
  }

  it('التغطية تكتب اللون', () => {
    const b = filled()
    applyOp(b, {
      rect: { x: 5, y: 5, w: 4, h: 4 },
      mode: 'cover',
      strength: 0,
      cover: { r: 1, g: 2, b: 3, a: 255 },
    })
    const i = (6 * 20 + 6) * 4
    expect([b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]]).toEqual([1, 2, 3, 255])
  })

  it('والبكسلة تسوّي الخليّة، والضباب ينعّم', () => {
    const p = filled()
    const g = filled()
    applyOp(p, {
      rect: { x: 4, y: 4, w: 8, h: 8 },
      mode: 'pixelate',
      strength: 4,
      cover: { r: 0, g: 0, b: 0, a: 255 },
    })
    applyOp(g, {
      rect: { x: 4, y: 4, w: 8, h: 8 },
      mode: 'blur',
      strength: 3,
      cover: { r: 0, g: 0, b: 0, a: 255 },
    })
    const at = (b: PixelBuffer, x: number, y: number) => b.data[(y * 20 + x) * 4]!
    expect(at(p, 4, 4)).toBe(at(p, 7, 7))
    expect(at(g, 4, 4)).not.toBe(at(g, 7, 7))
  })

  it('والعمليات المتتابعة تُطبَّق بالترتيب — الأخيرة تغلب', () => {
    const b = filled()
    applyOps(b, [
      {
        rect: { x: 0, y: 0, w: 20, h: 20 },
        mode: 'cover',
        strength: 0,
        cover: { r: 9, g: 9, b: 9, a: 255 },
      },
      {
        rect: { x: 0, y: 0, w: 20, h: 20 },
        mode: 'cover',
        strength: 0,
        cover: { r: 7, g: 7, b: 7, a: 255 },
      },
    ])
    expect(b.data[0]).toBe(7)
  })
})

describe('الملخّص والحدود', () => {
  it('**يعدّ التغطية وحدها في `irreversible`**', () => {
    const modes: readonly ObscureMode[] = ['cover', 'blur', 'pixelate', 'cover']
    const scene = sceneWith(...modes.map((mode, i) => redact({ id: asNodeId(`r${i}`), mode })))
    expect(summariseRedaction(scene)).toEqual({ total: 4, irreversible: 2 })
    expect(isIrreversible('cover')).toBe(true)
    expect(isIrreversible('blur')).toBe(false)
    expect(isIrreversible('pixelate')).toBe(false)
  })

  it('ومشهدٌ بلا حجب يعطي صفرين', () => {
    expect(summariseRedaction(sceneWith())).toEqual({ total: 0, irreversible: 0 })
  })

  it('**والشدّة تُحصَر فوق العتبة الفعّالة** — لا مدًى لا يفعل شيئًا', () => {
    expect(clampStrength('blur', 0)).toBe(1)
    expect(clampStrength('blur', 999)).toBe(40)
    expect(clampStrength('pixelate', 0)).toBe(2)
    expect(clampStrength('pixelate', 7.6)).toBe(8)
    expect(clampStrength('cover', 30)).toBe(0)
  })

  it('والتبديل بين نمطين لا ينقل رقمًا بين وحدتين مختلفتين', () => {
    // 12 هنا σ وهناك ضلع خليّة — رقمان بالاسم نفسه ومعنيان مختلفان.
    expect(defaultStrength('blur')).toBe(12)
    expect(defaultStrength('pixelate')).toBe(12)
    expect(defaultStrength('cover')).toBe(0)
  })

  it('والتسمية تُفرّق: «حجب» للتغطية و«طمس» لغيرها', () => {
    expect(OBSCURE_LABEL.cover).toContain('حجب')
    expect(OBSCURE_LABEL.blur).toContain('طمس')
    expect(OBSCURE_LABEL.pixelate).toContain('طمس')
  })
})
