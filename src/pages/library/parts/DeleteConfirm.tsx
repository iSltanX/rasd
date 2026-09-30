import { useEffect, useRef } from 'preact/hooks'

import { countText, type CountForms } from '@/shared/bidi/numerals'
import { Button } from '@/ui/components/Button/Button'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { Icon } from '@/ui/icons/Icon'

import styles from './DeleteConfirm.module.css'

import type { JSX } from 'preact'

/** معدود اللقطات — «حذف ٣ لقطات» في الإطار. */
export const CAPTURE_FORMS: CountForms = {
  one: 'لقطة واحدة',
  two: 'لقطتين',
  many: 'لقطات',
  accusative: 'لقطة',
  singular: 'لقطة',
}

/** معدود الأنواع الأخرى — الشريط البسيط لا يعرف أيّها محدَّد. */
export const ITEM_FORMS: CountForms = {
  one: 'عنصر واحد',
  two: 'عنصرين',
  many: 'عناصر',
  accusative: 'عنصرًا',
  singular: 'عنصر',
}

export interface DeleteConfirmProps {
  readonly count: number
  readonly forms: CountForms
  /** ما يُحذف فعلًا وأنه لا يُسترجع — نصّ الملاحظة الخطرة. */
  readonly note: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}

/**
 * حوار الحذف النهائي — `library / delete-confirm` (`304:2735` · `310:36046`).
 *
 * بدل `window.confirm`: حوار نظامٍ بلا هويّة ولا نصّ يقول ما يُحذف. والتركيز يبدأ على «ألغِ» لا على
 * «احذف» — فعلٌ بلا تراجع لا يُنفَّذ بـEnter عابر. و`Esc` والغشاء و«×» تلغي، و`Tab` يدور داخل الحوار.
 */
export function DeleteConfirm({
  count,
  forms,
  note,
  onConfirm,
  onCancel,
}: DeleteConfirmProps): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  // الأب يمرّر `onCancel` سطريًّا فيتجدّد مع كل رسم؛ لو كان تبعيّة الأثر لأُعيد التركيز إلى «ألغِ» عند كل
  // رسمٍ للأب (المراجعة المستقلّة لـ`STAGES/04`). فالتركيز عند الفتح وحده، والمستمع يقرأ الأحدث.
  const cancel = useRef(onCancel)
  cancel.current = onCancel

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('[data-rasd-cancel]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel.current()
        return
      }
      if (e.key !== 'Tab' || !dialog.current) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div class={styles.scrim} onClick={onCancel}>
      <div
        ref={dialog}
        class={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rasd-delete-title"
        aria-describedby="rasd-delete-note"
        data-rasd-dialog="delete-confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.head}>
          <div class={styles.titles}>
            <h2 class={`${styles.title} t-arabic-heading-s`} id="rasd-delete-title">
              حذف {countText(count, forms)}
            </h2>
            <p class={`${styles.subtitle} t-arabic-ui-xs`}>الحذف نهائي</p>
          </div>
          <IconButton icon="close" aria-label="أغلق" size="m" onClick={onCancel} />
        </div>
        <div class={styles.body}>
          <p class={`${styles.note} t-arabic-ui-xs`} id="rasd-delete-note">
            <Icon name="alert" size="sm" class={styles.noteIcon} />
            <span>{note}</span>
          </p>
        </div>
        <div class={styles.actions}>
          <Button variant="secondary" size="l" data-rasd-cancel="delete" onClick={onCancel}>
            ألغِ
          </Button>
          <Button
            variant="danger"
            size="l"
            icon="trash"
            data-rasd-confirm="delete"
            onClick={onConfirm}
          >
            احذف
          </Button>
        </div>
      </div>
    </div>
  )
}
