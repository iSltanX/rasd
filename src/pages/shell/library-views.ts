/**
 * عروض المكتبة التي يفتحها الشريط الجانبي، وعناوينها — مصدر واحد للمكتبة والإعدادات.
 *
 * العرض يُحمَل في `?view=` كي يفتحه رابط من صفحة أخرى، وكي يبقى بعد إعادة التحميل.
 * بيانات خالصة بلا `chrome.*`.
 */

import { PAGE_PATHS } from '@/shared/page-paths'

export type LibraryView =
  | { readonly kind: 'all' }
  | { readonly kind: 'favorites' }
  | { readonly kind: 'recent' }
  | { readonly kind: 'projects' }
  | { readonly kind: 'project'; readonly id: string }
  | { readonly kind: 'palettes' }
  | { readonly kind: 'references' }
  | { readonly kind: 'guides' }
  | { readonly kind: 'colors' }
  /** مكتبة المشكلات (قائمتها) — `?view=issues`. */
  | { readonly kind: 'issues' }
  /** تفصيل مشكلة واحدة — `?issue=<id>` كما يحمل عرض المشروع `?project=`. */
  | { readonly kind: 'issue'; readonly id: string }
  /** دليل خطوات واحد — `?guide=<id>` (`STAGES/06`). */
  | { readonly kind: 'guide'; readonly id: string }

const SIMPLE = [
  'all',
  'favorites',
  'recent',
  'projects',
  'palettes',
  'references',
  'guides',
  'colors',
  'issues',
] as const

type SimpleKind = (typeof SIMPLE)[number]

const isSimple = (value: string): value is SimpleKind =>
  (SIMPLE as readonly string[]).includes(value)

/** يقرأ العرض من سلسلة الاستعلام؛ غير المعروف يعود إلى «كل اللقطات». */
export function viewFromSearch(search: string): LibraryView {
  const params = new URLSearchParams(search)
  // التفصيل أخصّ العروض فيسبق: رابطٌ يحمل مشكلةً يفتحها ولو حمل معها مشروعًا.
  const issue = params.get('issue')
  if (issue) return { kind: 'issue', id: issue }
  const guide = params.get('guide')
  if (guide) return { kind: 'guide', id: guide }
  const project = params.get('project')
  if (project) return { kind: 'project', id: project }
  const view = params.get('view') ?? 'all'
  return isSimple(view) ? { kind: view } : { kind: 'all' }
}

/** معرّف العنصر في الشريط الجانبي. التفصيل يُضيء مجموعته («المشكلات» · «أدلة الخطوات») لا عنصرًا لا وجود له. */
export function viewId(view: LibraryView): string {
  if (view.kind === 'project') return `project:${view.id}`
  if (view.kind === 'guide') return 'guides'
  return view.kind === 'issue' ? 'issues' : view.kind
}

/** سلسلة الاستعلام وحدها — للمكتبة وهي تبدّل عرضها بلا تنقّل. */
export function searchFor(view: LibraryView): string {
  if (view.kind === 'all') return ''
  if (view.kind === 'project') return `?project=${encodeURIComponent(view.id)}`
  if (view.kind === 'issue') return `?issue=${encodeURIComponent(view.id)}`
  if (view.kind === 'guide') return `?guide=${encodeURIComponent(view.id)}`
  return `?view=${view.kind}`
}

/** رابط المكتبة على عرض بعينه، من أي صفحة إضافة. */
export function hrefFor(view: LibraryView): string {
  return `/${PAGE_PATHS.library}${searchFor(view)}`
}

export const SETTINGS_HREF = `/${PAGE_PATHS.settings}`
