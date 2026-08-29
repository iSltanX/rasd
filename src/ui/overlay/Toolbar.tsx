import { MODE_META, type Mode } from '@/shared/modes'
import { Icon, type IconName } from '@/ui/icons/Icon'

import { at, type Point } from './geometry'

import type { JSX } from 'preact'

export interface ToolbarItem {
  readonly mode: Mode
  /** يتجاوز أيقونة الوضع الافتراضية عند الحاجة. */
  readonly icon?: IconName
  readonly label?: string
  readonly disabled?: boolean
}

export interface ToolbarProps {
  origin: Point
  items: readonly ToolbarItem[]
  active: Mode
  onPick?: (mode: Mode) => void
  onClose?: () => void
}

/**
 * `Overlay / Toolbar` — الشريط العائم، والسطح الوحيد في الطبقة الذي يستقبل
 * المؤشِّر (`pointer-events: auto`).
 *
 * الأدوات تأتي مُمرَّرة لا مثبَّتة: البدائيّة تعرض ما يُعطى لها، والمرحلة 7
 * هي التي تقرّر أي أوضاع تُعرض ومتى. هذا يبقيها صالحة بلا تعديل مع نموّ
 * قائمة الأوضاع.
 */
export function Toolbar({ origin, items, active, onPick, onClose }: ToolbarProps): JSX.Element {
  return (
    <div class="rasd-ov-place" style={at(origin)} data-rasd-ov="toolbar">
      <div class="rasd-ov-toolbar" role="toolbar" aria-label="أدوات رصد">
        {items.map((item) => {
          const meta = MODE_META[item.mode]
          const label = item.label ?? meta.label
          return (
            <button
              key={item.mode}
              type="button"
              class="rasd-ov-tool"
              aria-pressed={active === item.mode}
              aria-label={label}
              title={label}
              disabled={item.disabled}
              onClick={() => onPick?.(item.mode)}
            >
              <Icon name={(item.icon ?? meta.icon) as IconName} size="sm" />
            </button>
          )
        })}

        <span class="rasd-ov-toolbar-divider" />

        <button
          type="button"
          class="rasd-ov-tool rasd-ov-tool-close"
          aria-label="إغلاق رصد"
          title="إغلاق رصد"
          onClick={onClose}
        >
          <Icon name="close" size="sm" />
        </button>
      </div>
    </div>
  )
}
