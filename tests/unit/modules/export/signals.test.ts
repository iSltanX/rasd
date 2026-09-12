import { describe, expect, it } from 'vitest'

import { MAX_FREEHAND_POINTS, asNodeId, type Scene, type SceneNode } from '@/modules/editor/scene'
import { emptyScene } from '@/modules/editor/scene-schema'
import { MAX_EPSILON_PX } from '@/modules/editor/smoothing'
import { collectSignals } from '@/modules/export/signals'

import type { BakeReport } from '@/modules/editor/bake'
import type { TextLayoutCache, WrapResult } from '@/modules/editor/text-layout'

const REPORT = (warnings: readonly string[] = []): BakeReport => ({
  width: 64,
  height: 48,
  bytes: 1234,
  obscured: [],
  format: 'png',
  reencoded: true,
  paletteMode: 'dark',
  warnings,
})

/** ذاكرة تخطيط مزيَّفة: تُعلن الفيضان للعقد التي تحمل نصًّا مسمًّى. */
const layoutWhere = (overflowing: ReadonlySet<string>): TextLayoutCache => ({
  get: (node: { id: string }): WrapResult => ({
    lines: [],
    width: 0,
    height: 0,
    direction: 'rtl',
    overflow: overflowing.has(node.id),
  }),
  metrics: () => ({ ascent: 10, descent: 3, lineHeight: 16 }),
  invalidate: () => undefined,
  size: 0,
})

const sceneWith = (...nodes: readonly SceneNode[]): Scene => ({
  ...emptyScene({ captureId: 'c', width: 64, height: 48, dpr: 1 }),
  nodes,
})

const freehand = (id: string, points: number, epsilon: number): SceneNode =>
  ({
    kind: 'freehand',
    id: asNodeId(id),
    hidden: false,
    locked: false,
    rotation: 0,
    stroke: { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 },
    points: Array.from({ length: points * 2 }, (_, i) => i),
    closed: false,
    epsilon,
  }) as unknown as SceneNode

const textNode = (id: string): SceneNode =>
  ({
    kind: 'text',
    id: asNodeId(id),
    hidden: false,
    locked: false,
    rotation: 0,
    stroke: { colorToken: 'tool/annotate/solid', widthPx: 2, dash: [], opacity: 1 },
    at: { x: 0, y: 0 },
    text: 'نص',
    font: { family: 'Cairo', sizePx: 14, weight: 400, letterSpacingPx: 0 },
    maxWidthPx: 100,
    align: 'start',
    dir: 'rtl',
  }) as unknown as SceneNode

const EMPTY_LAYOUT = layoutWhere(new Set())

describe('الإشارات الثلاث — تُعرَض بعد أن كانت تُحسب ولا يقرؤها أحد', () => {
  it('**مشهدٌ نظيف يُنتج قائمةً فارغة** — لا إشارات مخترعة', () => {
    expect(collectSignals({ scene: sceneWith(), layout: EMPTY_LAYOUT, report: REPORT() })).toEqual(
      [],
    )
  })

  it('تحذير الحجب يأتي من `BakeReport.warnings` بعدده', () => {
    const signals = collectSignals({
      scene: sceneWith(),
      layout: EMPTY_LAYOUT,
      report: REPORT(['خارج النافذة', 'خارج النافذة']),
    })
    expect(signals).toHaveLength(1)
    expect(signals[0]!.kind).toBe('redact-outside')
    expect(signals[0]!.tone).toBe('warning')
    expect(signals[0]!.count).toBe(2)
  })

  it('وفيضان النصّ يُقرأ من ذاكرة التخطيط لا يُعاد حسابه', () => {
    const signals = collectSignals({
      scene: sceneWith(textNode('t1'), textNode('t2')),
      layout: layoutWhere(new Set(['t1'])),
      report: REPORT(),
    })
    expect(signals).toHaveLength(1)
    expect(signals[0]!.kind).toBe('text-overflow')
    expect(signals[0]!.count).toBe(1)
  })

  /**
   * **الاشتقاق الثالث: `SmoothResult.truncated` لا يُحفَظ في العقدة.**
   *
   * `finalizeStroke` تقتطع حين يستنفد التصعيد سقفه، فتُخرج مسارًا نقاطه
   * `MAX_FREEHAND_POINTS` بالضبط وعتبتُه `MAX_EPSILON_PX`. والشرطان معًا —
   * وأحدهما وحده لا يكفي، وهذا ما تُثبته الحالتان السالبتان أدناه.
   */
  describe('اقتطاع المسار — مُشتقٌّ بشرطين لا بشرط', () => {
    it('يُكشَف حين يجتمع العدد الأقصى والعتبة القصوى', () => {
      const signals = collectSignals({
        scene: sceneWith(freehand('f1', MAX_FREEHAND_POINTS, MAX_EPSILON_PX)),
        layout: EMPTY_LAYOUT,
        report: REPORT(),
      })
      expect(signals).toHaveLength(1)
      expect(signals[0]!.kind).toBe('path-truncated')
      expect(signals[0]!.tone).toBe('info')
    })

    it('ولا يُكشَف بالعدد وحده — مسارٌ بلغ الحدّ بعتبةٍ منخفضة لم يُقتطع', () => {
      const signals = collectSignals({
        scene: sceneWith(freehand('f1', MAX_FREEHAND_POINTS, 1.2)),
        layout: EMPTY_LAYOUT,
        report: REPORT(),
      })
      expect(signals).toEqual([])
    })

    it('ولا بالعتبة وحدها — مسارٌ صعّد حتى السقف ثمّ استقرّ دونه', () => {
      const signals = collectSignals({
        scene: sceneWith(freehand('f1', MAX_FREEHAND_POINTS - 1, MAX_EPSILON_PX)),
        layout: EMPTY_LAYOUT,
        report: REPORT(),
      })
      expect(signals).toEqual([])
    })
  })

  /**
   * **الترتيب بالأهمّية لا بالمصدر.**
   *
   * ما يمسّ الحجب أوّلًا، لأنه الوحيد الذي يعني أن شيئًا قُصد إخفاؤه ولم
   * يُخفَ — والقارئ الذي يقرأ سطرًا واحدًا يجب أن يقرأ هذا.
   */
  it('الثلاث معًا مرتَّبة: الحجب ثمّ المسار ثمّ النصّ', () => {
    const signals = collectSignals({
      scene: sceneWith(freehand('f1', MAX_FREEHAND_POINTS, MAX_EPSILON_PX), textNode('t1')),
      layout: layoutWhere(new Set(['t1'])),
      report: REPORT(['خارج النافذة']),
    })
    expect(signals.map((s) => s.kind)).toEqual([
      'redact-outside',
      'path-truncated',
      'text-overflow',
    ])
    for (const signal of signals) {
      expect(signal.text.length).toBeGreaterThan(0)
      expect(signal.count).toBeGreaterThan(0)
    }
  })
})
