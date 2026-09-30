/**
 * صفحة المكتبة — `library / grid` (`66:20`) وحالاتها، على القشرة المشتركة `AppShell`.
 *
 * **العرض من الشريط الجانبي** (`?view=` أو `?project=`): «كل اللقطات» و«المميّزة» و«الأخيرة»
 * والمشاريع مرشّحات على اللقطات، و«المجموعات» تفتح نوعها. والعرض يتبدّل في مكانه بلا تنقّل
 * (`history.replaceState`) فيبقى بعد إعادة التحميل ويفتحه رابط من صفحة أخرى.
 *
 * **ما ليس في الإطار ويبقى، وسببه:** صفّ أنواع السجلّات (`role="tab"`) ومبدّل «نشِطة/الأرشيف/
 * المهملات» (`عرض المكتبة`) وزرّا لوحتَي المشاريع والوسوم. كلّها ميزات قائمة لا موضع لها في
 * الإطار، والحارس الحاجب `verify:library` يقودها بأسمائها هذه — وملفّه مثبَّت ببصمته، فتعديله
 * يُنزله من «حاجب» (`AGENTS.md` §4). والحذف النهائي بتأكيد المتصفّح للسبب نفسه.
 *
 * **مبدِّل العرض (نشِطة/الأرشيف/المهملات) والوسوم مقصوران على اللقطات**:
 * `ARCHIVE_FILTERS`/`TRASH_FILTERS`/`tags` كلّها مبنيّة على `CaptureRecord`.
 *
 * التحديد المتعدّد للأنواع الأربعة غير اللقطات يمنحها `SimpleSelectionBar` حذفًا نهائيًا (لا
 * مهملات لها) ونقلًا إلى مشروع — عبر `DELETE_FN_FOR_TAB`/`MOVE_FN_FOR_TAB` أدناه.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import {
  ARCHIVE_FILTERS,
  DEFAULT_LIBRARY_FILTERS,
  TRASH_FILTERS,
  type LibraryFilters,
} from '@/modules/library/filters'
import { type LibraryTab } from '@/modules/library/search'
import {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  type LibrarySortKey,
  type SortDirection,
} from '@/modules/library/sort'
import { purgeCapture, TRASH_RETENTION_DAYS } from '@/modules/library/trash'
import { countText, formatHuman, type CountForms } from '@/shared/bidi/numerals'
import { send } from '@/shared/messaging'
import { captures } from '@/shared/storage/repository'
import { Button } from '@/ui/components/Button/Button'
import { EmptyState, type EmptyStateKind } from '@/ui/components/EmptyState/EmptyState'
import { ErrorMessage } from '@/ui/components/ErrorMessage/ErrorMessage'
import { SegmentedControl } from '@/ui/components/SegmentedControl/SegmentedControl'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'
import { Tab, TabRow } from '@/ui/components/Tab/Tab'
import { Toast } from '@/ui/components/Toast/Toast'

import { AppShell } from '../shell/AppShell'
import {
  searchFor,
  SETTINGS_HREF,
  viewFromSearch,
  viewId,
  type LibraryView,
} from '../shell/library-views'
import { RECENT_WINDOW_MS } from '../shell/sidebar-data'

import { deleteColors, deleteGuides, deletePalettes, deleteReferences } from './bulk-delete'
import {
  loadCounts,
  loadProjectNames,
  loadQuota,
  loadTab,
  purgeExpiredOnOpen,
  resolveThumbnailUrl,
  type LibraryRecord,
} from './context'
import { createGuide } from './guides'
import styles from './Library.module.css'
import { ColorCard } from './parts/ColorCard'
import { Grid } from './parts/Grid'
import { GuideCard } from './parts/GuideCard'
import { GuidePage } from './parts/GuidePage'
import { IssuesPage } from './parts/IssuesPage'
import { PaletteCard } from './parts/PaletteCard'
import { ProjectsOverview } from './parts/ProjectsOverview'
import { ProjectsPanel } from './parts/ProjectsPanel'
import { ReferenceCard } from './parts/ReferenceCard'
import { SelectionBar, type LibraryViewMode } from './parts/SelectionBar'
import { SimpleGrid } from './parts/SimpleGrid'
import { SimpleSelectionBar } from './parts/SimpleSelectionBar'
import { TagsPanel } from './parts/TagsPanel'
import { dateFromFor, SortSelect, Toolbar, type DateFilter, type KindFilter } from './parts/Toolbar'
import { loadProjectOverview, type ProjectOverview } from './project-overview'
import {
  createProject,
  deleteProject,
  loadProjects,
  moveCapturesToProject,
  moveColorsToProject,
  moveGuidesToProject,
  movePalettesToProject,
  moveReferencesToProject,
  renameProject,
  setProjectColor,
} from './projects'
import { addTagToCaptures, loadTagsWithCounts } from './tags'
import { browserThumbnailEncoder } from './thumbnail-encoder'

import type { Result } from '@/shared/result'
import type { QuotaState } from '@/shared/storage/quota'
import type {
  CaptureRecord,
  ColorRecord,
  GuideRecord,
  PaletteRecord,
  ProjectRecord,
  ReferenceRecord,
  TagRecord,
} from '@/shared/storage/schema'
import type { JSX } from 'preact'

type LoadState = 'loading' | 'ready' | 'error'

const SKELETON_CARD_COUNT = 8

/** أنواع السجلّات بترتيبها الثابت — صفّ الأنواع، وأسماؤه عقد `verify:library`. */
const TAB_ITEMS: readonly { value: LibraryTab; label: string }[] = [
  { value: 'captures', label: 'اللقطات' },
  { value: 'references', label: 'المراجع' },
  { value: 'colors', label: 'الألوان' },
  { value: 'palettes', label: 'اللوحات' },
  { value: 'guides', label: 'أدلة الخطوات' },
]

/** العرض الذي يفتحه كل نوع حين يُختار من صفّ الأنواع. */
const VIEW_FOR_TAB: Record<LibraryTab, LibraryView> = {
  captures: { kind: 'all' },
  references: { kind: 'references' },
  colors: { kind: 'colors' },
  palettes: { kind: 'palettes' },
  guides: { kind: 'guides' },
}

function tabForView(view: LibraryView): LibraryTab {
  switch (view.kind) {
    case 'palettes':
    case 'references':
    case 'colors':
    case 'guides':
      return view.kind
    default:
      return 'captures'
  }
}

/** حالة الفراغ الصحيحة لكل تبويب حين لا نتيجة — بمعزل عن تمييز «فارغ أصلًا» (اللقطات وحدها تملكه). */
const EMPTY_KIND_FOR_TAB: Record<LibraryTab, EmptyStateKind> = {
  captures: 'no-captures',
  references: 'no-reference',
  colors: 'no-colors',
  palettes: 'no-palette',
  guides: 'no-guides',
}

const VIEW_MODE_OPTIONS: readonly { value: LibraryViewMode; label: string }[] = [
  { value: 'live', label: 'نشِطة' },
  { value: 'archived', label: 'الأرشيف' },
  { value: 'trashed', label: 'المهملات' },
]

const TITLE: Record<Exclude<LibraryView['kind'], 'project'>, string> = {
  all: 'كل اللقطات',
  favorites: 'المميّزة',
  recent: 'الأخيرة',
  projects: 'المشاريع',
  palettes: 'اللوحات',
  references: 'المراجع',
  colors: 'الألوان',
  guides: 'أدلة الخطوات',
  issues: 'المشكلات',
  issue: 'المشكلة',
  guide: 'دليل الخطوات',
}

const SEARCH_PLACEHOLDER: Record<LibraryTab, string> = {
  captures: 'ابحث في اللقطات…',
  references: 'ابحث في المراجع…',
  colors: 'ابحث في الألوان…',
  palettes: 'ابحث في اللوحات…',
  guides: 'ابحث في الأدلّة…',
}

const PROJECT_FORMS: CountForms = {
  one: 'مشروع واحد',
  two: 'مشروعان',
  many: 'مشاريع',
  accusative: 'مشروعًا',
  singular: 'مشروع',
}

const COUNT_FORMS: Record<LibraryTab, CountForms> = {
  captures: {
    one: 'لقطة واحدة',
    two: 'لقطتان',
    many: 'لقطات',
    accusative: 'لقطة',
    singular: 'لقطة',
  },
  references: {
    one: 'مرجع واحد',
    two: 'مرجعان',
    many: 'مراجع',
    accusative: 'مرجعًا',
    singular: 'مرجع',
  },
  colors: { one: 'لون واحد', two: 'لونان', many: 'ألوان', accusative: 'لونًا', singular: 'لون' },
  palettes: {
    one: 'لوحة واحدة',
    two: 'لوحتان',
    many: 'لوحات',
    accusative: 'لوحة',
    singular: 'لوحة',
  },
  guides: {
    one: 'دليل واحد',
    two: 'دليلان',
    many: 'أدلّة',
    accusative: 'دليلًا',
    singular: 'دليل',
  },
}

/**
 * حذف ونقل-لمشروع للتبويبات الأربعة غير اللقطات — جدولا تفريع بمعرِّف
 * ثابت (نفس نمط `EMPTY_KIND_FOR_TAB` أعلاه)، بدل تفريع `if/switch` طويل
 * داخل كل معالج. `captures` غائب عمدًا: مسارها منفصل (`applyToSelection`
 * و`onPurgeSelection`) لأن لها دورة مهملات لا تملكها الأنواع الأخرى.
 */
const DELETE_FN_FOR_TAB: Partial<
  Record<LibraryTab, (ids: readonly string[]) => Promise<Result<number>>>
> = {
  references: deleteReferences,
  colors: deleteColors,
  palettes: deletePalettes,
  guides: deleteGuides,
}
const MOVE_FN_FOR_TAB: Partial<
  Record<LibraryTab, (ids: readonly string[], projectId: string | null) => Promise<Result<number>>>
> = {
  references: moveReferencesToProject,
  colors: moveColorsToProject,
  palettes: movePalettesToProject,
  guides: moveGuidesToProject,
}

/** كم يبقى إشعار النتيجة — مدّة إشعار الحفظ في الإعدادات نفسها. */
const NOTICE_MS = 4000

interface Notice {
  readonly title: string
  readonly detail?: string
  /** النجاح افتراضيّ؛ والخطر لفشل عملية يُقال ولا يُبتلع. */
  readonly tone?: 'success' | 'danger'
}

export function Library(): JSX.Element {
  const [view, setView] = useState<LibraryView>(() =>
    viewFromSearch(typeof location === 'undefined' ? '' : location.search),
  )
  const activeTab = tabForView(view)
  /** العرض الحاضر لمعالجات تُستدعى قبل أن يُعاد الرسم — نقرتان متتاليتان على صفّ الأنواع. */
  const viewRef = useRef(view)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [records, setRecords] = useState<LibraryRecord[]>([])
  const [libraryHasAny, setLibraryHasAny] = useState(true)
  const [projectNames, setProjectNames] = useState<Record<string, string>>({})
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string | null>>(new Map())
  const pendingThumbs = useRef<Set<string>>(new Set())
  /** يتغيّر بعد كل كتابة فيُعيد الشريط الجانبي عدّ ما تغيّر. */
  const [revision, setRevision] = useState(0)
  const bump = useCallback(() => setRevision((r) => r + 1), [])

  /**
   * يعكس `activeTab` **حاضرًا** لا لحظة إنشاء إغلاق — انظر `reload()` أدناه.
   * مرجعٌ لا حالة: قراءته لا تُعيد رسمًا، وهذا بالضبط ما يلزم لحارس يُفحَص
   * عند بداية `reload()` وبعد `await`ـه معًا.
   */
  const activeTabRef = useRef(activeTab)
  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  /**
   * تذكرة تسلسل لكل استدعاء `reload()` — تكمِّل `activeTabRef` لا تكرّره.
   * `activeTabRef` يكشف استدعاءً من إغلاقٍ قديم انتقل التبويب عنه تمامًا؛
   * هذه التذكرة تكشف حالة **أضيق**: استدعاءان متتاليان على **نفس** التبويب
   * (بحثٌ يُكتَب بسرعة بلا تهدئة، أو تبديل عرضين من عروض اللقطات) قد يعود
   * أقدمهما بعد أحدثهما — IndexedDB لا يضمن ترتيب استجابتين متزامنتين
   * ولو استُهدِف المخزن نفسه. مرجعٌ لا حالة، للسبب نفسه.
   */
  const reloadTicketRef = useRef(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<LibrarySortKey>(DEFAULT_SORT_KEY)
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION)
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('any')
  const [viewMode, setViewMode] = useState<LibraryViewMode>('live')
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false)
  const [overview, setOverview] = useState<ProjectOverview[] | null>(null)
  /** تعذّرت قراءة النظرة — كانت تُقرأ «لا مشاريع بعد»، فراغًا كاذبًا (`projects / error`). */
  const [overviewFailed, setOverviewFailed] = useState(false)

  const [tags, setTags] = useState<TagRecord[]>([])
  const [tagsPanelOpen, setTagsPanelOpen] = useState(false)

  const [quota, setQuota] = useState<QuotaState | null>(null)
  const [quotaNoticeDismissed, setQuotaNoticeDismissed] = useState(false)

  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const announce = useCallback((next: Notice) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(next)
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    },
    [],
  )

  /** تطهير المهملات المنتهية — مرّة واحدة عند فتح الصفحة، لا عند كل بحث أو ترتيب أو تبويب. */
  useEffect(() => {
    void purgeExpiredOnOpen(Date.now())
  }, [])

  const reload = useCallback(async () => {
    // القيمة **حين بدأ هذا الاستدعاء بعينه** — ما يُطلَب من المخزن، لا ما
    // يُعرَض الآن. والتذكرة تميّزه عن أي استدعاء آخر لاحق على التبويب نفسه.
    const requestedTab = activeTab
    const myTicket = ++reloadTicketRef.current
    // المشكلات مخزنها غير مخزن اللقطات وعرضاها يقرآنه بنفسيهما — لا لقطات تُحمَّل لهما. والتذكرة زِيدت قبل
    // هذا فيُسقَط استدعاءٌ قديم لعرض اللقطات كان في الطيران وعاد بعد الانتقال.
    if (view.kind === 'issues' || view.kind === 'issue' || view.kind === 'guide') return

    /**
     * **حارس مبكر — قبل `setLoadState('loading')` لا بعده فقط.** مراجعة
     * خصمة على هذا الحارس نفسه (يوم إضافته) كشفت أن الفحص المتأخّر وحده لا
     * يكفي: استدعاءٌ من إغلاقٍ قديم (‏`.then()` معالج حذف/نقل بطيء نُقر
     * زرّه قبل تبديل التبويب) يبدأ تنفيذه بعد أن صار `activeTab` تبويبًا
     * آخر تمامًا منذ زمن — فيكتب `setLoadState('loading')` فورًا **مفسدًا
     * حالة `ready` صحيحة عُرضت للتوّ للتبويب الحالي**، ثم يعود عند الحارس
     * المتأخّر بلا أن يُصحِّحها ثانيةً أبدًا: سكيلتون تحميل معلَّق للأبد.
     * الفحص هنا عند البداية يمنع الاستدعاء الفاسد من الكتابة أصلًا.
     */
    if (activeTabRef.current !== requestedTab) return
    setLoadState('loading')
    const names = await loadProjectNames()
    setProjectNames(names)

    const now = Date.now()
    const base =
      viewMode === 'archived'
        ? ARCHIVE_FILTERS
        : viewMode === 'trashed'
          ? TRASH_FILTERS
          : DEFAULT_LIBRARY_FILTERS
    // «الأخيرة» ومرشّح التاريخ كلاهما حدّ أدنى — يُؤخذ الأضيق منهما.
    const floors = [
      view.kind === 'recent' ? now - RECENT_WINDOW_MS : undefined,
      dateFromFor(dateFilter, now),
    ].filter((v): v is number => v !== undefined)
    const filters: LibraryFilters = {
      ...base,
      ...(view.kind === 'favorites' ? { favorite: true } : {}),
      ...(view.kind === 'project' ? { projectId: view.id } : {}),
      ...(kindFilter !== 'all' ? { kind: kindFilter } : {}),
      ...(floors.length > 0 ? { dateFrom: Math.max(...floors) } : {}),
      ...(activeTagFilter ? { tag: activeTagFilter } : {}),
    }

    const [result, counts, quotaState] = await Promise.all([
      loadTab({
        tab: requestedTab,
        searchQuery,
        captureQuery: { filters, sortKey, sortDirection },
        projectNameLookup: (id) => names[id] ?? '',
      }),
      loadCounts(),
      loadQuota(),
    ])

    /**
     * **حارس السباق المتأخّر — عطلٌ حقيقي كشفه `verify-library.mjs` في
     * كروم حقيقي لا وحدة اختبار واحدة.** استدعاءا `reload()` يتداخلان
     * زمنيًا حين يُشغَّل الثاني (تبديل تبويب، مثلًا) قبل أن يُتمّ الأوّل
     * (بعد حذف أو نقل) سلسلة `await`ـه — وIndexedDB لا يضمن ترتيب
     * استجابتين متوازيتين. فحين يفوز الاستدعاء **الأقدم** بالسباق، يكتب
     * `setRecords` بشكل سجلّ تبويبه هو، بينما `activeTab` صار تبويبًا آخر
     * فعلًا — فرع العرض يحوّل `records` إلى نوع التبويب *الحالي* بـ`as` بلا
     * فحص، فبطاقة كـ`Card` (لقطات) تقرأ `record.kind` من سجلّ لوحة فتنهار.
     *
     * **والتذكرة تضيف حالة لا يكشفها فحص التبويب وحده**: استدعاءان على
     * *نفس* التبويب يمكن أن يعود أقدمهما بعد أحدثهما أيضًا.
     */
    if (activeTabRef.current !== requestedTab || reloadTicketRef.current !== myTicket) return

    setQuota(quotaState)
    if (result.ok) {
      setRecords(result.value)
      setLibraryHasAny(counts.ok ? counts.value.total > 0 : true)
      setLoadState('ready')
    } else {
      setLoadState('error')
    }
  }, [
    activeTab,
    view,
    searchQuery,
    sortKey,
    sortDirection,
    kindFilter,
    dateFilter,
    viewMode,
    activeTagFilter,
  ])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * تبديل العرض يُفرِغ التحديد ويعيد «نشِطة» — تحديدٌ أو وضعٌ من عرض لا معنى لبقائه في آخر.
   *
   * **يُفرِغ `records` أيضًا هنا — لا يترك ذلك لـ`reload()`.** قِسته
   * `verify-library.mjs` في متصفّح حقيقي: تغيير التبويب يُعيد العرض فورًا في نفس
   * اللفّة، بينما `reload()` لا يعمل إلا في تأثير لاحق — ما ينتج إطار رسمٍ واحدًا
   * يحمل تبويبًا جديدًا وسجلّات التبويب *القديم* بشكلها القديم، فتنهار بطاقة تقرأ
   * حقلًا لا وجود له. تفريغ `records` فورًا يجعل ذلك الإطار يعرض الحالة الفارغة.
   */
  const switchView = useCallback((next: LibraryView) => {
    viewRef.current = next
    setView(next)
    setRecords([])
    setSelection(new Set())
    setViewMode('live')
    if (typeof history !== 'undefined') {
      history.replaceState(null, '', `${location.pathname}${searchFor(next)}`)
    }
  }, [])

  /** نوعٌ من صفّ الأنواع — نوعه الحاضر لا يُعاد فتحه، فلا يُسقط مرشّح العرض ولا التحديد. */
  const selectTab = useCallback(
    (tab: LibraryTab) => {
      if (tabForView(viewRef.current) !== tab) switchView(VIEW_FOR_TAB[tab])
    },
    [switchView],
  )

  const switchViewMode = useCallback((index: number) => {
    const mode = VIEW_MODE_OPTIONS[index]?.value
    if (!mode) return
    setViewMode(mode)
    setSelection(new Set())
  }, [])

  const reloadProjects = useCallback(async () => {
    const result = await loadProjects()
    if (result.ok) setProjects(result.value)
  }, [])

  useEffect(() => {
    void reloadProjects()
  }, [reloadProjects])

  /** بطاقات النظرة العامّة — تُعاد مع كل كتابة يعيد الشريط لها عدّه. */
  useEffect(() => {
    if (view.kind !== 'projects') return
    let live = true
    void loadProjectOverview().then((result) => {
      if (!live) return
      setOverviewFailed(!result.ok)
      setOverview(result.ok ? result.value : [])
    })
    return () => {
      live = false
    }
  }, [view.kind, revision])

  const reloadTags = useCallback(async () => {
    const result = await loadTagsWithCounts()
    if (result.ok) setTags(result.value)
  }, [])

  useEffect(() => {
    void reloadTags()
  }, [reloadTags])

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

  /** الدليل يُفتح صفحته تحت القشرة نفسها — `?guide=<id>` (`STAGES/06`). */
  const openGuide = useCallback((id: string) => switchView({ kind: 'guide', id }), [switchView])

  /**
   * «أنشئ دليلًا» من التحديد — بترتيب الالتقاط، ثمّ يُفتح الدليل ليُسمّى ويُرتَّب. والفشل يُقال بسببه ولا يُفرِغ
   * التحديد: المستخدم يعيد المحاولة على ما اختاره.
   */
  const onCreateGuide = useCallback(() => {
    void createGuide([...selection], Date.now()).then((created) => {
      if (!created.ok) {
        announce({ tone: 'danger', title: 'تعذّر إنشاء الدليل', detail: created.error.message })
        return
      }
      clearSelection()
      bump()
      switchView({ kind: 'guide', id: created.value.id })
    })
  }, [selection, announce, clearSelection, bump, switchView])

  /**
   * تُطبَّق تسلسليًّا لا بالتوازي: العدد المتوقَّع للتحديد عشراتٌ لا آلاف،
   * ومعاملة واحدة لكل سجلّ أبسط من إدارة فشل جزئي وسط دفعة متوازية.
   *
   * **`clearSelection()` مشروطة بالتبويب — لا تُفرَّغ صمتًا تحديدًا جديدًا
   * على تبويب آخر.** الحلقة التسلسلية قد تمتدّ إلى ما بعد أن يبدّل المستخدم
   * التبويب ويحدِّد عناصر جديدة هناك. `reload()` لا يحتاج الحارس — يحرس نفسه.
   */
  const applyToSelection = useCallback(
    async (mutate: (record: CaptureRecord) => CaptureRecord) => {
      const requestedTab = activeTab
      for (const id of selection) {
        const found = await captures.get(id)
        if (found.ok) await captures.put(mutate(found.value))
      }
      if (activeTabRef.current === requestedTab) clearSelection()
      bump()
      await reload()
    },
    [activeTab, selection, clearSelection, reload, bump],
  )

  const onFavoriteSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, favorite: true })),
    [applyToSelection],
  )
  const onArchiveSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, archived: true })),
    [applyToSelection],
  )
  const onUnarchiveSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, archived: false })),
    [applyToSelection],
  )
  const onTrashSelection = useCallback(() => {
    const count = selection.size
    void applyToSelection((r) => ({ ...r, trashedAt: Date.now() })).then(() =>
      announce({
        title: `نُقل إلى المهملات: ${countText(count, COUNT_FORMS.captures)}`,
        detail: `تُستعاد منها خلال ${formatHuman(TRASH_RETENTION_DAYS)} يومًا، ثمّ تُحذف نهائيًا.`,
      }),
    )
  }, [applyToSelection, selection, announce])
  const onRestoreSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, trashedAt: null })),
    [applyToSelection],
  )
  /** حذف نهائي — لا معاملة `applyToSelection` البسيطة: `purgeCapture` يحذف من ثلاثة مخازن معًا. */
  const onPurgeSelection = useCallback(() => {
    const requestedTab = activeTab
    const count = selection.size
    void (async () => {
      for (const id of selection) await purgeCapture(id)
      // نفس حارس `applyToSelection` — تحديدٌ جديد على تبويب آخر لا يُمحى بصمت.
      if (activeTabRef.current === requestedTab) clearSelection()
      bump()
      announce({ title: `حُذف نهائيًا: ${countText(count, COUNT_FORMS.captures)}` })
      await reload()
    })()
  }, [activeTab, selection, clearSelection, reload, bump, announce])

  const onMoveSelectionToProject = useCallback(
    (projectId: string | null) => {
      const requestedTab = activeTab
      void moveCapturesToProject([...selection], projectId).then(() => {
        if (activeTabRef.current === requestedTab) clearSelection()
        bump()
        void reload()
      })
    },
    [activeTab, selection, clearSelection, reload, bump],
  )
  const onAddTagToSelection = useCallback(
    (name: string) => {
      // التحديد لا يُفرَّغ عمدًا: قد يضيف المستخدم أكثر من وسم على التوالي لنفس التحديد.
      void addTagToCaptures([...selection], name).then(() => void reloadTags())
    },
    [selection, reloadTags],
  )

  /**
   * حذف ونقل-لمشروع للتبويبات الأربعة غير اللقطات — `DELETE_FN_FOR_TAB`/
   * `MOVE_FN_FOR_TAB` أعلاه. `activeTab === 'captures'` لا يصل هذين
   * المعالجين أصلًا (فرع العرض أدناه يُخصّص `SelectionBar` الحقيقي لها).
   */
  const onDeleteSelectionGeneric = useCallback(() => {
    const del = DELETE_FN_FOR_TAB[activeTab]
    if (!del) return
    const requestedTab = activeTab
    const count = selection.size
    void del([...selection]).then(() => {
      // نفس حارس `applyToSelection` — احذف/انقل يخصّان التبويب الذي طُلبا
      // عليه؛ تحديدٌ جديد استُحدِث على تبويب آخر أثناء الانتظار لا يُمحى.
      if (activeTabRef.current === requestedTab) clearSelection()
      bump()
      announce({ title: `حُذف نهائيًا: ${countText(count, COUNT_FORMS[requestedTab])}` })
      void reload()
    })
  }, [activeTab, selection, clearSelection, reload, bump, announce])

  const onMoveSelectionToProjectGeneric = useCallback(
    (projectId: string | null) => {
      const move = MOVE_FN_FOR_TAB[activeTab]
      if (!move) return
      const requestedTab = activeTab
      void move([...selection], projectId).then(() => {
        if (activeTabRef.current === requestedTab) clearSelection()
        bump()
        void reload()
      })
    },
    [activeTab, selection, clearSelection, reload, bump],
  )

  // ── المشاريع ──────────────────────────────────────────────────
  const afterProjectsChange = useCallback(() => {
    void reloadProjects()
    bump()
  }, [reloadProjects, bump])
  /**
   * فشل عملية مشروع يُقال بسببه (`projects / new-error`) — كانت النتيجة تُهمَل، فيبدو الإنشاء
   * أو الحذف كأنه تمّ واللوحة لم تتغيّر.
   */
  const reportProjectFailure = useCallback(
    (what: string, result: Result<unknown>) => {
      if (!result.ok) {
        announce({ tone: 'danger', title: `تعذّر ${what}`, detail: result.error.message })
      }
    },
    [announce],
  )
  const onCreateProject = useCallback(
    (name: string, color: string) => {
      void createProject(name, color).then((result) => {
        reportProjectFailure('إنشاء المشروع', result)
        // `projects / created` (`304:28147`): النجاح يُقال كما يُقال الفشل — كان صامتًا.
        if (result.ok) announce({ title: 'أُنشئ المشروع', detail: `«${name}» جاهز لأوّل لقطة` })
        afterProjectsChange()
      })
    },
    [afterProjectsChange, announce, reportProjectFailure],
  )
  const onRenameProject = useCallback(
    (id: string, name: string) => {
      void renameProject(id, name).then((result) => {
        reportProjectFailure('تغيير اسم المشروع', result)
        afterProjectsChange()
      })
    },
    [afterProjectsChange, reportProjectFailure],
  )
  const onSetProjectColor = useCallback(
    (id: string, color: string) => {
      void setProjectColor(id, color).then((result) => {
        reportProjectFailure('تغيير لون المشروع', result)
        afterProjectsChange()
      })
    },
    [afterProjectsChange, reportProjectFailure],
  )
  const onDeleteProject = useCallback(
    (id: string, moveContentTo: string | null) => {
      void deleteProject(id, moveContentTo).then((result) => {
        reportProjectFailure('حذف المشروع', result)
        afterProjectsChange()
        // عرض المشروع المحذوف لا وجهة له بعده — يعود إلى كل اللقطات. والحذف الفاشل يُبقيه.
        if (result.ok && view.kind === 'project' && view.id === id) switchView({ kind: 'all' })
        else void reload()
      })
    },
    [afterProjectsChange, reload, reportProjectFailure, view, switchView],
  )

  const viewModeIndex = useMemo(
    () =>
      Math.max(
        0,
        VIEW_MODE_OPTIONS.findIndex((o) => o.value === viewMode),
      ),
    [viewMode],
  )

  if (view.kind === 'guide') {
    return (
      <AppShell
        activeId={viewId(view)}
        onNavigate={switchView}
        revision={revision}
        onNewProject={() => {
          switchView({ kind: 'projects' })
          setProjectsPanelOpen(true)
        }}
      >
        <GuidePage id={view.id} onBack={() => switchView({ kind: 'guides' })} onChanged={bump} />
      </AppShell>
    )
  }

  // عرضا المشكلات لهما صفحتهما تحت القشرة نفسها: لا شريط أنواع السجلّات ولا مبدّل العرض ولا لوحاتها —
  // ليست منها. و«مشروع جديد» في الشريط يفتح نظرة المشاريع ولوحتها فلا يبقى زرّ بلا أثر.
  if (view.kind === 'issues' || view.kind === 'issue') {
    return (
      <AppShell
        activeId={viewId(view)}
        onNavigate={switchView}
        revision={revision}
        onNewProject={() => {
          switchView({ kind: 'projects' })
          setProjectsPanelOpen(true)
        }}
      >
        <IssuesPage view={view} projects={projects} onNavigate={switchView} />
      </AppShell>
    )
  }

  const title =
    view.kind === 'project'
      ? (projects.find((p) => p.id === view.id)?.name ?? projectNames[view.id] ?? 'مشروع')
      : TITLE[view.kind]
  const isProjects = view.kind === 'projects'
  /** عروض اللقطات — لا نظرة المشاريع، وإن كانت تحت نوع اللقطات. */
  const isCaptures = activeTab === 'captures' && !isProjects
  const showQuotaNotice = quota !== null && quota.level !== 'ok' && !quotaNoticeDismissed

  return (
    <AppShell
      activeId={viewId(view)}
      onNavigate={switchView}
      revision={revision}
      onNewProject={() => setProjectsPanelOpen(true)}
    >
      <div class={styles.page}>
        <Toolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={isProjects ? 'ابحث في المشاريع…' : SEARCH_PLACEHOLDER[activeTab]}
          captureFilters={
            isCaptures
              ? {
                  kind: kindFilter,
                  onKindChange: setKindFilter,
                  date: dateFilter,
                  onDateChange: setDateFilter,
                  tagsOpen: tagsPanelOpen,
                  onToggleTags: () => setTagsPanelOpen((v) => !v),
                }
              : null
          }
          projectsOpen={projectsPanelOpen}
          onToggleProjects={() => setProjectsPanelOpen((v) => !v)}
        />

        <div class={styles.content}>
          <TabRow aria-label="أنواع السجلّات" class={styles.tabs}>
            {TAB_ITEMS.map((t) => (
              <Tab
                key={t.value}
                label={t.label}
                selected={activeTab === t.value}
                onClick={() => selectTab(t.value)}
              />
            ))}
          </TabRow>

          <div class={styles.head}>
            <div class={styles.heading}>
              <h1 class={`${styles.title} t-arabic-heading-m`}>{title}</h1>
              {isProjects ? (
                overview && overview.length > 0 ? (
                  <span class={`${styles.count} t-arabic-ui-xs`}>
                    {countText(overview.length, PROJECT_FORMS)}
                  </span>
                ) : null
              ) : loadState === 'ready' && records.length > 0 ? (
                <span class={`${styles.count} t-arabic-ui-xs`}>
                  {countText(records.length, COUNT_FORMS[activeTab])}
                </span>
              ) : null}
              {isCaptures && activeTagFilter ? (
                <button
                  type="button"
                  class={`${styles.tagFilter} t-arabic-ui-xs-strong`}
                  aria-label={`أزل مرشّح الوسم ${activeTagFilter}`}
                  onClick={() => setActiveTagFilter(null)}
                >
                  {`الوسم: ${activeTagFilter} ×`}
                </button>
              ) : null}
            </div>
            {isProjects ? (
              <Button
                variant="primary"
                size="m"
                icon="plus"
                onClick={() => setProjectsPanelOpen(true)}
              >
                مشروع جديد
              </Button>
            ) : isCaptures ? (
              <div class={styles.headActions}>
                <SegmentedControl
                  options={VIEW_MODE_OPTIONS}
                  selected={viewModeIndex}
                  onChange={switchViewMode}
                  aria-label="عرض المكتبة"
                />
                <SortSelect
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onChange={(key, direction) => {
                    setSortKey(key)
                    setSortDirection(direction)
                  }}
                />
              </div>
            ) : null}
          </div>

          <div class={styles.body}>
            <div class={styles.main}>
              {isProjects ? (
                overview === null ? (
                  <div
                    class={styles.skeletonGrid}
                    role="status"
                    aria-busy="true"
                    aria-label="جارٍ تحميل المشاريع"
                  >
                    {Array.from({ length: 4 }, (_, i) => (
                      <Skeleton key={i} kind="panel" />
                    ))}
                  </div>
                ) : overviewFailed ? (
                  <div class={styles.center}>
                    <ErrorMessage
                      layout="page"
                      title="تعذّرت قراءة المشاريع"
                      body="لم يستجب التخزين على هذا الجهاز. مشاريعك لم تُحذف — أعد المحاولة."
                      onRetry={() => {
                        setOverview(null)
                        bump()
                      }}
                    />
                  </div>
                ) : overview.length === 0 ? (
                  <div class={styles.center}>
                    <EmptyState
                      kind="no-projects"
                      action={
                        <Button
                          variant="primary"
                          size="m"
                          icon="plus"
                          onClick={() => setProjectsPanelOpen(true)}
                        >
                          مشروع جديد
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <ProjectsOverview
                    items={
                      searchQuery.trim()
                        ? overview.filter((p) => p.name.includes(searchQuery.trim()))
                        : overview
                    }
                    thumbnailUrls={thumbnailUrls}
                    onNeedThumbnail={onNeedThumbnail}
                    onOpen={(id) => switchView({ kind: 'project', id })}
                  />
                )
              ) : loadState === 'loading' ? (
                <div
                  class={styles.skeletonGrid}
                  role="status"
                  aria-busy="true"
                  aria-label="جارٍ تحميل المكتبة"
                >
                  {Array.from({ length: SKELETON_CARD_COUNT }, (_, i) => (
                    <Skeleton key={i} kind="card" />
                  ))}
                </div>
              ) : loadState === 'error' ? (
                <div class={styles.center}>
                  <ErrorMessage
                    layout="page"
                    title="تعذّرت قراءة المكتبة"
                    body="لم يستجب التخزين على هذا الجهاز. لقطاتك لم تُحذف — أعد المحاولة، أو أعد تحميل الصفحة."
                    onRetry={() => void reload()}
                  />
                </div>
              ) : records.length === 0 ? (
                // اللقطات وحدها تميِّز «لا لقطة أصلًا» عن «لا نتيجة لهذا البحث أو المرشّح»
                // (loadCounts) — الأنواع الأخرى بلا عدّاد غير مصفًّى، فحالة فراغها ثابتة.
                <div class={styles.center}>
                  <EmptyState
                    kind={
                      isCaptures && libraryHasAny ? 'no-results' : EMPTY_KIND_FOR_TAB[activeTab]
                    }
                    {...(activeTab === 'guides' && !searchQuery.trim()
                      ? {
                          // `guide / empty` (`319:54680`): الدليل يُنشأ من لقطات محدَّدة، فالزرّ يأخذ إليها.
                          action: (
                            <Button
                              variant="primary"
                              size="m"
                              icon="plus"
                              data-guide-create-empty=""
                              onClick={() => {
                                switchView({ kind: 'all' })
                                announce({
                                  title: 'حدّد اللقطات، ثمّ «أنشئ دليلًا»',
                                  detail: 'تصير الخطوات بترتيب التقاطها، وتُعاد ترتيبها في الدليل.',
                                })
                              }}
                            >
                              أنشئ دليلًا
                            </Button>
                          ),
                        }
                      : {})}
                  />
                </div>
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
                  minCardRem={28}
                  aria-label="لوحات الألوان"
                />
              ) : activeTab === 'references' ? (
                <SimpleGrid
                  records={records as ReferenceRecord[]}
                  selection={selection}
                  onToggleSelect={toggleSelect}
                  onOpen={noopOpen}
                  CardComponent={ReferenceCard}
                  minCardRem={20}
                  aria-label="المراجع المحفوظة"
                />
              ) : (
                <SimpleGrid
                  records={records as GuideRecord[]}
                  selection={selection}
                  onToggleSelect={toggleSelect}
                  onOpen={openGuide}
                  CardComponent={GuideCard}
                  aria-label="أدلّة الخطوات"
                />
              )}
            </div>

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

            {tagsPanelOpen && isCaptures ? (
              <TagsPanel
                tags={tags}
                activeTag={activeTagFilter}
                onSelectTag={setActiveTagFilter}
                onClose={() => setTagsPanelOpen(false)}
              />
            ) : null}
          </div>

          {selection.size > 0 && isCaptures ? (
            <SelectionBar
              count={selection.size}
              viewMode={viewMode}
              projects={projects}
              onFavorite={onFavoriteSelection}
              onArchive={onArchiveSelection}
              onUnarchive={onUnarchiveSelection}
              onTrash={onTrashSelection}
              onRestore={onRestoreSelection}
              onPurge={onPurgeSelection}
              onMoveToProject={onMoveSelectionToProject}
              onAddTag={onAddTagToSelection}
              onCreateGuide={onCreateGuide}
              onClear={clearSelection}
            />
          ) : selection.size > 0 ? (
            <SimpleSelectionBar
              count={selection.size}
              projects={projects}
              onMoveToProject={onMoveSelectionToProjectGeneric}
              onDelete={onDeleteSelectionGeneric}
              onClear={clearSelection}
            />
          ) : null}

          {notice || showQuotaNotice ? (
            <div class={styles.toastDock}>
              {notice ? (
                <Toast
                  tone={notice.tone ?? 'success'}
                  detail={notice.detail}
                  onDismiss={() => setNotice(null)}
                >
                  {notice.title}
                </Toast>
              ) : (
                <Toast
                  tone="warning"
                  action="with-action"
                  actionLabel="افتح البيانات"
                  onAction={() => {
                    location.href = `${SETTINGS_HREF}?section=data`
                  }}
                  detail="احذف لقطات قديمة أو أفرغ المهملات لتحرير المساحة."
                  onDismiss={() => setQuotaNoticeDismissed(true)}
                >
                  المساحة تكاد تمتلئ
                </Toast>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}
