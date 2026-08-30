import { useRef } from 'preact/hooks'

import {
  BLUR_SIGMA_MAX,
  BLUR_SIGMA_MIN,
  PIXELATE_CELL_MAX,
  PIXELATE_CELL_MIN,
  summariseRedaction,
} from '@/modules/editor/redact'
import {
  isIrreversible,
  OBSCURE_LABEL,
  type AnnotationColor,
  type NodeId,
  type ObscureMode,
  type RedactNode,
} from '@/modules/editor/scene'
import { setCoverToken, setRedactMode, setRedactStrength } from '@/modules/editor/scene-ops'
import { formatHuman, formatUnit } from '@/shared/bidi'
import { ANNOTATION_COLORS } from '@/shared/settings/schema'
import { Icon } from '@/ui/icons/Icon'

import styles from './RedactPanel.module.css'

import type { History } from '@/modules/editor/history'
import type { Palette } from '@/modules/editor/renderer'
import type { JSX } from 'preact'

export interface RedactPanelProps {
  readonly history: History
  readonly selection: ReadonlySet<NodeId>
  readonly palette: Palette
  readonly onChange: () => void
}

/** الأنماط بترتيب العرض — التغطية أوّلًا لأنها الوعد الوحيد. */
const MODES: readonly ObscureMode[] = ['cover', 'pixelate', 'blur']

const MODE_SHORT: Readonly<Record<ObscureMode, string>> = {
  cover: 'تغطية',
  pixelate: 'بكسلة',
  blur: 'ضبابي',
}

/** ما تعنيه الشدّة في كل نمط — رقمان بالاسم نفسه ومعنيان مختلفان. */
const STRENGTH_HINT: Readonly<Record<ObscureMode, string>> = {
  cover: 'التغطية تُدمّر المنطقة كاملةً — لا شدّة لها.',
  pixelate: 'ضلع الخليّة',
  blur: 'الانحراف المعياري',
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

/**
 * لوحة الحجب والطمس.
 *
 * **التسمية تفرّق ولا تجمع.** «حجب» للتغطية وحدها، و«طمس» للبكسلة والضباب.
 * والبكسلة بلا انتشار — بحثٌ تراجعي على نصّ معروف الخطّ يستردّه حرفًا حرفًا؛
 * والضباب التفافٌ خطّي، أي عاملٌ قابل للعكس رياضيًّا حتى التكميم والقصّ.
 * فتسميتهما «حجبًا» وعدٌ لا يُوفى: المستخدم يقرأ «حجب» فيصدّر كلمة مرور
 * مطموسة ويرسلها. انظر ADR 0015.
 *
 * **ولذلك درعٌ للتغطية وحدها، وتحذير للاثنين الآخرين — لا وعدٌ واحد لثلاثة.**
 */
export function RedactPanel(props: RedactPanelProps): JSX.Element {
  /** هل سحبةُ شدّة جارية؟ العلامة مفتوحة ما دامت. */
  const dragging = useRef(false)
  const scene = props.history.state.scene
  const summary = summariseRedaction(scene)

  const nodes = scene.nodes.filter((n): n is RedactNode => n.kind === 'redact')
  const selected =
    nodes.find((n) => props.selection.has(n.id)) ?? (nodes.length === 1 ? nodes[0] : undefined)

  /** كل تغيير علامة تاريخ كاملة — لا نوبة، فهذه أفعال ذرّية لا كتابة. */
  const commit = (label: string, patches: readonly { readonly op: string }[]): void => {
    if (patches.length === 0) return
    props.history.mark(label)
    props.history.push(patches as never)
    props.history.commit()
    props.onChange()
  }

  const mode = selected?.mode ?? 'cover'
  const guaranteed = isIrreversible(mode)

  return (
    <section class={styles.panel} data-redact-panel="" aria-label="الحجب والطمس">
      <div class={styles.head}>
        <h2 class={styles.title}>الحجب والطمس</h2>
        <span class={styles.count} data-redact-count title="عدد مناطق الحجب والطمس">
          {formatHuman(summary.total)}
        </span>
      </div>

      {summary.irreversible > 0 ? (
        <p class={styles.hint} data-redact-summary>
          منها {formatHuman(summary.irreversible)} لا يمكن استرجاعها من الملفّ المصدَّر.
        </p>
      ) : null}

      {!selected ? (
        <p class={styles.empty} data-redact-empty>
          {nodes.length === 0
            ? 'لا مناطق بعد. اسحب فوق ما تريد حجبه أو طمسه.'
            : 'اختر منطقة لتغيير نمطها.'}
        </p>
      ) : (
        <>
          <div class={styles.field}>
            <span class={styles.label} id="redact-mode-label">
              النمط
            </span>
            <div class={styles.row} role="group" aria-labelledby="redact-mode-label">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  data-redact-mode={m}
                  aria-pressed={mode === m}
                  // الاسم الكامل لقارئ الشاشة، والمختصر للعين — لا يقرأ
                  // القارئ «تغطية» مجرّدةً بلا عائلتها.
                  aria-label={OBSCURE_LABEL[m]}
                  aria-describedby="redact-promise"
                  onClick={() =>
                    commit(OBSCURE_LABEL[m], setRedactMode(scene, selected, m).patches)
                  }
                >
                  {MODE_SHORT[m]}
                </button>
              ))}
            </div>
          </div>

          {guaranteed ? (
            <p class={styles.promise} id="redact-promise" data-redact-promise>
              <Icon name="shield" size="sm" />
              <span>لا يمكن استرجاع ما تحتها من الملفّ المصدَّر.</span>
            </p>
          ) : (
            <p class={styles.warning} id="redact-promise" data-redact-warning role="note">
              <Icon name="alert" size="sm" />
              <span>
                يُدمَج في الصورة المصدَّرة، لكنه لا يمنع الاستدلال على المحتوى. للبيانات الحسّاسة
                استعمل التغطية.
              </span>
            </p>
          )}

          {mode === 'cover' ? (
            <>
              <div class={styles.field}>
                <span class={styles.label} id="redact-color-label">
                  لون التغطية
                </span>
                <div class={styles.swatches} role="group" aria-labelledby="redact-color-label">
                  {ANNOTATION_COLORS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      class={styles.swatch}
                      data-cover-token={token}
                      aria-label={COLOR_LABEL[token]}
                      aria-pressed={selected.coverToken === token}
                      style={{ background: props.palette[token] }}
                      onClick={() =>
                        commit('لون التغطية', setCoverToken(scene, selected, token).patches)
                      }
                    />
                  ))}
                </div>
              </div>
              <p class={styles.hint} data-strength-disabled>
                {STRENGTH_HINT.cover}
              </p>
            </>
          ) : (
            <div class={styles.field}>
              <label class={styles.label} for="redact-strength">
                شدّة الطمس — {STRENGTH_HINT[mode]}
              </label>
              <div class={styles.row}>
                <input
                  id="redact-strength"
                  type="range"
                  data-redact-strength
                  min={mode === 'blur' ? BLUR_SIGMA_MIN : PIXELATE_CELL_MIN}
                  max={mode === 'blur' ? BLUR_SIGMA_MAX : PIXELATE_CELL_MAX}
                  step={1}
                  value={selected.strength}
                  aria-describedby="redact-promise"
                  /*
                   * **علامة واحدة للسحبة كلّها.** `input` يقع عند كل حركة
                   * إبهام، فسحبةٌ من 12 إلى 40 تدفع ثلاثين علامة وتُخلي
                   * مكدّسًا سعته خمسون — فيضيع كل ما رُسم قبلها. فالفروق
                   * تُدفَع داخل علامة مفتوحة و`coalesce` يدمجها، وتُغلَق
                   * عند `change` أي عند ترك الإبهام.
                   */
                  onInput={(e) => {
                    const patches = setRedactStrength(
                      scene,
                      selected,
                      Number(e.currentTarget.value),
                    ).patches
                    if (patches.length === 0) return
                    if (!dragging.current) {
                      props.history.mark('شدّة الطمس')
                      dragging.current = true
                    }
                    props.history.push(patches)
                    props.onChange()
                  }}
                  onChange={() => {
                    if (!dragging.current) return
                    dragging.current = false
                    props.history.commit()
                    props.onChange()
                  }}
                />
                {/* غربية لا هندية: قياسٌ يُنسَخ إلى تذكرة، لا عدٌّ بشري. */}
                <span class={styles.value} data-strength-value>
                  {formatUnit(selected.strength)}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** يُصدَّر للاختبار: ترتيب الأنماط جزء من العقد — التغطية أوّلًا. */
export const MODE_ORDER = MODES
