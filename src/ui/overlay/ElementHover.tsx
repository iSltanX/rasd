import { Icon, type IconName } from '@/ui/icons/Icon'

import { BoxModel, type Edges } from './BoxModel'
import { at, box, type Rect } from './geometry'
import { NodeLabel } from './NodeLabel'

import type { JSX } from 'preact'

/** إجراء سريع واحد في الشريط الملاصق للإبراز. */
export interface QuickAction {
  readonly id: string
  readonly icon: IconName
  readonly label: string
  /** الإجراء الأساسي يأخذ لون الأداة — واحد فقط في الشريط. */
  readonly primary?: boolean
  readonly onPick?: () => void
}

export interface HintKey {
  readonly label: string
  readonly key: string
}

export interface ElementHoverProps {
  /** مستطيل الحدود، بإحداثيات النافذة؛ `null` قبل استهداف أوّل عنصر. */
  rect: Rect | null
  bounds: Rect
  tag: string
  /** المحدِّد المختصر المعروض في البطاقة. */
  selector: string
  /** يُعرَض مخطّط صندوق النموذج حين تصل حوافّه. */
  padding?: Edges
  margin?: Edges
  border?: Edges
  actions?: readonly QuickAction[]
  hints?: readonly HintKey[]
}

/** فراغ بين الإبراز وما يُعلَّق به — من الملفّ. */
const GAP = 8

/**
 * `capture / element-hover` — إبراز العنصر وبطاقته وإجراءاته.
 *
 * **بلا تعتيم**، خلافًا لتحديد المنطقة: الصفحة تبقى مرئية كاملةً لأن
 * المستخدم ما يزال يبحث ويقارن. التعتيم يليق بقرار اتُّخذ لا ببحث جارٍ.
 *
 * البطاقة معلَّقة بالركن **الأيمن العلوي** للإبراز، والإجراءات بالركن
 * **الأيسر السفلي** — كما في الملفّ حرفيًا. وكلاهما خارج الإبراز فلا يحجب
 * العنصر الذي يفحصه المستخدم.
 */
export function ElementHover({
  rect,
  bounds,
  tag,
  selector,
  padding,
  margin,
  border,
  actions = [],
  hints = [],
}: ElementHoverProps): JSX.Element {
  return (
    <>
      {rect ? (
        <>
          {/*
           * مخطّط الصندوق يُرسَم **تحت** الإبراز: طبقاته شفّافة، وحدّ الإبراز
           * هو ما يجب أن يبقى أوضح ما في المشهد.
           */}
          {padding || margin || border ? (
            <BoxModel
              rect={rect}
              {...(margin ? { margin } : {})}
              {...(border ? { border } : {})}
              {...(padding ? { padding } : {})}
            />
          ) : null}

          <div
            class="rasd-ov-place rasd-ov-elhl"
            style={box(rect)}
            data-rasd-ov="element-highlight"
          />

          <NodeLabel
            origin={{ x: rect.x + rect.width, y: Math.max(bounds.y, rect.y - GAP) }}
            anchor="bottom-right"
            tag={tag}
            selector={selector}
            width={rect.width}
            height={rect.height}
          />

          {actions.length > 0 ? (
            <div
              class="rasd-ov-place"
              style={at({ x: rect.x, y: rect.y + rect.height + GAP })}
              data-rasd-ov="quick-actions"
            >
              <span class="rasd-ov-quick" role="toolbar" aria-label="إجراءات العنصر">
                {actions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    class="rasd-ov-quick-btn"
                    data-primary={a.primary ? 'true' : 'false'}
                    aria-label={a.label}
                    title={a.label}
                    onClick={a.onPick}
                  >
                    <Icon name={a.icon} size="sm" />
                  </button>
                ))}
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {hints.length > 0 ? (
        <div
          class="rasd-ov-place"
          style={at({
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height - 76,
          })}
          data-rasd-ov="hint"
        >
          {/* الترجمة تُوسِّط الشريط أفقيًا حول نقطة وضعه. */}
          <span class="rasd-ov-hint" style={{ translate: '-50% 0' }}>
            {hints.map((h) => (
              <span key={h.key} class="rasd-ov-hint-item">
                <span class="rasd-ov-hint-label">{h.label}</span>
                <kbd class="rasd-ov-key">{h.key}</kbd>
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </>
  )
}
