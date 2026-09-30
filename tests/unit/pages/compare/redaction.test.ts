import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { asNodeId, type RedactNode, type Scene } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { loadScene, maskDiff, redactionRects, redactionScene } from '@/pages/compare/redaction'
import { deviceRect } from '@/shared/geometry'
import { annotations, clearAllStores } from '@/shared/storage/repository'

/**
 * ما حُجب في المحرّر لا يخرج في التقرير ولا في «التقط الفرق» (ADR 0015 §6) — أمسكه المراجع المستقلّ. والمسار
 * في كروم يحرسه `verify:export` (منطقةٌ محجوبة مسطّحةٌ بلونٍ واحد في صورة الفرق)؛ وهنا ما يُختبر بلا متصفّح.
 */

const stroke = { colorToken: 'status/danger/solid', widthPx: 2, dash: [], opacity: 1 } as const

const redact = (id: string, x: number, y: number, w: number, h: number): RedactNode => ({
  kind: 'redact',
  id: asNodeId(id),
  locked: false,
  rotation: 0,
  stroke,
  rect: deviceRect(x, y, w, h),
  mode: 'cover',
  strength: 0,
  coverToken: 'status/danger/solid',
})

const withNodes = (nodes: Scene['nodes'], crop: Scene['meta']['crop'] = null): Scene => {
  const base = emptyScene({ captureId: 'b', width: 10, height: 6, dpr: 1 })
  return { ...base, meta: { ...base.meta, crop }, nodes }
}

describe('خريطة الفرق تُصفَّر داخل المحجوب', () => {
  const full = () => {
    const data = new Uint8ClampedArray(10 * 6 * 4).fill(200)
    return { data, width: 10, height: 6 }
  }

  it('البكسلات داخل المستطيل شفّافة، وخارجه كما هي، والأصل لا يُمسّ', () => {
    const source = full()
    const masked = maskDiff(source, [deviceRect(2, 1, 3, 2)])
    const alpha = (x: number, y: number) => masked.data[(y * 10 + x) * 4 + 3]
    expect(alpha(2, 1)).toBe(0)
    expect(alpha(4, 2)).toBe(0)
    expect(alpha(5, 1)).toBe(200)
    expect(alpha(2, 3)).toBe(200)
    expect(source.data[(1 * 10 + 2) * 4 + 3]).toBe(200)
  })

  it('مستطيلٌ يتجاوز الحدود يُقصّ ولا يرمي، وبلا مستطيلات تعود الخريطة نفسها', () => {
    const source = full()
    expect(() => maskDiff(source, [deviceRect(-5, -5, 100, 100)])).not.toThrow()
    expect(maskDiff(source, [deviceRect(-5, -5, 100, 100)]).data.every((v) => v === 0)).toBe(true)
    expect(maskDiff(source, [])).toBe(source)
  })
})

describe('مشهد الحجب', () => {
  it('عقد الحجب وحدها، بلا اقتصاص — التعليقات لا تُخبز في صورة الفرق', () => {
    const note = { ...redact('x', 0, 0, 1, 1), kind: 'rect' } as unknown as Scene['nodes'][number]
    const scene = withNodes([redact('r1', 1, 1, 2, 2), note], deviceRect(0, 0, 5, 5))
    const only = redactionScene(scene)
    expect(only.nodes.map((n) => n.kind)).toEqual(['redact'])
    expect(only.meta.crop).toBeNull()
  })

  it('مستطيلاته مسوّاة بفضاء الصورة — عرضٌ سالب يُقلب', () => {
    expect(redactionRects(withNodes([redact('r1', 5, 5, -3, -2)]))).toEqual([
      deviceRect(2, 3, 3, 2),
    ])
    expect(redactionRects(null)).toEqual([])
  })
})

describe('قراءة المشهد', () => {
  beforeEach(async () => {
    await clearAllStores()
  })

  it('لا مشهد محفوظ ⟵ `null`: لا حجب يُفقد لأنه لم يُرسم', async () => {
    const read = await loadScene('none')
    expect(read).toEqual({ ok: true, value: null })
  })

  it('**مشهدٌ لا يُقرأ يرفض التصدير بالاسم** — الفارغ يُسقط الحجب بصمت', async () => {
    await annotations.put({ captureId: 'bad', updatedAt: 1, scene: { nodes: 'تالف' } })
    const read = await loadScene('bad')
    expect(read.ok).toBe(false)
    if (!read.ok) expect(read.error.message).toContain('بلا حجبها')
  })

  it('ومشهدٌ سليم يُقرأ بعقده', async () => {
    const scene = withNodes([redact('r1', 1, 1, 2, 2)])
    await annotations.put({ captureId: 'b', updatedAt: 1, scene })
    const read = await loadScene('b')
    expect(read.ok && read.value?.nodes.length).toBe(1)
  })
})
