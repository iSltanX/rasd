import { isMacPlatform } from '@/shared/platform'
import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import styles from './EmptyState.module.css'

import type { ComponentChildren, JSX } from 'preact'

export type EmptyStateKind =
  | 'no-captures'
  | 'no-results'
  | 'no-reference'
  | 'no-palette'
  | 'no-projects'
  | 'no-colors'
  | 'no-guides'

export interface EmptyStateProps {
  kind: EmptyStateKind
  action?: ComponentChildren
  class?: string | undefined
}

/**
 * اختصار «التقاط منطقة» الافتراضي للمنصّة — `manifest.config.ts`: `⇧⌘T` على macOS،
 * و`Ctrl+Shift+Q` على غيرها لأن `Ctrl+Shift+T` محجوزة هناك (`Docs/Engineering.md §6` الصفّ 99).
 */
const captureShortcut = (): string => (isMacPlatform() ? '⇧⌘T' : 'Ctrl+Shift+Q')

/** نصوص الحالات الأربع المرسومة من مكوّن Figma `Empty State` (`89:297`). */
const CONTENT: Record<
  EmptyStateKind,
  { icon: IconName; title: string; hint: () => ComponentChildren }
> = {
  'no-captures': {
    icon: 'capture-area',
    title: 'لا توجد لقطات بعد',
    // الاختصار معزول LTR: «⇧⌘T» في سطر عربي كانت تُرسم «T⌘⇧» (`STAGES/04`، لقطة `library / empty`).
    hint: () => (
      <>
        اضغط <bdi dir="ltr">{captureShortcut()}</bdi> في أي صفحة لالتقاط الأولى، أو افتح نافذة رصد
        من شريط الأدوات.
      </>
    ),
  },
  'no-results': {
    icon: 'search',
    title: 'لا نتائج',
    hint: () => 'لا شيء يطابق البحث. جرّب قيمة HEX أو رابطًا، أو امسح المرشّحات.',
  },
  'no-reference': {
    icon: 'split-view',
    title: 'لا يوجد مرجع',
    hint: () => 'ثبّت لقطة كمرجع لهذا المشروع، ثم ضعها فوق الصفحة الحيّة.',
  },
  'no-palette': {
    icon: 'swatches',
    title: 'لا ألوان محفوظة',
    hint: () => 'اسحب لونًا بالقطّارة واحفظه — تُصدَّر اللوحات إلى CSS أو JSON أو إعداد Tailwind.',
  },
  'no-projects': {
    icon: 'folder',
    title: 'لا مشاريع بعد',
    hint: () => 'أنشئ مشروعًا لتنظيم لقطاتك وموادّك تحته.',
  },
  'no-colors': {
    icon: 'eyedropper',
    title: 'لا ألوان محفوظة بعد',
    hint: () => 'التقط لونًا من الصفحة أو أضِفه يدويًّا لحفظه هنا.',
  },
  'no-guides': {
    icon: 'list-view',
    title: 'لا أدلّة خطوات بعد',
    hint: () => 'اجمع لقطات مرقَّمة في دليل واحد لمشاركته.',
  },
}

/**
 * `Empty State` — 7 حالات في الكود، أربعٌ منها فقط بإطار Figma مقابل
 * (`matrices.ts`). `no-projects` و`no-colors` و`no-guides` أضافتها المرحلة 18
 * بلا إطار بعد — انظر التعليق في `matrices.ts` بجوار مصفوفة هذا المكوّن.
 */
export function EmptyState({ kind, action, class: className }: EmptyStateProps): JSX.Element {
  const content = CONTENT[kind]

  return (
    <div class={cx(styles.wrap, className)}>
      <span class={styles.iconWrap}>
        <Icon name={content.icon} size="lg" class={styles.icon} />
      </span>
      <div class={styles.text}>
        <p class={cx(styles.title, 't-arabic-heading-xs')}>{content.title}</p>
        <p class={cx(styles.hint, 't-arabic-ui-s')}>{content.hint()}</p>
      </div>
      {action ? <div class={styles.action}>{action}</div> : null}
    </div>
  )
}
