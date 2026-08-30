/**
 * الفرق (patch) — الوحدة التي يُبنى منها التاريخ.
 *
 * **قاعدتان لا يُخالَفان، وكلتاهما مسنودة إلى عطل مثبَت:**
 *
 * **١. لا تُكتب دالّة `undo()` أبدًا.** العكس المحسوب لحظة التراجع يرى
 * الحالة الراهنة لا الحالة التي وقعت عليها العملية. احذف الدبّوس «٣» من
 * خمسة: الترقيم التلقائي يحوّل ٤→٣ و٥→٤. وعكسُ «احذف الدبّوس ٣» ليس
 * «أدرِج دبّوسًا برقم ٣»، لأن من يحمل الرقم ٣ الآن شخصٌ آخر. والنتيجة
 * ترقيمٌ صحيح شكلًا مخرَّب دلاليًّا: الملاحظات تنفصل عن دبابيسها بصمت.
 *
 * **٢. ولا يُشتقّ الفرق بمقارنة المشهدين.** المقارنة بالمراجع تجعل
 * «تغيّرت» ≡ «اختلف المرجع»، فطفرةٌ موضعية واحدة (سهوٌ في وحدة أخرى) تُنتج
 * فرقًا **فارغًا**، فيتخطّى التراجع خطوةً وقعت فعلًا — عطلٌ يظهر بعد
 * خطوتين وينجو من كل اختبار لا يفحص التاريخ نفسه.
 *
 * فالعكس **يُلتقَط لحظة التنفيذ**، و`remove` يحمل العقدة **كاملة** لا
 * معرّفًا. وهذا ما تفعله المحرّرات التي تعمل: العكس يُحسب عند التسجيل.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import type { PinNode, Scene, SceneNode } from './scene'
import type { DeviceRect } from '@/shared/geometry'

/** تغيير على جذر المشهد — اتحاد مُميَّز بحقل، لا `unknown` مزدوج. */
export type RootPatch =
  | {
      readonly field: 'crop'
      readonly before: DeviceRect | null
      readonly after: DeviceRect | null
    }
  | { readonly field: 'pinStart'; readonly before: number; readonly after: number }
  | {
      readonly field: 'pinShape'
      readonly before: PinNode['shape']
      readonly after: PinNode['shape']
    }

/**
 * عملية واحدة قابلة للعكس.
 *
 * **الدلالة الملزِمة: الفهرس هو الفهرس لحظة تطبيق هذه العملية**، لا لحظة
 * تسجيلها. ولذلك تُصدِر عمليات الحذف فهارسها **تنازليًّا**، وتُحسب فهارس
 * الاستبدال على المصفوفة بعد الحذف. مخالفة هذا تعطي تراجعًا يعمل على عقدة
 * واحدة ويفسد على اثنتين.
 */
export type Patch =
  | { readonly op: 'insert'; readonly index: number; readonly node: SceneNode }
  | { readonly op: 'remove'; readonly index: number; readonly node: SceneNode }
  | {
      readonly op: 'replace'
      readonly index: number
      readonly before: SceneNode
      readonly after: SceneNode
    }
  | { readonly op: 'move'; readonly from: number; readonly to: number }
  | { readonly op: 'root'; readonly patch: RootPatch }

/** نسخة جذر جديدة بمصفوفة عقد جديدة — والعقد غير الممسوسة تُشارَك بالمرجع. */
function withNodes(scene: Scene, nodes: readonly SceneNode[]): Scene {
  return { ...scene, nodes }
}

function applyRoot(scene: Scene, patch: RootPatch): Scene {
  switch (patch.field) {
    case 'crop':
      return { ...scene, meta: { ...scene.meta, crop: patch.after } }
    case 'pinStart':
      return { ...scene, meta: { ...scene.meta, pinStart: patch.after } }
    case 'pinShape':
      return { ...scene, meta: { ...scene.meta, pinShape: patch.after } }
  }
}

/**
 * يطبّق عملية واحدة.
 *
 * **يرمي على الفهرس خارج المدى ولا يتجاهله.** فهرسٌ خاطئ يعني أن ترتيب
 * العمليات انكسر، وتطبيقُ ما بعده على مشهد منزاح يُنتج فسادًا صامتًا أسوأ
 * من الانفجار — والمستدعي (`history`) يحصره في محاولة واحدة.
 */
export function applyPatch(scene: Scene, patch: Patch): Scene {
  switch (patch.op) {
    case 'insert': {
      if (patch.index < 0 || patch.index > scene.nodes.length) {
        throw new RangeError(`إدراج خارج المدى: ${patch.index}`)
      }
      const nodes = scene.nodes.slice()
      nodes.splice(patch.index, 0, patch.node)
      return withNodes(scene, nodes)
    }
    case 'remove': {
      if (patch.index < 0 || patch.index >= scene.nodes.length) {
        throw new RangeError(`حذف خارج المدى: ${patch.index}`)
      }
      const nodes = scene.nodes.slice()
      nodes.splice(patch.index, 1)
      return withNodes(scene, nodes)
    }
    case 'replace': {
      if (patch.index < 0 || patch.index >= scene.nodes.length) {
        throw new RangeError(`استبدال خارج المدى: ${patch.index}`)
      }
      const nodes = scene.nodes.slice()
      nodes[patch.index] = patch.after
      return withNodes(scene, nodes)
    }
    case 'move': {
      const { from, to } = patch
      if (from < 0 || from >= scene.nodes.length || to < 0 || to >= scene.nodes.length) {
        throw new RangeError(`نقل خارج المدى: ${from} → ${to}`)
      }
      const nodes = scene.nodes.slice()
      const [moved] = nodes.splice(from, 1)
      if (moved) nodes.splice(to, 0, moved)
      return withNodes(scene, nodes)
    }
    case 'root':
      return applyRoot(scene, patch.patch)
  }
}

/** عكس عملية واحدة — تبديلُ حقلين، لا إعادة حساب. */
export function invertPatch(patch: Patch): Patch {
  switch (patch.op) {
    case 'insert':
      return { op: 'remove', index: patch.index, node: patch.node }
    case 'remove':
      return { op: 'insert', index: patch.index, node: patch.node }
    case 'replace':
      return { op: 'replace', index: patch.index, before: patch.after, after: patch.before }
    case 'move':
      return { op: 'move', from: patch.to, to: patch.from }
    case 'root': {
      const p = patch.patch
      switch (p.field) {
        case 'crop':
          return { op: 'root', patch: { field: 'crop', before: p.after, after: p.before } }
        case 'pinStart':
          return { op: 'root', patch: { field: 'pinStart', before: p.after, after: p.before } }
        case 'pinShape':
          return { op: 'root', patch: { field: 'pinShape', before: p.after, after: p.before } }
      }
    }
  }
}

export function applyPatches(scene: Scene, patches: readonly Patch[]): Scene {
  let next = scene
  for (const p of patches) next = applyPatch(next, p)
  return next
}

/**
 * عكس قائمة — **عكس الترتيب ثمّ عكس كلٍّ**.
 *
 * الترتيب ليس تجميلًا: الفهارس نسبية إلى الحالة لحظة التطبيق. حذفُ العقدة
 * 2 ثمّ العقدة 5 يُطبَّق تنازليًّا؛ وعكسه يجب أن يُدرِج 5 **قبل** 2 كي
 * يجد كلٌّ منهما موضعه الأصلي. عكسُ كلٍّ بلا عكس الترتيب يعطي مشهدًا
 * تبدو عقده صحيحة ومواضعها مبدَّلة.
 */
export function invertPatches(patches: readonly Patch[]): readonly Patch[] {
  return patches.slice().reverse().map(invertPatch)
}

/** مفتاح الدمج — العقدة، أو حقل الجذر. */
function keyOf(patch: Patch): string | null {
  if (patch.op === 'replace') return `node:${patch.after.id}`
  if (patch.op === 'root') return `root:${patch.patch.field}`
  return null
}

/**
 * الدمج داخل العلامة الواحدة.
 *
 * **يدمج على مستوى المعرّف لا على التتالي** — والفرق حاسم: سحبُ تحديد
 * متعدّد يمسّ عشرين عقدة، فيولّد `n1…n20` ثمّ يعيد الكرّة مع كل حركة
 * مؤشِّر. فلا توجد `replace` متتاليتان على العقدة نفسها **أبدًا**، ودمجٌ
 * يشترط التتالي لا يُفعَّل ولا مرّة — فتصير سحبةٌ من ثانيتين ألفين وأربعمئة
 * فرق في علامة واحدة.
 *
 * فيمرّ الدمج على العلامة كاملة ويُبقي لكل مفتاح **أوّل `before` وآخر
 * `after`**، محافظًا على موضع أوّل ظهور كي لا ينقلب ترتيب العمليات.
 *
 * ولا يُدمج ما بعد `remove` لمعرّفٍ ما: الحذف يقطع سلسلة الاستبدال، وما
 * يليه إدراجٌ لعقدةٍ أخرى بالمعنى وإن حملت المعرّف نفسه.
 */
export function coalesce(patches: readonly Patch[]): readonly Patch[] {
  const out: Patch[] = []
  /** المفتاح ← موضعه في `out`. */
  const slot = new Map<string, number>()
  /** مفاتيح قُطعت بحذف — لا تُدمج بعده. */
  const severed = new Set<string>()

  for (const patch of patches) {
    if (patch.op === 'remove' || patch.op === 'insert') {
      severed.add(`node:${patch.node.id}`)
      slot.delete(`node:${patch.node.id}`)
      out.push(patch)
      continue
    }

    const key = keyOf(patch)
    if (key === null || severed.has(key)) {
      out.push(patch)
      continue
    }

    const at = slot.get(key)
    if (at === undefined) {
      slot.set(key, out.length)
      out.push(patch)
      continue
    }

    const prev = out[at]
    if (prev === undefined) continue

    if (patch.op === 'replace' && prev.op === 'replace') {
      out[at] = { op: 'replace', index: prev.index, before: prev.before, after: patch.after }
    } else if (patch.op === 'root' && prev.op === 'root') {
      out[at] = mergeRoot(prev.patch, patch.patch)
    } else {
      out.push(patch)
    }
  }

  return out
}

/** يدمج تغييرين على الحقل نفسه — الأوّل يعطي `before` والأخير `after`. */
function mergeRoot(first: RootPatch, last: RootPatch): Patch {
  switch (last.field) {
    case 'crop':
      return {
        op: 'root',
        patch: {
          field: 'crop',
          before: first.field === 'crop' ? first.before : last.before,
          after: last.after,
        },
      }
    case 'pinStart':
      return {
        op: 'root',
        patch: {
          field: 'pinStart',
          before: first.field === 'pinStart' ? first.before : last.before,
          after: last.after,
        },
      }
    case 'pinShape':
      return {
        op: 'root',
        patch: {
          field: 'pinShape',
          before: first.field === 'pinShape' ? first.before : last.before,
          after: last.after,
        },
      }
  }
}
