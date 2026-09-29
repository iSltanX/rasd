import { IconButton } from '@/ui/components/IconButton/IconButton'
import { RasdMark } from '@/ui/RasdMark'

import styles from '../Popup.module.css'

import type { JSX } from 'preact'

export interface HeaderProps {
  /**
   * سطر الحالة تحت اسم المنتج — سياقي لا ثابت: مضيف التبويب في `default`،
   * تقدّم الالتقاط في `capturing`، سبب المنع في `restricted`، وهكذا لكل حالة.
   */
  status: string
  onSettings?: () => void
}

/**
 * ترويسة ثابتة في كل الحالات — العلامة وسطر الحالة في بداية السطر (يمينًا)، وزرّ
 * الإعدادات في نهايته، كما في `13 — Extension Popup`.
 *
 * `onSettings` يُهيَّأ بدالّة فارغة لا يُترَك `undefined`: `IconButton.onClick`
 * يشترط دالّة حقيقية تحت `exactOptionalPropertyTypes` — تمرير `undefined`
 * صراحةً مرفوض وقت الترجمة، لا سلوك وقت تشغيل.
 */
export function Header({ status, onSettings = () => undefined }: HeaderProps): JSX.Element {
  return (
    <header class={styles.header}>
      <div class={styles.brand}>
        <RasdMark size="md" class={styles.brandMark} title="رصد" />
        <div class={styles.brandNames}>
          <span class={styles.brandName}>رصد</span>
          <bdi class={styles.brandStatus}>{status}</bdi>
        </div>
      </div>
      <IconButton icon="settings" aria-label="الإعدادات" size="m" onClick={onSettings} />
    </header>
  )
}
