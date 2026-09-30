/**
 * «لقطة الدليل» في تفصيل المشكلة: لقطة العنصر من المكتبة، وإطارٌ حوله من `evidence.crop`.
 *
 * **حذف اللقطة لا يحذف المشكلة** (ADR 0030 §5): تُعرض «حُذفت لقطة الدليل من المكتبة». وإن وُجدت مصغَّرتها
 * وحدها عُرضت هي، والإطار يُقاس على أبعاد اللقطة الأصلية لا المصغَّرة — `crop` ببكسل الأصل.
 *
 * عنوان الكائن يُنشأ لكل تحميل ويُسحب عند الإزالة أو تبدّل اللقطة، فلا يبقى تسريبٌ في ذاكرة الصفحة.
 */

import { useEffect, useState } from 'preact/hooks'

import { STATUS_TONE } from '@/modules/issues/labels'
import { Skeleton } from '@/ui/components/Skeleton/Skeleton'
import { cx } from '@/ui/cx'

import { loadEvidence, type EvidenceImage } from '../issues'

import { DetailCard } from './IssueCard'
import styles from './IssueEvidence.module.css'

import type { IssueRecord } from '@/shared/issue-schema'
import type { JSX } from 'preact'

type Shot =
  | { readonly state: 'loading' }
  | { readonly state: 'missing' }
  | { readonly state: 'ready'; readonly url: string; readonly image: EvidenceImage }

interface Size {
  readonly width: number
  readonly height: number
}

/** نسبة مئوية مقيَّدة بين 0 و100 بخانتين — تُكتب في CSS لا في نصّ يُقرأ، فأرقامها غربية. */
const percent = (value: number, of: number): number =>
  Math.round(Math.min(100, Math.max(0, (value / of) * 100)) * 100) / 100

/** الإطار حول العنصر بنسبٍ من الصورة كلّها، أو `null` حين لا أبعاد أصل يُقاس عليها. */
export function outlineOf(
  crop: IssueRecord['evidence']['crop'],
  base: Size | null,
): { x: number; y: number; width: number; height: number } | null {
  if (!base || base.width <= 0 || base.height <= 0 || crop.width <= 0 || crop.height <= 0) {
    return null
  }
  const x = percent(crop.x, base.width)
  const y = percent(crop.y, base.height)
  return {
    x,
    y,
    width: Math.min(percent(crop.width, base.width), 100 - x),
    height: Math.min(percent(crop.height, base.height), 100 - y),
  }
}

export function IssueEvidence({ issue }: { issue: IssueRecord }): JSX.Element {
  const captureId = issue.evidence.captureId
  const [shot, setShot] = useState<Shot>({ state: 'loading' })
  const [natural, setNatural] = useState<Size | null>(null)

  useEffect(() => {
    let live = true
    let url: string | null = null
    setShot({ state: 'loading' })
    setNatural(null)
    void loadEvidence(captureId).then((image) => {
      if (!live) return
      if (!image) return setShot({ state: 'missing' })
      try {
        url = URL.createObjectURL(image.blob)
      } catch {
        // صورةٌ لا يُنشأ لها عنوان كالمفقودة: لا يُعرض شيءٌ مكسور.
        return setShot({ state: 'missing' })
      }
      setShot({ state: 'ready', url, image })
    })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [captureId])

  const outline =
    shot.state === 'ready'
      ? outlineOf(issue.evidence.crop, shot.image.thumbnail ? shot.image.originalSize : natural)
      : null

  return (
    <DetailCard title="لقطة الدليل">
      {shot.state === 'loading' ? (
        <div role="status" aria-busy="true" aria-label="جارٍ تحميل لقطة الدليل">
          <Skeleton kind="panel" />
        </div>
      ) : shot.state === 'missing' ? (
        <p class={cx(styles.missing, 't-arabic-ui-s')}>حُذفت لقطة الدليل من المكتبة</p>
      ) : (
        <figure class={styles.figure}>
          {/* إحداثيات الصورة يسارها الأصل مهما كان اتجاه الصفحة، فالإطار يتموضع فيه بلا انعكاس. */}
          <div class={styles.frame}>
            <img
              class={styles.image}
              src={shot.url}
              alt="لقطة العنصر الذي سُجّلت عليه المشكلة"
              onLoad={(e: JSX.TargetedEvent<HTMLImageElement>) =>
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
            />
            {outline ? (
              <span
                class={cx(styles.outline, styles[`outline-${STATUS_TONE[issue.status]}`])}
                data-evidence-outline
                aria-hidden="true"
                style={{
                  '--rasd-crop-x': `${outline.x}%`,
                  '--rasd-crop-y': `${outline.y}%`,
                  '--rasd-crop-w': `${outline.width}%`,
                  '--rasd-crop-h': `${outline.height}%`,
                }}
              />
            ) : null}
          </div>
          <figcaption class={cx(styles.caption, 't-arabic-ui-xs')}>
            مقتطع حول العنصر من لقطة الصفحة وقت التسجيل
          </figcaption>
        </figure>
      )}
    </DetailCard>
  )
}
