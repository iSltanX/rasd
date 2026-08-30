import { formatRelativeTime } from '@/shared/bidi'

import styles from './RecentThumb.module.css'

import type { JSX } from 'preact'

export interface RecentThumbProps {
  title: string
  createdAt: number
  /** عنوان الصورة المصغَّرة كـobject URL، أو `null` قبل توليدها. */
  thumbUrl: string | null
  /**
   * حُجبت المصغَّرة عمدًا — لقطةٌ عُلِّق عليها بحجب غير قابل للعكس.
   *
   * تُعرَض عبارةٌ بدل الصورة، لا فراغ: الفراغ يُقرأ عطلًا، والعبارة تقول
   * ما وقع وتدلّ على مكان رؤية المحجوب.
   */
  withheld?: boolean
  onClick?: () => void
}

/** بطاقة لقطة أخيرة — عنوان ووقت نسبي وصورة مصغَّرة. */
export function RecentThumb({
  title,
  createdAt,
  thumbUrl,
  withheld = false,
  onClick,
}: RecentThumbProps): JSX.Element {
  return (
    <button type="button" class={styles.thumb} onClick={onClick} data-withheld={withheld}>
      <span class={styles.text}>
        <span class={styles.title}>{title}</span>
        <span class={styles.time}>{formatRelativeTime(createdAt)}</span>
      </span>
      {withheld ? (
        <span class={styles.withheld} data-thumb-withheld>
          معلَّق عليها بحجب — افتح المحرر
        </span>
      ) : (
        <span class={styles.image} aria-hidden="true">
          {thumbUrl ? <img src={thumbUrl} alt="" class={styles.img} /> : null}
        </span>
      )}
    </button>
  )
}
