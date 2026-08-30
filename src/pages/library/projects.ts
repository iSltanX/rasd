/**
 * إدارة المشاريع (§10.2) — منطق بلا JSX، منفصل عن `ProjectsPanel.tsx` عمدًا،
 * نفس نمط `context.ts` المجاور.
 *
 * **حذف مشروع لا يحذف محتواه أبدًا — ينقله**: خمسة مخازن تشير إليه
 * بـ`projectId` (`captures` و`colors` و`palettes` و`references` و`guides`)،
 * وحذفٌ تتاليًّا (cascade) كان يعني أن ضغطة واحدة تمحو مئات اللقطات بلا
 * تراجع مقصود لهذا الفعل بعينه — تراجعٌ من هذا الحجم يحتاج تأكيدًا صريحًا
 * لا حذفًا صامتًا. فالمشروع نفسه يزول، ومحتواه يُعاد تعيينه إلى مشروع آخر
 * يختاره المستخدم أو إلى «بلا مشروع» (`null`).
 */

import { errText, ok, type Result } from '@/shared/result'
import {
  captures,
  colors,
  guides,
  palettes,
  projects,
  references,
} from '@/shared/storage/repository'

import type { ProjectRecord } from '@/shared/storage/schema'

export async function loadProjects(): Promise<Result<ProjectRecord[]>> {
  return projects.getAll()
}

export async function createProject(
  name: string,
  color: string,
  now = Date.now(),
): Promise<Result<ProjectRecord>> {
  const record: ProjectRecord = {
    id: crypto.randomUUID(),
    name,
    color,
    createdAt: now,
    updatedAt: now,
  }
  const written = await projects.put(record)
  if (!written.ok) return written
  return ok(record)
}

export async function renameProject(
  id: string,
  name: string,
  now = Date.now(),
): Promise<Result<null>> {
  const found = await projects.get(id)
  if (!found.ok) return found
  const written = await projects.put({ ...found.value, name, updatedAt: now })
  if (!written.ok) return written
  return ok(null)
}

export async function setProjectColor(
  id: string,
  color: string,
  now = Date.now(),
): Promise<Result<null>> {
  const found = await projects.get(id)
  if (!found.ok) return found
  const written = await projects.put({ ...found.value, color, updatedAt: now })
  if (!written.ok) return written
  return ok(null)
}

/** ينقل لقطات مُحدَّدة إلى مشروع (أو إلى «بلا مشروع» بتمرير `null`) — «نقل عناصر» في §10.2. */
export async function moveCapturesToProject(
  ids: readonly string[],
  projectId: string | null,
): Promise<Result<number>> {
  let moved = 0
  for (const id of ids) {
    const found = await captures.get(id)
    if (!found.ok) continue
    const written = await captures.put({ ...found.value, projectId })
    if (written.ok) moved += 1
  }
  return ok(moved)
}

/** ينقل كل ما يشير إلى `fromProjectId` في مخزن واحد إلى `toProjectId` — خطوة واحدة من خمس. */
async function reassignCaptures(
  fromProjectId: string,
  toProjectId: string | null,
): Promise<Result<null>> {
  const found = await captures.byIndex('projectId', fromProjectId)
  if (!found.ok) return found
  for (const record of found.value) {
    const written = await captures.put({ ...record, projectId: toProjectId })
    if (!written.ok) return written
  }
  return ok(null)
}

async function reassignColors(
  fromProjectId: string,
  toProjectId: string | null,
): Promise<Result<null>> {
  const found = await colors.byIndex('projectId', fromProjectId)
  if (!found.ok) return found
  for (const record of found.value) {
    const written = await colors.put({ ...record, projectId: toProjectId })
    if (!written.ok) return written
  }
  return ok(null)
}

async function reassignPalettes(
  fromProjectId: string,
  toProjectId: string | null,
): Promise<Result<null>> {
  const found = await palettes.byIndex('projectId', fromProjectId)
  if (!found.ok) return found
  for (const record of found.value) {
    const written = await palettes.put({ ...record, projectId: toProjectId })
    if (!written.ok) return written
  }
  return ok(null)
}

async function reassignReferences(
  fromProjectId: string,
  toProjectId: string | null,
): Promise<Result<null>> {
  const found = await references.byIndex('projectId', fromProjectId)
  if (!found.ok) return found
  for (const record of found.value) {
    const written = await references.put({ ...record, projectId: toProjectId })
    if (!written.ok) return written
  }
  return ok(null)
}

async function reassignGuides(
  fromProjectId: string,
  toProjectId: string | null,
): Promise<Result<null>> {
  const found = await guides.byIndex('projectId', fromProjectId)
  if (!found.ok) return found
  for (const record of found.value) {
    const written = await guides.put({ ...record, projectId: toProjectId })
    if (!written.ok) return written
  }
  return ok(null)
}

/**
 * يحذف مشروعًا وينقل محتواه أوّلًا — بالترتيب: كل مخزن ثم حذف سجلّ المشروع
 * نفسه أخيرًا. الترتيب مقصود: لو حُذف سجلّ المشروع أوّلًا ثم فشل نقل محتوى
 * لاحقًا، تبقى لقطات تشير إلى معرّف مشروع لم يعد له وجود — سجلّات يتيمة
 * بصمت. النقل أوّلًا يعني أن أسوأ فشل ممكن مشروعٌ لم يُحذف بعد، لا محتوًى
 * تائه.
 *
 * `toProjectId === id` (نقل مشروع إلى نفسه) يُرفَض صراحةً — لا تناقض صامت.
 */
export async function deleteProject(
  id: string,
  moveContentTo: string | null,
): Promise<Result<null>> {
  if (moveContentTo === id) {
    return errText('invalid-data', 'لا يمكن نقل محتوى مشروع إلى نفسه.')
  }

  const steps = [
    reassignCaptures,
    reassignColors,
    reassignPalettes,
    reassignReferences,
    reassignGuides,
  ]
  for (const step of steps) {
    const result = await step(id, moveContentTo)
    if (!result.ok) return result
  }

  return projects.remove(id)
}
