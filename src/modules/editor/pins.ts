/**
 * الدبابيس المرقَّمة — إعادة الترقيم، وترتيبها، وفكّ روابطها عند الحذف.
 *
 * **هذا الملفّ هو الحالة التي أثبتت بنية الفرق كلّها.** «أرقام متتابعة
 * تلقائيًا» + «إعادة ترتيب الأرقام» + «ربط كل رقم بملاحظة نصية» تجتمع في
 * عملية واحدة تكسر أي نموذج تراجع ساذج: حذفُ دبّوس من خمسة يُعيد ترقيم من
 * بعده، فعكسُ «احذف الثالث» ليس «أدرِج ثالثًا» — لأن من يحمل الرقم ٣ بعد
 * الحذف شخصٌ آخر.
 *
 * والمخرج هنا بنيويّ لا علاجي:
 *   - **الترقيم مخزَّن** في العقدة، فالعكس محفوظ في الفرق كاملًا.
 *   - **الربط بالمعرّف** لا بالرقم، فإعادة الترقيم لا تمسّ الروابط أصلًا.
 *   - **كل عملية تُصدِر فروق كل عقدة مسّتها**، لا العقدة المقصودة وحدها.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import type { Patch } from './commands'
import type { NodeId, NoteNode, PinNode, Scene, SceneNode } from './scene'

/** الدبابيس بترتيب أرقامها لا بترتيب رسمها — محوران مستقلّان. */
export function pinsByOrdinal(scene: Scene): readonly PinNode[] {
  return scene.nodes
    .filter((n): n is PinNode => n.kind === 'pin')
    .sort((a, b) => a.ordinal - b.ordinal)
}

/** فهرس العقدة في المشهد، أو `-1`. */
function indexOf(scene: Scene, id: NodeId): number {
  return scene.nodes.findIndex((n) => n.id === id)
}

/**
 * يُعيد ترقيم الدبابيس تتابعيًّا من `meta.pinStart`.
 *
 * يُصدِر فرقًا **لكل دبّوس تغيّر رقمه**، لا للمقصود وحده — وهذا بالضبط ما
 * يجعل التراجع صحيحًا: العكس يحمل الأرقام القديمة كلّها.
 *
 * ويُستدعى بعد كل عملية تمسّ مجموعة الدبابيس: إضافة، حذف، إعادة ترتيب،
 * تغيير نقطة البداية.
 */
export function renumber(scene: Scene): readonly Patch[] {
  const ordered = pinsByOrdinal(scene)
  const patches: Patch[] = []

  ordered.forEach((pin, i) => {
    const ordinal = scene.meta.pinStart + i
    if (pin.ordinal === ordinal) return
    const index = indexOf(scene, pin.id)
    if (index < 0) return
    patches.push({
      op: 'replace',
      index,
      before: pin,
      after: { ...pin, ordinal },
    })
  })

  return patches
}

/**
 * ينقل دبّوسًا إلى موضع جديد في **ترتيب الأرقام**.
 *
 * لا يمسّ ترتيب الرسم إطلاقًا: رفعُ دبّوس فوق سهم في لوحة الطبقات شيء،
 * وجعلُه «الثاني» في التسلسل شيء آخر. خلطهما — بأن يُشتقّ الرقم من موضع
 * المصفوفة — يجعل كل إعادة ترتيب بصرية تُعيد ترقيم الشرح.
 */
export function movePinOrdinal(scene: Scene, id: NodeId, toPosition: number): readonly Patch[] {
  const ordered = pinsByOrdinal(scene)
  const from = ordered.findIndex((p) => p.id === id)
  if (from < 0) return []

  const target = Math.max(0, Math.min(ordered.length - 1, toPosition))
  if (target === from) return []

  const reordered = ordered.slice()
  const [moved] = reordered.splice(from, 1)
  if (!moved) return []
  reordered.splice(target, 0, moved)

  const patches: Patch[] = []
  reordered.forEach((pin, i) => {
    const ordinal = scene.meta.pinStart + i
    if (pin.ordinal === ordinal) return
    const index = indexOf(scene, pin.id)
    if (index < 0) return
    patches.push({ op: 'replace', index, before: pin, after: { ...pin, ordinal } })
  })
  return patches
}

/**
 * يغيّر نقطة بداية الترقيم.
 *
 * فرقُ الجذر **مع** فروق كل دبّوس — لأن تغيير البداية يُزيح الجميع. ولو
 * اكتُفي بفرق الجذر لبقيت الأرقام المخزَّنة على حالها ولانفصل المعروض عن
 * المحفوظ.
 */
export function setPinStart(scene: Scene, start: number): readonly Patch[] {
  const before = scene.meta.pinStart
  if (before === start) return []

  const root: Patch = { op: 'root', patch: { field: 'pinStart', before, after: start } }
  const ordered = pinsByOrdinal(scene)
  const patches: Patch[] = [root]

  ordered.forEach((pin, i) => {
    const ordinal = start + i
    if (pin.ordinal === ordinal) return
    const index = indexOf(scene, pin.id)
    if (index < 0) return
    patches.push({ op: 'replace', index, before: pin, after: { ...pin, ordinal } })
  })

  return patches
}

/**
 * يفكّ رابطًا من الطرفين.
 *
 * الربط ثنائي الاتجاه (`PinNode.noteId` و`NoteNode.pinId`)، فحذف أحد
 * الطرفين يترك مرجعًا معلَّقًا في الآخر ما لم يُفَكّ صراحةً. ومرجعٌ معلَّق
 * لا يظهر عطلًا: تظهر ملاحظةٌ تدّعي انتماءها لدبّوس غير موجود.
 */
export function unlinkPatchesFor(scene: Scene, removedIds: ReadonlySet<NodeId>): readonly Patch[] {
  const patches: Patch[] = []

  scene.nodes.forEach((node, index) => {
    if (removedIds.has(node.id)) return

    if (node.kind === 'pin' && node.noteId && removedIds.has(node.noteId)) {
      const after: PinNode = { ...node, noteId: null }
      patches.push({ op: 'replace', index, before: node, after })
      return
    }
    if (node.kind === 'note' && node.pinId && removedIds.has(node.pinId)) {
      const after: NoteNode = { ...node, pinId: null }
      patches.push({ op: 'replace', index, before: node, after })
    }
  })

  return patches
}

/** الملاحظة المربوطة بدبّوس، أو `null`. */
export function noteOf(scene: Scene, pin: PinNode): NoteNode | null {
  if (!pin.noteId) return null
  const found = scene.nodes.find((n): n is NoteNode => n.kind === 'note' && n.id === pin.noteId)
  return found ?? null
}

/** الدبّوس المربوط بملاحظة، أو `null`. */
export function pinOf(scene: Scene, note: NoteNode): PinNode | null {
  if (!note.pinId) return null
  const found = scene.nodes.find((n): n is PinNode => n.kind === 'pin' && n.id === note.pinId)
  return found ?? null
}

/** هل هذه العقدة دبّوس؟ حارس نوع للاستعمال في المرشِّحات. */
export const isPin = (n: SceneNode): n is PinNode => n.kind === 'pin'
