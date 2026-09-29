import { useEffect, useRef, useState } from 'preact/hooks'

import { Button } from '@/ui/components/Button/Button'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { cx } from '@/ui/cx'

import styles from './LeaveDialog.module.css'

import type { JSX } from 'preact'

export interface LeaveDialogProps {
  /** عنوان اللقطة — سطر الحوار الثاني. */
  readonly title: string
  /** يكتب ما لم يُكتب، ويُعيد هل نجح. */
  readonly onSave: () => Promise<boolean>
  readonly onLeave: () => void
  readonly onStay: () => void
}

/**
 * `editor / leave-unsaved` (`303:23804`) — حين يغادر المستخدم بزرّ العودة وفي المشهد ما لم
 * يُكتب بعد (تهدئة الحفظ لم تنقضِ، أو فشلت كتابة). «احفظ وغادر» يُفرغ الحفظ التلقائي أوّلًا،
 * وإن فشل بقي الحوار وقال ذلك، فلا يغادر أحدٌ ظانًّا أن عمله حُفظ.
 */
export function LeaveDialog(props: LeaveDialogProps): JSX.Element {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('[data-leave-stay]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      props.onStay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onStay])

  const saveAndLeave = () => {
    setSaving(true)
    setFailed(false)
    void props.onSave().then((ok) => {
      if (ok) props.onLeave()
      else {
        setSaving(false)
        setFailed(true)
      }
    })
  }

  return (
    <div class={styles.scrim}>
      <div
        ref={dialog}
        class={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="leave-title"
        aria-describedby="leave-body"
      >
        <div class={styles.head}>
          <div class={styles.titles}>
            <h2 id="leave-title" class={cx(styles.title, 't-arabic-heading-s')}>
              تعديلات لم تُحفَظ
            </h2>
            <p class={cx(styles.subtitle, 't-arabic-ui-xs')}>{props.title}</p>
          </div>
          <IconButton icon="close" size="m" aria-label="أغلق" onClick={props.onStay} />
        </div>
        <p id="leave-body" class={cx(styles.body, 't-arabic-ui-s')}>
          {failed
            ? 'تعذّر الحفظ الآن. ابقَ وأعد المحاولة، أو غادر وتُفقَد التعديلات الأخيرة.'
            : 'في اللقطة تعديلات لم تُكتب بعد. إن غادرت الآن ضاعت.'}
        </p>
        {/* ترتيب القراءة كما في الإطار: البقاء أوّلًا والحفظ آخرًا في طرف الفعل الأساسي. */}
        <div class={styles.actions}>
          <Button variant="secondary" size="l" data-leave-stay="" onClick={props.onStay}>
            ابقَ
          </Button>
          <Button variant="danger" size="l" onClick={props.onLeave}>
            غادر بلا حفظ
          </Button>
          <Button
            variant="primary"
            size="l"
            state={saving ? 'loading' : 'default'}
            onClick={saveAndLeave}
          >
            احفظ وغادر
          </Button>
        </div>
      </div>
    </div>
  )
}
