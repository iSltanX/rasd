import { MODE_META, TOOL_MODES, type Mode } from '@/shared/modes'
import {
  BoxModel,
  Crosshair,
  Dimension,
  DimensionVertical,
  FrameBlocked,
  Marquee,
  NodeLabel,
  Toolbar,
} from '@/ui/overlay'

import styles from './Gallery.module.css'

import type { JSX, ComponentChildren } from 'preact'

/**
 * مسرح واحد لكل بدائيّة: يحاكي نافذة صغيرة، والبدائيّة تضع نفسها داخله
 * بالإحداثيات نفسها التي ستستقبلها فوق صفحة حقيقية.
 *
 * البدائيّات هنا معروضة في **مستند عادي** لا في Shadow Root — وهو الفرق
 * الوحيد عن التشغيل الفعلي: `overlay.css` نفسه، والتوكنز من `tokens.css`
 * بدل نسختها `:host`. ما يُختبَر هنا هو الشكل؛ أمّا العزل فلا يُثبَت إلا
 * داخل ظلّ حقيقي فوق صفحة عدائية (جولة Playwright).
 */
function Stage({
  title,
  note,
  height = 260,
  children,
}: {
  title: string
  note?: string
  height?: number
  children: ComponentChildren
}): JSX.Element {
  return (
    <div class={styles.cell}>
      <div
        class={styles.overlayStage}
        style={{ blockSize: `${height}px` }}
        data-overlay-stage={title}
      >
        <div class="rasd-ov-layer">{children}</div>
      </div>
      <div class={styles.cellCombo}>{title}</div>
      {note ? <div class={styles.overlayNote}>{note}</div> : null}
    </div>
  )
}

/**
 * حواف متساوية للعرض التوضيحي.
 *
 * تُبنى من مصفوفة الجوانب لا من كائن حرفي: أسماء الجوانب الفيزيائية
 * (`left`/`right`) ممنوعة كمفاتيح في الأنماط السطرية بقاعدة اللنت، وهي هنا
 * بيانات لا نمط — فالبناء البرمجي يعبّر عن ذلك بدل تعطيل القاعدة.
 */
const edges = (n: number) =>
  Object.fromEntries((['top', 'right', 'bottom', 'left'] as const).map((s) => [s, n])) as {
    top: number
    right: number
    bottom: number
    left: number
  }

export function OverlayStages(): JSX.Element {
  const toolbarItems = TOOL_MODES.map((mode) => ({ mode }))
  const active: Mode = 'area'

  return (
    <section class={styles.group} data-gallery-group="Overlay">
      <div class={styles.groupHeader}>
        <h2 class={styles.groupTitle}>Overlay</h2>
        <span class={styles.groupCount}>8 / 8 primitive</span>
      </div>

      <div class={styles.grid} data-overlay-grid="">
        <Stage title="Marquee">
          <Marquee rect={{ x: 28, y: 30, width: 210, height: 120 }} />
        </Stage>

        <Stage title="Node Label" height={140}>
          <NodeLabel
            origin={{ x: 16, y: 52 }}
            tag="section"
            selector=".hero-section"
            width={1280}
            height={420}
          />
        </Stage>

        <Stage title="Dimension" height={140}>
          <Dimension rect={{ x: 20, y: 56, width: 240, height: 28 }} />
        </Stage>

        <Stage title="Dimension · Vertical">
          <DimensionVertical rect={{ x: 150, y: 24, width: 28, height: 200 }} />
        </Stage>

        <Stage title="Box Model">
          <BoxModel
            rect={{ x: 24, y: 24, width: 260, height: 190 }}
            margin={edges(24)}
            border={edges(16)}
            padding={edges(20)}
          />
        </Stage>

        <Stage
          title="Toolbar"
          height={140}
          note={`${TOOL_MODES.length} أوضاع · النشط: ${MODE_META[active].label}`}
        >
          <Toolbar origin={{ x: 16, y: 48 }} items={toolbarItems} active={active} />
        </Stage>

        <Stage title="Crosshair">
          {/* لون **مأخوذ من صفحة** لا لون من سمتنا — الحرفي هنا هو المعنى. */}
          <Crosshair point={{ x: 150, y: 110 }} sample="#3b82f6" /> {/* rasd-allow-literal */}
        </Stage>

        <Stage title="Frame Blocked">
          <FrameBlocked rect={{ x: 24, y: 40, width: 260, height: 150 }} />
        </Stage>
      </div>
    </section>
  )
}
