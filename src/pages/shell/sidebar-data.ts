/**
 * بيانات الشريط الجانبي المشترك بين صفحات الإضافة — منطق بلا JSX.
 *
 * كل عدّ **مشتقّ من السجلّات لا مخزَّن**، نمط `library/context.ts#loadCounts` نفسه: عدّاد
 * مخزَّن ينحرف عن `captures` عند أوّل كتابة تنساه. والصفحات تقرأ IndexedDB مباشرةً لأنها
 * صفحات إضافة تملك التخزين (`AGENTS.md` §4).
 */

import { ok, type Result } from '@/shared/result'
import { quotaState } from '@/shared/storage/quota'
import { captures, guides, palettes, projects, references } from '@/shared/storage/repository'

/** «الأخيرة» في الشريط: ما التُقط خلال سبعة أيام. */
export const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface SidebarProject {
  readonly id: string
  readonly name: string
  readonly count: number
}

export interface SidebarData {
  readonly all: number
  readonly favorites: number
  readonly recent: number
  readonly projects: readonly SidebarProject[]
  readonly palettes: number
  readonly references: number
  readonly guides: number
  readonly storage: { readonly usage: number | null; readonly quota: number | null }
}

/** يقرأ ما يعرضه الشريط. فشل أي مخزن يُسقط التحميل كلّه: عدّاد صفريّ كاذب أسوأ من غيابه. */
export async function loadSidebarData(now = Date.now()): Promise<Result<SidebarData>> {
  const [all, projectList, paletteList, referenceList, guideList, quota] = await Promise.all([
    captures.getAll(),
    projects.getAll(),
    palettes.getAll(),
    references.getAll(),
    guides.getAll(),
    quotaState(),
  ])
  if (!all.ok) return all
  if (!projectList.ok) return projectList
  if (!paletteList.ok) return paletteList
  if (!referenceList.ok) return referenceList
  if (!guideList.ok) return guideList

  const live = all.value.filter((r) => r.trashedAt === null && !r.archived)
  const perProject = new Map<string, number>()
  for (const record of live) {
    if (record.projectId)
      perProject.set(record.projectId, (perProject.get(record.projectId) ?? 0) + 1)
  }

  return ok({
    all: live.length,
    favorites: live.filter((r) => r.favorite).length,
    recent: live.filter((r) => now - r.createdAt <= RECENT_WINDOW_MS).length,
    projects: [...projectList.value]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((p) => ({ id: p.id, name: p.name, count: perProject.get(p.id) ?? 0 })),
    palettes: paletteList.value.length,
    references: referenceList.value.length,
    guides: guideList.value.length,
    storage:
      quota.quotaBytes > 0
        ? { usage: quota.usageBytes, quota: quota.quotaBytes }
        : { usage: null, quota: null },
  })
}
