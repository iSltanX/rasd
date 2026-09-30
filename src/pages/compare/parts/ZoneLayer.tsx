/**
 * طبقتا مناطق هذه الجلسة فوق المسرح — صناديق المناطق المرسومة، وطبقة الالتقاط أثناء الرسم.
 *
 * كلتاهما في فضاء المسرح نفسه (نسب مئوية من `stageSizePx`)، فتعملان بلا تغيير في طرق العرض
 * الثلاث: الفرق لا يعرف عن المناطق شيئًا، والمحرّك وحده يستثني بكسلاتها من العدّ.
 *
 * **طبقة الالتقاط شفّافة فوق المسرح كلّه لا فوق الصورة.** الصندوق هو فضاء الإحداثيات
 * (`dragToImageRect`)، والمؤشّر يُلتقَط (`setPointerCapture`) فيستمرّ السحب خارج الصندوق ويُقصّ
 * عند حدّه بدل أن يُفلَت. وتُركَّب آخر أبناء المسرح فتعلو مقبض الفصل وأزرار المناطق: الرسم
 * وضعٌ صريح يأخذ المؤشّر كلّه، لا نقرة تتنازعها ثلاثة عناصر.
 *
 * **الصناديق `pointer-events: none`** — علامةٌ بصرية لا هدف؛ تمرّ النقرات إلى ما تحتها (أزرار
 * المناطق المتغيّرة، مقبض الفصل).
 *
 * **الحالة بعد الرفع:** سحبةٌ صالحة تُضيف منطقةً ويُغادَر وضع الرسم (يملكه الأب)؛ وسحبةٌ أصغر
 * من الحدّ الأدنى لا تُضيف شيئًا ويبقى الوضع قائمًا لمحاولة ثانية. `Escape` يلغي الوضع كلّه.
 */

import { useEffect, useRef, useState } from 'preact/hooks'

import { percentBox, percentBoxStyle, type PixelRect, type PixelSize } from '@/pages/compare/layout'
import {
  dragToImageBounds,
  dragToImageRect,
  zoneChipLabel,
  type ClientPoint,
  type SessionZone,
} from '@/pages/compare/session-zones'

import styles from './ZoneLayer.module.css'

import type { DeviceRect } from '@/shared/geometry'
import type { JSX } from 'preact'

export interface ZoneBoxesProps {
  readonly zones: readonly SessionZone[]
  readonly stage: PixelSize
}

/** صناديق المناطق المرسومة — رقمها هو فهرسها في القائمة + 1، كما في الشريط الجانبي. */
export function ZoneBoxes({ zones, stage }: ZoneBoxesProps): JSX.Element {
  return (
    <>
      {zones.map((zone, index) => (
        <div
          key={zone.id}
          class={styles.zoneBox}
          style={percentBoxStyle(percentBox(zone.rect, stage))}
          data-compare-zone-box={String(zone.id)}
        >
          <span class={styles.zoneLabel}>{zoneChipLabel(index)}</span>
        </div>
      ))}
    </>
  )
}

export interface ZoneDrawLayerProps {
  readonly stageSizePx: PixelSize
  readonly onAddZone: (rect: DeviceRect) => void
  readonly onCancel: () => void
}

export function ZoneDrawLayer({
  stageSizePx,
  onAddZone,
  onCancel,
}: ZoneDrawLayerProps): JSX.Element {
  const startRef = useRef<ClientPoint | null>(null)
  const [preview, setPreview] = useState<PixelRect | null>(null)

  // `Escape` يلغي الوضع — الطبقة لا تُركَّب إلا أثناء الرسم، فحياة المستمع هي حياة الوضع.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // happy-dom لا يطبّق setPointerCapture — تدهور لا فشل، نفس نمط PageSplitHandle.
    }
    const start = { x: e.clientX, y: e.clientY }
    startRef.current = start
    setPreview(
      dragToImageBounds(start, start, e.currentTarget.getBoundingClientRect(), stageSizePx),
    )
  }

  const onPointerMove = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const start = startRef.current
    if (!start) return
    setPreview(
      dragToImageBounds(
        start,
        { x: e.clientX, y: e.clientY },
        e.currentTarget.getBoundingClientRect(),
        stageSizePx,
      ),
    )
  }

  const release = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      // المؤشِّر أُفلت أصلًا أو العنصر أُزيل.
    }
  }

  const onPointerUp = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    const start = startRef.current
    if (!start) return
    startRef.current = null
    setPreview(null)
    release(e)
    const rect = dragToImageRect(
      start,
      { x: e.clientX, y: e.clientY },
      e.currentTarget.getBoundingClientRect(),
      stageSizePx,
    )
    if (rect) onAddZone(rect)
  }

  const onPointerCancel = (e: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (!startRef.current) return
    startRef.current = null
    setPreview(null)
    release(e)
  }

  return (
    <div
      class={styles.drawLayer}
      data-compare-zone-layer=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {preview ? (
        <div
          class={styles.zoneBox}
          style={percentBoxStyle(percentBox(preview, stageSizePx))}
          data-compare-zone-preview=""
        />
      ) : null}
    </div>
  )
}
