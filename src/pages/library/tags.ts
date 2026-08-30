/**
 * إدارة الوسوم (§10.3) — منطق بلا JSX، منفصل عن `TagsPanel.tsx` عمدًا،
 * نفس نمط `projects.ts` المجاور.
 *
 * **العدّاد في `tags` مخزنٌ لا مُشتقّ**: `TagRecord.count` لا يُعاد حسابه من
 * مسح `captures` كاملةً عند كل عرض (فهرس بحث المرحلة نفسها يفعل هذا،
 * والعدّاد غرضه تفادي ذلك تحديدًا في لوحة الوسوم). فكل إضافة أو إزالة
 * **تُحدِّث العدّاد في نفس الخطوة** — لا معاملة واحدة عبر مخزنين (`captures`
 * و`tags`) لأن `idb` لا يمنح هذا مجّانًا هنا وتكلفة معاملة موسَّعة لا
 * تستحقّها عملية بهذا الحجم؛ خطر تعليقٍ مؤقّت بين الكتابتين مقبول لأن
 * أسوأ أثره عدّاد بفارق واحد يُصحَّح بأوّل إضافة أو إزالة تالية — لا تلف
 * بيانات، ولا سجلّ يتيم.
 */

import { ok, type Result } from '@/shared/result'
import { captures, tags } from '@/shared/storage/repository'

import type { TagRecord } from '@/shared/storage/schema'

export async function loadTagsWithCounts(): Promise<Result<TagRecord[]>> {
  return tags.getAll()
}

/** أكثر الوسوم استعمالًا — «مقترحة» في §10.3. */
export async function suggestTags(limit = 8): Promise<Result<TagRecord[]>> {
  const all = await tags.getAll()
  if (!all.ok) return all
  return ok([...all.value].sort((a, b) => b.count - a.count).slice(0, limit))
}

async function incrementTagCount(name: string): Promise<Result<null>> {
  const found = await tags.get(name)
  if (found.ok) {
    const written = await tags.put({ name, count: found.value.count + 1 })
    if (!written.ok) return written
    return ok(null)
  }
  if (found.error.code !== 'not-found') return found
  const written = await tags.put({ name, count: 1 })
  if (!written.ok) return written
  return ok(null)
}

async function decrementTagCount(name: string): Promise<Result<null>> {
  const found = await tags.get(name)
  if (!found.ok) return found.error.code === 'not-found' ? ok(null) : found
  if (found.value.count <= 1) {
    const removed = await tags.remove(name)
    if (!removed.ok) return removed
    return ok(null)
  }
  const written = await tags.put({ name, count: found.value.count - 1 })
  if (!written.ok) return written
  return ok(null)
}

/**
 * يضيف وسمًا إلى كل لقطة في `ids` لا تحمله أصلًا — «تعدّد لكل عنصر» في §10.3.
 * لقطة تحمل الوسم مسبقًا **لا تُحتسَب مرّتين** في العدّاد.
 */
export async function addTagToCaptures(
  ids: readonly string[],
  name: string,
): Promise<Result<number>> {
  const trimmed = name.trim()
  if (!trimmed) return ok(0)

  let added = 0
  for (const id of ids) {
    const found = await captures.get(id)
    if (!found.ok) continue
    if (found.value.tags.includes(trimmed)) continue

    const written = await captures.put({ ...found.value, tags: [...found.value.tags, trimmed] })
    if (!written.ok) return written
    const counted = await incrementTagCount(trimmed)
    if (!counted.ok) return counted
    added += 1
  }
  return ok(added)
}

/** يزيل وسمًا من لقطة واحدة. */
export async function removeTagFromCapture(id: string, name: string): Promise<Result<null>> {
  const found = await captures.get(id)
  if (!found.ok) return found
  if (!found.value.tags.includes(name)) return ok(null)

  const written = await captures.put({
    ...found.value,
    tags: found.value.tags.filter((t) => t !== name),
  })
  if (!written.ok) return written
  return decrementTagCount(name)
}
