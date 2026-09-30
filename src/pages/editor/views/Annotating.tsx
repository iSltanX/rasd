import { useState } from 'preact/hooks'

import { exportFilename } from '@/modules/export/filename'
import { formatHuman } from '@/shared/bidi'
import { formatRelativeTime } from '@/shared/bidi/numerals'
import { isIncognitoContext } from '@/shared/env'
import { Button } from '@/ui/components/Button/Button'
import { IconButton } from '@/ui/components/IconButton/IconButton'
import { cx } from '@/ui/cx'
import { Icon, type IconName } from '@/ui/icons/Icon'

import { hrefFor } from '../../shell/library-views'
import { LayerList } from '../parts/LayerList'
import { LeaveDialog } from '../parts/LeaveDialog'
import { NoteList } from '../parts/NoteList'
import { PageMeta } from '../parts/PageMeta'
import { Stage } from '../Stage'
import { DRAW_TOOLS, TOOL_LABEL, type ToolName, type ToolSettings } from '../tools'

import styles from './Annotating.module.css'

import type { EditorContext } from '../context'
import type { BakeReport } from '@/modules/editor/bake'
import type { History } from '@/modules/editor/history'
import type { BaseSource, RenderStyle } from '@/modules/editor/renderer'
import type { NodeId } from '@/modules/editor/scene'
import type { JSX } from 'preact'

/**
 * أيقونة كل أداة في السكّة — أيقونات `70:2` التسع كما هي، والثلاث التي لا يرسمها الإطار
 * (الخطّ والاقتصاص والنصّ) من المجموعة نفسها: `minus` للخطّ، وعلامات الزوايا للاقتصاص.
 * والنصّ بلا أيقونة في المجموعة، فحرفه `T` مكانها.
 */
const TOOL_ICON: Readonly<Record<Exclude<ToolName, 'text'>, IconName>> = {
  select: 'inspect',
  arrow: 'annotate-arrow',
  line: 'minus',
  rect: 'draw-rect',
  ellipse: 'draw-ellipse',
  freehand: 'pen',
  note: 'text-note',
  pin: 'pin-number',
  redact: 'redact',
  measure: 'dimension-h',
  crop: 'capture-area',
}

/** ترتيب السكّة: ترتيب الإطار، ثمّ ما ليس فيه. */
const RAIL: readonly ToolName[] = [
  'select',
  'arrow',
  'rect',
  'ellipse',
  'freehand',
  'note',
  'pin',
  'redact',
  'measure',
  ...DRAW_TOOLS.filter(
    (t) =>
      !['arrow', 'rect', 'ellipse', 'freehand', 'note', 'pin', 'redact', 'measure'].includes(t),
  ),
  'crop',
]

export interface AnnotatingProps {
  readonly context: EditorContext
  readonly history: History
  readonly source: BaseSource | null
  readonly style: RenderStyle
  readonly tool: ToolName
  readonly settings: ToolSettings
  readonly cropRatio: number | null
  readonly selection: ReadonlySet<NodeId>
  readonly onTool: (tool: ToolName) => void
  readonly onSelectionChange: (next: ReadonlySet<NodeId>) => void
  readonly onChange: () => void
  /** شريط حالة الحفظ ولافتة التعارض — يُمرَّر لا يُبنى هنا. */
  readonly save: JSX.Element | null
  /** شريط النمط: السمك وحجم الخطّ وشكل الدبّوس وبداية ترقيمه. */
  readonly styleBar: JSX.Element | null
  /** ألوان التعليق — في أسفل السكّة. */
  readonly colors: JSX.Element | null
  /**
   * الحالة المعلَنة.
   *
   * الثلاث المنصوصة في الخطّة (`annotating` · `redact` · `exporting`)،
   * ورابعةٌ لم تنصّ عليها هي `crop` — وضعٌ حقيقي بلوحته وسلوكه، وإخفاؤه
   * تحت `annotating` كان سيجعل الحالة المعلَنة تكذب على من يقرؤها.
   *
   * **تُعلَن على العنصر لا تُشتقّ من الأداة وحدها.** الحالات الثلاث بندٌ في
   * نصّ المرحلة، وأداةُ فحصٍ تقرأ `data-editor-state` كانت تجد `annotating`
   * دائمًا — فتصير «الحالات الثلاث منفَّذة» دعوى بلا سطح تُقاس عليه.
   */
  readonly state: 'annotating' | 'redact' | 'exporting' | 'crop'
  /**
   * المشهد المخزَّن تالف: يُعرض ولا يُحفَظ.
   *
   * ويُقال للمستخدم صراحةً — محرّرٌ لا يحفظ بلا أن يخبر هو أسوأ من محرّر
   * لا يفتح.
   */
  readonly readOnly: boolean
  readonly side: JSX.Element | null
  /** طبقةٌ فوق كل شيء — التصدير، وهو نافذةٌ مشروطة لا حالةٌ بديلة. */
  readonly overlay: JSX.Element | null
  /** الإجراء السريع: خبزةٌ بهذه الدقّة إلى الحافظة مباشرةً. */
  readonly onExport: (scale: 1 | 2) => void
  /** يفتح `export / modal` — المدخل الكامل بالصيغة والجودة والتنزيل. */
  readonly onOpenExport: () => void
  /**
   * يفتح «حزمة التسليم» لمشكلات هذه اللقطة (ADR 0036) — `null` حين لا مشكلة دليلها هنا، فلا زرّ بلا ما يصدّره.
   */
  readonly onOpenHandoff?: (() => void) | null
  /** عنوان اللقطة — يشتقّ منه اسم الملفّ المقترَح. */
  readonly title: string
  /** في المشهد ما لم يُكتب بعد — فالعودة تسأل قبل أن تغادر. */
  readonly unsaved: boolean
  /** يُفرغ الحفظ التلقائي ويُعيد هل كُتب كلّه. */
  readonly onFlush: () => Promise<boolean>
  /** آخر تصدير ناجح بتقريره وعنوان بايتاته ودقّته، أو `null`. */
  readonly exported: {
    readonly report: BakeReport
    readonly url: string
    readonly scale: 1 | 2
  } | null
}

/** اسم المضيف وحده — `northwind.com` لا `https://northwind.com`. */
function hostOf(origin: string): string {
  try {
    return new URL(origin).host || origin
  } catch {
    return origin
  }
}

/**
 * حالة `editor / annotating` (`70:2`) — الحالة الافتراضية: شريط علوي بالعنوان والأفعال،
 * وسكّة الأدوات في البداية، والمسرح في الوسط على `surface/sunken`، واللوحة في النهاية.
 *
 * **اللوحة الجانبية تُمرَّر لا تُبنى هنا.** الحالات الثلاث تشترك في المسرح
 * والشريط وتختلف في اللوحة، فبناؤها داخل كل حالة كان سيكرّر المسرح ثلاث
 * مرّات — وثلاث نسخ منه تعني ثلاثة قماشين وثلاث ذاكرات تخطيط، وإعادة تركيبها
 * كلّها عند كل تبديل حالة.
 *
 * **ما في الإطار ولا يُبنى:** «مشاركة» معطَّلة بسببها حتى `STAGES/10`، وقسم «افتح بلاغًا في
 * GitHub» حتى `STAGES/11`–`12`. **وما ليس فيه ويبقى:** بيانات الصفحة والطبقات وشريط النمط
 * في اللوحة — ميزات قائمة لا موضع لها في الإطار.
 */
export function Annotating(props: AnnotatingProps): JSX.Element {
  const capture = props.context.capture
  const scene = props.history.state.scene
  const exporting = props.state === 'exporting'
  const noteCount = scene.nodes.filter((n) => n.kind === 'note').length

  const [leaving, setLeaving] = useState(false)
  const libraryHref = hrefFor({ kind: 'all' })
  const leave = () => {
    location.href = libraryHref
  }

  const step = (fn: () => void) => () => {
    fn()
    props.onChange()
  }

  return (
    <main class={styles.editor} data-editor-state={props.state}>
      <header class={styles.topbar}>
        <div class={styles.titleBlock}>
          <IconButton
            icon="chevron-left"
            size="m"
            aria-label="عودة إلى المكتبة"
            onClick={() => (props.unsaved ? setLeaving(true) : leave())}
          />
          <div class={styles.titles}>
            <h1 class={cx(styles.title, 't-arabic-ui-m-strong')} title={capture.title}>
              {capture.title || capture.url}
            </h1>
            <p class={styles.subtitle}>
              {/* المقاسات والمضيف بخطّ القياس، والزمن بخطّ النصّ — Geist Mono بلا حروف عربية. */}
              <bdi dir="ltr" class="t-mono-2xs">
                {hostOf(capture.origin)} · {capture.width} × {capture.height}
              </bdi>
              <span class="t-arabic-ui-xs"> · {formatRelativeTime(capture.createdAt)}</span>
            </p>
          </div>
        </div>

        <div class={styles.actions}>
          {props.readOnly ? null : <span class={styles.save}>{props.save}</span>}
          <IconButton
            icon="undo"
            variant="solid"
            size="m"
            aria-label={props.history.undoLabel ? `تراجع: ${props.history.undoLabel}` : 'تراجع'}
            state={!props.history.canUndo || exporting ? 'disabled' : 'default'}
            onClick={step(() => props.history.undo())}
          />
          <IconButton
            icon="redo"
            variant="solid"
            size="m"
            aria-label={props.history.redoLabel ? `إعادة: ${props.history.redoLabel}` : 'إعادة'}
            state={!props.history.canRedo || exporting ? 'disabled' : 'default'}
            onClick={step(() => props.history.redo())}
          />
          {/*
           * **«نسخ» إجراءٌ سريع و«تصدير» حوارٌ كامل — لا أحدهما يُلغي الآخر.** النسخ خبزةٌ
           * بدقّة 1× إلى الحافظة مباشرةً، والتصدير يسأل عن الصيغة والجودة والدقّة والوجهة.
           * و`data-export-scale` و`data-export-open` السطحان اللذان يقودهما `verify:editor`.
           */}
          <Button
            variant="secondary"
            size="m"
            icon="copy"
            data-export-scale="1"
            aria-label="نسخ الصورة إلى الحافظة"
            onClick={() => props.onExport(1)}
          >
            نسخ
          </Button>
          <Button
            variant="secondary"
            size="m"
            icon="download"
            data-export-open=""
            onClick={props.onOpenExport}
          >
            تصدير
          </Button>
          <Button variant="primary" size="m" icon="share" state="disabled">
            مشاركة · قريبًا
          </Button>
        </div>
      </header>

      <div class={styles.body}>
        <nav class={styles.rail} aria-label="أدوات التعليق" data-editor-tools>
          <div class={styles.tools}>
            {RAIL.map((name) => (
              <button
                key={name}
                type="button"
                class={cx(styles.tool, props.tool === name && styles.toolActive)}
                data-tool={name}
                aria-pressed={props.tool === name}
                aria-label={TOOL_LABEL[name]}
                title={TOOL_LABEL[name]}
                onClick={() => props.onTool(name)}
              >
                {name === 'text' ? (
                  <span class={cx(styles.glyph, 't-mono-m-strong')} aria-hidden="true">
                    T
                  </span>
                ) : (
                  <Icon name={TOOL_ICON[name]} size="sm" />
                )}
              </button>
            ))}
          </div>
          {props.colors}
        </nav>

        <div class={styles.canvas}>
          {props.source ? (
            <Stage
              history={props.history}
              source={props.source}
              style={props.style}
              tool={props.tool}
              settings={props.settings}
              cropRatio={props.cropRatio}
              selection={props.selection}
              onSelectionChange={props.onSelectionChange}
              onSceneChange={props.onChange}
            />
          ) : (
            <p class={cx(styles.decoding, 't-arabic-ui-s')} data-editor-decoding>
              جارٍ فكّ الصورة…
            </p>
          )}
        </div>

        <aside class={styles.panel} data-editor-side>
          {isIncognitoContext() ? (
            /*
             * **يُقال قبل العمل لا بعده.** الحفظ في التصفّح الخاص ممنوع
             * بسياسة المشروع؛ ومعرفةُ ذلك بعد ساعة من التعليق تعني ساعةً
             * ضائعة. واللافتة هنا لا تنتظر أوّل محاولة حفظ.
             */
            <p class={cx(styles.notice, 't-arabic-ui-xs')} data-editor-incognito role="note">
              تصفّحٌ خاص: لا يُحفَظ التعليق تلقائيًّا. صدّر الصورة قبل إغلاق التبويب.
            </p>
          ) : null}

          {props.readOnly ? (
            <p
              class={cx(styles.notice, styles.noticeDanger, 't-arabic-ui-xs')}
              data-editor-readonly
              role="alert"
            >
              تعذّرت قراءة التعليقات المحفوظة: {props.context.sceneError} — يُعرض المحرر فارغًا، ولا
              يُحفَظ فوق المحفوظ حتى لا يضيع ما لم نفهمه.
            </p>
          ) : null}

          {/*
           * الاقتصاص والتمويه يملكان اللوحة كلّها كما في `editor / crop` و`editor / redact`:
           * أدوات الوضع وحدها، والملاحظات تعود بعودة الأداة.
           */}
          {props.side ? (
            <div class={styles.section}>{props.side}</div>
          ) : (
            <>
              <section class={styles.notes} aria-labelledby="editor-notes-title">
                <div class={styles.sectionHead}>
                  <h2
                    id="editor-notes-title"
                    class={cx(styles.sectionTitle, 't-arabic-ui-m-strong')}
                  >
                    الملاحظات
                  </h2>
                  <span class={cx(styles.countChip, 't-mono-2xs')}>{formatHuman(noteCount)}</span>
                  {props.onOpenHandoff ? (
                    <Button
                      variant="ghost"
                      size="s"
                      icon="file-code"
                      class={styles.handoff}
                      data-editor-handoff=""
                      onClick={props.onOpenHandoff}
                      {...(exporting ? { state: 'disabled' as const } : {})}
                    >
                      حزمة التسليم
                    </Button>
                  ) : null}
                </div>
                <div class={styles.noteBody}>
                  <NoteList
                    history={props.history}
                    selection={props.selection}
                    onSelect={(id) => props.onSelectionChange(new Set([id]))}
                    onChange={props.onChange}
                    issues={props.context.noteIssues}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="l"
                  icon="plus"
                  class={styles.addNote}
                  onClick={() => props.onTool('note')}
                >
                  أضف ملاحظة
                </Button>
              </section>

              <div class={styles.section}>{props.styleBar}</div>

              <div class={styles.section}>
                <LayerList
                  history={props.history}
                  selection={props.selection}
                  onSelect={(id) => props.onSelectionChange(new Set([id]))}
                  onChange={props.onChange}
                />
              </div>

              <section class={styles.section} aria-labelledby="editor-page-title">
                <h2 id="editor-page-title" class={cx(styles.sectionTitle, 't-arabic-ui-s-strong')}>
                  الصفحة
                </h2>
                <PageMeta capture={capture} />
              </section>
            </>
          )}

          {props.exported ? (
            <p class={cx(styles.section, styles.exported, 't-arabic-ui-xs')} data-export-done>
              <a
                href={props.exported.url}
                /*
                 * كان `rasd.png` ثابتًا — اسمٌ لا يدلّ على لقطته، ولاحقةٌ
                 * تكذب إن لم يكن المخبوز PNG. صار الاسم مشتقًّا من العنوان
                 * ومن **الصيغة المُنتَجة فعلًا** في التقرير.
                 */
                download={exportFilename(
                  props.title,
                  props.exported.scale,
                  props.exported.report.format,
                )}
                data-export-url={props.exported.url}
                data-export-guaranteed={
                  props.exported.report.obscured.filter((o) => o.guaranteed).length
                }
                data-export-reencoded={props.exported.report.reencoded}
              >
                {/* غربية: قياسٌ يُنسَخ إلى تذكرة، لا عدٌّ بشري. */}
                احفظ الصورة ({props.exported.report.width} × {props.exported.report.height})
              </a>
              {props.exported.report.obscured.length > 0
                ? ` — ${formatHuman(props.exported.report.obscured.filter((o) => o.guaranteed).length)} منطقة محجوبة`
                : ''}
            </p>
          ) : null}

          {/* عدد العقد للحارس — قيمة تُقرأ لا تُعرض، فلا يقرؤها قارئ الشاشة رقمًا مجرّدًا. */}
          <span data-editor-nodes hidden>
            {scene.nodes.length}
          </span>
        </aside>
      </div>
      {props.overlay}
      {leaving ? (
        <LeaveDialog
          title={capture.title || capture.url}
          onSave={props.onFlush}
          onLeave={leave}
          onStay={() => setLeaving(false)}
        />
      ) : null}
    </main>
  )
}
