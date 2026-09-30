/**
 * قسم «مناطق هذه الجلسة» في الشريط الجانبي — `compare / session-zones` (`393:2742` · `395:61044`).
 *
 * **لقطتان بلا مرجع: المناطق هنا مؤقّتة وتقول ذلك.** الشارة «غير محفوظة» والشرح تحتها ليسا زخرفة:
 * من يرسم منطقةً ثم يغلق الصفحة يفقدها، وهذا يُقال قبل أن يفقدها لا بعد.
 *
 * **زرّ الرسم `<button>` محلّي لا `Button` المشترك** لأن المشترك لا يقبل `aria-pressed`، والزرّ
 * تبديلٌ بين حالتين (وضع الرسم قائم/غير قائم) فحالته تُعلَن لقارئ الشاشة.
 *
 * الفئات الثلاث الأخرى في الإطار (مناطق مضافة/محذوفة، تغيّرات لونية، فروق نصية) غير مبنيّة — تصنيفٌ
 * دلاليّ لا يستخرجه المحرّك؛ انظر ترويسة `Sidebar.tsx`.
 */

import { zoneDimensions, type SessionZone } from '@/pages/compare/session-zones'
import { formatHuman } from '@/shared/bidi/numerals'
import { Chip } from '@/ui/components/Chip/Chip'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { Icon } from '@/ui/icons/Icon'

import styles from './ZonesSection.module.css'

import type { JSX } from 'preact'

export interface ZonesSectionProps {
  readonly zones: readonly SessionZone[]
  readonly drawing: boolean
  readonly onToggleDrawing: () => void
  readonly onRemoveZone: (id: number) => void
}

export function ZonesSection({
  zones,
  drawing,
  onToggleDrawing,
  onRemoveZone,
}: ZonesSectionProps): JSX.Element {
  return (
    <section class={styles.section} data-compare-zones="">
      <div class={styles.head}>
        <h2 class={styles.heading}>مناطق هذه الجلسة</h2>
        <Chip tone="warning">غير محفوظة</Chip>
      </div>

      <p class={styles.note}>
        لقطتان بلا مرجع: تُطبَّق المناطق هنا وتُنسى عند إغلاق الصفحة. للحفظ، ثبّت إحداهما مرجعًا.
      </p>

      {zones.length > 0 ? (
        <ul class={styles.list}>
          {zones.map((zone, index) => (
            <li key={zone.id} class={styles.row} data-compare-zone={String(zone.id)}>
              <span class={styles.number}>{formatHuman(index + 1)}</span>
              <Chip dot={false}>مستطيل</Chip>
              <bdi dir="ltr" class={styles.dimensions}>
                {zoneDimensions(zone.rect)}
              </bdi>
              <IconButton
                icon="trash"
                size="s"
                aria-label={`احذف المنطقة ${formatHuman(index + 1)}`}
                onClick={() => onRemoveZone(zone.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p class={styles.empty}>لا مناطق مستثناة — كل البكسلات تدخل الفرق.</p>
      )}

      <button
        type="button"
        class={styles.drawButton}
        aria-pressed={drawing}
        data-compare-zone-draw=""
        onClick={onToggleDrawing}
      >
        <Icon name="capture-area" size="sm" />
        <span>ارسم مستطيلًا</span>
      </button>
    </section>
  )
}
