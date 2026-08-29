import { box, type Rect } from './geometry'

import type { JSX } from 'preact'

export interface FrameBlockedProps {
  /** مستطيل الإطار في المستند الأعلى، بإحداثيات النافذة. */
  rect: Rect
  note?: string
}

/**
 * علامة «خارج النطاق» فوق إطار من أصل آخر.
 *
 * الإطار cross-origin لا يمكن الوصول إلى داخله، والبديل عن الفشل الصامت أن
 * تُوسَم مساحته صراحةً: المستخدم يرى **أين** تتوقّف الأداة و**لماذا**، بدل
 * أن يظنّ الأداة معطّلة.
 */
export function FrameBlocked({
  rect,
  note = 'إطار من أصل آخر — خارج نطاق الفحص',
}: FrameBlockedProps): JSX.Element {
  return (
    <div class="rasd-ov-place rasd-ov-frame-blocked" style={box(rect)} data-rasd-ov="frame-blocked">
      <span class="rasd-ov-frame-blocked-note rasd-ov-ar">{note}</span>
    </div>
  )
}
