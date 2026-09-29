/**
 * شبكة المكتبة الافتراضية — تُركِّب `virtualize.ts` على DOM حقيقي.
 *
 * **عدد الأعمدة يُقاس لا يُخمَّن**: عرض الحاوية يُرصَد بـ`ResizeObserver`
 * (نمط `Stage.tsx` بالمرحلة 15 حرفيًّا)، ويُحوَّل إلى عدد أعمدة بنفس صيغة
 * `auto-fill` التي يستعملها CSS Grid فعليًا — فلا ينحرف عدد ما يُرسَم عن عدد
 * ما تراه العين، حتى مع تكبير النص أو تصغيره (يُقرأ حجم الجذر لا يُفترَض 16px).
 *
 * **ارتفاع الصفّ تقدير محدود الخطأ لا حساب دقيق**: البطاقة تحوي مصغَّرة
 * بنسبة عرض إلى ارتفاع ثابتة (275 × 148 في الإطار) فوق نصّين، وارتفاعها الفعلي
 * يتبع عرض عمودها. حساب دقيق يحتاج قياس بطاقة مرسومة فعلًا — دورة قياس-ثم-رسم لكل
 * تغيّر عرض. التقدير هنا يكفي لأن هامش `overscanRows` الافتراضي (صفّان)
 * يمتصّ الفارق: أسوأ الأحوال صفٌّ إضافي يُرسَم أو يُغاب عن الرسم للحظة قبل
 * إعادة القياس التالية — لا وميض حقيقي ولا صفّ فارغ دائم.
 */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { computeVirtualGrid } from '@/modules/library/virtualize'

import { Card } from './Card'
import styles from './Grid.module.css'

import type { CaptureRecord } from '@/shared/storage/schema'
import type { JSX } from 'preact'

/** يطابق `minmax(16rem, …)` في `Grid.module.css` — مصدر واحد مُعاد استعماله في القياسين. */
const MIN_CARD_REM = 16
/** يطابق `--rasd-space-16` في `Grid.module.css` — فجوة صفوف الإطار وأعمدته. */
const GAP_PX = 16
/** نسبة المصغَّرة في `capture-card`: 148 ارتفاعًا لكل 275 عرضًا. */
const THUMB_RATIO = 148 / 275
/** حدّا البطاقة (1 + 1)، يقتطعان من عرض المصغَّرة ويُضافان إلى الارتفاع. */
const CARD_BORDERS_PX = 2
/** كتلة الوصف في الإطار: حشوة 10 وعنوان 20.8 وفجوة 3 وسطر 19.2 وحشوة 11. */
const TEXT_BLOCK_PX = 64

function rootFontSizePx(): number {
  if (typeof document === 'undefined') return 16
  const parsed = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16
}

export interface GridProps {
  records: readonly CaptureRecord[]
  thumbnailUrls: ReadonlyMap<string, string | null>
  onNeedThumbnail: (captureId: string) => void
  projectNames: Readonly<Record<string, string>>
  selection: ReadonlySet<string>
  onToggleSelect: (id: string) => void
  onOpen: (id: string) => void
  now?: number
}

export function Grid({
  records,
  thumbnailUrls,
  onNeedThumbnail,
  projectNames,
  selection,
  onToggleSelect,
  onOpen,
  now,
}: GridProps): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState({ width: 0, height: 0, scrollTop: 0 })

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const read = () => {
      setMetrics((m) => ({ ...m, width: el.clientWidth, height: el.clientHeight }))
    }
    read()

    const ro = new ResizeObserver(read)
    ro.observe(el)

    const onScroll = () => setMetrics((m) => ({ ...m, scrollTop: el.scrollTop }))
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  const { columns, rowHeightPx } = useMemo(() => {
    const rootPx = rootFontSizePx()
    const minCardPx = MIN_CARD_REM * rootPx
    // صيغة auto-fill نفسها: floor((W + gap) / (min + gap))، بحدّ أدنى عمود واحد.
    const cols = Math.max(1, Math.floor((metrics.width + GAP_PX) / (minCardPx + GAP_PX)))
    const cardWidthPx = cols > 0 ? (metrics.width - (cols - 1) * GAP_PX) / cols : minCardPx
    const thumbHeightPx = (cardWidthPx - CARD_BORDERS_PX) * THUMB_RATIO
    return { columns: cols, rowHeightPx: thumbHeightPx + TEXT_BLOCK_PX + CARD_BORDERS_PX }
  }, [metrics.width])

  const virtual = useMemo(
    () =>
      computeVirtualGrid({
        itemCount: records.length,
        columns,
        rowHeight: rowHeightPx,
        rowGap: GAP_PX,
        scrollTop: metrics.scrollTop,
        viewportHeight: metrics.height,
      }),
    [records.length, columns, rowHeightPx, metrics.scrollTop, metrics.height],
  )

  const visible = records.slice(virtual.startIndex, virtual.endIndex)

  /*
   * مصفوفة الاعتماديات مقصودة لا سهو: `virtual.startIndex`/`endIndex` وحدهما.
   * `thumbnailUrls` **يتغيّر كنتيجة لهذا التأثير نفسه** (الأب يحدِّث الخريطة
   * بعد أن يُطلَب التحميل) — لو أُدرجت في الاعتماديات لأعاد كل تحديث خريطة
   * نفس طلبات المصغَّرات لعناصر مرئية لم تتغيّر، في حلقة لا تهدأ. لا مكتبة
   * فحص اعتماديات مُثبَّتة في هذا المشروع تفرض هذا آليًا (Preact لا React) —
   * والقرار هنا موثَّق نصًّا بدل ذلك.
   */
  useEffect(() => {
    for (const record of visible) {
      if (!thumbnailUrls.has(record.id)) onNeedThumbnail(record.id)
    }
  }, [virtual.startIndex, virtual.endIndex])

  return (
    <div class={styles.scroller} ref={scrollerRef} data-testid="library-grid-scroller">
      <div class={styles.spacer} style={{ blockSize: `${virtual.totalHeight}px` }}>
        <div
          class={styles.window}
          style={{ transform: `translateY(${virtual.offsetTop}px)` }}
          role="list"
          aria-label="لقطات المكتبة"
        >
          {visible.map((record) => (
            <div role="listitem" key={record.id}>
              <Card
                record={record}
                thumbnailUrl={thumbnailUrls.get(record.id) ?? null}
                projectName={record.projectId ? (projectNames[record.projectId] ?? null) : null}
                selectionMode={selection.size > 0}
                selected={selection.has(record.id)}
                onToggleSelect={onToggleSelect}
                onOpen={onOpen}
                now={now}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export { MIN_CARD_REM as GRID_MIN_CARD_REM, GAP_PX as GRID_GAP_PX }
