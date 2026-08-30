import { useEffect } from 'preact/hooks'

import { formatPercent } from '@/shared/bidi'

import styles from './ExportProgress.module.css'

import type { JSX } from 'preact'

export interface ExportProgressProps {
  /** ٠…١. */
  readonly fraction: number
  readonly width: number
  readonly height: number
  readonly scale: 1 | 2
  readonly error: string | null
  readonly onCancel: () => void
}

/**
 * تقدّم التصدير — **بإلغاءٍ حقيقي**.
 *
 * ⎋ يُلغي، والزرّ يُلغي. والإلغاء ليس إخفاءً للّوحة: `bake` تفحص الإشارة
 * عند كل شريحة وكل عقدة، وتُرجع خطأً **ولا تبني بايتات قطّ**. فتصديرٌ
 * أُلغي في منتصفه لا يكتب ملفًّا نصفُ مناطقه محجوب.
 *
 * **والمقاس معروض قبل الانتظار.** تصديرٌ يستغرق عشرين ثانية بلا رقم يشرح
 * لماذا يجعل المستخدم يظنّ الأداة معلّقة.
 */
export function ExportProgress(props: ExportProgressProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      props.onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onCancel])

  const pct = Math.max(0, Math.min(1, props.fraction))

  return (
    <div
      class={styles.scrim}
      data-export-progress=""
      role="dialog"
      aria-modal="true"
      aria-label="تصدير الصورة"
    >
      <div class={styles.card}>
        <h2 class={styles.title}>جارٍ التصدير…</h2>

        <p class={styles.detail} data-export-size>
          {props.width} × {props.height} عند {props.scale}×
        </p>

        <div
          class={styles.track}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 100)}
        >
          <div class={styles.fill} style={{ inlineSize: `${pct * 100}%` }} />
        </div>

        {props.error ? (
          <p class={styles.error} data-export-error>
            {props.error}
          </p>
        ) : null}

        <div class={styles.row}>
          {/* غربية: نسبة قياس لا عدٌّ بشري. */}
          <span class={styles.hint} data-export-percent>
            {formatPercent(pct)}
          </span>
          <button type="button" data-export-cancel onClick={props.onCancel}>
            إلغاء (⎋)
          </button>
        </div>
      </div>
    </div>
  )
}
