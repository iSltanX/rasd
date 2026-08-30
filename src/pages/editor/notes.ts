/**
 * ترتيب الملاحظات وتصنيفها — منطق القائمة الجانبية بلا JSX.
 *
 * **الترتيب برقم الدبّوس لا بموضع العقدة في المصفوفة.** موضع العقدة هو
 * ترتيب **الطبقات**، ورفعُ ملاحظةٍ فوق سهم في قائمة الطبقات كان سيعيد ترتيب
 * القائمة الجانبية معها — محوران مستقلّان بنصّ الخطّة يُخلَطان بلا رسالة.
 *
 * وملاحظةٌ بلا دبّوس تُذيَّل ولا تُخفى: هي عملُ المستخدم، وإخفاؤها لأنها بلا
 * رقم يجعلها تختفي عند فكّ الارتباط ولا تعود إلّا بحظّ.
 */

import { NOTE_TAGS } from '@/modules/editor/scene'

import type { NoteNode, NoteTag, PinNode, Scene } from '@/modules/editor/scene'

export interface NoteEntry {
  readonly note: NoteNode
  readonly pin: PinNode | null
}

/** ما يصفه كل تصنيف — يظهر عنوانًا (`title`) على الزرّ. */
export const NOTE_TAG_HINT: Readonly<Record<NoteTag, string>> = {
  type: 'حجم الخطّ ووزنه وارتفاع السطر',
  spacing: 'الحشوة والهوامش والفجوات',
  token: 'اسم توكن أو متغيّر أو لون النظام',
}

export const NOTE_TAG_ORDER: readonly NoteTag[] = NOTE_TAGS

/** الملاحظات مرتّبةً: المربوطة برقم دبّوسها، ثمّ الحرّة بترتيب الطبقات. */
export function orderedNotes(scene: Scene): readonly NoteEntry[] {
  const pins = new Map<string, PinNode>()
  for (const n of scene.nodes) if (n.kind === 'pin' && n.noteId) pins.set(n.noteId, n)

  const entries: NoteEntry[] = []
  for (const n of scene.nodes) {
    if (n.kind !== 'note') continue
    entries.push({ note: n, pin: pins.get(n.id) ?? null })
  }

  return entries.sort((a, b) => {
    if (a.pin && b.pin) return a.pin.ordinal - b.pin.ordinal
    if (a.pin) return -1
    if (b.pin) return 1
    return 0
  })
}

/** يرشِّح بالتصنيف. `null` يعني «الكلّ». */
export function filterByTag(
  entries: readonly NoteEntry[],
  tag: NoteTag | null,
): readonly NoteEntry[] {
  return tag === null ? entries : entries.filter((e) => e.note.tag === tag)
}

/** عدد الملاحظات في كل تصنيف — يُعرض على أزرار الترشيح. */
export function countByTag(entries: readonly NoteEntry[]): Readonly<Record<NoteTag, number>> {
  const counts = { type: 0, spacing: 0, token: 0 }
  for (const e of entries) if (e.note.tag) counts[e.note.tag] += 1
  return counts
}

/** السطر الأوّل من متن الملاحظة — معاينةٌ حين لا عنوان لها. */
export function notePreview(note: NoteNode, max = 40): string {
  const source = note.title.trim() || note.body.trim()
  if (source === '') return 'ملاحظة فارغة'
  const line = source.split('\n', 1)[0] ?? ''
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`
}
