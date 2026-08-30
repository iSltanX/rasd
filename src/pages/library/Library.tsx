/**
 * صفحة المكتبة — الحاوية الجذر.
 *
 * هذه الدفعة (السابعة) تُفعِّل التبويبات الأربعة الأخرى (§16): المراجع
 * والألوان واللوحات وأدلة الخطوات — فوق لوحة المشاريع (الدفعة السادسة)
 * وشريط الأدوات (الخامسة) والشبكة الافتراضية (الرابعة). واجهة الوسوم
 * وحالتا الأرشيف/المهملات المخصَّصتان ومؤشِّر الحصة دفعاتٌ لاحقة.
 *
 * **التحديد المتعدّد يبقى للقطات وحدها وظيفيًا**: البطاقات الأربعة الجديدة
 * تدعم مربّع اختيار بنيويًا (نفس مكوّن `Checkbox`)، لكن لا إجراء جماعي
 * (مفضّلة/أرشفة/مهملات/نقل مشروع) معرَّف لها بعد — تلك عمليات على
 * `CaptureRecord` تحديدًا. فشريط تحديدها هنا **عدّاد وإلغاء فقط**، لا
 * إجراءاتٌ وهمية تعد بأثر لا يقع.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { DEFAULT_LIBRARY_FILTERS, type LibraryFilters } from '@/modules/library/filters'
import { type LibraryTab } from '@/modules/library/search'
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
import { EmptyState, type EmptyStateKind } from '@/ui/components/EmptyState/EmptyState'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'
import { Tabs, type TabItem } from '@/ui/components/Tabs/Tabs'

import {
  loadCounts,
  loadProjectNames,
  loadTab,
  purgeExpiredOnOpen,
  resolveThumbnailUrl,
  type LibraryRecord,
} from './context'
import styles from './Library.module.css'
import { ColorCard } from './parts/ColorCard'
import { Grid } from './parts/Grid'
import { GuideCard } from './parts/GuideCard'
import { PaletteCard } from './parts/PaletteCard'
import { ProjectsPanel } from './parts/ProjectsPanel'
import { ReferenceCard } from './parts/ReferenceCard'
import { SelectionBar } from './parts/SelectionBar'
import { SimpleGrid } from './parts/SimpleGrid'
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

import type {
  CaptureRecord,
  ColorRecord,
  GuideRecord,
  PaletteRecord,
  ProjectRecord,
  ReferenceRecord,
} from '@/shared/storage/schema'
import type { JSX } from 'preact'

type LoadState = 'loading' | 'ready' | 'error'

const SKELETON_CARD_COUNT = 8

/** ترتيب التبويبات نفسه في نصّ المرحلة 18 (§16) حرفيًا. */
const TAB_ITEMS: readonly TabItem[] = [
  { value: 'captures', label: 'اللقطات' },
  { value: 'references', label: 'المراجع' },
  { value: 'colors', label: 'الألوان' },
  { value: 'palettes', label: 'اللوحات' },
  { value: 'guides', label: 'أدلة الخطوات' },
]
const TAB_VALUES: readonly LibraryTab[] = TAB_ITEMS.map((t) => t.value as LibraryTab)

/** حالة الفراغ الصحيحة لكل تبويب حين لا نتيجة — بمعزل عن تمييز «فارغ أصلًا» (اللقطات وحدها تملكه). */
const EMPTY_KIND_FOR_TAB: Record<LibraryTab, EmptyStateKind> = {
  captures: 'no-captures',
  references: 'no-reference',
  colors: 'no-colors',
  palettes: 'no-palette',
  guides: 'no-guides',
}

export function Library(): JSX.Element {
  const [activeTab, setActiveTab] = useState<LibraryTab>('captures')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [records, setRecords] = useState<LibraryRecord[]>([])
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

  /** تطهير المهملات المنتهية — مرّة واحدة عند فتح الصفحة، لا عند كل بحث أو ترتيب أو تبويب. */
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
        tab: activeTab,
        searchQuery,
        captureQuery: { filters, sortKey, sortDirection },
        projectNameLookup: (id) => names[id] ?? '',
      }),
      loadCounts(),
    ])

    if (result.ok) {
      setRecords(result.value)
      setLibraryHasAny(counts.ok ? counts.value.total > 0 : true)
      setLoadState('ready')
    } else {
      setLoadState('error')
    }
    // `filters` ليست في مصفوفة الاعتماديات لأنها مُشتقَّة من `favoriteOnly` في
    // كل عرض بلا حالة خاصّة بها — اعتماديّتها الحقيقية `favoriteOnly` نفسها،
    // وهي مذكورة.
  }, [activeTab, searchQuery, sortKey, sortDirection, favoriteOnly])

  useEffect(() => {
    void reload()
  }, [reload])

  /** تبديل التبويب يُفرِغ التحديد — تحديدٌ من تبويب لا معنى لبقائه في آخر. */
  const switchTab = useCallback((index: number) => {
    const tab = TAB_VALUES[index]
    if (!tab) return
    setActiveTab(tab)
    setSelection(new Set())
  }, [])

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

  /**
   * وجهة «فتح» تختلف بمعنى حقيقي لا واحد مصطنع لكل الأنواع:
   * اللقطة تُفتَح في المحرر (وجهة تحرير فعلية). اللون **يُنسَخ** — أقرب فعل
   * لما يفعله المستخدم بلون محفوظ فعلًا. اللوحة والمرجع والدليل بلا وجهة
   * مبنيّة بعد (تحتاج مقارنة/تصدير من مراحل لاحقة) — لا نافذة وهمية تفتح
   * على لا شيء.
   */
  const openCapture = useCallback((id: string) => {
    void send('page/open', { page: 'editor', params: { capture: id } })
  }, [])

  const openColor = useCallback(
    (id: string) => {
      const record = (records as ColorRecord[]).find((r) => r.id === id)
      if (record) void navigator.clipboard?.writeText(record.hex).catch(() => undefined)
    },
    [records],
  )

  const noopOpen = useCallback(() => undefined, [])

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
  const onMoveSelectionToProject = useCallback(
    (projectId: string | null) => {
      void moveCapturesToProject([...selection], projectId).then(() => {
        clearSelection()
        void reload()
      })
    },
    [selection, clearSelection, reload],
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
  const onDeleteProject = useCallback(
    (id: string, moveContentTo: string | null) => {
      void deleteProject(id, moveContentTo).then(() => {
        void reloadProjects()
        void reload()
      })
    },
    [reloadProjects, reload],
  )

  const tabIndex = useMemo(() => Math.max(0, TAB_VALUES.indexOf(activeTab)), [activeTab])

  return (
    <div class={styles.page}>
      {!online ? (
        <Banner tone="warning">
          أنت غير متصل — التغييرات تُحفَظ محليًا وتُطابَق تلقائيًا عند العودة.
        </Banner>
      ) : null}

      <Tabs items={TAB_ITEMS} selected={tabIndex} onChange={switchTab} />

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
          showSortAndFilter={activeTab === 'captures'}
        />
        <IconButton
          icon="folder"
          aria-label={projectsPanelOpen ? 'إغلاق لوحة المشاريع' : 'فتح لوحة المشاريع'}
          variant={projectsPanelOpen ? 'solid' : 'ghost'}
          onClick={() => setProjectsPanelOpen((v) => !v)}
        />
      </div>

      {selection.size > 0 && activeTab === 'captures' ? (
        <SelectionBar
          count={selection.size}
          projects={projects}
          onFavorite={onFavoriteSelection}
          onArchive={onArchiveSelection}
          onTrash={onTrashSelection}
          onMoveToProject={onMoveSelectionToProject}
          onClear={clearSelection}
        />
      ) : selection.size > 0 ? (
        <div class={styles.plainSelectionBar} role="toolbar" aria-label="إجراءات التحديد">
          <span>{selection.size} محدَّدة</span>
          <Button variant="ghost" size="s" onClick={clearSelection}>
            إلغاء التحديد
          </Button>
        </div>
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
            // تبويب اللقطات وحده يميِّز «لا لقطة أصلًا» عن «لا نتيجة لهذا
            // البحث» (loadCounts) — التبويبات الأربعة الأخرى ليس لها بعد
            // عدّاد غير مصفًّى مماثل، فتُعرض حالة فراغها الثابتة دومًا؛
            // فجوة تغطية مُعلَنة لا مسكوت عنها.
            <EmptyState
              kind={
                activeTab === 'captures' && libraryHasAny
                  ? 'no-results'
                  : EMPTY_KIND_FOR_TAB[activeTab]
              }
            />
          ) : activeTab === 'captures' ? (
            <Grid
              records={records as CaptureRecord[]}
              thumbnailUrls={thumbnailUrls}
              onNeedThumbnail={onNeedThumbnail}
              projectNames={projectNames}
              selection={selection}
              onToggleSelect={toggleSelect}
              onOpen={openCapture}
            />
          ) : activeTab === 'colors' ? (
            <SimpleGrid
              records={records as ColorRecord[]}
              selection={selection}
              onToggleSelect={toggleSelect}
              onOpen={openColor}
              CardComponent={ColorCard}
              aria-label="الألوان المحفوظة"
            />
          ) : activeTab === 'palettes' ? (
            <SimpleGrid
              records={records as PaletteRecord[]}
              selection={selection}
              onToggleSelect={toggleSelect}
              onOpen={noopOpen}
              CardComponent={PaletteCard}
              aria-label="لوحات الألوان"
            />
          ) : activeTab === 'references' ? (
            <SimpleGrid
              records={records as ReferenceRecord[]}
              selection={selection}
              onToggleSelect={toggleSelect}
              onOpen={noopOpen}
              CardComponent={ReferenceCard}
              aria-label="المراجع المحفوظة"
            />
          ) : (
            <SimpleGrid
              records={records as GuideRecord[]}
              selection={selection}
              onToggleSelect={toggleSelect}
              onOpen={noopOpen}
              CardComponent={GuideCard}
              aria-label="أدلّة الخطوات"
            />
          )}
        </div>
      </div>
    </div>
  )
}
