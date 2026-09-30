/**
 * عروض المشكلات في المكتبة: القائمة (`?view=issues`) وتفصيل المشكلة (`?issue=<id>`) تحت قشرة واحدة.
 *
 * مرشّحات القائمة تُحفَظ هنا لا في القائمة: فتح مشكلة والرجوع إلى القائمة يعيدانها كما تُركت، بدل أن يبدأ
 * المستخدم من «كل المشاريع» بعد كل تفصيل. والعرض يتبدّل في مكانه عبر `onNavigate` (`Library.switchView`).
 */

import { useState } from 'preact/hooks'

import { DEFAULT_ISSUE_FILTERS, type IssueFilters } from '../issues'

import { IssueDetail } from './IssueDetail'
import { IssuesView } from './IssuesView'

import type { LibraryView } from '../../shell/library-views'
import type { ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

export interface IssuesPageProps {
  view: Extract<LibraryView, { kind: 'issues' | 'issue' }>
  projects: readonly ProjectRecord[]
  onNavigate: (view: LibraryView) => void
}

export function IssuesPage({ view, projects, onNavigate }: IssuesPageProps): JSX.Element {
  const [filters, setFilters] = useState<IssueFilters>(DEFAULT_ISSUE_FILTERS)
  return view.kind === 'issue' ? (
    <IssueDetail
      key={view.id}
      id={view.id}
      projects={projects}
      onBack={() => onNavigate({ kind: 'issues' })}
    />
  ) : (
    <IssuesView
      filters={filters}
      onFiltersChange={setFilters}
      projects={projects}
      onOpen={(id) => onNavigate({ kind: 'issue', id })}
    />
  )
}
