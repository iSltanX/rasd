/**
 * تحميل بيانات المكتبة — منطق بلا JSX، منفصل عن `Library.tsx` عمدًا.
 *
 * نفس نمط `popup/context.ts` و`editor/context.ts`: يُختبَر بقاعدة بيانات
 * وهمية (`fake-indexeddb`) بلا تركيب أي مكوّن، والصفحة تقرأ قاعدة البيانات
 * مباشرةً لا عبر رسالة إلى الخلفية — نفس السابقة المستقرّة منذ المرحلة 7.
 */

import { queryCaptures, type CaptureQuery } from '@/modules/library/query'
import { type LibraryTab, searchTab } from '@/modules/library/search'
import { ensureThumbnail, type ThumbnailEncoder } from '@/modules/library/thumbnail'
import { purgeExpired } from '@/modules/library/trash'
import { ok, type Result } from '@/shared/result'
import { quotaState, type QuotaState } from '@/shared/storage/quota'
import { captures, projects } from '@/shared/storage/repository'

import type { ProjectNameLookup } from '@/modules/library/sort'
import type {
  CaptureRecord,
  ColorRecord,
  GuideRecord,
  PaletteRecord,
  ReferenceRecord,
} from '@/shared/storage/schema'

export type LibraryRecord =
  CaptureRecord | ColorRecord | PaletteRecord | ReferenceRecord | GuideRecord

export interface LoadTabParams {
  readonly tab: LibraryTab
  readonly searchQuery: string
  /** يُستهلَك لتبويب اللقطات فقط — انظر تعليل `query.ts`. */
  readonly captureQuery: CaptureQuery
  readonly projectNameLookup: ProjectNameLookup
}

/** التبويبات الأربعة غير اللقطات: بحثٌ فقط، ثم الأحدث أوّلًا — لا شريط تصفية (انظر `query.ts`). */
function sortByCreatedAtDesc<T extends { createdAt: number }>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => b.createdAt - a.createdAt)
}

export async function loadTab(params: LoadTabParams): Promise<Result<LibraryRecord[]>> {
  const searched = await searchTab(params.tab, params.searchQuery)
  if (!searched.ok) return searched

  if (params.tab !== 'captures') {
    return ok(
      sortByCreatedAtDesc(
        searched.value as (ColorRecord | PaletteRecord | ReferenceRecord | GuideRecord)[],
      ),
    )
  }

  return ok(
    queryCaptures(searched.value as CaptureRecord[], params.captureQuery, params.projectNameLookup),
  )
}

/** خريطة معرِّف مشروع ← اسمه، لعرض بطاقات اللقطات والترتيب بالمشروع. */
export async function loadProjectNames(): Promise<Record<string, string>> {
  const all = await projects.getAll()
  if (!all.ok) return {}
  return Object.fromEntries(all.value.map((p) => [p.id, p.name]))
}

/**
 * يُشغَّل **مرّة واحدة** عند فتح المكتبة — لا بمؤقّت خلفي، انظر `trash.ts`.
 *
 * فشله لا يمنع فتح المكتبة: التطهير تحسينٌ لا شرط، وفتح صفحة فارغة لأن
 * التطهير تعذّر أسوأ من عدم تطهير هذه الجلسة.
 */
export async function purgeExpiredOnOpen(now: number): Promise<void> {
  await purgeExpired(now)
}

/**
 * يُرجع عنوان كائن لمصغَّرة لقطة — يولِّدها إن غابت.
 *
 * `urls` مُحقَن كنمط `editor/context.ts` — بيئة الاختبار (happy-dom) ترفض
 * ما يعود من قاعدة بيانات وهمية بوصفه `Blob` حقيقيًا لِـ`createObjectURL`.
 */
export interface ObjectUrls {
  create(blob: Blob): string
}

const browserUrls: ObjectUrls = {
  create: (blob) => URL.createObjectURL(blob),
}

export async function resolveThumbnailUrl(
  captureId: string,
  encoder: ThumbnailEncoder,
  urls: ObjectUrls = browserUrls,
): Promise<string | null> {
  const result = await ensureThumbnail(captureId, encoder)
  if (!result.ok || result.value === null) return null
  return urls.create(result.value.blob)
}

export async function loadQuota(): Promise<QuotaState> {
  return quotaState()
}

/** أعداد الحالات المصمَّمة — تُشتقّ لا تُخزَّن، فلا تنحرف عن `captures` أبدًا. */
export interface LibraryCounts {
  readonly total: number
  readonly favorites: number
  readonly archived: number
  readonly trashed: number
}

export async function loadCounts(): Promise<Result<LibraryCounts>> {
  const all = await captures.getAll()
  if (!all.ok) return all
  return ok({
    total: all.value.filter((r) => r.trashedAt === null && !r.archived).length,
    favorites: all.value.filter((r) => r.favorite && r.trashedAt === null).length,
    archived: all.value.filter((r) => r.archived && r.trashedAt === null).length,
    trashed: all.value.filter((r) => r.trashedAt !== null).length,
  })
}
