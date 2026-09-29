/**
 * نظرة المشاريع العامّة (`projects / overview`، `72:2`) — ما تعرضه بطاقة كل مشروع، مشتقًّا
 * من السجلّات لا مخزَّنًا، على نمط `shell/sidebar-data.ts`.
 *
 * **ما في الإطار ولا يُحسب هنا لأنه لا حقل له:** حالة المشروع («نشط» · «قيد المراجعة» ·
 * «متوقّف»)، وموقعه، و«ملاحظات مفتوحة». والبطاقة تعرض ما يُقاس: اللقطات واللوحات والألوان
 * الحيّة، وآخر نشاط، وأحدث خمس لقطات.
 */

import { ok, type Result } from '@/shared/result'
import { captures, colors, palettes, projects } from '@/shared/storage/repository'

/** أحدث اللقطات المعروضة مصغّراتها على البطاقة — خمس كما في الإطار. */
export const OVERVIEW_THUMBS = 5

export interface ProjectOverview {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly captures: number
  readonly palettes: number
  readonly colors: number
  /** آخر ما جرى في المشروع: أحدث لقطة حيّة، أو تعديل المشروع نفسه إن كان أحدث. */
  readonly updatedAt: number
  /** معرّفات أحدث اللقطات الحيّة، الأحدث أوّلًا. */
  readonly recent: readonly string[]
}

/** يقرأ ويشتقّ. فشل أي مخزن يُسقط التحميل كلّه: عدٌّ صفريّ كاذب أسوأ من غيابه. */
export async function loadProjectOverview(): Promise<Result<ProjectOverview[]>> {
  const [projectList, captureList, paletteList, colorList] = await Promise.all([
    projects.getAll(),
    captures.getAll(),
    palettes.getAll(),
    colors.getAll(),
  ])
  if (!projectList.ok) return projectList
  if (!captureList.ok) return captureList
  if (!paletteList.ok) return paletteList
  if (!colorList.ok) return colorList

  const live = captureList.value
    .filter((r) => r.trashedAt === null && !r.archived && r.projectId !== null)
    .sort((a, b) => b.createdAt - a.createdAt)

  return ok(
    [...projectList.value]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((p) => {
        const own = live.filter((r) => r.projectId === p.id)
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          captures: own.length,
          palettes: paletteList.value.filter((r) => r.projectId === p.id).length,
          colors: colorList.value.filter((r) => r.projectId === p.id).length,
          updatedAt: Math.max(p.updatedAt, own[0]?.createdAt ?? 0),
          recent: own.slice(0, OVERVIEW_THUMBS).map((r) => r.id),
        }
      }),
  )
}
