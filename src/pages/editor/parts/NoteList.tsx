import { useRef, useState } from 'preact/hooks'

import { movePinOrdinal } from '@/modules/editor/pins'
import {
  NOTE_TAG_LABEL,
  type NodeId,
  type NoteNode,
  type NoteTag,
  type PinNode,
} from '@/modules/editor/scene'
import { replaceNode, replaceNodes } from '@/modules/editor/scene-ops'
import { isHistoryShortcut } from '@/modules/editor/typing'
import { formatHuman } from '@/shared/bidi'
import { cx } from '@/ui/cx'
import { Icon } from '@/ui/icons/Icon'

import { countByTag, filterByTag, NOTE_TAG_HINT, NOTE_TAG_ORDER, orderedNotes } from '../notes'
import { createTextEditSession, type EditableField } from '../text-editing'

import styles from './NoteList.module.css'

import type { History } from '@/modules/editor/history'
import type { JSX } from 'preact'

export interface NoteListProps {
  readonly history: History
  readonly selection: ReadonlySet<NodeId>
  readonly onSelect: (id: NodeId) => void
  readonly onChange: () => void
}

/**
 * لوحة الملاحظات — القائمة الجانبية المرتبطة بالدبابيس.
 *
 * **التحرير هنا لا على القماش.** بطاقة الملاحظة تحمل عنوانًا ومتنًا وتصنيفًا
 * ثلاثيًّا؛ وثلاثة حقول فوق صورةٍ مكبَّرة أربع مرّات تحتاج تمريرًا وتكبيرًا
 * لكل حرف. واللوحة تعرضها كلّها بلا كاميرا.
 *
 * **والأرقام هندية**: «الملاحظة ٣» عدٌّ بشري لا قياس — القاعدة نفسها التي
 * تحكم رقم الدبّوس على القماش.
 *
 * **و`⌘Z` تُعترَض في كل حقل** كما في محرر النصّ على القماش: حقلٌ يترك
 * مكدّس المتصفّح يعمل يجعل التراجع يمحو حرفًا هنا وشكلًا هناك بالتناوب.
 */
export function NoteList(props: NoteListProps): JSX.Element {
  const [filter, setFilter] = useState<NoteTag | null>(null)
  const sessions = useRef(new Map<string, ReturnType<typeof createTextEditSession>>())

  const scene = props.history.state.scene
  const all = orderedNotes(scene)
  const shown = filterByTag(all, filter)
  const counts = countByTag(all)

  /** جلسة تحرير لكل (عقدة، حقل) — تُنشأ عند أوّل حرف وتُغلَق عند فقد التركيز. */
  const sessionFor = (
    id: NodeId,
    field: EditableField,
  ): ReturnType<typeof createTextEditSession> => {
    const key = `${id}|${field}`
    const found = sessions.current.get(key)
    if (found) return found
    const made = createTextEditSession(props.history, id, field, 'ملاحظة')
    sessions.current.set(key, made)
    return made
  }

  const closeSession = (id: NodeId, field: EditableField): void => {
    const key = `${id}|${field}`
    sessions.current.get(key)?.finish()
    sessions.current.delete(key)
    props.onChange()
  }

  const onKeyDown = (
    e: JSX.TargetedKeyboardEvent<HTMLElement>,
    id: NodeId,
    field: EditableField,
  ): void => {
    const shortcut = isHistoryShortcut(e)
    if (!shortcut) return
    e.preventDefault()
    e.stopPropagation()
    sessions.current.get(`${id}|${field}`)?.finish()
    if (shortcut === 'undo') props.history.undo()
    else props.history.redo()
    props.onChange()
  }

  const pinCount = scene.nodes.filter((n) => n.kind === 'pin').length

  /** الدبابيس التي لا ملاحظة لها — مرشَّحو الربط. */
  const freePins = scene.nodes.filter((n): n is PinNode => n.kind === 'pin' && n.noteId === null)

  /** يربط ملاحظةً بدبّوس — الطرفان يحملان هوية الآخر، فلا يوجد ربطٌ نصفيّ. */
  const linkTo = (note: NoteNode, pin: PinNode): void => {
    const next = replaceNodes(scene, [
      { ...note, pinId: pin.id },
      { ...pin, noteId: note.id },
    ])
    if (next.patches.length === 0) return
    props.history.mark('ربط ملاحظة بدبّوس')
    props.history.push(next.patches)
    props.history.commit()
    props.onChange()
  }

  /** ينقل رقم دبّوس موضعًا واحدًا — بلا مساس بترتيب الرسم. */
  const movePin = (pin: PinNode, delta: number): void => {
    const to = pin.ordinal - scene.meta.pinStart + delta
    const patches = movePinOrdinal(scene, pin.id, to)
    if (patches.length === 0) return
    props.history.mark('ترقيم الدبابيس')
    props.history.push(patches)
    props.history.commit()
    props.onChange()
  }

  /** التصنيف تغييرٌ ذرّي — علامة كاملة لا نوبة كتابة. */
  const setTag = (note: NoteNode, tag: NoteTag): void => {
    const next: NoteNode = { ...note, tag: note.tag === tag ? null : tag }
    props.history.mark('تصنيف الملاحظة')
    props.history.push(replaceNode(props.history.state.scene, next).patches)
    props.history.commit()
    props.onChange()
  }

  return (
    <section class={styles.panel} data-note-list="" aria-label="الملاحظات">
      <div class={styles.filters} role="group" aria-label="ترشيح بالتصنيف">
        <button
          type="button"
          class={styles.filter}
          data-note-filter="all"
          aria-pressed={filter === null}
          onClick={() => setFilter(null)}
        >
          الكلّ {formatHuman(all.length)}
        </button>
        {NOTE_TAG_ORDER.map((tag) => (
          <button
            key={tag}
            type="button"
            class={styles.filter}
            data-note-filter={tag}
            title={NOTE_TAG_HINT[tag]}
            aria-pressed={filter === tag}
            onClick={() => setFilter(filter === tag ? null : tag)}
          >
            {NOTE_TAG_LABEL[tag]} {formatHuman(counts[tag])}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        all.length === 0 ? (
          // `editor / empty` (`303:23312`): حامل أيقونة وعنوان وتلميح يدلّ على الطريق.
          <div class={styles.empty} data-note-empty="">
            <span class={styles.emptyIcon}>
              <Icon name="pen" size="sm" />
            </span>
            <p class={cx(styles.emptyTitle, 't-arabic-heading-xs')}>لا ملاحظات بعد</p>
            <p class={cx(styles.emptyHint, 't-arabic-ui-s')}>
              ضَع دبّوسًا أو بطاقة ملاحظة من السكّة، فتظهر هنا مرقّمة.
            </p>
          </div>
        ) : (
          <p class={styles.emptyFiltered} data-note-empty="">
            لا ملاحظة بهذا التصنيف.
          </p>
        )
      ) : (
        <ul class={styles.list}>
          {shown.map(({ note, pin }) => (
            <li
              key={note.id}
              class={styles.item}
              data-note={note.id}
              data-selected={props.selection.has(note.id)}
              onFocusCapture={() => props.onSelect(note.id)}
            >
              <span
                class={styles.ordinal}
                data-unlinked={pin === null}
                title={pin ? `الدبّوس ${formatHuman(pin.ordinal)}` : 'ملاحظة بلا دبّوس'}
              >
                {pin ? formatHuman(pin.ordinal) : '—'}
              </span>

              {/*
                إعادة الترقيم **بأزرار لا بالسحب وحده**: السحب مريحٌ بالفأرة
                وغير قابل للاستعمال بلوحة المفاتيح ولا بقارئ الشاشة، وقائمةٌ
                لا تُرتَّب إلّا بالسحب تُخرج من الميزة كل من لا يستعمل الفأرة.
                والترقيم محورٌ مستقلّ عن ترتيب الطبقات — يُنقل الرقم ولا
                تتحرّك العقدة في الرسم.
              */}
              {pin ? (
                <span class={styles.reorder}>
                  <button
                    type="button"
                    data-pin-up={pin.id}
                    disabled={pin.ordinal <= scene.meta.pinStart}
                    aria-label={`أنقص رقم الدبّوس ${formatHuman(pin.ordinal)}`}
                    title="رقمٌ أصغر"
                    onClick={() => movePin(pin, -1)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    data-pin-down={pin.id}
                    disabled={pin.ordinal >= scene.meta.pinStart + pinCount - 1}
                    aria-label={`زد رقم الدبّوس ${formatHuman(pin.ordinal)}`}
                    title="رقمٌ أكبر"
                    onClick={() => movePin(pin, 1)}
                  >
                    ›
                  </button>
                </span>
              ) : (
                /*
                 * ربط الملاحظة بدبّوس — `§5.2` يشترطه، والربط **بالهوية لا
                 * بالرقم**: احذف الدبّوس الثالث من خمسة فيصير الرابع ثالثًا،
                 * ثمّ تراجَع — فتجد الملاحظة معلّقة على من صار ثالثًا.
                 * ترقيمٌ صحيح شكلًا مخرَّب دلاليًّا، بلا خطأ ولا رسالة.
                 */
                <span class={styles.reorder}>
                  <button
                    type="button"
                    data-note-link={note.id}
                    disabled={freePins.length === 0}
                    aria-label={
                      freePins.length === 0
                        ? 'لا دبّوس حرّ لربطها به'
                        : `اربطها بالدبّوس ${formatHuman(freePins[0]!.ordinal)}`
                    }
                    title={
                      freePins.length === 0
                        ? 'لا دبّوس حرّ لربطها به'
                        : `اربطها بالدبّوس ${formatHuman(freePins[0]!.ordinal)}`
                    }
                    onClick={() => linkTo(note, freePins[0]!)}
                  >
                    ⚭
                  </button>
                </span>
              )}

              <div class={styles.body}>
                <input
                  class={styles.title}
                  data-note-title={note.id}
                  value={note.title}
                  placeholder="عنوان الملاحظة"
                  aria-label="عنوان الملاحظة"
                  onInput={(e) =>
                    sessionFor(note.id, 'title').edit(
                      e.currentTarget.value,
                      (e as unknown as InputEvent).data ?? '',
                      performance.now(),
                    )
                  }
                  onKeyDown={(e) => onKeyDown(e, note.id, 'title')}
                  onBlur={() => closeSession(note.id, 'title')}
                />
                <textarea
                  class={styles.text}
                  data-note-body={note.id}
                  value={note.body}
                  placeholder="التفصيل"
                  aria-label="متن الملاحظة"
                  onInput={(e) =>
                    sessionFor(note.id, 'body').edit(
                      e.currentTarget.value,
                      (e as unknown as InputEvent).data ?? '',
                      performance.now(),
                    )
                  }
                  onKeyDown={(e) => onKeyDown(e, note.id, 'body')}
                  onBlur={() => closeSession(note.id, 'body')}
                />

                <div class={styles.tags} role="group" aria-label="تصنيف الملاحظة">
                  {NOTE_TAG_ORDER.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      class={styles.tag}
                      data-note-tag={tag}
                      title={NOTE_TAG_HINT[tag]}
                      aria-pressed={note.tag === tag}
                      onClick={() => setTag(note, tag)}
                    >
                      {NOTE_TAG_LABEL[tag]}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
