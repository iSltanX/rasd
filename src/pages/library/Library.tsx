/**
 * صفحة المكتبة — الحاوية الجذر.
 *
 * الدفعة الثامنة أضافت الوسوم (§10.3) وعرضَي الأرشيف والمهملات ومؤشِّر
 * الحصة، فوق التبويبات الخمسة (السابعة) ولوحة المشاريع (السادسة) وشريط
 * الأدوات (الخامسة) والشبكة الافتراضية (الرابعة).
 *
 * **مبدِّل العرض (نشِطة/الأرشيف/المهملات) والوسوم مقصوران على تبويب
 * اللقطات**: `ARCHIVE_FILTERS`/`TRASH_FILTERS`/`tags` كلّها مبنيّة على
 * `CaptureRecord` — نفس حدّ التصفية والترتيب من الدفعة الخامسة، الآن ممتدّ
 * إلى العرض والوسوم بنفس التعليل بالضبط.
 *
 * **إضافة لاحقة لدفعة الإغلاق**: التحديد المتعدّد للتبويبات الأربعة غير
 * اللقطات كان يعرض شريطًا بلا فعل حقيقي (إلغاء فقط) — فجوة سُجِّلت في
 * `Phase_18.md §4/§8` كشرط تسليم للمرحلة 16 ولم تُبنَ في الإغلاق نفسه.
 * سُدّت هنا: `SimpleSelectionBar` يمنح هذه الأنواع حذفًا نهائيًا (لا مهملات
 * لها) ونقلًا إلى مشروع — عبر `DELETE_FN_FOR_TAB`/`MOVE_FN_FOR_TAB` أدناه.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { ARCHIVE_FILTERS, DEFAULT_LIBRARY_FILTERS, TRASH_FILTERS } from '@/modules/library/filters'
import { type LibraryTab } from '@/modules/library/search'
import {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  type LibrarySortKey,
  type SortDirection,
} from '@/modules/library/sort'
import { purgeCapture } from '@/modules/library/trash'
import { send } from '@/shared/messaging'
import { captures } from '@/shared/storage/repository'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { EmptyState, type EmptyStateKind } from '@/ui/components/EmptyState/EmptyState'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { SegmentedControl } from '@/ui/components/SegmentedControl/SegmentedControl'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'
import { Tabs, type TabItem } from '@/ui/components/Tabs/Tabs'

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
import styles from './Library.module.css'
import { ColorCard } from './parts/ColorCard'
import { Grid } from './parts/Grid'
import { GuideCard } from './parts/GuideCard'
import { PaletteCard } from './parts/PaletteCard'
import { ProjectsPanel } from './parts/ProjectsPanel'
import { QuotaIndicator } from './parts/QuotaIndicator'
import { ReferenceCard } from './parts/ReferenceCard'
import { SelectionBar, type LibraryViewMode } from './parts/SelectionBar'
import { SimpleGrid } from './parts/SimpleGrid'
import { SimpleSelectionBar } from './parts/SimpleSelectionBar'
import { TagsPanel } from './parts/TagsPanel'
import { Toolbar } from './parts/Toolbar'
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

const VIEW_MODE_OPTIONS: readonly { value: LibraryViewMode; label: string }[] = [
  { value: 'live', label: 'نشِطة' },
  { value: 'archived', label: 'الأرشيف' },
  { value: 'trashed', label: 'المهملات' },
]

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
   * (بحثٌ يُكتَب بسرعة بلا تهدئة، كل ضغطة زرّ تُطلق `reload()` مستقلّة) قد
   * يعود أقدمهما بعد أحدثهما — IndexedDB لا يضمن ترتيب استجابتين متزامنتين
   * ولو استُهدِف المخزن نفسه. مرجعٌ لا حالة، للسبب نفسه.
   */
  const reloadTicketRef = useRef(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<LibrarySortKey>(DEFAULT_SORT_KEY)
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION)
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [viewMode, setViewMode] = useState<LibraryViewMode>('live')
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false)

  const [tags, setTags] = useState<TagRecord[]>([])
  const [tagsPanelOpen, setTagsPanelOpen] = useState(false)

  const [quota, setQuota] = useState<QuotaState | null>(null)

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

  const baseFilters =
    viewMode === 'archived'
      ? ARCHIVE_FILTERS
      : viewMode === 'trashed'
        ? TRASH_FILTERS
        : DEFAULT_LIBRARY_FILTERS
  const filters = {
    ...baseFilters,
    ...(favoriteOnly ? { favorite: true } : {}),
    ...(activeTagFilter ? { tag: activeTagFilter } : {}),
  }

  const reload = useCallback(async () => {
    // القيمة **حين بدأ هذا الاستدعاء بعينه** — ما يُطلَب من المخزن، لا ما
    // يُعرَض الآن. والتذكرة تميّزه عن أي استدعاء آخر لاحق على التبويب نفسه.
    const requestedTab = activeTab
    const myTicket = ++reloadTicketRef.current

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
     * فحص، فبطاقة كـ`Card` (لقطات) تقرأ `record.kind` من سجلّ لوحة فتنهار
     * (`Icon` تستلم `name: undefined`، ‎`shouldMirror` تُفشِل على `.replace`
     * لا وجود له). نفس عائلة عطل تبديل التبويب المُصلَح في دفعة الإغلاق —
     * هنا مصدر التأخّر معالج حذف/نقل لا الرسم المتزامن.
     *
     * **والتذكرة تضيف حالة لا يكشفها فحص التبويب وحده**: استدعاءان على
     * *نفس* التبويب (بحثٌ يُكتَب بسرعة بلا تهدئة) يمكن أن يعود أقدمهما
     * بعد أحدثهما أيضًا — مراجعة خصمة كشفت هذا كحالة منفصلة، وdiff الأداء
     * لا يبرِّر إضافة تهدئة (debounce) لحلّها حين يكفيها فحصٌ صريح هنا.
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
    // `filters` ليست في مصفوفة الاعتماديات لأنها مُشتقَّة من الحالات الأخرى
    // في كل عرض بلا حالة خاصّة بها — اعتماديّاتها الحقيقية (viewMode،
    // favoriteOnly، activeTagFilter) كلّها مذكورة.
  }, [activeTab, searchQuery, sortKey, sortDirection, favoriteOnly, viewMode, activeTagFilter])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * تبديل التبويب يُفرِغ التحديد ويعيد العرض إلى «نشِطة» — تحديدٌ أو عرضٌ من تبويب لا معنى لبقائه في آخر.
   *
   * **يُفرِغ `records` أيضًا هنا — لا يترك ذلك لـ`reload()`.** قِسته
   * `verify-library.mjs` في متصفّح حقيقي: تغيير `activeTab` يُعيد العرض
   * فورًا في نفس اللفّة، بينما `reload()` لا يعمل إلا في تأثير لاحق —
   * ما ينتج إطار رسمٍ واحدًا يحمل تبويبًا جديدًا وسجلّات التبويب *القديم*
   * بشكلها القديم. فرع العرض (Library.tsx أسفله) يحوّل `records` بـ`as`
   * إلى نوع التبويب الجديد بلا فحص فعلي، فبطاقة كـ`PaletteCard` تقرأ
   * `record.colors` من سجلّ لقطة لا حقل `colors` له فتنهار — وانهيار عرضٍ
   * بلا حدود خطأ يُسقط الشجرة كاملة، فتفشل كل التبويبات التالية معه.
   * تفريغ `records` فورًا يجعل ذلك الإطار الوحيد يعرض الحالة الفارغة
   * (سكيلتون أو `EmptyState`) بدل بيانات مموَّهة الشكل — انظر §6.
   */
  const switchTab = useCallback((index: number) => {
    const tab = TAB_VALUES[index]
    if (!tab) return
    setActiveTab(tab)
    setRecords([])
    setSelection(new Set())
    setViewMode('live')
  }, [])

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

  /**
   * تُطبَّق تسلسليًّا لا بالتوازي: العدد المتوقَّع للتحديد عشراتٌ لا آلاف،
   * ومعاملة واحدة لكل سجلّ أبسط من إدارة فشل جزئي وسط دفعة متوازية.
   *
   * **`clearSelection()` مشروطة بالتبويب — لا تُفرَّغ صمتًا تحديدًا جديدًا
   * على تبويب آخر.** مراجعة خصمة كشفت أن حلقة `for` هنا (تسلسلية، فقد تأخذ
   * وقتًا محسوسًا على تحديد كبير) قد تمتدّ إلى ما بعد أن يبدّل المستخدم
   * التبويب ويحدِّد عناصر جديدة هناك؛ `clearSelection()` غير المشروطة
   * سابقًا كانت ستمحو ذلك التحديد الجديد بلا أي علاقة بما طُلب هنا أصلًا.
   * `reload()` لا يحتاج الحارس نفسه — يحرس نفسه داخليًا.
   */
  const applyToSelection = useCallback(
    async (mutate: (record: CaptureRecord) => CaptureRecord) => {
      const requestedTab = activeTab
      for (const id of selection) {
        const found = await captures.get(id)
        if (found.ok) await captures.put(mutate(found.value))
      }
      if (activeTabRef.current === requestedTab) clearSelection()
      await reload()
    },
    [activeTab, selection, clearSelection, reload],
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
  const onTrashSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, trashedAt: Date.now() })),
    [applyToSelection],
  )
  const onRestoreSelection = useCallback(
    () => void applyToSelection((r) => ({ ...r, trashedAt: null })),
    [applyToSelection],
  )
  /** حذف نهائي — لا معاملة `applyToSelection` البسيطة: `purgeCapture` يحذف من ثلاثة مخازن معًا. */
  const onPurgeSelection = useCallback(() => {
    const requestedTab = activeTab
    void (async () => {
      for (const id of selection) await purgeCapture(id)
      // نفس حارس `applyToSelection` — تحديدٌ جديد على تبويب آخر لا يُمحى بصمت.
      if (activeTabRef.current === requestedTab) clearSelection()
      await reload()
    })()
  }, [activeTab, selection, clearSelection, reload])

  const onMoveSelectionToProject = useCallback(
    (projectId: string | null) => {
      const requestedTab = activeTab
      void moveCapturesToProject([...selection], projectId).then(() => {
        if (activeTabRef.current === requestedTab) clearSelection()
        void reload()
      })
    },
    [activeTab, selection, clearSelection, reload],
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
   * المعالجين أصلًا (فرع العرض أدناه يُخصّص `SelectionBar` الحقيقي لها)،
   * فغياب الدالّة من الجدول لتبويب اللقطات غير ذي أثر — حارسٌ لا يُشحن كودًا
   * ميتًا فحسب.
   */
  const onDeleteSelectionGeneric = useCallback(() => {
    const del = DELETE_FN_FOR_TAB[activeTab]
    if (!del) return
    const requestedTab = activeTab
    void del([...selection]).then(() => {
      // نفس حارس `applyToSelection` — احذف/انقل يخصّان التبويب الذي طُلبا
      // عليه؛ تحديدٌ جديد استُحدِث على تبويب آخر أثناء الانتظار لا يُمحى.
      if (activeTabRef.current === requestedTab) clearSelection()
      void reload()
    })
  }, [activeTab, selection, clearSelection, reload])

  const onMoveSelectionToProjectGeneric = useCallback(
    (projectId: string | null) => {
      const move = MOVE_FN_FOR_TAB[activeTab]
      if (!move) return
      const requestedTab = activeTab
      void move([...selection], projectId).then(() => {
        if (activeTabRef.current === requestedTab) clearSelection()
        void reload()
      })
    },
    [activeTab, selection, clearSelection, reload],
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
  const viewModeIndex = useMemo(
    () =>
      Math.max(
        0,
        VIEW_MODE_OPTIONS.findIndex((o) => o.value === viewMode),
      ),
    [viewMode],
  )

  return (
    <div class={styles.page}>
      {/*
       * «غير متصل» هنا لا يعني بيانات معلَّقة تنتظر مطابقة: المكتبة تقرأ
       * وتكتب IndexedDB محليًا وحده بلا خادم في v1.0 (لا مسار مزامنة
       * موجود في المستودع أصلًا)، فلا شيء «يُطابَق عند العودة» فعليًا —
       * كانت الصياغة الأولى تعد بسلوك لا مقابل له بالشيفرة. اللافتة
       * تبقى لأن `§16` يصمّمها ضمن حالات الشاشة العشر، ونصّها الآن يصف
       * الحقيقة المحلّية لا استعارة سحابية.
       */}
      {!online ? (
        <Banner tone="warning">
          أنت غير متصل — بيانات المكتبة محلّية بالكامل ولا تحتاج اتصالًا.
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
        {activeTab === 'captures' ? (
          <SegmentedControl
            options={VIEW_MODE_OPTIONS}
            selected={viewModeIndex}
            onChange={switchViewMode}
            aria-label="عرض المكتبة"
          />
        ) : null}
        {activeTab === 'captures' ? (
          <IconButton
            icon="tag"
            aria-label={tagsPanelOpen ? 'إغلاق لوحة الوسوم' : 'فتح لوحة الوسوم'}
            variant={tagsPanelOpen ? 'solid' : 'ghost'}
            onClick={() => setTagsPanelOpen((v) => !v)}
          />
        ) : null}
        <IconButton
          icon="folder"
          aria-label={projectsPanelOpen ? 'إغلاق لوحة المشاريع' : 'فتح لوحة المشاريع'}
          variant={projectsPanelOpen ? 'solid' : 'ghost'}
          onClick={() => setProjectsPanelOpen((v) => !v)}
        />
        {quota ? <QuotaIndicator state={quota} /> : null}
      </div>

      {selection.size > 0 && activeTab === 'captures' ? (
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

        {tagsPanelOpen ? (
          <TagsPanel
            tags={tags}
            activeTag={activeTagFilter}
            onSelectTag={setActiveTagFilter}
            onClose={() => setTagsPanelOpen(false)}
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
