import { useEffect, useMemo, useState } from 'preact/hooks'

import { ASPECT_PRESETS, clampRatioRect, type AspectPresetId } from '@/modules/capture/selection'
import { createAutosave, type SaveState } from '@/modules/editor/autosave'
import { createHistory } from '@/modules/editor/history'
import { normaliseBox } from '@/modules/editor/hit-test'
import { replaceNodes, setCrop } from '@/modules/editor/scene-ops'
import { createTextLayoutCache } from '@/modules/editor/text-layout'
import { isHistoryShortcut } from '@/modules/editor/typing'
import { deviceRect } from '@/shared/geometry'
import { err, ok } from '@/shared/result'

import { ExportFlow } from '../export/ExportFlow'

import { buildRenderStyle } from './colors'
import {
  captureIdFromLocation,
  loadEditorContext,
  releaseContext,
  saveScene,
  type EditorContext,
} from './context'
import { createMeasurer } from './measure'
import { CropBar } from './parts/CropBar'
import { SaveStatus } from './parts/SaveStatus'
import { StyleBar } from './parts/StyleBar'
import {
  DEFAULT_TOOL_SETTINGS,
  TOOL_LABEL,
  translateNode,
  type ToolName,
  type ToolSettings,
} from './tools'
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
  const [cropPreset, setCropPreset] = useState<AspectPresetId>('free')
  /**
   * إعدادات الأداة — **حالة لا ثابت**.
   *
   * كانت `DEFAULT_TOOL_SETTINGS` تُمرَّر مجمَّدة، فلا لون ولا سمك ولا حجم
   * خطّ قابل للتغيير من الواجهة رغم أن نصّ المرحلة يشترطه. والأداة التي
   * تُنتج شكلًا واحدًا بلون واحد ليست أداة تعليق.
   */
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_TOOL_SETTINGS)
  const [exported, setExported] = useState<{
    report: BakeReport
    url: string
    scale: 1 | 2
  } | null>(null)
  /**
   * هل نافذة التصدير الكاملة مفتوحة؟
   *
   * منفصلةٌ عن `exporting` قصدًا: تلك دقّةُ خبزٍ **جارٍ** (الإجراء السريع)،
   * وهذه نافذةُ حوار تسأل قبل أن تخبز. ودمجهما في حالةٍ واحدة كان يجعل فتح
   * الحوار يُعلن `data-editor-state="exporting"` بلا خبزٍ يجري.
   */
  const [exportOpen, setExportOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({
    outcome: 'idle',
    baseUpdatedAt: context.baseUpdatedAt,
    message: null,
    dirty: false,
  })
  const [savedAt, setSavedAt] = useState<number | null>(null)
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
      /*
       * **ولا تراجع أثناء التصدير.** `Exporting` تعتمد على `scene`، فتراجعٌ
       * خلف الحاجب يُبدّل المشهد ويُعيد تشغيل الخبز من أوّله — عملٌ مضاعف
       * على ملفّ قد يبلغ مئات الميغابايتات، بلا أن يطلبه أحد.
       */
      if (exporting !== null) return
      e.preventDefault()
      if (shortcut === 'redo') history.redo()
      else history.undo()
      /*
       * **التراجع تعديلٌ يُحفَظ.** بدونه: يرسم المستخدم شكلًا فيُحفَظ بعد
       * ثمانمئة مللي، ثمّ يتراجع عنه، ثمّ يُغلق — فيعود الشكل الذي حذفه
       * عند الفتح التالي.
       */
      onSceneChanged()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history])

  /*
   * ⎋ تُنهي وضع الاقتصاص.
   *
   * زرّ الشريط مكتوب عليه «إنهاء (⎋)» — ووعدُ مفتاحٍ لا يعمل أسوأ من غياب
   * المفتاح: المستخدم يجرّبه، فلا يقع شيء، فيفقد ثقته بما يقرأ.
   */
  useEffect(() => {
    if (tool !== 'crop') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const target = e.target
      if (target instanceof HTMLElement && isEditable(target)) return
      e.preventDefault()
      setTool('select')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool])

  /*
   * **تحريك المحدَّد بالأسهم** — بند إتاحة لا رفاهية.
   *
   * الرسم والتحديد يقعان بالمؤشِّر، فمن لا يستعمل فأرة لا يملك سبيلًا إلى
   * ضبط موضع شكل بعد وضعه. والسهم يمنحه دقّة بكسل واحد، و⇧ يقفز عشرة.
   *
   * **ويُتخطّى داخل الحقول**: سهمٌ في حقل نصّ يحرّك المؤشِّر لا الشكل —
   * وهو الحارس نفسه الذي يمنع ⌘Z من التنازع.
   */
  useEffect(() => {
    const STEP = 1
    const JUMP = 10
    const onKey = (e: KeyboardEvent) => {
      const delta =
        e.key === 'ArrowLeft'
          ? [-1, 0]
          : e.key === 'ArrowRight'
            ? [1, 0]
            : e.key === 'ArrowUp'
              ? [0, -1]
              : e.key === 'ArrowDown'
                ? [0, 1]
                : null
      if (!delta || selection.size === 0) return
      const target = e.target
      if (target instanceof HTMLElement && isEditable(target)) return
      e.preventDefault()

      const scene = history.state.scene
      const moved = scene.nodes
        .filter((n) => selection.has(n.id) && !n.locked)
        .map((n) =>
          translateNode(
            n,
            delta[0]! * (e.shiftKey ? JUMP : STEP),
            delta[1]! * (e.shiftKey ? JUMP : STEP),
          ),
        )
      if (moved.length === 0) return

      /*
       * علامةٌ واحدة لكل ضغطة، **وتُدمَج بالتكرار التلقائي**: `coalesce`
       * يدمج الفروق على العقدة نفسها، فإمساك السهم ثانيتين لا يُخلي مكدّسًا
       * سعته خمسون.
       */
      history.mark(TOOL_LABEL.select)
      history.push(replaceNodes(scene, moved).patches)
      history.commit()
      onSceneChanged()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /*
   * الوضع يتبع الأداة، ولا يُدار بحالة ثانية.
   *
   * حالتان لشيء واحد تتباعدان: يختار المستخدم أداة الحجب من الشريط فتبقى
   * اللوحة على الملاحظات، أو يفتح لوحة الحجب فتبقى الأداة على التحديد.
   * والاشتقاق يجعل السؤال «هل نحن في وضع الحجب؟» بلا جوابين.
   */
  const mode = tool === 'redact' ? 'redact' : tool === 'crop' ? 'crop' : 'annotating'

  /** حدود الصورة بفضاء الجهاز — من سجلّ اللقطة لا من البتماب المفكوكة. */
  const imageBounds = deviceRect(0, 0, context.capture.width, context.capture.height)

  /*
   * خيط الطمس نفسه يخدم التصدير.
   *
   * وإنشاء ثانٍ له عند كل تصدير يعني خيطًا جديدًا ينتظر جهوزه بينما الأوّل
   * جاهز — تأخيرٌ مجّاني على أثقل عملية في المحرر.
   */
  const client = useMemo(() => createBlurClient(), [])
  useEffect(() => () => client.dispose(), [client])

  /*
   * الحفظ التلقائي — **ولا يُنشأ أصلًا حين يكون المشهد المخزَّن تالفًا**.
   *
   * `readOnly` يعني أن `parseScene` فشلت وأن المحرر فُتح على مشهد فارغ.
   * وأساس الكتابة المشروطة مقروءٌ من ذلك السجلّ نفسه، فالكتابة **تنجح** —
   * ويُمحى عمل المستخدم بمشهدٍ فارغ عند أوّل خطّ يرسمه.
   */
  const autosave = useMemo(() => {
    if (context.readOnly) return null
    return createAutosave({
      write: async (payload, _bytes, expected) => {
        const outcome = await saveScene(payload.scene, expected)
        if (outcome.kind === 'saved') {
          return ok({ written: true as const, updatedAt: outcome.updatedAt })
        }
        if (outcome.kind === 'conflict') {
          return ok({ written: false as const, actual: outcome.actual })
        }
        return err({ code: 'handler-failed' as const, message: outcome.message })
      },
      now: () => Date.now(),
      schedule: (fn, ms) => {
        const id = setTimeout(fn, ms)
        return () => clearTimeout(id)
      },
      baseUpdatedAt: context.baseUpdatedAt,
      onState: (next) => {
        setSaveState(next)
        if (next.outcome === 'saved') setSavedAt(Date.now())
      },
    })
  }, [context.readOnly, context.baseUpdatedAt])

  useEffect(() => () => autosave?.dispose(), [autosave])

  /*
   * **الإغلاق يُفرغ ما لم يُكتب.**
   *
   * `visibilitychange` لا `beforeunload`: الثاني لا يحتمل عملًا غير متزامن
   * أصلًا، والأوّل يقع قبله ويترك للكتابة فرصةً حقيقية. ونافذة التهدئة
   * ثمانمئة مللي ثانية — أي أن إغلاقًا بعد آخر ضربة قلم مباشرةً كان يخسرها.
   */
  useEffect(() => {
    if (!autosave) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') void autosave.flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [autosave])

  /** يُستدعى بعد كل تغيير في المشهد — من المسرح ومن اللوحات ومن التاريخ. */
  const onSceneChanged = () => {
    bump((n) => n + 1)
    autosave?.push(history.state.scene)
  }

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
      settings={settings}
      cropRatio={ASPECT_PRESETS.find((p) => p.id === cropPreset)?.ratio ?? null}
      selection={selection}
      onTool={setTool}
      onSelectionChange={setSelection}
      onChange={onSceneChanged}
      state={exporting !== null ? 'exporting' : mode}
      readOnly={context.readOnly}
      styleBar={
        <StyleBar
          settings={settings}
          onSettings={setSettings}
          palette={style.palette}
          history={history}
          onChange={onSceneChanged}
        />
      }
      save={
        <SaveStatus
          state={saveState}
          savedAt={savedAt}
          onKeepMine={() => void autosave?.overwrite()}
          onTakeTheirs={() => window.location.reload()}
          onRetry={() => void autosave?.flush()}
        />
      }
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
                return { report, url: URL.createObjectURL(blob), scale: exporting }
              })
              setExporting(null)
            }}
            onClose={() => setExporting(null)}
          />
        ) : exportOpen ? (
          /*
           * **الحوار الكامل، وهو الأولوية الأدنى في الترتيب.**
           *
           * الخبز الجاري يسبقه: لو فُتح الحوار أثناء خبزةٍ سريعة لَغطّى
           * شريطَ تقدّمها وزرَّ إلغائها — فيبقى المستخدم أمام نافذةٍ
           * ساكنة بينما يعمل شيءٌ لا يراه.
           */
          <ExportFlow
            scene={history.state.scene}
            sourceBlob={context.sourceBlob}
            style={style}
            layout={layout}
            client={client}
            title={context.capture.title}
            onClose={() => setExportOpen(false)}
          />
        ) : null
      }
      onExport={(scale) => setExporting(scale)}
      onOpenExport={() => setExportOpen(true)}
      title={context.capture.title}
      exported={exported}
      side={
        mode === 'crop' ? (
          <CropBar
            crop={history.state.scene.meta.crop}
            preset={cropPreset}
            onPreset={(id) => {
              setCropPreset(id)
              const ratio = ASPECT_PRESETS.find((p) => p.id === id)?.ratio ?? null
              const current = history.state.scene.meta.crop
              if (ratio === null || !current) return
              /*
               * تطبيق النسبة على اقتصاصٍ قائم — بـ`clampRatioRect` وحدها.
               * ولا تُطبَّق على «لا اقتصاص»: نسبةٌ على الصورة كاملة تعني
               * اقتصاصًا لم يطلبه أحد.
               */
              history.mark('نسبة الاقتصاص')
              history.push(
                setCrop(
                  history.state.scene,
                  clampRatioRect(normaliseBox(current), imageBounds, ratio),
                ).patches,
              )
              history.commit()
              onSceneChanged()
            }}
            onApply={() => setTool('select')}
            onReset={() => {
              history.mark('إلغاء الاقتصاص')
              history.push(setCrop(history.state.scene, null).patches)
              history.commit()
              onSceneChanged()
            }}
            onCancel={() => setTool('select')}
          />
        ) : mode === 'redact' ? (
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
