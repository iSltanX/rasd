import { formatHuman } from '@/shared/bidi'
import { isIncognitoContext } from '@/shared/env'

import { LayerList } from '../parts/LayerList'
import { NoteList } from '../parts/NoteList'
import { PageMeta } from '../parts/PageMeta'
import { Stage } from '../Stage'
import { DRAW_TOOLS, TOOL_LABEL, type ToolName, type ToolSettings } from '../tools'

import type { EditorContext } from '../context'
import type { BakeReport } from '@/modules/editor/bake'
import type { History } from '@/modules/editor/history'
import type { BaseSource, RenderStyle } from '@/modules/editor/renderer'
import type { NodeId } from '@/modules/editor/scene'
import type { JSX } from 'preact'

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
  readonly onExport: (scale: 1 | 2) => void
  /** آخر تصدير ناجح بتقريره وعنوان بايتاته، أو `null`. */
  readonly exported: { readonly report: BakeReport; readonly url: string } | null
}

/**
 * حالة `editor / annotating` — الحالة الافتراضية.
 *
 * **اللوحة الجانبية تُمرَّر لا تُبنى هنا.** الحالات الثلاث تشترك في المسرح
 * والشريط وتختلف في اللوحة، فبناؤها داخل كل حالة كان سيكرّر المسرح ثلاث
 * مرّات — وثلاث نسخ منه تعني ثلاثة قماشين وثلاث ذاكرات تخطيط، وإعادة تركيبها
 * كلّها عند كل تبديل حالة.
 */
export function Annotating(props: AnnotatingProps): JSX.Element {
  return (
    <main data-editor-state="annotating" style={{ display: 'flex', blockSize: '100vh' }}>
      <div style={{ flex: 1, minInlineSize: 0 }}>
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
          <p data-editor-decoding>جارٍ فكّ الصورة…</p>
        )}
      </div>

      <aside
        style={{
          inlineSize: '19rem',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          // اللوحة تمرّر محتواها وحدها — القائمة تطول والمسرح لا ينزلق معها.
          minBlockSize: 0,
          overflowY: 'auto',
        }}
        data-editor-side
      >
        <PageMeta capture={props.context.capture} />

        {isIncognitoContext() ? (
          /*
           * **يُقال قبل العمل لا بعده.** الحفظ في التصفّح الخاص ممنوع
           * بسياسة المشروع؛ ومعرفةُ ذلك بعد ساعة من التعليق تعني ساعةً
           * ضائعة. واللافتة هنا لا تنتظر أوّل محاولة حفظ.
           */
          <p data-editor-incognito role="note">
            تصفّحٌ خاص: لا يُحفَظ التعليق تلقائيًّا. صدّر الصورة قبل إغلاق التبويب.
          </p>
        ) : null}

        {props.readOnly ? (
          <p data-editor-readonly role="alert">
            تعذّرت قراءة التعليقات المحفوظة: {props.context.sceneError} — يُعرض المحرر فارغًا، ولا
            يُحفَظ فوق المحفوظ حتى لا يضيع ما لم نفهمه.
          </p>
        ) : (
          props.save
        )}

        <div data-editor-tools>
          {(['select', ...DRAW_TOOLS, 'crop'] as ToolName[]).map((name) => (
            <button
              key={name}
              type="button"
              data-tool={name}
              aria-pressed={props.tool === name}
              onClick={() => props.onTool(name)}
            >
              {TOOL_LABEL[name]}
            </button>
          ))}
        </div>

        {props.side}

        <LayerList
          history={props.history}
          selection={props.selection}
          onSelect={(id) => props.onSelectionChange(new Set([id]))}
          onChange={props.onChange}
        />

        <NoteList
          history={props.history}
          selection={props.selection}
          onSelect={(id) => props.onSelectionChange(new Set([id]))}
          onChange={props.onChange}
        />

        <div data-editor-export>
          {([1, 2] as const).map((scale) => (
            <button
              key={scale}
              type="button"
              data-export-scale={scale}
              onClick={() => props.onExport(scale)}
            >
              انسخ الصورة {scale}×
            </button>
          ))}
        </div>

        {props.exported ? (
          <p data-export-done>
            <a
              href={props.exported.url}
              download="rasd.png"
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

        <p data-editor-nodes>{props.history.state.scene.nodes.length}</p>
      </aside>
      {props.overlay}
    </main>
  )
}
