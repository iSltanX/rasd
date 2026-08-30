import { describe, expect, it } from 'vitest'

import { applyPatches } from '@/modules/editor/commands'
import {
  asNodeId,
  MAX_SCENE_BYTES,
  SCENE_SCHEMA_VERSION,
  type RedactNode,
  type Scene,
  type SceneNode,
} from '@/modules/editor/scene'
import { addNode } from '@/modules/editor/scene-ops'
import {
  emptyScene,
  estimateSceneBytes,
  parseScene,
  migrateScene,
} from '@/modules/editor/scene-schema'
import { deviceRect, devicePoint } from '@/shared/geometry'

/**
 * المخطَّط هو حدّ الثقة فوق `AnnotationRecord.scene: unknown`.
 *
 * ما يعبر `structuredClone` يعود بلا نماذج أوّلية، وما يُقرأ من قرص عُبث به
 * ليس مشهدًا حتى يُثبَت. هذه الاختبارات تفحص الحدّ لا الرياضيات.
 */

const stroke = { colorToken: 'tool/annotate/solid', widthPx: 3, dash: [], opacity: 1 } as const

const base = () => emptyScene({ captureId: 'cap', width: 800, height: 600, dpr: 2 })

const redact = (): RedactNode => ({
  kind: 'redact',
  id: asNodeId('r1'),
  locked: false,
  rotation: 0,
  stroke,
  rect: deviceRect(10, 10, 100, 20),
  mode: 'cover',
  strength: 0,
  coverToken: 'status/danger/solid',
})

describe('المشهد الفارغ', () => {
  it('صالح ويحمل نسخته', () => {
    const scene = base()
    const parsed = parseScene(scene)
    expect(parsed.ok).toBe(true)
    expect(scene.schemaVersion).toBe(SCENE_SCHEMA_VERSION)
  })

  it('كثافة البكسل إلزامية', () => {
    const { dpr: _drop, ...rest } = base().source
    const bad = { ...base(), source: rest }
    expect(parseScene(bad).ok).toBe(false)
  })
})

describe('دورة كاملة عبر JSON — ما يعبر IndexedDB', () => {
  it('مشهد بكل أصناف العقد يعود مطابقًا', () => {
    let scene: Scene = base()
    const nodes: SceneNode[] = [
      {
        kind: 'rect',
        id: asNodeId('a'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        rect: deviceRect(0, 0, 10, 10),
        radiusPx: 2,
        fill: 'none',
      },
      {
        kind: 'ellipse',
        id: asNodeId('b'),
        locked: false,
        rotation: 0.5,
        hidden: false,
        stroke,
        rect: deviceRect(0, 0, 10, 10),
        fill: 'solid',
      },
      {
        kind: 'line',
        id: asNodeId('c'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        a: devicePoint(0, 0),
        b: devicePoint(9, 9),
      },
      {
        kind: 'arrow',
        id: asNodeId('d'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        a: devicePoint(0, 0),
        b: devicePoint(9, 9),
        head: 'end',
        headSizePx: 12,
      },
      {
        kind: 'freehand',
        id: asNodeId('e'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        points: [0, 0, 1, 1, 2, 2],
        closed: false,
        epsilon: 1,
      },
      {
        kind: 'text',
        id: asNodeId('f'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        at: devicePoint(5, 5),
        text: 'الحشوة 14px واللون #3B82F6',
        font: { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 0 },
        maxWidthPx: 200,
        align: 'start',
        dir: 'auto',
      },
      {
        kind: 'note',
        id: asNodeId('g'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        at: devicePoint(0, 0),
        widthPx: 200,
        title: 'عنوان',
        body: 'شرح',
        tag: 'spacing',
        font: { family: 'Cairo', sizePx: 14, weight: 400, letterSpacingPx: 0 },
        paddingPx: 12,
        pinId: asNodeId('h'),
      },
      {
        kind: 'pin',
        id: asNodeId('h'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        at: devicePoint(20, 20),
        shape: 'circle',
        ordinal: 1,
        noteId: asNodeId('g'),
        radiusPx: 13,
      },
      redact(),
      {
        kind: 'measure',
        id: asNodeId('j'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        a: deviceRect(0, 0, 5, 5),
        b: null,
        show: 'size',
      },
    ]
    scene = { ...scene, nodes }

    const round = parseScene(JSON.parse(JSON.stringify(scene)))
    expect(round.ok).toBe(true)
    if (round.ok) expect(round.value).toEqual(scene)
  })
})

describe('الرفض الصريح لا الانهيار المتأخّر', () => {
  it('قيمة ليست كائنًا', () => {
    expect(parseScene(null).ok).toBe(false)
    expect(parseScene('scene').ok).toBe(false)
  })

  it('عقدة بصنف مجهول', () => {
    const bad = { ...base(), nodes: [{ kind: 'ufo', id: 'x' }] }
    expect(parseScene(bad).ok).toBe(false)
  })

  it('**مسار حرّ بعدد إحداثيات فردي** — نقطة بلا إحداثي ثانٍ ترسم NaN ولا ترمي', () => {
    const bad = {
      ...base(),
      nodes: [
        {
          kind: 'freehand',
          id: 'e',
          locked: false,
          rotation: 0,
          hidden: false,
          stroke,
          points: [0, 0, 1],
          closed: false,
          epsilon: 1,
        },
      ],
    }
    expect(parseScene(bad).ok).toBe(false)
  })

  it('تباعد حروف غير صفري يُرفَض — العربية لا تُباعَد', () => {
    const bad = {
      ...base(),
      nodes: [
        {
          kind: 'text',
          id: 'f',
          locked: false,
          rotation: 0,
          hidden: false,
          stroke,
          at: { space: 'device', x: 0, y: 0 },
          text: 'س',
          font: { family: 'Cairo', sizePx: 16, weight: 400, letterSpacingPx: 3 },
          maxWidthPx: 0,
          align: 'start',
          dir: 'auto',
        },
      ],
    }
    expect(parseScene(bad).ok).toBe(false)
  })

  it('لون خارج قائمة التوكنات يُرفَض — لا `string` حرّ', () => {
    const bad = {
      ...base(),
      nodes: [
        {
          kind: 'rect',
          id: 'a',
          locked: false,
          rotation: 0,
          hidden: false,
          stroke: { ...stroke, colorToken: '#ff0000' },
          rect: { space: 'device', x: 0, y: 0, width: 1, height: 1 },
          radiusPx: 0,
          fill: 'none',
        },
      ],
    }
    expect(parseScene(bad).ok).toBe(false)
  })

  it('نسخة مخطَّط أحدث من القارئ تُرفَض برسالة مفهومة', () => {
    const future = { ...base(), schemaVersion: SCENE_SCHEMA_VERSION + 1 }
    const parsed = parseScene(future)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error.message).toContain('نسخة أحدث')
    expect(migrateScene(future as Scene).ok).toBe(false)
  })
})

describe('عقدة الحجب بلا حقل إخفاء — بحكم النوع وبحكم المخطَّط', () => {
  it('تمرّ بلا `hidden`', () => {
    const scene = { ...base(), nodes: [redact()] }
    expect(parseScene(scene).ok).toBe(true)
  })

  it('**و`hidden` المدسوس لا يُقرأ ولا يبقى**', () => {
    const smuggled = { ...base(), nodes: [{ ...redact(), hidden: true }] }
    const parsed = parseScene(smuggled)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const node = parsed.value.nodes[0] as unknown as Record<string, unknown>
      expect(node['hidden']).toBeUndefined()
    }
  })
})

describe('تقدير الحجم', () => {
  it('مشهد فارغ صغير، ومشهد ممتلئ أكبر', () => {
    const empty = base()
    const filled = applyPatches(
      empty,
      addNode(empty, {
        kind: 'freehand',
        id: asNodeId('e'),
        locked: false,
        rotation: 0,
        hidden: false,
        stroke,
        points: Array.from({ length: 512 }, (_, i) => i),
        closed: false,
        epsilon: 1,
      }).patches,
    )
    expect(estimateSceneBytes(empty)).toBeLessThan(estimateSceneBytes(filled))
    expect(estimateSceneBytes(filled)).toBeLessThan(MAX_SCENE_BYTES)
  })
})
