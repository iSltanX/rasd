/**
 * مُنشئات الأوامر — كل واحدة `(Scene, …) => readonly Patch[]`.
 *
 * **لا تُعدِّل مشهدًا ولا تُرجعه.** تُرجع الفروق وحدها، ويطبّقها التاريخ.
 * هذا ما يجعل «نفِّذ» و«تراجَع» يمرّان بالمسار نفسه: لا فرع ثانٍ يمكن أن
 * ينحرف عن الأوّل.
 *
 * **وهنا تُفرَض الأسقف** — لا في طبقة التخزين. `unlimitedStorage` ممنوحة
 * دائمًا في هذا المشروع، فحارس الحصّة لا يحجب عمليًّا؛ ومشهدٌ ينتفخ لا
 * يُبلَّغ عنه بل يظهر بطئًا في المكتبة بعد شهور.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { unlinkPatchesFor, renumber } from './pins'
import { clampStrength, defaultStrength } from './redact'
import { MAX_SCENE_NODES } from './scene'

import type { Patch } from './commands'
import type {
  HideableNode,
  NodeId,
  ObscureMode,
  PinNode,
  RedactNode,
  Scene,
  SceneNode,
} from './scene'
import type { DeviceRect } from '@/shared/geometry'

/** سبب رفض عملية — يُعرض للمستخدم ولا يُبتلع. */
export type OpRefusal = 'too-many-nodes' | 'locked' | 'not-found'

export interface OpResult {
  readonly patches: readonly Patch[]
  /** `null` يعني: نُفِّذت. وإلّا فسببٌ يُعرَض. */
  readonly refusal: OpRefusal | null
}

const done = (patches: readonly Patch[]): OpResult => ({ patches, refusal: null })
const refused = (refusal: OpRefusal): OpResult => ({ patches: [], refusal })

/**
 * يضيف عقدة إلى أعلى المشهد.
 *
 * والترقيم يُعاد **بعد** الإدراج لا قبله: الدبّوس الجديد يدخل بترتيبه ثمّ
 * تُصحَّح الأرقام كلّها، فيصحّ الرقم حتى لو أُدرج في وسط تسلسل قائم.
 */
export function addNode(scene: Scene, node: SceneNode): OpResult {
  if (scene.nodes.length >= MAX_SCENE_NODES) return refused('too-many-nodes')

  const insert: Patch = { op: 'insert', index: scene.nodes.length, node }
  if (node.kind !== 'pin') return done([insert])

  const after: Scene = { ...scene, nodes: [...scene.nodes, node] }
  return done([insert, ...renumber(after)])
}

/**
 * يحذف عقدًا.
 *
 * **ثلاث خطوات بترتيب ملزم:**
 *   ١. فكّ الروابط على العقد **الباقية** — تُحسب على المشهد الأصلي.
 *   ٢. الحذف **تنازليًّا بالفهرس** — لأن دلالة `Patch.index` هي الفهرس لحظة
 *      التطبيق، فحذفُ الأصغر أوّلًا يُزيح ما بعده.
 *   ٣. إعادة الترقيم على المشهد **بعد** الحذف.
 *
 * وأي خلط في هذا الترتيب يعطي تراجعًا يعمل على عقدة واحدة ويفسد على اثنتين
 * — وهو أخبث ما في نماذج التاريخ.
 */
export function deleteNodes(scene: Scene, ids: readonly NodeId[]): OpResult {
  const set = new Set(ids)
  const targets = scene.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => set.has(node.id))

  if (targets.length === 0) return refused('not-found')
  if (targets.some(({ node }) => node.locked)) return refused('locked')

  const unlink = unlinkPatchesFor(scene, set)

  // تنازليًّا: الفهرس الأكبر أوّلًا.
  const removals: Patch[] = targets
    .slice()
    .sort((a, b) => b.index - a.index)
    .map(({ node, index }) => ({ op: 'remove', index, node }))

  const remaining: Scene = { ...scene, nodes: scene.nodes.filter((n) => !set.has(n.id)) }
  return done([...unlink, ...removals, ...renumber(remaining)])
}

/** يستبدل عقدة بأخرى — الأساس الذي تُبنى عليه كل عمليات التحرير. */
export function replaceNode(scene: Scene, next: SceneNode): OpResult {
  const index = scene.nodes.findIndex((n) => n.id === next.id)
  if (index < 0) return refused('not-found')
  const before = scene.nodes[index]
  if (!before) return refused('not-found')
  if (before.locked && next.locked) return refused('locked')
  return done([{ op: 'replace', index, before, after: next }])
}

/** يستبدل عدّة عقد دفعةً — سحب تحديد متعدّد يمرّ من هنا. */
export function replaceNodes(scene: Scene, nodes: readonly SceneNode[]): OpResult {
  const patches: Patch[] = []
  for (const next of nodes) {
    const index = scene.nodes.findIndex((n) => n.id === next.id)
    if (index < 0) continue
    const before = scene.nodes[index]
    if (!before || before.locked) continue
    patches.push({ op: 'replace', index, before, after: next })
  }
  return patches.length > 0 ? done(patches) : refused('not-found')
}

/** ينقل عقدة في **ترتيب الرسم** — لوحة الطبقات. لا يمسّ أرقام الدبابيس. */
export function reorderNode(scene: Scene, id: NodeId, to: number): OpResult {
  const from = scene.nodes.findIndex((n) => n.id === id)
  if (from < 0) return refused('not-found')
  const target = Math.max(0, Math.min(scene.nodes.length - 1, to))
  if (target === from) return done([])
  return done([{ op: 'move', from, to: target }])
}

/**
 * يبدّل الإخفاء — **على ما يجوز إخفاؤه وحده**.
 *
 * التوقيع يستقبل `HideableNode` لا `SceneNode`، فعقدة الحجب لا تصل هنا
 * أصلًا. الحدّ الأمني مفروض بالنوع لا بفحصٍ يمكن نسيانه.
 */
export function toggleHidden(scene: Scene, node: HideableNode): OpResult {
  return replaceNode(scene, { ...node, hidden: !node.hidden })
}

/** يبدّل القفل. المقفول لا يُحرَّك ولا يُحذَف، ويبقى قابلًا لفكّ قفله. */
export function toggleLocked(scene: Scene, node: SceneNode): OpResult {
  const index = scene.nodes.findIndex((n) => n.id === node.id)
  if (index < 0) return refused('not-found')
  return done([{ op: 'replace', index, before: node, after: { ...node, locked: !node.locked } }])
}

/**
 * يضبط الاقتصاص — حقل جذر واحد.
 *
 * لا إزاحة على العقد: ذلك يحوّل أرخص عملية إلى أثقل خطوة تاريخ، ويُفقد
 * القدرة على توسيع الاقتصاص ثانيةً بلا خسارة.
 */
export function setCrop(scene: Scene, crop: DeviceRect | null): OpResult {
  const before = scene.meta.crop
  if (before === crop) return done([])
  return done([{ op: 'root', patch: { field: 'crop', before, after: crop } }])
}

/**
 * يبدّل نمط الحجب — **ويحمل معه شدّةً صالحة للنمط الجديد**.
 *
 * الشدّة رقمان بالاسم نفسه ومعنيان مختلفان: انحرافٌ معياري للضباب، وضلعُ
 * خليّة للبكسلة، ومُهمَلة للتغطية. ونقلُ الرقم كما هو بين نمطين يعطي أرقامًا
 * بلا معنى؛ ونقلُ صفر التغطية إلى الضباب **أسوأ**: المستخدم يختار «ضبابي»،
 * فلا يتغيّر شيء على الشاشة، فإمّا يظنّ الأداة معطّلة، وإمّا — وهو الأخطر —
 * **يظنّها عملت** فيصدّر كلمة مرور غير مطموسة.
 */
export function setRedactMode(scene: Scene, node: RedactNode, mode: ObscureMode): OpResult {
  const carried = node.mode === mode ? node.strength : defaultStrength(mode)
  return replaceNode(scene, { ...node, mode, strength: clampStrength(mode, carried) })
}

/** يضبط شدّة الحجب — محصورةً في مدى نمطها. */
export function setRedactStrength(scene: Scene, node: RedactNode, value: number): OpResult {
  return replaceNode(scene, { ...node, strength: clampStrength(node.mode, value) })
}

/** يضبط لون التغطية. */
export function setCoverToken(
  scene: Scene,
  node: RedactNode,
  coverToken: RedactNode['coverToken'],
): OpResult {
  return replaceNode(scene, { ...node, coverToken })
}

/** يضبط شكل الدبابيس الافتراضي، ويُحدِّث القائم منها. */
export function setPinShape(scene: Scene, shape: PinNode['shape']): OpResult {
  const before = scene.meta.pinShape
  const patches: Patch[] = []
  if (before !== shape) {
    patches.push({ op: 'root', patch: { field: 'pinShape', before, after: shape } })
  }
  scene.nodes.forEach((node, index) => {
    if (node.kind !== 'pin' || node.shape === shape) return
    patches.push({ op: 'replace', index, before: node, after: { ...node, shape } })
  })
  return done(patches)
}
