import { useEffect, useMemo, useState } from 'preact/hooks'

import { createHistory } from '@/modules/editor/history'

import { buildRenderStyle } from './colors'
import {
  captureIdFromLocation,
  loadEditorContext,
  releaseContext,
  type EditorContext,
} from './context'
import { Stage } from './Stage'
import { DEFAULT_TOOL_SETTINGS, DRAW_TOOLS, TOOL_LABEL, type ToolName } from './tools'
import { NotFound } from './views/NotFound'

import type { BaseSource } from '@/modules/editor/renderer'
import type { NodeId } from '@/modules/editor/scene'
import type { JSX } from 'preact'

/**
 * جذر المحرر — يحمّل ثم يوزّع.
 *
 * السابقة `Popup.tsx`: منسّقٌ يقرأ الحالة ويختار العرض، والمنطق كلّه خارجه
 * في `context.ts` كي يُختبَر بلا تركيب.
 *
 * والتحميل هنا يحمل ثلاثة أوضاع فشل مختلفة — لا معرّف، ولقطة محذوفة،
 * وبايتات مفقودة — ولكلٍّ عرضه ونصّه. ودمجها في «تعذّر الفتح» واحدة يترك
 * المستخدم لا يعرف أيفتح من مكان آخر أم يعيد الالتقاط.
 */
export function Editor(): JSX.Element {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; context: EditorContext }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  useEffect(() => {
    const captureId = captureIdFromLocation(window.location.href)
    if (!captureId) {
      setState({
        kind: 'error',
        message: 'لم تُحدَّد لقطة. افتح المحرر من لقطة في النافذة أو المكتبة.',
      })
      return
    }

    let live = true
    let loaded: EditorContext | null = null

    void loadEditorContext(captureId).then((result) => {
      if (!live) {
        // وصل الردّ بعد التفكيك — يُحرَّر عنوان الكائن ولا يُحتجَز.
        if (result.ok) releaseContext(result.value)
        return
      }
      if (result.ok) {
        loaded = result.value
        setState({ kind: 'ready', context: result.value })
      } else {
        setState({ kind: 'error', message: result.error.message })
      }
    })

    return () => {
      live = false
      if (loaded) releaseContext(loaded)
    }
  }, [])

  if (state.kind === 'loading') return <NotFound message="جارٍ الفتح…" tone="loading" />
  if (state.kind === 'error') return <NotFound message={state.message} tone="error" />
  return <Loaded context={state.context} />
}

/**
 * المحرر بمسرحه.
 *
 * **الدفعة الثالثة تصل إلى هنا**: مسرح بطبقتين، وسبع أدوات رسم، وتحديد،
 * وتكبير وتحريك. والنصّ والملاحظات والطمس والتصدير في الدفعات التالية —
 * وأزرارها لا تُرسم قبل محرّكاتها.
 */
function Loaded({ context }: { context: EditorContext }): JSX.Element {
  const [tool, setTool] = useState<ToolName>('select')
  const [selection, setSelection] = useState<ReadonlySet<NodeId>>(new Set())
  const [, bump] = useState(0)

  const history = useMemo(() => createHistory(context.scene), [context.scene])
  const style = useMemo(() => buildRenderStyle('dark'), [])
  const [source, setSource] = useState<BaseSource | null>(null)

  // الصورة تُفكّ مرّة — `createImageBitmap` أسرع من `<img>` ولا يمرّ بطبقة
  // تحميل الموارد، والنتيجة تُغلَق عند التفكيك.
  useEffect(() => {
    let live = true
    let bitmap: ImageBitmap | null = null
    const img = new Image()
    img.src = context.imageUrl
    void img
      .decode()
      .then(() => createImageBitmap(img))
      .then((bm) => {
        if (!live) {
          bm.close()
          return
        }
        bitmap = bm
        setSource({ bitmap: bm, width: bm.width, height: bm.height })
      })
      .catch(() => {
        if (live) setSource(null)
      })
    return () => {
      live = false
      bitmap?.close()
    }
  }, [context.imageUrl])

  // اختصارات التاريخ — تُعترَض قبل أن يلتقطها المتصفّح.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo()
        else history.undo()
        bump((n) => n + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history])

  return (
    <main data-editor-state="ready" style={{ display: 'flex', blockSize: '100vh' }}>
      <div style={{ flex: 1, minInlineSize: 0 }}>
        {source ? (
          <Stage
            history={history}
            source={source}
            style={style}
            tool={tool}
            settings={DEFAULT_TOOL_SETTINGS}
            selection={selection}
            onSelectionChange={setSelection}
            onSceneChange={() => bump((n) => n + 1)}
          />
        ) : (
          <p data-editor-decoding>جارٍ فكّ الصورة…</p>
        )}
      </div>

      <aside style={{ inlineSize: '15rem', padding: '1rem' }} data-editor-side>
        <h1 style={{ fontSize: '1rem' }}>{context.capture.title || 'لقطة بلا عنوان'}</h1>
        <p data-editor-origin>{context.capture.origin}</p>
        <p data-editor-size>
          {context.capture.width} × {context.capture.height}
        </p>
        {context.sceneError ? <p data-editor-scene-error>{context.sceneError}</p> : null}

        <div data-editor-tools>
          {(['select', ...DRAW_TOOLS] as ToolName[]).map((name) => (
            <button
              key={name}
              type="button"
              data-tool={name}
              aria-pressed={tool === name}
              onClick={() => setTool(name)}
            >
              {TOOL_LABEL[name]}
            </button>
          ))}
        </div>

        <p data-editor-nodes>{history.state.scene.nodes.length}</p>
      </aside>
    </main>
  )
}
