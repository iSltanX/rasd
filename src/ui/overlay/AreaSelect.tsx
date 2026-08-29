import { formatUnit } from '@/shared/bidi'

import { Dimension } from './Dimension'
import { DimensionVertical } from './DimensionVertical'
import { box, type Rect } from './geometry'
import { Marquee } from './Marquee'

import type { JSX } from 'preact'

/**
 * مقبض واحد، بموضعه المحسوب مسبقًا.
 *
 * البدائيّة **تعرض ولا تحسب**: المواضع تصل جاهزة من `handlePoint` في
 * `modules/capture/selection.ts`. والمعرّف نصّ حرّ لا نوع مستورَد، فلا يربط
 * طبقة العرض بوحدة منطق.
 */
export interface HandleSpot {
  readonly id: string
  readonly x: number
  readonly y: number
}

export interface HintKey {
  readonly label: string
  readonly key: string
}

export interface AreaSelectProps {
  /** التحديد الحالي بإحداثيات النافذة؛ `null` قبل أوّل سحب. */
  rect: Rect | null
  /** حدود النافذة — تُبنى منها قطع التعتيم الأربع. */
  bounds: Rect
  /** نصّ رقاقة النسبة، مثل `16:9`. */
  ratioLabel?: string
  /** تُعرَض في مرحلة `ready` وحدها. */
  handles?: readonly HandleSpot[]
  hints?: readonly HintKey[]
  onHandleDown?: (id: string, event: PointerEvent) => void
  onBodyDown?: (event: PointerEvent) => void
}

/**
 * أربع قطع تعتيم حول التحديد.
 *
 * `capture / area-select` في Figma يرسمها أربعة مستطيلات صريحة لا مستطيلًا
 * واحدًا بثقب — والحساب هنا يعيد إنتاجها بالضبط: علوي بعرض الحدود كاملًا،
 * وسفلي مثله، ويسار ويمين بارتفاع التحديد وحده بينهما.
 */
function scrimPieces(bounds: Rect, rect: Rect | null): Rect[] {
  if (!rect) return [bounds]
  const top = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: Math.max(0, rect.y - bounds.y),
  }
  const bottomY = rect.y + rect.height
  const bottom = {
    x: bounds.x,
    y: bottomY,
    width: bounds.width,
    height: Math.max(0, bounds.y + bounds.height - bottomY),
  }
  const left = {
    x: bounds.x,
    y: rect.y,
    width: Math.max(0, rect.x - bounds.x),
    height: rect.height,
  }
  const rightX = rect.x + rect.width
  const right = {
    x: rightX,
    y: rect.y,
    width: Math.max(0, bounds.x + bounds.width - rightX),
    height: rect.height,
  }
  return [top, bottom, left, right]
}

/**
 * `capture / area-select` — التحديد وتعتيمه ومسطرتاه ورقاقة نسبته وتلميحاته.
 *
 * تركيب من بدائيّات المرحلة 6 (`Marquee`، `Dimension`، `DimensionVertical`)
 * زائد ما تفرده هذه الشاشة: التعتيم الرباعي، والمقابض، والرقاقة، والشريط.
 *
 * المسطرتان **خارج** التحديد كما في الملفّ: الأفقية فوقه والرأسية على يساره،
 * وشارة الرأسية تتدلّى إلى ما وراء حدودها. لذلك لا قصّ على أي حاوية هنا.
 */
export function AreaSelect({
  rect,
  bounds,
  ratioLabel,
  handles = [],
  hints = [],
  onHandleDown,
  onBodyDown,
}: AreaSelectProps): JSX.Element {
  const pieces = scrimPieces(bounds, rect)

  return (
    <>
      {pieces.map((piece, i) => (
        <div
          // القطع ثابتة العدد والدور (علوي · سفلي · يسار · يمين)، فالفهرس
          // مفتاح مستقرّ لا ترتيب عشوائي.
          key={`scrim-${i}`}
          class="rasd-ov-place rasd-ov-scrim"
          style={box(piece)}
          data-rasd-ov="scrim"
        />
      ))}

      {rect ? (
        <>
          <Dimension rect={{ x: rect.x, y: rect.y - 28, width: rect.width, height: 28 }} />
          <DimensionVertical rect={{ x: rect.x - 40, y: rect.y, width: 28, height: rect.height }} />

          <Marquee rect={rect} />

          {/* جسم التحديد — يُسحب كاملًا. تحت المقابض في DOM فتفوز هي. */}
          <div
            class="rasd-ov-place"
            style={box(rect)}
            data-rasd-ov="area-body"
            onPointerDown={onBodyDown}
          >
            <span class="rasd-ov-grab" />
          </div>

          {handles.map((h) => (
            <button
              key={h.id}
              type="button"
              class={`rasd-ov-place rasd-ov-handle rasd-ov-handle-${h.id}`}
              style={box({ x: h.x, y: h.y, width: 0, height: 0 })}
              data-rasd-ov="handle"
              aria-label={`تغيير الحجم — ${h.id}`}
              onPointerDown={(e) => onHandleDown?.(h.id, e)}
            />
          ))}

          {ratioLabel ? (
            <div
              class="rasd-ov-place"
              style={box({ x: rect.x + rect.width + 12, y: rect.y - 28, width: 0, height: 0 })}
              data-rasd-ov="ratio"
            >
              <span class="rasd-ov-ratio">{ratioLabel}</span>
            </div>
          ) : null}
        </>
      ) : null}

      {hints.length > 0 ? (
        <div
          class="rasd-ov-place"
          style={box({
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height - 76,
            width: 0,
            height: 0,
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

export interface CountdownProps {
  seconds: number
  origin: { x: number; y: number }
}

/**
 * عدّاد الالتقاط المؤجَّل.
 *
 * **خامل للمؤشِّر**: الغرض من التأجيل أن يفتح المستخدم قائمة منسدلة قبل
 * الالتقاط، فلو اعترض العدّاد نقرته لأبطل الميزة التي وُجد لأجلها.
 */
export function Countdown({ seconds, origin }: CountdownProps): JSX.Element {
  return (
    <div
      class="rasd-ov-place"
      style={box({ ...origin, width: 0, height: 0 })}
      data-rasd-ov="countdown"
    >
      <span class="rasd-ov-countdown" style={{ translate: '-50% -50%' }}>
        <span class="rasd-ov-countdown-num">{formatUnit(seconds, '')}</span>
        <span class="rasd-ov-countdown-note">اضغط Esc للإلغاء</span>
      </span>
    </div>
  )
}
