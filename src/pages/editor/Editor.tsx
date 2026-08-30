import { useEffect, useMemo, useState } from 'preact/hooks'

import { createHistory } from '@/modules/editor/history'
import { createTextLayoutCache } from '@/modules/editor/text-layout'
import { isHistoryShortcut } from '@/modules/editor/typing'

import { buildRenderStyle } from './colors'
import {
  captureIdFromLocation,
  loadEditorContext,
  releaseContext,
  type EditorContext,
} from './context'
import { createMeasurer } from './measure'
import { DEFAULT_TOOL_SETTINGS, type ToolName } from './tools'
import { Annotating } from './views/Annotating'
import { Exporting } from './views/Exporting'
import { NotFound } from './views/NotFound'
import { RedactView } from './views/Redact'
import { createBlurClient } from './worker-client'

import type { BakeReport } from '@/modules/editor/bake'
import type { BaseSource } from '@/modules/editor/renderer'
import type { NodeId } from '@/modules/editor/scene'
import type { JSX } from 'preact'

/** هل يحرَّر نصٌّ داخل هذا العنصر؟ */
const isEditable = (el: HTMLElement): boolean =>
  el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'

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
 * **الدفعة الرابعة تصل إلى هنا**: مسرح بطبقتين، وتسع أدوات، ونصّ عربي
 * يُحرَّر على القماش، ولوحة ملاحظات مصنَّفة، وبيانات الصفحة. والطمس والاقتصاص
 * والتصدير في الدفعات التالية — وأزرارها لا تُرسم قبل محرّكاتها.
 */
function Loaded({ context }: { context: EditorContext }): JSX.Element {
  const [tool, setTool] = useState<ToolName>('select')
  /** دقّة التصدير الجارية، أو `null` — والحالة `exporting` مشتقّة منها. */
  const [exporting, setExporting] = useState<1 | 2 | null>(null)
  const [exported, setExported] = useState<{ report: BakeReport; url: string } | null>(null)
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

  /*
   * اختصارات التاريخ على مستوى النافذة — **بعد الحقول لا قبلها**.
   *
   * الحقول (محرر النصّ على القماش، وحقول لوحة الملاحظات) تعترض `⌘Z` عندها
   * وتُوقف الانتشار، لأنها تحتاج إغلاق نوبة الكتابة أوّلًا. وهذا المستمع
   * يخدم بقيّة المحرر — والحارس أدناه يمنع التراجع مرّتين لو أفلت حدثٌ.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const shortcut = isHistoryShortcut(e)
      if (!shortcut) return
      const target = e.target
      if (target instanceof HTMLElement && isEditable(target)) return
      e.preventDefault()
      if (shortcut === 'redo') history.redo()
      else history.undo()
      bump((n) => n + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history])

  /*
   * الوضع يتبع الأداة، ولا يُدار بحالة ثانية.
   *
   * حالتان لشيء واحد تتباعدان: يختار المستخدم أداة الحجب من الشريط فتبقى
   * اللوحة على الملاحظات، أو يفتح لوحة الحجب فتبقى الأداة على التحديد.
   * والاشتقاق يجعل السؤال «هل نحن في وضع الحجب؟» بلا جوابين.
   */
  const mode = tool === 'redact' ? 'redact' : 'annotating'

  /*
   * خيط الطمس نفسه يخدم التصدير.
   *
   * وإنشاء ثانٍ له عند كل تصدير يعني خيطًا جديدًا ينتظر جهوزه بينما الأوّل
   * جاهز — تأخيرٌ مجّاني على أثقل عملية في المحرر.
   */
  const client = useMemo(() => createBlurClient(), [])
  useEffect(() => () => client.dispose(), [client])

  const layout = useMemo(() => {
    const m = createMeasurer(style.textFamily)
    return createTextLayoutCache(m.measure, m.measureFont)
  }, [style.textFamily])

  return (
    <Annotating
      context={context}
      history={history}
      source={source}
      style={style}
      tool={tool}
      settings={DEFAULT_TOOL_SETTINGS}
      selection={selection}
      onTool={setTool}
      onSelectionChange={setSelection}
      onChange={() => bump((n) => n + 1)}
      overlay={
        exporting !== null ? (
          <Exporting
            scene={history.state.scene}
            sourceBlob={context.sourceBlob}
            scale={exporting}
            style={style}
            layout={layout}
            client={client}
            onDone={(report, blob) => {
              /*
               * عنوان الكائن يبقى حيًّا حتى التصدير التالي.
               *
               * هو ما يعرضه رابط «احفظ» ويقرؤه الفحص الحيّ. وتحريره فورًا
               * يجعل الرابط ميّتًا لحظة ظهوره؛ وعدمُ تحريره أصلًا يُبقي
               * ملفًّا بمئات الميغابايت في الذاكرة بعد كل تصدير.
               */
              setExported((prev) => {
                if (prev) URL.revokeObjectURL(prev.url)
                return { report, url: URL.createObjectURL(blob) }
              })
              setExporting(null)
            }}
            onClose={() => setExporting(null)}
          />
        ) : null
      }
      onExport={(scale) => setExporting(scale)}
      exported={exported}
      side={
        mode === 'redact' ? (
          <RedactView
            history={history}
            selection={selection}
            palette={style.palette}
            onChange={() => bump((n) => n + 1)}
            onExit={() => setTool('select')}
          />
        ) : null
      }
    />
  )
}
