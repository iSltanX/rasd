import { useEffect } from 'preact/hooks'

import { formatPercent } from '@/shared/bidi'
import { Button } from '@/ui/components/Button/Button'
import { Spinner } from '@/ui/components/Spinner/Spinner'
import { cx } from '@/ui/cx'

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
        {/* `editor / exporting` (`99:415`): الدوّارة فوق العنوان، والتفاصيل بخطّ القياس. */}
        {props.error ? null : <Spinner size="m" tone="brand" />}
        <h2 class={cx(styles.title, 't-arabic-heading-s')}>
          {props.error ? 'تعذّر إخراج الملف' : 'جارٍ إخراج الملف'}
        </h2>

        {/*
         * سطر عربي والرقم معزول: «×2» خارج العزل كانت تنقلب في سطر عربي فتُقرأ
         * «1280 × 800 1 عند×» (`STAGES/04`، لقطة `editor / exporting`).
         */}
        <p class={cx(styles.detail, 't-arabic-ui-xs')}>
          بدقّة <bdi dir="ltr">×{props.scale}</bdi>
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

        {/* النسبة في بداية السطر والأبعاد في نهايته، كما في الإطار. غربية كلتاهما: قياس لا عدّ. */}
        <div class={styles.row}>
          <span class={cx(styles.percent, 't-mono-xs')} data-export-percent>
            {formatPercent(pct)}
          </span>
          <bdi dir="ltr" class={cx(styles.hint, 't-mono-xs')} data-export-size>
            {props.width} × {props.height}
          </bdi>
        </div>
        <Button
          variant="secondary"
          size="m"
          icon="close"
          class={styles.cancel}
          data-export-cancel=""
          onClick={props.onCancel}
        >
          {props.error ? 'أغلق' : 'ألغِ'}
        </Button>
      </div>
    </div>
  )
}
