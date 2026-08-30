/**
 * صفحة المكتبة — الحاوية الجذر.
 *
 * هذه الدفعة تُضيف لوحة المشاريع (§10.2) فوق ما بُني في الدفعتين الرابعة
 * والخامسة. واجهة الوسوم والتبويبات الأربعة الأخرى دفعاتٌ لاحقة.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import { DEFAULT_LIBRARY_FILTERS, type LibraryFilters } from '@/modules/library/filters'
import {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  type LibrarySortKey,
  type SortDirection,
} from '@/modules/library/sort'
import { send } from '@/shared/messaging'
import { captures } from '@/shared/storage/repository'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { EmptyState } from '@/ui/components/EmptyState/EmptyState'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'

import {
  loadCounts,
  loadProjectNames,
  loadTab,
  purgeExpiredOnOpen,
  resolveThumbnailUrl,
} from './context'
import styles from './Library.module.css'
import { Grid } from './parts/Grid'
import { ProjectsPanel } from './parts/ProjectsPanel'
import { SelectionBar } from './parts/SelectionBar'
import { Toolbar } from './parts/Toolbar'
import {
  createProject,
  deleteProject,
  loadProjects,
  moveCapturesToProject,
  renameProject,
  setProjectColor,
} from './projects'
import { browserThumbnailEncoder } from './thumbnail-encoder'

import type { CaptureRecord, ProjectRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

type LoadState = 'loading' | 'ready' | 'error'

const SKELETON_CARD_COUNT = 8

export function Library(): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [records, setRecords] = useState<CaptureRecord[]>([])
  const [libraryHasAny, setLibraryHasAny] = useState(true)
  const [projectNames, setProjectNames] = useState<Record<string, string>>({})
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string | null>>(new Map())
  const pendingThumbs = useRef<Set<string>>(new Set())

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<LibrarySortKey>(DEFAULT_SORT_KEY)
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION)
  const [favoriteOnly, setFavoriteOnly] = useState(false)

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  /** تطهير المهملات المنتهية — مرّة واحدة عند فتح الصفحة، لا عند كل بحث أو ترتيب. */
  useEffect(() => {
    void purgeExpiredOnOpen(Date.now())
  }, [])

  const filters: LibraryFilters = favoriteOnly
    ? { ...DEFAULT_LIBRARY_FILTERS, favorite: true }
    : DEFAULT_LIBRARY_FILTERS

  const reload = useCallback(async () => {
    setLoadState('loading')
    const names = await loadProjectNames()
    setProjectNames(names)

    const [result, counts] = await Promise.all([
      loadTab({
        tab: 'captures',
        searchQuery,
        captureQuery: { filters, sortKey, sortDirection },
        projectNameLookup: (id) => names[id] ?? '',
      }),
      loadCounts(),
    ])

    if (result.ok) {
      setRecords(result.value as CaptureRecord[])
      setLibraryHasAny(counts.ok ? counts.value.total > 0 : true)
      setLoadState('ready')
    } else {
      setLoadState('error')
    }
    // `filters` ليست في مصفوفة الاعتماديات لأنها مُشتقَّة من `favoriteOnly` في
    // كل عرض بلا حالة خاصّة بها — اعتماديّتها الحقيقية `favoriteOnly` نفسها،
    // وهي مذكورة.
  }, [searchQuery, sortKey, sortDirection, favoriteOnly])

  useEffect(() => {
    void reload()
  }, [reload])

  const reloadProjects = useCallback(async () => {
    const result = await loadProjects()
    if (result.ok) setProjects(result.value)
  }, [])

  useEffect(() => {
    void reloadProjects()
  }, [reloadProjects])

  const onNeedThumbnail = useCallback((id: string) => {
    if (pendingThumbs.current.has(id)) return
    pendingThumbs.current.add(id)
    void resolveThumbnailUrl(id, browserThumbnailEncoder).then((url) => {
      setThumbnailUrls((prev) => new Map(prev).set(id, url))
    })
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelection(new Set()), [])

  const openCapture = useCallback((id: string) => {
    void send('page/open', { page: 'editor', params: { capture: id } })
  }, [])

  /**
   * تُطبَّق تسلسليًّا لا بالتوازي: العدد المتوقَّع للتحديد عشراتٌ لا آلاف،
   * ومعاملة واحدة لكل سجلّ أبسط من إدارة فشل جزئي وسط دفعة متوازية.
   */
  const applyToSelection = useCallback(
    async (mutate: (record: CaptureRecord) => CaptureRecord) => {
      for (const id of selection) {
        const found = await captures.get(id)
        if (found.ok) await captures.put(mutate(found.value))
      }
      clearSelection()
      await reload()
    },
    [selection, clearSelection, reload],
  )

  const onFavoriteSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, favorite: true })),
    [applyToSelection],
  )
  const onArchiveSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, archived: true })),
    [applyToSelection],
  )
  const onTrashSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, trashedAt: Date.now() })),
    [applyToSelection],
  )

  // ── المشاريع ──────────────────────────────────────────────────
  const onCreateProject = useCallback(
    (name: string, color: string) => {
      void createProject(name, color).then(() => reloadProjects())
    },
    [reloadProjects],
  )
  const onRenameProject = useCallback(
    (id: string, name: string) => {
      void renameProject(id, name).then(() => reloadProjects())
    },
    [reloadProjects],
  )
  const onSetProjectColor = useCallback(
    (id: string, color: string) => {
      void setProjectColor(id, color).then(() => reloadProjects())
    },
    [reloadProjects],
  )
  /** حذف مشروع يُعيد تعيين مشروع اللقطات المعروضة — الشبكة تُحدَّث معه لا اللوحة وحدها. */
  const onDeleteProject = useCallback(
    (id: string, moveContentTo: string | null) => {
      void deleteProject(id, moveContentTo).then(() => {
        void reloadProjects()
        void reload()
      })
    },
    [reloadProjects, reload],
  )
  /** «نقل عناصر» في §10.2 — يُطبَّق على التحديد الحالي من الشبكة الرئيسية. */
  const onMoveSelectionToProject = useCallback(
    (projectId: string | null) => {
      void moveCapturesToProject([...selection], projectId).then(() => {
        clearSelection()
        void reload()
      })
    },
    [selection, clearSelection, reload],
  )

  return (
    <div class={styles.page}>
      {!online ? (
        <Banner tone="warning">
          أنت غير متصل — التغييرات تُحفَظ محليًا وتُطابَق تلقائيًا عند العودة.
        </Banner>
      ) : null}

      <div class={styles.toolbarRow}>
        <Toolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
          favoriteOnly={favoriteOnly}
          onFavoriteOnlyChange={setFavoriteOnly}
        />
        <IconButton
          icon="folder"
          aria-label={projectsPanelOpen ? 'إغلاق لوحة المشاريع' : 'فتح لوحة المشاريع'}
          variant={projectsPanelOpen ? 'solid' : 'ghost'}
          onClick={() => setProjectsPanelOpen((v) => !v)}
        />
      </div>

      {selection.size > 0 ? (
        <SelectionBar
          count={selection.size}
          projects={projects}
          onFavorite={onFavoriteSelection}
          onArchive={onArchiveSelection}
          onTrash={onTrashSelection}
          onMoveToProject={onMoveSelectionToProject}
          onClear={clearSelection}
        />
      ) : null}

      <div class={styles.body}>
        {projectsPanelOpen ? (
          <ProjectsPanel
            projects={projects}
            onCreate={onCreateProject}
            onRename={onRenameProject}
            onSetColor={onSetProjectColor}
            onDelete={onDeleteProject}
            onClose={() => setProjectsPanelOpen(false)}
          />
        ) : null}

        <div class={styles.main}>
          {loadState === 'loading' ? (
            <div class={styles.skeletonGrid} aria-busy="true" aria-label="جارٍ تحميل المكتبة">
              {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
                <Skeleton key={i} kind="card" />
              ))}
            </div>
          ) : loadState === 'error' ? (
            <div class={styles.errorState} role="alert">
              <p>تعذّر تحميل المكتبة.</p>
              <Button variant="secondary" onClick={() => void reload()}>
                أعد المحاولة
              </Button>
            </div>
          ) : records.length === 0 ? (
            // لا لقطة في المكتبة أصلًا تختلف عن لا نتيجة لهذا البحث/التصفية —
            // الأولى تدعو للالتقاط، والثانية لتعديل الاستعلام؛ رسالتان مختلفتان.
            <EmptyState kind={libraryHasAny ? 'no-results' : 'no-captures'} />
          ) : (
            <Grid
              records={records}
              thumbnailUrls={thumbnailUrls}
              onNeedThumbnail={onNeedThumbnail}
              projectNames={projectNames}
              selection={selection}
              onToggleSelect={toggleSelect}
              onOpen={openCapture}
            />
          )}
        </div>
      </div>
    </div>
  )
}
