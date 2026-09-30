import { describe, expect, it } from 'vitest'

import { applyExclusions, computeDiff, type RasterImage } from '@/modules/compare/diff'
import { parseExclusions, parseLiveRects } from '@/modules/compare/exclusion-parse'
import {
  drawnRectToReference,
  exclusionRects,
  newZone,
  referenceRectToViewport,
  resolveElementZone,
  suggestElementZones,
} from '@/modules/compare/exclusions'
import { identityOverlayTransform, type OverlayTransform } from '@/modules/compare/overlay'
import { deviceRect, viewportPoint, viewportRect } from '@/shared/geometry'

import type { ElementAnchor, ExclusionZone } from '@/shared/exclusion-schema'

const fingerprint = { tag: 'time', attrs: ['datetime'], textHash: '0badf00d', textLength: 5 }

const element = (selector: string, rect = deviceRect(10, 10, 40, 20)): ElementAnchor => ({
  kind: 'element',
  selector,
  hosts: [],
  fingerprint,
  rect,
})

const zone = (id: string, anchor: ExclusionZone['anchor']): ExclusionZone =>
  newZone(anchor, id, 1_780_000_000_000)

describe('drawnRectToReference — مستطيلٌ على الشاشة إلى بكسل المرجع', () => {
  it('بالتحويل المحايد: نفس الأرقام، أيًّا كان ركن البداية', () => {
    const r = drawnRectToReference(
      viewportPoint(50, 40),
      viewportPoint(10, 20),
      identityOverlayTransform,
    )
    expect(r).toEqual(deviceRect(10, 20, 40, 20))
  })

  it('مرجعٌ مصغَّر إلى النصف ومزاح (طابق العرض على DPR 2): الشاشة ×2 بعد طرح الإزاحة', () => {
    const t: OverlayTransform = { scale: 0.5, tx: 100, ty: 30, rotation: 0 }
    const r = drawnRectToReference(viewportPoint(110, 40), viewportPoint(160, 70), t)
    expect(r).toEqual(deviceRect(20, 20, 100, 60))
  })

  it('الكسور تُوسَّع إلى البكسلات التي يمسّها السحب — لا تُقصّ حافّة ما يُراد استثناؤه', () => {
    const t: OverlayTransform = { scale: 3, tx: 0, ty: 0, rotation: 0 }
    const r = drawnRectToReference(viewportPoint(1, 1), viewportPoint(7, 8), t)
    // 1/3 → 0 و7/3 → 3 و8/3 → 3
    expect(r).toEqual(deviceRect(0, 0, 3, 3))
  })

  it('وذهابٌ وإياب عبر `referenceRectToViewport` يعيد المستطيل المرسوم', () => {
    const t: OverlayTransform = { scale: 0.5, tx: 12, ty: -8, rotation: 0 }
    const stored = drawnRectToReference(viewportPoint(12, -8), viewportPoint(62, 42), t)
    expect(referenceRectToViewport(stored, t)).toEqual(viewportRect(12, -8, 50, 50))
  })

  it('ودورانٌ ربع دورة يُعطي الصندوق المحيط بالزوايا الأربع لا بزاويتين', () => {
    const t: OverlayTransform = { scale: 1, tx: 0, ty: 0, rotation: 90 }
    const back = referenceRectToViewport(deviceRect(0, 0, 40, 10), t)
    expect(back.width).toBeCloseTo(10)
    expect(back.height).toBeCloseTo(40)
  })
})

describe('resolveElementZone — مستطيل منطقة العنصر ساعة القياس', () => {
  const anchor = element('#clock', deviceRect(5, 5, 50, 20))
  const live = deviceRect(300, 12, 60, 24)

  it('`found` و`changed` كلاهما يأخذ المستطيل الحيّ — المحتوى المتجدّد يغيّر بصمته بطبعه', () => {
    expect(resolveElementZone(anchor, 'found', live)).toEqual({ rect: live, fallback: false })
    expect(resolveElementZone(anchor, 'changed', live)).toEqual({ rect: live, fallback: false })
  })

  it.each(['not-found', 'multiple', 'unreachable'] as const)(
    '`%s` يسقط إلى المستطيل المحفوظ ويُعلَم',
    (verdict) => {
      expect(resolveElementZone(anchor, verdict, live)).toEqual({
        rect: anchor.rect,
        fallback: true,
      })
    },
  )

  it('و`found` بلا مستطيل حيّ (عنصرٌ بلا تخطيط) يسقط كذلك لا يرمي', () => {
    expect(resolveElementZone(anchor, 'found', null)).toEqual({ rect: anchor.rect, fallback: true })
  })
})

describe('exclusionRects — القناع من السجلّ المخزَّن', () => {
  const zones = [
    zone('r1', { kind: 'rect', rect: deviceRect(0, 0, 10, 10) }),
    zone('e1', element('#clock', deviceRect(5, 5, 50, 20))),
    zone('e2', element('.ad', deviceRect(100, 100, 30, 30))),
  ]

  it('منطقة العنصر تأخذ مستطيلها الحيّ، والغائب منها يسقط إلى المحفوظ', () => {
    expect(exclusionRects(zones, { e1: deviceRect(300, 12, 60, 24) })).toEqual([
      deviceRect(0, 0, 10, 10),
      deviceRect(300, 12, 60, 24),
      deviceRect(100, 100, 30, 30),
    ])
  })

  it('والصفحة لا تنقل منطقة مستطيل ولا تضيف منطقةً لم تُحفظ', () => {
    const rects = exclusionRects(zones, {
      r1: deviceRect(500, 500, 10, 10),
      ghost: deviceRect(0, 0, 9999, 9999),
    })
    expect(rects).toEqual(zones.map((z) => z.anchor.rect))
  })

  it('ولا يُقرأ من سلسلة النموذج الأولي — `hasOwn` لا `in`', () => {
    const polluted = Object.create({ e1: deviceRect(0, 0, 1, 1) }) as Record<string, never>
    expect(exclusionRects(zones, polluted)[1]).toEqual(deviceRect(5, 5, 50, 20))
  })
})

describe('suggestElementZones — مناطق العنصر من المقاسات الأخرى للصفحة نفسها', () => {
  it('تُقترح مناطق العنصر الغائبة هنا وحدها، بلا تكرار بين المقاسات، ولا تُقترح المستطيلات', () => {
    const current = [zone('here', element('#clock'))]
    const phone = [
      zone('p1', element('#clock', deviceRect(0, 0, 5, 5))), // موجودة هنا بمحدِّدها
      zone('p2', element('.ad')),
      zone('p3', { kind: 'rect', rect: deviceRect(0, 0, 10, 10) }),
    ]
    const tablet = [zone('t1', element('.ad')), zone('t2', element('.ticker'))]

    const suggested = suggestElementZones(current, [phone, tablet])
    expect(suggested.map((z) => z.id)).toEqual(['p2', 't2'])
  })

  it('والمطابقة بالمحدِّد وسلسلة المضيفين لا ببصمة النصّ — العنصر المتجدّد نفسه في وقتين', () => {
    const current = [zone('here', element('#clock'))]
    const later: ExclusionZone = zone('p1', {
      ...element('#clock'),
      fingerprint: { ...fingerprint, textHash: 'deadbeef' },
    })
    const inShadow: ExclusionZone = zone('p2', { ...element('#clock'), hosts: ['app-shell'] })
    expect(suggestElementZones(current, [[later, inShadow]]).map((z) => z.id)).toEqual(['p2'])
  })
})

describe('parseExclusions — حدّ الثقة للقائمة الواردة من الصفحة', () => {
  const valid = [
    zone('r1', { kind: 'rect', rect: deviceRect(0, 0, 10, 10) }),
    zone('e1', element('#clock')),
  ]

  it('القائمة الصالحة تمرّ كما هي', () => {
    const parsed = parseExclusions(valid)
    expect(parsed.ok && parsed.value).toEqual(valid)
  })

  it('وما ليس في المخطّط يُسقَط لا يُخزَّن — نصّ العنصر لا يعبر ولو أُرسل', () => {
    const leaky = [{ ...valid[1], text: 'سعر خاص', anchor: { ...element('#clock'), html: '<b>' } }]
    const parsed = parseExclusions(leaky)
    expect(parsed.ok && parsed.value[0]).toEqual(valid[1])
  })

  it.each([
    [
      'مستطيلٌ بفضاءٍ آخر',
      [
        zone('x', {
          kind: 'rect',
          rect: { ...deviceRect(0, 0, 1, 1), space: 'viewport' } as never,
        }),
      ],
    ],
    ['رقمٌ غير منتهٍ', [zone('x', { kind: 'rect', rect: deviceRect(Number.NaN, 0, 1, 1) })]],
    ['نوعٌ مجهول', [{ ...valid[0], anchor: { kind: 'colour', rect: deviceRect(0, 0, 1, 1) } }]],
    [
      'بصمةٌ ليست ستّ عشرية',
      [zone('x', { ...element('#a'), fingerprint: { ...fingerprint, textHash: 'nothex!!' } })],
    ],
    ['معرِّفٌ مكرَّر', [valid[0], valid[0]]],
    ['اسمٌ فوق الحدّ', [{ ...valid[0], label: 'ا'.repeat(81) }]],
    ['قائمةٌ فوق الحدّ', Array.from({ length: 33 }, (_, i) => zone(`z${i}`, valid[0]!.anchor))],
    ['ليست قائمة', { r1: valid[0] }],
  ])('وتُرفض: %s', (_why, raw) => {
    const parsed = parseExclusions(raw)
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.error.code).toBe('invalid-data')
  })

  it('والمستطيلات الحيّة: معرِّفٌ ومستطيلٌ بفضاء الجهاز، والغياب قائمةٌ فارغة', () => {
    const live = { e1: deviceRect(1, 2, 3, 4) }
    const parsed = parseLiveRects(live)
    expect(parsed.ok && parsed.value).toEqual(live)
    const absent = parseLiveRects(undefined)
    expect(absent.ok && absent.value).toEqual({})
    expect(parseLiveRects({ e1: { x: 1, y: 2, width: 3, height: 4 } }).ok).toBe(false)
    const tooMany = Object.fromEntries(
      Array.from({ length: 33 }, (_, i) => [`z${i}`, deviceRect(0, 0, 1, 1)]),
    )
    expect(parseLiveRects(tooMany).ok).toBe(false)
  })
})

/**
 * معيار القبول: القناع على صورة 1440 × 900 بـDPR 2 يضيف ≤ 30ms إلى زمن الفرق المقيس (`STAGES/34`).
 *
 * يُقاس ما يضيفه القناع وحده — `applyExclusions` هي كل ما يزيد على `computeDiff` حين توجد مناطق، وبلا مناطق لا
 * تُنادى. وأسوأ حالة: منطقةٌ تغطّي الصورة كلّها ومنطقتان متراكبتان فوقها، وفرقٌ في كل سابع بكسل فيُصفَّر كل
 * مجال. الوسيط لا الأدنى: الأدنى يُخفي تمريرةً بطيئة، والوسيط لا يعلق بإحماءٍ أوّل.
 */
describe('كلفة القناع — معيار ≤ 30ms على 2880 × 1800', () => {
  const W = 2880
  const H = 1800
  const zones = [
    deviceRect(0, 0, W, H),
    deviceRect(100, 100, 800, 600),
    deviceRect(-50, 1500, 4000, 400),
  ]

  it('تمريرة القناع وحدها', () => {
    const runs: number[] = []
    for (let k = 0; k < 7; k++) {
      const out = new Uint8ClampedArray(W * H * 4)
      const mask = new Uint8Array(W * H)
      for (let i = 0; i < mask.length; i += 7) mask[i] = 1
      const started = performance.now()
      const { excluded } = applyExclusions(out, mask, W, H, zones)
      runs.push(performance.now() - started)
      expect(excluded).toBe(W * H)
    }
    const median = [...runs].sort((p, q) => p - q)[3] as number
    expect(median).toBeLessThanOrEqual(30)
  })

  it('وفي `computeDiff` نفسها: النتيجة على المساحة كلّها مستثناة صفرٌ بلا مقام', () => {
    const a: RasterImage = { data: new Uint8ClampedArray(W * H * 4).fill(120), width: W, height: H }
    const b: RasterImage = { data: Uint8ClampedArray.from(a.data), width: W, height: H }
    for (let i = 0; i < b.data.length; i += 997 * 4) b.data[i] = 250
    const result = computeDiff(a, b, { exclude: zones })
    expect(result.diffPixelCount).toBe(0)
    expect(result.comparedPixels).toBe(0)
    expect(result.excludedPixels).toBe(W * H)
  })
})
