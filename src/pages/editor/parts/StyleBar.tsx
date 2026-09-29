import { setPinStart } from '@/modules/editor/pins'
import { setPinShape } from '@/modules/editor/scene-ops'
import { formatHuman, formatUnit } from '@/shared/bidi'
import { ANNOTATION_COLORS } from '@/shared/settings/schema'

import styles from './StyleBar.module.css'

import type { ToolSettings } from '../tools'
import type { Patch } from '@/modules/editor/commands'
import type { History } from '@/modules/editor/history'
import type { Palette } from '@/modules/editor/renderer'
import type { AnnotationColor, PinNode } from '@/modules/editor/scene'
import type { JSX } from 'preact'

export interface StyleBarProps {
  readonly settings: ToolSettings
  readonly onSettings: (next: ToolSettings) => void
  readonly history: History
  readonly onChange: () => void
}

const COLOR_LABEL: Readonly<Record<AnnotationColor, string>> = {
  'tool/annotate/solid': 'كهرماني',
  'tool/capture/solid': 'فيروزي',
  'tool/inspect/solid': 'بنفسجي',
  'tool/measure/solid': 'وردي',
  'tool/compare/solid': 'أزرق',
  'status/danger/solid': 'أحمر',
  'status/success/solid': 'أخضر',
}

const SHAPE_LABEL: Readonly<Record<PinNode['shape'], string>> = {
  circle: 'دائرة',
  square: 'مربّع',
  pin: 'دبّوس',
}

const SHAPES: readonly PinNode['shape'][] = ['circle', 'square', 'pin']

/**
 * نمط التعليق — اللون والسمك وحجم الخطّ، وشكل الدبّوس ونقطة بدايته.
 *
 * **الإعدادات تصف ما سيُرسم لا ما رُسم.** تغييرها لا يمسّ عقدةً قائمة: من
 * أراد تغيير شكلٍ مرسوم يحدّده ويغيّره — وخلطُ الأمرين يجعل اختيار لونٍ
 * للأداة يعيد تلوين كل ما سبق بلا أن يطلبه أحد.
 *
 * **وشكل الدبّوس ونقطة البداية استثناءان مقصودان**: كلاهما **خاصيّة مشهد**
 * لا خاصيّة أداة (`SceneMeta`)، فتغييرهما يُحدِّث القائم فعلًا — وهو ما
 * ينصّ عليه `§5.2`: «تغيير نقطة البداية» يعني إعادة ترقيم ما رُسم.
 *
 * **والأرقام مزدوجة القناة**: السمك وحجم الخطّ قياسان بأرقام غربية، ونقطة
 * البداية عدٌّ بشري بأرقام هندية.
 */
export interface ColorSwatchesProps {
  readonly settings: ToolSettings
  readonly onSettings: (next: ToolSettings) => void
  readonly palette: Palette
}

/**
 * ألوان التعليق السبعة — في أسفل سكّة الأدوات كما في `editor / annotating` (`70:2`)، لا في
 * اللوحة: اللون يُختار مع الأداة، واليد عند السكّة.
 */
export function ColorSwatches(props: ColorSwatchesProps): JSX.Element {
  return (
    <div class={styles.swatches} role="group" aria-label="لون التعليق">
      {ANNOTATION_COLORS.map((token) => (
        <button
          key={token}
          type="button"
          class={styles.swatch}
          data-style-color={token}
          aria-label={COLOR_LABEL[token]}
          title={COLOR_LABEL[token]}
          aria-pressed={props.settings.colorToken === token}
          style={{ background: props.palette[token] }}
          onClick={() => props.onSettings({ ...props.settings, colorToken: token })}
        />
      ))}
    </div>
  )
}

export function StyleBar(props: StyleBarProps): JSX.Element {
  const scene = props.history.state.scene

  const commit = (label: string, patches: readonly Patch[]): void => {
    if (patches.length === 0) return
    props.history.mark(label)
    props.history.push(patches)
    props.history.commit()
    props.onChange()
  }

  return (
    <section class={styles.bar} data-style-bar="" aria-label="نمط التعليق">
      <h2 class={styles.title}>النمط</h2>

      <div class={styles.field}>
        <label class={styles.label} for="style-stroke">
          سمك الخطّ
        </label>
        <div class={styles.row}>
          <input
            id="style-stroke"
            type="range"
            data-style-stroke
            min={1}
            max={24}
            step={1}
            value={props.settings.strokeWidthCss}
            onInput={(e) =>
              props.onSettings({ ...props.settings, strokeWidthCss: Number(e.currentTarget.value) })
            }
          />
          <span class={styles.value}>{formatUnit(props.settings.strokeWidthCss)}</span>
        </div>
      </div>

      <div class={styles.field}>
        <label class={styles.label} for="style-font">
          حجم الخطّ
        </label>
        <div class={styles.row}>
          <input
            id="style-font"
            type="range"
            data-style-font
            min={10}
            max={72}
            step={1}
            value={props.settings.fontSizeCss}
            onInput={(e) =>
              props.onSettings({ ...props.settings, fontSizeCss: Number(e.currentTarget.value) })
            }
          />
          <span class={styles.value}>{formatUnit(props.settings.fontSizeCss)}</span>
        </div>
      </div>

      <div class={styles.field}>
        <span class={styles.label} id="style-pin-label">
          شكل الدبّوس
        </span>
        <div class={styles.shapes} role="group" aria-labelledby="style-pin-label">
          {SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              class={styles.shape}
              data-pin-shape={shape}
              aria-pressed={scene.meta.pinShape === shape}
              onClick={() => {
                props.onSettings({ ...props.settings, pinShape: shape })
                commit('شكل الدبّوس', setPinShape(scene, shape).patches)
              }}
            >
              {SHAPE_LABEL[shape]}
            </button>
          ))}
        </div>
      </div>

      <div class={styles.field}>
        <label class={styles.label} for="style-pin-start">
          يبدأ الترقيم من
        </label>
        <div class={styles.row}>
          <input
            id="style-pin-start"
            type="number"
            data-pin-start
            min={0}
            max={99}
            value={scene.meta.pinStart}
            onInput={(e) =>
              commit('بداية الترقيم', setPinStart(scene, Number(e.currentTarget.value)))
            }
          />
          {/* هندية: عدٌّ بشري لا قياس. */}
          <span class={styles.value}>{formatHuman(scene.meta.pinStart)}</span>
        </div>
      </div>
    </section>
  )
}
