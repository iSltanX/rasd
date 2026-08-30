/**
 * خطّة الإطار — ماذا يُعاد رسمه، وأين.
 *
 * **المناطق المتّسخة ليست تحسينًا اختياريًّا** بل شرط معيار المرحلة: مئتا
 * تعليق على لقطة 4000×3000 فوق 55 إطارًا في الثانية أثناء السحب. وإعادة
 * رسم المشهد كلّه في كل حركة مؤشِّر تعني مئتَي عمليّة رسم لتحريك عقدة واحدة.
 *
 * **ولها حدّ يُعلَن لا يُخفى:** حين تتجاوز المساحة المتّسخة نسبةً من المنفذ،
 * يصير المسح الكامل أرخص من إدارة القصّ — لأن كل منطقة متّسخة تكلّف
 * `save`/`clip`/`restore` وإعادة تقييم كل عقدة تتقاطع معها. فالخطّة تسقط
 * إلى الكامل بدل أن تتظاهر بالتوفير.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { deviceRect, type DeviceRect } from '@/shared/geometry'

import { nodeBounds, type MeasureBox } from './bounds'
import { visibleImageRect, type Camera, type StageSize } from './camera'

import type { NodeId, Scene, SceneNode } from './scene'

/**
 * نسبة المساحة المتّسخة التي تُسقِط الخطّة إلى مسح كامل.
 *
 * أربعون بالمئة: دون ذلك يوفّر القصّ عملًا حقيقيًّا، وفوقه تصير كلفة إدارة
 * المستطيلات وتقييم التقاطعها أكبر من الوفر. الرقم **مشتقّ لا مقيس**،
 * ويُعاير بقياس حيّ حين يوجد سطح يقيسه.
 */
export const DIRTY_ESCALATION_RATIO = 0.4

/** أقصى عدد مستطيلات متّسخة قبل الاندماج — كلٌّ يكلّف قصًّا مستقلًّا. */
export const MAX_DIRTY_RECTS = 8

export type PlanMode = 'full' | 'partial'

export interface RenderPlan {
  readonly mode: PlanMode
  /** بفضاء الصورة. فارغة في `full`. */
  readonly dirty: readonly DeviceRect[]
  /** العقد التي ستُرسم فعلًا، بترتيب الرسم. */
  readonly nodes: readonly SceneNode[]
  /** المستطيل المرئي — يُستعمل للترشيح وللإحصاء. */
  readonly visible: DeviceRect
}

export interface RenderStats {
  readonly drawn: number
  readonly culled: number
  readonly mode: PlanMode
}

function overlaps(a: DeviceRect, b: DeviceRect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  )
}

function union(a: DeviceRect, b: DeviceRect): DeviceRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return deviceRect(
    x,
    y,
    Math.max(a.x + a.width, b.x + b.width) - x,
    Math.max(a.y + a.height, b.y + b.height) - y,
  )
}

const area = (r: DeviceRect): number => Math.max(0, r.width) * Math.max(0, r.height)

/**
 * يدمج المستطيلات المتقاطعة، ثم يقصّ العدد إلى السقف بضمّ الأصغر.
 *
 * الدمج ليس تجميلًا: مستطيلان متقاطعان يعنيان رسم ما بينهما مرّتين، وهو
 * خطأ بصري حقيقي مع الشفافية — الطبقة نصف الشفّافة تُرسم مرّتين فتُظلم.
 */
export function mergeDirty(rects: readonly DeviceRect[]): readonly DeviceRect[] {
  const out: DeviceRect[] = []

  for (const rect of rects) {
    if (area(rect) <= 0) continue
    let merged = rect
    for (let i = out.length - 1; i >= 0; i--) {
      const existing = out[i]!
      if (!overlaps(existing, merged)) continue
      merged = union(existing, merged)
      out.splice(i, 1)
    }
    out.push(merged)
  }

  // ما زاد على السقف يُضمّ إلى أقربه مساحةً — أقلّ الخيارات هدرًا.
  while (out.length > MAX_DIRTY_RECTS) {
    let bestI = 0
    let bestJ = 1
    let bestCost = Infinity
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const cost = area(union(out[i]!, out[j]!)) - area(out[i]!) - area(out[j]!)
        if (cost < bestCost) {
          bestCost = cost
          bestI = i
          bestJ = j
        }
      }
    }
    const merged = union(out[bestI]!, out[bestJ]!)
    out.splice(bestJ, 1)
    out.splice(bestI, 1)
    out.push(merged)
  }

  return out
}

/** يستبعد ما يقع خارج المرئي — الترشيح العريض قبل أي رسم. */
export function cull(
  scene: Scene,
  visible: DeviceRect,
  measure?: MeasureBox,
): { readonly nodes: readonly SceneNode[]; readonly culled: number } {
  const nodes: SceneNode[] = []
  let culled = 0
  for (const node of scene.nodes) {
    // المخفيّ لا يُرسم؛ وعقدة الحجب لا تملك `hidden` أصلًا فتُرسم دائمًا.
    if (node.kind !== 'redact' && node.hidden) {
      culled++
      continue
    }
    if (!overlaps(nodeBounds(node, measure), visible)) {
      culled++
      continue
    }
    nodes.push(node)
  }
  return { nodes, culled }
}

export interface PlanInput {
  readonly scene: Scene
  readonly camera: Camera
  readonly stage: StageSize
  /** ما تغيّر منذ الإطار السابق — بفضاء الصورة. */
  readonly dirty?: readonly DeviceRect[]
  /** يفرض إعادة رسم كاملة: تغيّر كاميرا، أو اقتصاص، أو أوّل إطار. */
  readonly forceFull?: boolean
  readonly measure?: MeasureBox
}

/**
 * يبني خطّة الإطار.
 *
 * **تغيّر الكاميرا يفرض الكامل** ولا يُحاوَل تجزئته: التكبير أو التحريك
 * يُزيح كل بكسل على الشاشة، فالمنطقة المتّسخة هي المنفذ كلّه — وحسابها
 * مستطيلاتٍ عملٌ زائد على عمل.
 */
export function planFrame(input: PlanInput): RenderPlan {
  const visible = visibleImageRect(input.camera, input.stage)
  const { nodes, culled: _culled } = cull(input.scene, visible, input.measure)

  const dirty = input.dirty ? mergeDirty(input.dirty) : []
  const dirtyArea = dirty.reduce((sum, r) => sum + area(r), 0)
  const visibleArea = area(visible)

  const full =
    input.forceFull === true ||
    dirty.length === 0 ||
    visibleArea <= 0 ||
    dirtyArea / visibleArea >= DIRTY_ESCALATION_RATIO

  if (full) return { mode: 'full', dirty: [], nodes, visible }

  // في الوضع الجزئي تُرسَم العقد المتقاطعة مع المتّسخ وحدها.
  const touched = nodes.filter((node) => {
    const box = nodeBounds(node, input.measure)
    return dirty.some((d) => overlaps(box, d))
  })

  return { mode: 'partial', dirty, nodes: touched, visible }
}

/**
 * المستطيلات المتّسخة لتغيير عقدة — **صندوقها قبل وبعد**.
 *
 * الاثنان لازمان: الصندوق الجديد يرسم العقدة في موضعها، والقديم **يمحوها من
 * موضعها السابق**. وبلا الأوّل يبقى شبحها على الشاشة — وهو أشهر عطل في
 * الرسم الجزئي، ولا يظهر إلّا بعد تحريك حقيقي.
 */
export function dirtyForChange(
  before: SceneNode | null,
  after: SceneNode | null,
  measure?: MeasureBox,
): readonly DeviceRect[] {
  const out: DeviceRect[] = []
  if (before) out.push(nodeBounds(before, measure))
  if (after) out.push(nodeBounds(after, measure))
  return out
}

/** يقرّب مستطيلًا إلى حدود بكسل — يمنع خيوط نصف البكسل عند القصّ. */
export function snapToPixel(r: DeviceRect): DeviceRect {
  const x = Math.floor(r.x)
  const y = Math.floor(r.y)
  return deviceRect(x, y, Math.ceil(r.x + r.width) - x, Math.ceil(r.y + r.height) - y)
}

/** إحصاء إطار — يُعرض في التحقّق الحيّ لا في الواجهة. */
export function statsOf(plan: RenderPlan, scene: Scene): RenderStats {
  return {
    drawn: plan.nodes.length,
    culled: scene.nodes.length - plan.nodes.length,
    mode: plan.mode,
  }
}

/** معرّفات العقد المرسومة — لمقارنة الخطط في الاختبار. */
export const drawnIds = (plan: RenderPlan): readonly NodeId[] => plan.nodes.map((n) => n.id)
