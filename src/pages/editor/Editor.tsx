import { useEffect, useState } from 'preact/hooks'

import {
  captureIdFromLocation,
  loadEditorContext,
  releaseContext,
  type EditorContext,
} from './context'
import { NotFound } from './views/NotFound'

import type { JSX } from 'preact'

/**
 * جذر المحرر — يحمّل ثم يوزّع.
 *
 * السابقة `Popup.tsx`: منسّقٌ يقرأ الحالة ويختار العرض، والمنطق كلّه خارجه
 * في `context.ts` كي يُختبَر بلا تركيب.
 *
 * **الدفعة الثانية تصل إلى هنا وتقف**: التحميل والحالات الفاشلة وعرض
 * البيانات. المسرح والأدوات في الدفعة الثالثة — والصفحة تعمل قبلهما بحقّ:
 * تفتح على لقطة، وتعرض بياناتها، وتقول بوضوح ما ينقصها.
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
 * ما بُني حتى الآن من المحرر.
 *
 * يعرض ما تملكه الدفعة الثانية فعلًا — اللقطة وبياناتها وحالة مشهدها — ولا
 * يرسم شريط أدوات ولا مسرحًا لا يعملان. القاعدة من المرحلة 7: «كل ما لا
 * يملك محرّكًا حقيقيًا يُبنى ببنية عرضه كاملة ويُترك موصولًا بلا بيانات
 * ملفَّقة» — والعكس صحيح كذلك: ما لا بنية له بعد لا يُرسم شبحًا.
 */
function Loaded({ context }: { context: EditorContext }): JSX.Element {
  return (
    <main data-editor-state="ready">
      <h1>{context.capture.title || 'لقطة بلا عنوان'}</h1>
      <p data-editor-origin>{context.capture.origin}</p>
      <p data-editor-size>
        {context.capture.width} × {context.capture.height}
      </p>
      {context.sceneError ? <p data-editor-scene-error>{context.sceneError}</p> : null}
      <img src={context.imageUrl} alt="" data-editor-image />
    </main>
  )
}
