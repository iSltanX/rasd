import styles from './Group.module.css'

import type { ComponentChildren, JSX } from 'preact'

export interface GroupProps {
  title: string
  /** معرّف العنوان — يربط `aria-labelledby` للقسم. */
  id: string
  children: ComponentChildren
}

/**
 * مجموعة إعدادات كما في الإطار (`group · …`): عنوان `Arabic/Label/XS`، ثم بطاقة بسطح
 * `surface/default` وحدّ `border/subtle` ونصف قطر 12، صفوفها `Setting Row`.
 */
export function Group({ title, id, children }: GroupProps): JSX.Element {
  return (
    <section class={styles.group} aria-labelledby={id}>
      <h2 class={styles.title} id={id}>
        {title}
      </h2>
      <div class={styles.card}>{children}</div>
    </section>
  )
}
