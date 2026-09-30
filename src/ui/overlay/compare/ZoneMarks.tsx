import { formatDimensions, formatHuman } from '@/shared/bidi'

import { at, box, HINT_OFFSET_PX, type Rect } from '../geometry'

import type { JSX } from 'preact'

/**
 * المناطق المستثناة فوق المرجع — `compare / exclusions` (`391:1989`) و`compare / exclusion-draw` (`391:2217`)
 * و`compare / exclusion-pick` (`391:2422`). **تعرض ولا تحسب**، كبقيّة بدائيّات الطبقة: المستطيلات بفضاء
 * النافذة جاهزة من السلك (`referenceRectToViewport` بتحويل المرجع الحالي).
 *
 * قناعٌ بحدّ متقطّع ورقمه في زاويته؛ والساقطة إلى مستطيلها المحفوظ بلون التحذير (`391:3022`). والرسم الجاري
 * أو العنصر تحت المؤشِّر بمقاسه — ومحدِّده حين يُختار عنصر — وتلميح المفاتيح أسفل النافذة كبقيّة الأوضاع.
 */

export interface ZoneMark {
  readonly id: string
  readonly rect: Rect
  readonly fallback: boolean
}

export interface ZoneMarksProps {
  readonly marks: readonly ZoneMark[]
  readonly draft: { readonly rect: Rect; readonly selector?: string } | null
  readonly tool: 'draw' | 'pick' | null
  /** حدود النافذة — لموضع التلميح. */
  readonly bounds: Rect
}

const HINTS = {
  draw: [
    { key: 'اسحب', label: 'ارسم منطقة' },
    { key: 'esc', label: 'إلغاء' },
  ],
  pick: [
    { key: 'انقر', label: 'اختر العنصر' },
    { key: 'esc', label: 'إلغاء' },
  ],
} as const

export function ZoneMarks({ marks, draft, tool, bounds }: ZoneMarksProps): JSX.Element {
  return (
    <>
      {marks.map((mark, i) => (
        <div
          key={mark.id}
          class="rasd-ov-place rasd-ov-zone"
          style={box(mark.rect)}
          data-fallback={mark.fallback}
          data-rasd-ov="compare-zone-mark"
        >
          <span class="rasd-ov-zone-tag">
            {formatHuman(i + 1)} · {mark.fallback ? 'مستطيل احتياطي' : 'مستثناة'}
          </span>
        </div>
      ))}

      {draft ? (
        <div
          class="rasd-ov-place rasd-ov-zone"
          style={box(draft.rect)}
          data-draft="true"
          data-rasd-ov="compare-zone-draft"
        >
          <span class="rasd-ov-zone-tag">
            <bdi dir="ltr">
              {formatDimensions(Math.round(draft.rect.width), Math.round(draft.rect.height))}
              {draft.selector ? ` ${draft.selector}` : ''}
            </bdi>
          </span>
        </div>
      ) : null}

      {tool ? (
        <div
          class="rasd-ov-place"
          style={at({
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height - HINT_OFFSET_PX,
          })}
          data-rasd-ov="hint"
        >
          <span class="rasd-ov-hint" style={{ translate: '-50% 0' }}>
            {HINTS[tool].map((h) => (
              <span key={h.key} class="rasd-ov-hint-item">
                <kbd class="rasd-ov-key">{h.key}</kbd>
                <span class="rasd-ov-hint-label">{h.label}</span>
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </>
  )
}
