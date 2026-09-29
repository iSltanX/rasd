/**
 * نظرة المشاريع العامّة — `projects / overview` (`72:2`): بطاقة لكل مشروع بلونه واسمه،
 * وأعداده، وآخر نشاط، وأحدث خمس لقطات. النقر يفتح المشروع في المكتبة.
 *
 * البطاقة تعرض ما يُقاس وحده (`project-overview.ts`): لا رقاقة حالة ولا موقع ولا «ملاحظات
 * مفتوحة» — لا حقول لها في المشروع، والإطار يرسمها.
 */

import { useEffect } from 'preact/hooks'

import { formatHuman, formatRelativeTime } from '@/shared/bidi/numerals'
import { cx } from '@/ui/cx'

import styles from './ProjectsOverview.module.css'

import type { ProjectOverview } from '../project-overview'
import type { JSX } from 'preact'

export interface ProjectsOverviewProps {
  items: readonly ProjectOverview[]
  thumbnailUrls: ReadonlyMap<string, string | null>
  onNeedThumbnail: (captureId: string) => void
  onOpen: (projectId: string) => void
  now?: number
}

export function ProjectsOverview({
  items,
  thumbnailUrls,
  onNeedThumbnail,
  onOpen,
  now = Date.now(),
}: ProjectsOverviewProps): JSX.Element {
  useEffect(() => {
    for (const item of items) {
      for (const id of item.recent) if (!thumbnailUrls.has(id)) onNeedThumbnail(id)
    }
    // المصغّرات تُطلَب حين تتغيّر البطاقات لا حين تصل مصغّرة — انظر `Grid.tsx`.
  }, [items])

  return (
    <ul class={styles.grid} aria-label="المشاريع">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            class={styles.card}
            data-overview-project={item.id}
            onClick={() => onOpen(item.id)}
          >
            <span class={styles.head}>
              <span class={styles.swatch} style={{ background: item.color }} aria-hidden="true" />
              <span class={cx(styles.name, 't-arabic-ui-m-strong')}>{item.name}</span>
            </span>
            <span class={styles.stats}>
              <Stat label="اللقطات" value={formatHuman(item.captures)} />
              <Stat label="اللوحات" value={formatHuman(item.palettes)} />
              <Stat label="الألوان" value={formatHuman(item.colors)} />
              <Stat label="آخر تحديث" value={formatRelativeTime(item.updatedAt, now)} small />
            </span>
            <span class={styles.thumbs} aria-hidden="true">
              {Array.from({ length: 5 }, (_, i) => {
                const id = item.recent[i]
                const url = id ? thumbnailUrls.get(id) : null
                return (
                  <span key={i} class={styles.thumb}>
                    {url ? <img src={url} alt="" class={styles.thumbImg} /> : null}
                  </span>
                )
              })}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Stat({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <span class={styles.stat}>
      <span class={cx(styles.statLabel, 't-arabic-label-xs')}>{label}</span>
      <span class={cx(styles.statValue, small ? 't-arabic-ui-xs' : 't-arabic-ui-s-strong')}>
        {value}
      </span>
    </span>
  )
}
