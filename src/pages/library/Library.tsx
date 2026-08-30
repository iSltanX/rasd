/**
 * صفحة المكتبة — الحاوية الجذر.
 *
 * هذه الدفعة تُسلِّم شبكة تبويب اللقطات وحالاتها الخمس المصمَّمة
 * (`grid`/`empty`/`loading`/`selection`/`offline`) فقط. التبويبات الأربعة
 * الأخرى وشريط البحث/التصفية/الترتيب ولوحة المشاريع والوسوم دفعاتٌ لاحقة —
 * `captureQuery` أدناه مُثبَّت على الافتراضي عمدًا حتى تصل.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import { DEFAULT_LIBRARY_FILTERS } from '@/modules/library/filters'
import { DEFAULT_SORT_DIRECTION, DEFAULT_SORT_KEY } from '@/modules/library/sort'
import { send } from '@/shared/messaging'
import { captures } from '@/shared/storage/repository'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { EmptyState } from '@/ui/components/EmptyState/EmptyState'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'

import { loadProjectNames, loadTab, purgeExpiredOnOpen, resolveThumbnailUrl } from './context'
import styles from './Library.module.css'
import { Grid } from './parts/Grid'
import { SelectionBar } from './parts/SelectionBar'
import { browserThumbnailEncoder } from './thumbnail-encoder'

import type { CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

type LoadState = 'loading' | 'ready' | 'error'

const SKELETON_CARD_COUNT = 8

export function Library(): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [records, setRecords] = useState<CaptureRecord[]>([])
  const [projectNames, setProjectNames] = useState<Record<string, string>>({})
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string | null>>(new Map())
  const pendingThumbs = useRef<Set<string>>(new Set())

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

  const reload = useCallback(async () => {
    setLoadState('loading')
    const names = await loadProjectNames()
    setProjectNames(names)

    await purgeExpiredOnOpen(Date.now())

    const result = await loadTab({
      tab: 'captures',
      searchQuery: '',
      captureQuery: {
        filters: DEFAULT_LIBRARY_FILTERS,
        sortKey: DEFAULT_SORT_KEY,
        sortDirection: DEFAULT_SORT_DIRECTION,
      },
      projectNameLookup: (id) => names[id] ?? '',
    })

    if (result.ok) {
      setRecords(result.value as CaptureRecord[])
      setLoadState('ready')
    } else {
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

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

  return (
    <div class={styles.page}>
      {!online ? (
        <Banner tone="warning">
          أنت غير متصل — التغييرات تُحفَظ محليًا وتُطابَق تلقائيًا عند العودة.
        </Banner>
      ) : null}

      {selection.size > 0 ? (
        <SelectionBar
          count={selection.size}
          onFavorite={onFavoriteSelection}
          onArchive={onArchiveSelection}
          onTrash={onTrashSelection}
          onClear={clearSelection}
        />
      ) : null}

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
        <EmptyState kind="no-captures" />
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
  )
}
