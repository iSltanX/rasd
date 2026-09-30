import { formatHuman, formatMeasure } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'
import { TechnicalValue } from '@/ui/TechnicalValue'

import { at, type Rect } from './geometry'

import type { JSX } from 'preact'

export interface FullPageRow {
  readonly label: string
  /** قيمة تقنية — تمرّ من `TechnicalValue` فتُعزَل ثنائيًّا وتُرقَّم غربيًّا. */
  readonly value: string
}

export interface FullPageStatusProps {
  bounds: Rect
  /** رقم المقطع الحالي، من واحد. */
  done: number
  total: number
  /** سطر فرعي: ما يجري الآن. */
  note?: string
  rows?: readonly FullPageRow[]
  onCancel?: () => void
}

/**
 * `capture / full-page` — لوحة حالة المسح.
 *
 * **معلَّقة بالركن الأعلى المقابل** لا في وسط الشاشة: الصفحة تمرّ تحتها
 * بسرعة، ولوحة في الوسط تحجب ما يريد المستخدم أن يطمئنّ إليه. الملفّ يضعها
 * على بعد 90 من حافّة اليمين و300 من الأعلى في إطار 1440×900؛ ونحن نعلّقها
 * بالحافّة نفسها بمسافة من السلّم.
 *
 * **خاملة للمؤشِّر إلا زرّ الإلغاء.** لا وضع نشط أثناء المهمّة، والطبقة غير
 * مفعَّلة بـ`setInteractive` — فالصفحة تبقى قابلة للتمرير والنقر تحتها،
 * وسطح الالتقاط الوحيد هو الزرّ.
 *
 * **بلا نسبة مئوية.** الملفّ يعرض «المقطع ٤ من ٦» لا «67%»: العدّ البشري
 * أصدق هنا — المستخدم ينتظر بلاطات معدودة لا تقدّمًا مستمرًّا، والنسبة تكذب
 * حين تنمو الصفحة أثناء الالتقاط فيتراجع المقام.
 */
export function FullPageStatus({
  bounds,
  done,
  total,
  note,
  rows = [],
  onCancel,
}: FullPageStatusProps): JSX.Element {
  const pct = total > 0 ? Math.min(1, done / total) : 0

  return (
    <div
      class="rasd-ov-place"
      style={at({ x: bounds.x + bounds.width - GAP, y: bounds.y + TOP })}
      data-anchor="top-right"
      data-rasd-ov="full-page-status"
    >
      <div class="rasd-ov-fp" role="status" aria-live="polite">
        <div class="rasd-ov-fp-head">
          <div class="rasd-ov-fp-titles">
            <span class="rasd-ov-fp-title">جارٍ التقاط الصفحة كاملة</span>
            <span class="rasd-ov-fp-sub">
              المقطع {formatHuman(done)} من {formatHuman(total)}
              {note ? ` · ${note}` : ''}
            </span>
          </div>
          {onCancel ? (
            <button
              type="button"
              class="rasd-ov-fp-cancel"
              aria-label="إلغاء الالتقاط"
              title="إلغاء الالتقاط"
              onClick={onCancel}
            >
              <Icon name="close" size="sm" />
            </button>
          ) : null}
        </div>

        {/*
         * الشريط يُقاد بخاصّية مخصّصة لا بعرض سطري: الكتابة على متغيّر
         * واحد تبقى داخل الشجرة المحتواة (`contain: layout style`) فلا
         * تُبطل تخطيط الصفحة تحتنا.
         */}
        <div
          class="rasd-ov-fp-bar"
          role="progressbar"
          aria-label="تقدّم التقاط الصفحة"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          style={{ '--rasd-fp-pct': `${pct * 100}%` }}
        >
          <span class="rasd-ov-fp-bar-fill" />
        </div>

        {rows.length > 0 ? (
          <dl class="rasd-ov-fp-rows">
            {rows.map((r) => (
              <div key={r.label} class="rasd-ov-fp-row">
                <dt>{r.label}</dt>
                <dd>
                  <TechnicalValue>{r.value}</TechnicalValue>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  )
}

/** مسافة اللوحة عن الحافّة — من سلّم المسافات لا من قياس الملفّ الخام. */
const GAP = 24
const TOP = 24

/** يبني صفوف اللوحة الأربعة التي يعرضها الملفّ. */
export function fullPageRows(input: {
  capturedPx: number
  totalPx: number
  tiles: number
  totalTiles: number
}): FullPageRow[] {
  return [
    {
      label: 'الارتفاع المُلتقط',
      value: `${formatMeasure(input.capturedPx)} / ${formatMeasure(input.totalPx)}`,
    },
    {
      label: 'المقاطع',
      value: `${formatMeasure(input.tiles)} / ${formatMeasure(input.totalTiles)}`,
    },
  ]
}
