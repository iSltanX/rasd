import { NoteList } from '../parts/NoteList'
import { PageMeta } from '../parts/PageMeta'
import { Stage } from '../Stage'
import { DRAW_TOOLS, TOOL_LABEL, type ToolName, type ToolSettings } from '../tools'

import type { EditorContext } from '../context'
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
  readonly selection: ReadonlySet<NodeId>
  readonly onTool: (tool: ToolName) => void
  readonly onSelectionChange: (next: ReadonlySet<NodeId>) => void
  readonly onChange: () => void
  readonly side: JSX.Element | null
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
        {props.context.sceneError ? (
          <p data-editor-scene-error>{props.context.sceneError}</p>
        ) : null}

        <div data-editor-tools>
          {(['select', ...DRAW_TOOLS] as ToolName[]).map((name) => (
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

        <NoteList
          history={props.history}
          selection={props.selection}
          onSelect={(id) => props.onSelectionChange(new Set([id]))}
          onChange={props.onChange}
        />

        <p data-editor-nodes>{props.history.state.scene.nodes.length}</p>
      </aside>
    </main>
  )
}
