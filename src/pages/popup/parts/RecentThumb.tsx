import { formatRelativeTime } from '@/shared/bidi'

import styles from './RecentThumb.module.css'

import type { JSX } from 'preact'

export interface RecentThumbProps {
  title: string
  createdAt: number
  /** عنوان الصورة المصغَّرة كـobject URL، أو `null` قبل توليدها. */
  thumbUrl: string | null
  onClick?: () => void
}

/** بطاقة لقطة أخيرة — عنوان ووقت نسبي وصورة مصغَّرة. */
export function RecentThumb({
  title,
  createdAt,
  thumbUrl,
  onClick,
}: RecentThumbProps): JSX.Element {
  return (
    <button type="button" class={styles.thumb} onClick={onClick}>
      <span class={styles.text}>
        <span class={styles.title}>{title}</span>
        <span class={styles.time}>{formatRelativeTime(createdAt)}</span>
      </span>
      <span class={styles.image} aria-hidden="true">
        {thumbUrl ? <img src={thumbUrl} alt="" class={styles.img} /> : null}
      </span>
    </button>
  )
}
