import { isHideable, OBSCURE_LABEL, type NodeId, type SceneNode } from '@/modules/editor/scene'
import { deleteNodes, reorderNode, toggleHidden, toggleLocked } from '@/modules/editor/scene-ops'
import { formatHuman } from '@/shared/bidi'
import { Icon } from '@/ui/icons/Icon'

import { TOOL_LABEL } from '../tools'

import styles from './LayerList.module.css'

import type { History } from '@/modules/editor/history'
import type { JSX } from 'preact'

export interface LayerListProps {
  readonly history: History
  readonly selection: ReadonlySet<NodeId>
  readonly onSelect: (id: NodeId) => void
  readonly onChange: () => void
}

/** لا يمكن إخفاء الحجب — بحكم النوع، لا بفحصٍ يُنسى. */
const REDACT_HIDE_HINT = 'لا يمكن إخفاء الحجب — احذفه إن أردت إزالته'

/** اسمٌ يقرؤه إنسان لكل عقدة. */
function labelOf(node: SceneNode): string {
  switch (node.kind) {
    case 'redact':
      return OBSCURE_LABEL[node.mode]
    case 'pin':
      return `دبّوس ${formatHuman(node.ordinal)}`
    case 'text':
      return node.text.trim().slice(0, 24) || 'نصّ فارغ'
    case 'note':
      return node.title.trim().slice(0, 24) || 'ملاحظة'
    case 'measure':
      return 'قياس'
    default:
      return TOOL_LABEL[node.kind]
  }
}

/**
 * قائمة الطبقات.
 *
 * **الترتيب يُغيَّر بأزرار لا بالسحب وحده.** السحب مريحٌ بالفأرة وغير قابل
 * للاستعمال بلوحة المفاتيح ولا بقارئ الشاشة — وقائمةٌ لا تُرتَّب إلّا
 * بالسحب تُخرج من الميزة كل من لا يستعمل الفأرة.
 *
 * **والترتيب هنا ترتيب رسم لا ترتيب أرقام.** رفعُ دبّوس فوق سهم يغيّر ما
 * يُرسم فوق ماذا، ولا يمسّ رقمه: الرقم مخزَّن في العقدة، وإعادة الترتيب
 * تُصدر فرق `move` وحده. وخلطُ المحورين هو ما تمنعه `pins.ts` بتخزين
 * `ordinal` بدل اشتقاقه من الفهرس.
 *
 * **وعقدة الحجب لا أيقونة عين لها** — `RedactNode` بلا حقل `hidden` بحكم
 * النوع، فلا شيء تُبدّله اللوحة أصلًا. والزرّ معطَّل بتلميحه لا محذوف:
 * غيابه يُقرأ نقصًا في اللوحة، وتعطيلُه يقول لماذا.
 */
export function LayerList(props: LayerListProps): JSX.Element {
  const scene = props.history.state.scene

  const commit = (label: string, patches: readonly unknown[]): void => {
    if (patches.length === 0) return
    props.history.mark(label)
    props.history.push(patches as never)
    props.history.commit()
    props.onChange()
  }

  /** الأعلى في القائمة هو الأعلى في الرسم — أي آخر المصفوفة. */
  const rows = [...scene.nodes].reverse()

  return (
    <section class={styles.panel} data-layer-list="" aria-label="الطبقات">
      <h2 class={styles.title}>الطبقات</h2>

      {rows.length === 0 ? (
        <p class={styles.empty} data-layer-empty>
          لا طبقات بعد. ارسم شيئًا على اللقطة.
        </p>
      ) : (
        <ul class={styles.list}>
          {rows.map((node, row) => {
            const index = scene.nodes.length - 1 - row
            const hideable = isHideable(node)
            const hidden = hideable && node.hidden
            return (
              <li
                key={node.id}
                class={styles.row}
                data-layer={node.id}
                data-selected={props.selection.has(node.id)}
                data-hidden={hidden}
              >
                <button
                  type="button"
                  class={styles.label}
                  data-layer-select
                  onClick={() => props.onSelect(node.id)}
                >
                  {labelOf(node)}
                </button>

                <button
                  type="button"
                  class={styles.act}
                  data-layer-up
                  disabled={row === 0}
                  aria-label="ارفع طبقة"
                  title="ارفع طبقة"
                  onClick={() =>
                    commit('ترتيب الطبقات', reorderNode(scene, node.id, index + 1).patches)
                  }
                >
                  <Icon name="chevron-up" size="sm" />
                </button>

                <button
                  type="button"
                  class={styles.act}
                  data-layer-down
                  disabled={row === rows.length - 1}
                  aria-label="أنزل طبقة"
                  title="أنزل طبقة"
                  onClick={() =>
                    commit('ترتيب الطبقات', reorderNode(scene, node.id, index - 1).patches)
                  }
                >
                  <Icon name="chevron-down" size="sm" />
                </button>

                <button
                  type="button"
                  class={styles.act}
                  data-layer-hide
                  disabled={!hideable}
                  aria-pressed={hidden}
                  aria-label={hideable ? (hidden ? 'أظهر' : 'أخفِ') : REDACT_HIDE_HINT}
                  title={hideable ? (hidden ? 'أظهر' : 'أخفِ') : REDACT_HIDE_HINT}
                  onClick={() => hideable && commit('إخفاء', toggleHidden(scene, node).patches)}
                >
                  <Icon name={hidden ? 'eye-off' : 'eye'} size="sm" />
                </button>

                <button
                  type="button"
                  class={styles.act}
                  data-layer-lock
                  aria-pressed={node.locked}
                  aria-label={node.locked ? 'ألغِ القفل' : 'اقفل'}
                  title={node.locked ? 'ألغِ القفل' : 'اقفل'}
                  onClick={() => commit('قفل', toggleLocked(scene, node).patches)}
                >
                  <Icon name="lock" size="sm" />
                </button>

                <button
                  type="button"
                  class={styles.act}
                  data-layer-delete
                  aria-label="احذف"
                  title="احذف"
                  onClick={() => commit('حذف', deleteNodes(scene, [node.id]).patches)}
                >
                  <Icon name="trash" size="sm" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
