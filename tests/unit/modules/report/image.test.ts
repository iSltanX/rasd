import { describe, expect, it } from 'vitest'

import { planExport } from '@/modules/editor/bake'
import {
  bakeReportImage,
  fitWithin,
  reportScene,
  scaleRect,
  type ReportImageEdit,
} from '@/modules/report/image'
import { deviceRect } from '@/shared/geometry'

import { createFakeSurface, image, sliceOf, type FakeImage } from '../../../helpers/fake-surface'

/**
 * صورة البلاغ — `STAGES/13`: «اختبار بايتات: المنطقة المحجوبة في الصورة المستلَمة لا تُسترجَع — ويحمرّ عند تعطيل
 * الخَبز».
 *
 * **تفاضليٌّ كاختبار المحرّر** (ADR 0015 §8): صورتان تختلفان **داخل منطقة الحجب وحدها** ⇒ البايتات المُرسَلة
 * متطابقةٌ في الصورة كاملة — فلا شيء ممّا تحت الحجب يصل. والشاهد السالب: الصورتان نفسهما بلا حجب تختلفان، فالتطابق
 * أثر الخبز لا مصادفة. وعُطّل الخبز (المشهد بلا عُقد) فسقط الوصف الأوّل — سجلّ `STAGES/13`.
 */

const W = 60
const H = 40
const SECRET = { x: 10, y: 8, w: 20, h: 12 }

const plain = (x: number, y: number) => [(x * 7) % 256, (y * 13) % 256, (x + y) % 256, 255] as const

const base = (): FakeImage => image(W, H, plain)

/** الصورة نفسها، وفي المنطقة السرّية ضوضاءٌ حتمية مختلفة تمامًا — «كلمة مرور» ظهرت في اللقطة. */
const withSecret = (): FakeImage =>
  image(W, H, (x, y) => {
    const inside =
      x >= SECRET.x && x < SECRET.x + SECRET.w && y >= SECRET.y && y < SECRET.y + SECRET.h
    if (!inside) return plain(x, y)
    const n = (x * 2654435761 + y * 40503) >>> 0
    return [n & 255, (n >> 8) & 255, (n >> 16) & 255, 255]
  })

async function sent(src: FakeImage, edit: ReportImageEdit): Promise<number[]> {
  const plan = planExport(reportScene(edit), 1)
  const surface = createFakeSurface(plan.width, plan.height)
  const result = await bakeReportImage({
    edit,
    surface: { create: () => surface },
    sliceSource: (r) => Promise.resolve(sliceOf(src, r.x, r.y, r.width, r.height)),
  })
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value.blob.type).toBe('image/png')
  return [...new Uint8Array(await result.value.blob.arrayBuffer())]
}

const redacted: ReportImageEdit = {
  width: W,
  height: H,
  crop: null,
  redactions: [deviceRect(SECRET.x, SECRET.y, SECRET.w, SECRET.h)],
}

describe('الحجب في البايتات المُرسَلة', () => {
  it('صورتان تختلفان تحت الحجب وحده ⇒ ما يُرسَل متطابقٌ بايتًا ببايت', async () => {
    const a = await sent(base(), redacted)
    const b = await sent(withSecret(), redacted)
    expect(a.length).toBe(W * H * 4)
    expect(b).toEqual(a)
  })

  it('والمنطقة المحجوبة مصمتةٌ معتمة — لا أثر فيها للأصل', async () => {
    const bytes = await sent(withSecret(), redacted)
    for (let y = SECRET.y; y < SECRET.y + SECRET.h; y++) {
      for (let x = SECRET.x; x < SECRET.x + SECRET.w; x++) {
        const i = (y * W + x) * 4
        expect(bytes.slice(i, i + 4), `${x},${y}`).toEqual([0, 0, 0, 255])
      }
    }
  })

  it('ومع القصّ: النافذة وحدها تخرج، والحجب داخلها ما زال مدمَّرًا', async () => {
    const edit: ReportImageEdit = { ...redacted, crop: deviceRect(5, 4, 40, 24) }
    const a = await sent(base(), edit)
    const b = await sent(withSecret(), edit)
    expect(a.length).toBe(40 * 24 * 4)
    expect(b).toEqual(a)
  })

  it('الشاهد السالب: بلا حجب تختلف الصورتان — التطابق أعلاه أثر الخبز', async () => {
    const open: ReportImageEdit = { ...redacted, redactions: [] }
    const a = await sent(base(), open)
    const b = await sent(withSecret(), open)
    expect(b).not.toEqual(a)
  })
})

describe('التصغير', () => {
  it('أطول ضلعٍ يُقصّ إلى السقف بنسبته، ولا تكبير', () => {
    expect(fitWithin(5120, 2880, 2560)).toEqual({ width: 2560, height: 1440, scale: 0.5 })
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600, scale: 1 })
  })

  it('والحجب يُضرب في المقياس مقرَّبًا إلى الخارج — لا يضيق بالتقريب', () => {
    const r = scaleRect(deviceRect(11, 11, 11, 11), 0.5)
    expect(r.x).toBe(5)
    expect(r.y).toBe(5)
    expect(r.x + r.width).toBeGreaterThanOrEqual(11)
    expect(r.y + r.height).toBeGreaterThanOrEqual(11)
  })

  it('المشهد: عقدة تغطيةٍ لكل منطقة، بلا بكسلة ولا ضبابي', () => {
    const scene = reportScene({
      ...redacted,
      redactions: [deviceRect(0, 0, 1, 1), deviceRect(2, 2, 1, 1)],
    })
    expect(scene.nodes.map((n) => (n.kind === 'redact' ? n.mode : n.kind))).toEqual([
      'cover',
      'cover',
    ])
  })
})
