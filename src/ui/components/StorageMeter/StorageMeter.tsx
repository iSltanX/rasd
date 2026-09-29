import { formatStorage } from '@/shared/bidi'
import { WARN_RATIO } from '@/shared/storage/quota'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import styles from './StorageMeter.module.css'

import type { JSX } from 'preact'

export type StorageLevel = 'normal' | 'near-full' | 'unknown'

export interface StorageMeterProps {
  /** ما استُهلك فعلًا، من `navigator.storage.estimate().usage`. `null` حين تعذّر القياس. */
  usage: number | null
  /** حصّة المتصفّح للأصل، من `estimate().quota`. الشريط نسبته منها لا من سقف مفترض. */
  quota: number | null
  /** مستوى مفروض للمعرض؛ في الصفحات يُشتقّ من القيمتين. */
  level?: StorageLevel | undefined
  class?: string | undefined
}

/**
 * من هذه النسبة من الحصّة يصير المؤشّر تحذيرًا — عتبة التحذير نفسها في `quota.ts`، فلا
 * يقول الشريط «تكاد تمتلئ» والمكتبة ساكتة، ولا العكس.
 */
export const NEAR_FULL_RATIO = WARN_RATIO

export function storageLevel(usage: number | null, quota: number | null): StorageLevel {
  if (usage === null || quota === null || quota <= 0) return 'unknown'
  return usage / quota >= NEAR_FULL_RATIO ? 'near-full' : 'normal'
}

const NOTE: Record<StorageLevel, string> = {
  normal: 'كل شيء محفوظ على هذا الجهاز',
  'near-full': 'المساحة تكاد تمتلئ',
  unknown: 'تعذّر قياس المساحة',
}

/**
 * `Storage Meter` — 3 variant. مؤشّر المساحة الحقيقي بدل عدّاد «1.8 / 5 GB» القديم:
 * لا حساب ولا سقف مفترض (`Docs/Design.md` §7 القرار 1). الشريط `progressbar` مقروء.
 */
export function StorageMeter({
  usage,
  quota,
  level,
  class: className,
}: StorageMeterProps): JSX.Element {
  const resolved = level ?? storageLevel(usage, quota)
  const ratio =
    resolved === 'unknown' || usage === null || quota === null || quota <= 0
      ? null
      : Math.min(1, usage / quota)
  return (
    <div class={cx(styles.meter, resolved === 'near-full' && styles.nearFull, className)}>
      <div class={styles.row}>
        <span class={styles.label} id="rasd-storage-label">
          المساحة المستخدمة
        </span>
        <bdi class={cx(styles.value, 't-mono-2xs')} dir="ltr">
          {resolved === 'unknown' || usage === null ? '—' : formatStorage(usage)}
        </bdi>
      </div>
      <div
        class={styles.track}
        role="progressbar"
        aria-labelledby="rasd-storage-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={ratio === null ? undefined : Math.round(ratio * 100)}
      >
        {ratio === null ? null : (
          <span class={styles.bar} style={{ '--rasd-storage-ratio': String(ratio) }} />
        )}
      </div>
      <div class={styles.note}>
        <Icon name="shield" size="xs" class={styles.noteIcon} />
        <span>{NOTE[resolved]}</span>
      </div>
    </div>
  )
}
