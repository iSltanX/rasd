import { useEffect, useRef } from 'preact/hooks'

import { IconButton } from '@/ui/components/IconButton/IconButton'
import { SettingRow } from '@/ui/components/SettingRow/SettingRow'

import { LICENSES } from './licenses'
import styles from './LicensesDialog.module.css'

import type { JSX } from 'preact'

export interface LicensesDialogProps {
  onClose: () => void
}

/** نافذة التراخيص — المكتبات والخطوط المضمَّنة وتراخيصها. `Esc` أو الغشاء يغلقانها. */
export function LicensesDialog({ onClose }: LicensesDialogProps): JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const libraries = LICENSES.filter((l) => l.kind === 'library')
  const fonts = LICENSES.filter((l) => l.kind === 'font')

  return (
    <div class={styles.scrim} onClick={onClose}>
      <div
        ref={dialog}
        class={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rasd-licenses-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.head}>
          <h2 class={`${styles.title} t-arabic-heading-s`} id="rasd-licenses-title">
            تراخيص المكتبات
          </h2>
          <IconButton icon="close" aria-label="أغلق" size="m" onClick={onClose} />
        </div>
        <div class={styles.body}>
          <p class={styles.groupTitle}>المكتبات</p>
          <div class={styles.card}>
            {libraries.map((l, i) => (
              <SettingRow
                key={l.name}
                label={<bdi dir="ltr">{l.name}</bdi>}
                divider={i < libraries.length - 1}
                control={
                  <bdi class={styles.license} dir="ltr">
                    {l.license}
                  </bdi>
                }
              />
            ))}
          </div>
          <p class={styles.groupTitle}>الخطوط</p>
          <div class={styles.card}>
            {fonts.map((l, i) => (
              <SettingRow
                key={l.name}
                label={<bdi dir="ltr">{l.name}</bdi>}
                divider={i < fonts.length - 1}
                control={
                  <bdi class={styles.license} dir="ltr">
                    {l.license}
                  </bdi>
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
