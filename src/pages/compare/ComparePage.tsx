/**
 * صفحة المقارنة — الحاوية الجذر (`Rasd_Plan.md §17`).
 *
 * تسلسل التحميل: اقرأ `a`/`b` من الرابط ← حمِّل الوصف والبايتات من IndexedDB
 * مباشرةً (نفس نمط `Library.tsx` — أصل الصفحة أصل الإضافة) ← فكّ كلّ صورة
 * إلى `RasterImage` ← احسب الفرق عبر `worker-client.ts` (عقدٌ عامّ ثابت،
 * راجع ترويسته — لا يُلمَس هنا). أيّ خطوة تفشل تعرض خطأً صريحًا، لا شاشة
 * بيضاء صامتة (معيار الاكتمال، `Rasd_Plan.md §17`).
 *
 * **`URL.createObjectURL` يُلغى عند مغادرة الصفحة** عبر مرجعين يتتبّعان آخر
 * قيمة محمَّلة — التسريب الفعلي هنا ضئيل جدًّا حتى بلا ذلك (المتصفّح يُلغي
 * كل عنوان كائن تلقائيًّا عند تدمير المستند نفسه، وهذه صفحة تبويب كامل)، لكن
 * التنظيف الصريح أوضح نيّة من الاتّكال على ذلك ضمنيًّا.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { DEFAULT_DIFF_OPTIONS, type RasterImage } from '@/modules/compare/diff'
import { Banner } from '@/ui/components/Banner/Banner'
import { Button } from '@/ui/components/Button/Button'
import { Spinner } from '@/ui/components/Spinner/Spinner'

import styles from './ComparePage.module.css'
import { readDiffColorsFromDocument } from './diff-colors'
import { stageSize } from './layout'
import { type LoadedCapture, loadCapture } from './load'
import { Header } from './parts/Header'
import { Sidebar } from './parts/Sidebar'
import { Stage, type CompareMode } from './parts/Stage'
import { parseCompareQuery } from './query'
import { decodeRasterImage } from './raster'
import { buildRegionItems, nextRegionIndex, prevRegionIndex } from './region-format'
import { createDiffClient, type DiffOutcome } from './worker-client'

import type { JSX } from 'preact'

type PageState = 'loading' | 'error' | 'ready'

interface Loaded {
  readonly capture: LoadedCapture
  readonly raster: RasterImage
}

/** فاصل التبديل التلقائي في وضع «وميض» — بطيء بما يكفي للتمييز، سريع بما يكفي ليظهر التبديل واضحًا. */
const BLINK_INTERVAL_MS = 900

export function ComparePage(): JSX.Element {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [loadedA, setLoadedA] = useState<Loaded | null>(null)
  const [loadedB, setLoadedB] = useState<Loaded | null>(null)
  const [diffOutcome, setDiffOutcome] = useState<DiffOutcome | null>(null)
  const [threshold, setThreshold] = useState(DEFAULT_DIFF_OPTIONS.threshold)
  const [mode, setMode] = useState<CompareMode>('adjacent')
  const [splitPosition, setSplitPosition] = useState(50)
  const [selectedRegionIndex, setSelectedRegionIndex] = useState<number | null>(null)
  const [blinkShowingA, setBlinkShowingA] = useState(true)
  const [blinkPlaying, setBlinkPlaying] = useState(true)

  const clientRef = useRef(createDiffClient())
  useEffect(() => () => clientRef.current.dispose(), [])

  // ── تنظيف عناوين الكائنات عند مغادرة الصفحة ─────────────────────
  const loadedARef = useRef<Loaded | null>(null)
  const loadedBRef = useRef<Loaded | null>(null)
  useEffect(() => {
    loadedARef.current = loadedA
  }, [loadedA])
  useEffect(() => {
    loadedBRef.current = loadedB
  }, [loadedB])
  useEffect(
    () => () => {
      if (loadedARef.current) URL.revokeObjectURL(loadedARef.current.capture.objectUrl)
      if (loadedBRef.current) URL.revokeObjectURL(loadedBRef.current.capture.objectUrl)
    },
    [],
  )

  // ── تحميل اللقطتين وفكّهما — مرّة واحدة عند فتح الصفحة ───────────
  useEffect(() => {
    let alive = true

    void (async () => {
      const { a: idA, b: idB } = parseCompareQuery(location.search)
      if (!idA || !idB) {
        if (alive) {
          setErrorMessage('الرابط ناقص — لا يحدِّد لقطتين للمقارنة.')
          setPageState('error')
        }
        return
      }

      const [resultA, resultB] = await Promise.all([loadCapture(idA), loadCapture(idB)])
      if (!alive) return

      if (!resultA.ok) {
        setErrorMessage(`تعذّر تحميل اللقطة أ: ${resultA.error.message}`)
        setPageState('error')
        return
      }
      if (!resultB.ok) {
        setErrorMessage(`تعذّر تحميل اللقطة ب: ${resultB.error.message}`)
        setPageState('error')
        return
      }

      const [rasterA, rasterB] = await Promise.all([
        decodeRasterImage(resultA.value.blob),
        decodeRasterImage(resultB.value.blob),
      ])
      if (!alive) return

      if (!rasterA || !rasterB) {
        setErrorMessage('تعذّر تحليل صورة إحدى اللقطتين — قد تتجاوز أبعادها الحدّ المدعوم.')
        setPageState('error')
        return
      }

      setLoadedA({ capture: resultA.value, raster: rasterA })
      setLoadedB({ capture: resultB.value, raster: rasterB })
      setPageState('ready')
    })()

    return () => {
      alive = false
    }
  }, [])

  // ── حساب الفرق — عند جهوز الصورتين، وعند تغيّر عتبة الحساسية ─────
  useEffect(() => {
    if (!loadedA || !loadedB) return
    let alive = true
    const diffColors = readDiffColorsFromDocument()

    /*
     * **اتجاه إضافة/إزالة — تحقّق تجريبيًّا بمثالٍ تركيبي (سكربت خارج
     * المتصفّح، اثنا بكسل: غامق ثابت، وآخر ينتقل غامق↔فاتح) قبل الربط، لا
     * افتراضًا.** `pixelmatch` يقرّر اللون من سطوع البكسل في أ (`a`) مقابل
     * ب (`b`) لا من ترتيب المعاملين نفسه: يستعمل `diffColorAlt` (`addedColor`
     * هنا) حين أ أفتح من ب عند تلك النقطة — أي محتوًى غامق ظهر حديثًا فوق
     * خلفية كانت أفتح، وهو ما يقابل «أُضيف» فعليًّا في لقطة صفحة نموذجية
     * بخلفية فاتحة. ويستعمل `diffColor` (`removedColor`) في العكس — محتوًى
     * غامق زال فكشف خلفية أفتح، أي «أُزيل». هذا يطابق التخصيص الجاهز في
     * `modules/compare/diff.ts` (`removedColor→diffColor`،
     * `addedColor→diffColorAlt`) بلا حاجة لتبديل — التحقّق أثبت التخصيص
     * القائم لا غيّره.
     */
    void clientRef.current
      .run(loadedA.raster, loadedB.raster, {
        threshold,
        removedColor: diffColors.removed,
        addedColor: diffColors.added,
      })
      .then((outcome) => {
        if (!alive) return
        setDiffOutcome(outcome)
        setSelectedRegionIndex(null)
      })

    return () => {
      alive = false
    }
  }, [loadedA, loadedB, threshold])

  // ── الوميض التلقائي ───────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'blink' || !blinkPlaying) return
    const id = window.setInterval(() => setBlinkShowingA((v) => !v), BLINK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [mode, blinkPlaying])

  const regionItems = useMemo(
    () => (diffOutcome ? buildRegionItems(diffOutcome.regions) : []),
    [diffOutcome],
  )

  const onSelectRegion = useCallback((index: number) => setSelectedRegionIndex(index), [])
  const onPrevRegion = useCallback(() => {
    setSelectedRegionIndex((current) => prevRegionIndex(current ?? 0, regionItems.length))
  }, [regionItems.length])
  const onNextRegion = useCallback(() => {
    setSelectedRegionIndex((current) => nextRegionIndex(current ?? -1, regionItems.length))
  }, [regionItems.length])

  if (pageState === 'loading') {
    return (
      <div class={styles.centerState} aria-busy="true">
        <Spinner size="l" label="جارٍ تحميل اللقطتين" />
        <p class={styles.centerHint}>جارٍ تحميل اللقطتين وحساب الفرق…</p>
      </div>
    )
  }

  if (pageState === 'error' || !loadedA || !loadedB) {
    return (
      <div class={styles.centerState} role="alert">
        <Banner tone="danger">{errorMessage || 'تعذّر تحميل المقارنة.'}</Banner>
        <Button variant="secondary" onClick={() => location.reload()}>
          أعد المحاولة
        </Button>
      </div>
    )
  }

  const stage = stageSize(loadedA.capture.record, loadedB.capture.record)
  // فجوة معلَنة صراحة (§17: «تعليم المنطقة الزائدة») — لا يظهر بند الدليل
  // الرابع إلا حين تختلف الأبعاد فعلًا، فلا يُربك مقارنةً بمقاسين متساويين.
  const hasExtraRegion = Boolean(
    diffOutcome &&
    (diffOutcome.extraInA.cols ||
      diffOutcome.extraInA.rows ||
      diffOutcome.extraInB.cols ||
      diffOutcome.extraInB.rows),
  )

  return (
    <div class={styles.page}>
      <Header
        titleA={loadedA.capture.record.title}
        titleB={loadedB.capture.record.title}
        width={stage.width}
        height={stage.height}
      />
      <div class={styles.body}>
        <Sidebar
          mode={mode}
          onModeChange={setMode}
          diffRatio={diffOutcome?.diffRatio ?? 0}
          diffPixelCount={diffOutcome?.diffPixelCount ?? 0}
          comparedPixels={diffOutcome?.comparedPixels ?? 0}
          regionItems={regionItems}
          selectedRegionIndex={selectedRegionIndex}
          onSelectRegion={onSelectRegion}
          onPrevRegion={onPrevRegion}
          onNextRegion={onNextRegion}
          thresholdFraction={threshold}
          onThresholdChange={setThreshold}
          hasExtraRegion={hasExtraRegion}
        />
        <div class={styles.stageWrap}>
          <Stage
            mode={mode}
            stageSizePx={stage}
            a={{
              url: loadedA.capture.objectUrl,
              title: loadedA.capture.record.title,
              size: loadedA.capture.record,
            }}
            b={{
              url: loadedB.capture.objectUrl,
              title: loadedB.capture.record.title,
              size: loadedB.capture.record,
            }}
            splitPosition={splitPosition}
            onSplitPositionChange={setSplitPosition}
            blinkShowingA={blinkShowingA}
            blinkPlaying={blinkPlaying}
            onBlinkTogglePlay={() => setBlinkPlaying((v) => !v)}
            onBlinkStep={() => setBlinkShowingA((v) => !v)}
            diffOutcome={diffOutcome}
            regionItems={regionItems}
            selectedRegionIndex={selectedRegionIndex}
            onSelectRegion={onSelectRegion}
          />
        </div>
      </div>
    </div>
  )
}
