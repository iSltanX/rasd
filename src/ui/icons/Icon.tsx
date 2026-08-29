import { shouldMirror } from '@/shared/bidi'

import { ICON_DATA, type IconName } from './icon-data'

import type { JSX } from 'preact'

export type { IconName } from './icon-data'
export { ICON_NAMES } from './icon-data'

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

export interface IconProps {
  name: IconName
  /** يقابل سلّم `icon/*` — لا مقاس حرّ. */
  size?: IconSize
  class?: string | undefined
  /**
   * تجاوز يدوي لقرار العكس. الافتراضي `shouldMirror(name)` — قائمة المنع
   * الصريحة في `shared/bidi/isolate.ts` (الشعار، الصحّ، الوسائط، …).
   */
  mirror?: boolean
  /** عنوان يُقرأ لقارئ الشاشة. غيابه يعني أيقونة زخرفية — `aria-hidden`. */
  title?: string
}

/**
 * أيقونة من مجموعة الـ78. `currentColor` إلزامي — لا لون مجمَّد.
 *
 * العكس في RTL تلقائي حسب `shouldMirror()`، إلا إذا مُرِّر `mirror` صراحةً.
 */
export function Icon({
  name,
  size = 'md',
  class: className,
  mirror,
  title,
}: IconProps): JSX.Element {
  const entry = ICON_DATA[name]
  const mirrored = mirror ?? shouldMirror(name)

  const classes = ['rasd-icon', `rasd-icon-${size}`, className].filter(Boolean).join(' ')

  return (
    <svg
      class={classes}
      viewBox={entry.viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-mirror={mirrored ? 'true' : 'false'}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: entry.markup }}
    >
      {title ? <title>{title}</title> : null}
    </svg>
  )
}
