import { formatRelativeTime } from '@/shared/bidi'

import styles from './SaveStatus.module.css'

import type { SaveOutcome, SaveState } from '@/modules/editor/autosave'
import type { JSX } from 'preact'

export interface SaveStatusProps {
  readonly state: SaveState
  readonly savedAt: number | null
  readonly now?: number
  /** «أبقِ ما عندي» — يكتب فوق نسختهم. */
  readonly onKeepMine: () => void
  /** «افتح نسختهم» — يعيد التحميل ويخسر ما لم يُحفَظ. */
  readonly onTakeTheirs: () => void
  /** إعادة محاولة بعد فشلٍ عابر. */
  readonly onRetry: () => void
}

/** ما يُقرأ في الشريط لكل نتيجة. */
const LABEL: Readonly<Record<SaveOutcome, string>> = {
  idle: 'لم يُعدَّل شيء',
  saving: 'جارٍ الحفظ…',
  saved: 'حُفظ',
  conflict: 'تعارض',
  'incognito-blocked': 'الحفظ معطَّل',
  'quota-exceeded': 'التخزين ممتلئ',
  'too-large': 'المشهد كبير جدًّا',
  failed: 'تعذّر الحفظ',
}

/** النتائج التي تُوقف الحفظ حتى يتدخّل المستخدم. */
const BLOCKED: readonly SaveOutcome[] = [
  'conflict',
  'incognito-blocked',
  'quota-exceeded',
  'too-large',
  'failed',
]

/**
 * حالة الحفظ ولافتة التعارض.
 *
 * **«تعذّر الحفظ» بلا سبب أسوأ من الصمت**: يواصل المستخدم ساعةً على عملٍ
 * لن يُحفَظ، وهو يظنّ أن كل شيء بخير. فلكل نتيجة نصّها، ولكل حالةٍ موقِفة
 * فعلٌ يخرج منها.
 *
 * **والتعارض لا يُحسَم نيابةً عن أحد.** كلا الطرفين عملُ إنسان: الكتابة
 * العمياء تمحو جلسةً كاملة، وإعادةُ التحميل الصامتة تمحو الأخرى. فالخياران
 * معروضان بأثر كلٍّ منهما مكتوبًا.
 */
export function SaveStatus(props: SaveStatusProps): JSX.Element {
  const { outcome } = props.state
  const blocked = BLOCKED.includes(outcome)

  return (
    <div>
      <p
        class={styles.status}
        data-save-status={outcome}
        data-outcome={outcome}
        data-blocked={blocked}
      >
        <span class={styles.dot} aria-hidden="true" />
        <span>
          {LABEL[outcome]}
          {outcome === 'saved' && props.savedAt !== null
            ? ` ${formatRelativeTime(props.savedAt, props.now)}`
            : ''}
        </span>
      </p>

      {blocked ? (
        <div class={styles.banner} data-save-banner={outcome} role="alert">
          <p class={styles.bannerText}>{props.state.message ?? LABEL[outcome]}</p>

          {outcome === 'conflict' ? (
            <div class={styles.actions}>
              <button type="button" data-conflict-keep onClick={props.onKeepMine}>
                أبقِ ما عندي — يُكتَب فوق نسختهم
              </button>
              <button type="button" data-conflict-take onClick={props.onTakeTheirs}>
                افتح نسختهم — يُفقَد ما لم يُحفَظ هنا
              </button>
            </div>
          ) : (
            <div class={styles.actions}>
              <button type="button" data-save-retry onClick={props.onRetry}>
                أعد المحاولة
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
