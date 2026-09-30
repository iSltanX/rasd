import { useEffect, useRef } from 'preact/hooks'

import { imageToCanvas, type Camera } from '@/modules/editor/camera'
import { resolveDirection } from '@/modules/editor/text-bidi'
import { isHistoryShortcut } from '@/modules/editor/typing'

import { cssFont } from './measure'

import type { TextEditSession } from './text-editing'
import type { TextNode } from '@/modules/editor/scene'
import type { FontMetrics } from '@/modules/editor/text-layout'
import type { JSX } from 'preact'

export interface TextEditorOverlayProps {
  readonly node: TextNode
  readonly camera: Camera
  readonly family: string
  readonly colorHex: string
  readonly metrics: FontMetrics
  readonly widthCss: number
  readonly session: TextEditSession
  readonly onDone: () => void
  readonly onUndo: () => void
  readonly onRedo: () => void
  /** يُحقن في الاختبار كي تكون قواطع النوبة حتمية. */
  readonly now?: () => number
}

/** أضيق حقل يُكتَب فيه — دونه يبدو الحقل نقطةً لا مكان كتابة. */
const MIN_FIELD_CSS = 48

/**
 * حقل تحرير النصّ فوق القماش.
 *
 * **`<textarea>` حقيقي لا محاكاة مؤشِّر.** كتابة العربية تحتاج ما لا يُحاكى
 * في أسبوع: التشكيل المتّصل، ومحرّرات الإدخال (IME)، والاختيار بالسحب،
 * والنسخ واللصق، والتدقيق الإملائي، وقارئ الشاشة. وقماشٌ يرسم مؤشِّرًا
 * وامضًا يُسقطها كلّها.
 *
 * **والعقدة تُخفى عن الرسم أثناء التحرير، فلا يجتمع نصّان.** الحقل والقماش
 * لا يضعان خطّ الأساس في المكان نفسه بالضبط — القماش يرسم عند `ascent`
 * المقيس، والحقل يوسّط الحرف في صندوق سطره — فرسمهما معًا يُنتج شبحًا
 * مزدوجًا بإزاحة بكسل أو اثنين. وإخفاء أحدهما يجعل السؤال بلا موضوع.
 *
 * **و`⌘Z` تُعترَض هنا صراحةً.** الحقل يملك مكدّس تراجع أصليًّا للمتصفّح؛
 * ولو تُرك لتنازع المكدّسان: تراجعٌ يمحو حرفًا في الحقل ولا يمسّ المشهد،
 * ثمّ تراجعٌ ثانٍ يمحو شكلًا رُسم قبل الكتابة.
 */
export function TextEditorOverlay(props: TextEditorOverlayProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { node, camera, metrics } = props
  const now = props.now ?? (() => performance.now())

  const at = imageToCanvas(node.at, camera)
  const direction = resolveDirection(node.text, node.dir)
  const sizeCss = node.font.sizePx * camera.zoom
  const lineHeightCss = metrics.lineHeight * camera.zoom

  /** يلائم ارتفاع الحقل لمحتواه — بلا شريط تمرير داخل النصّ. */
  const grow = (el: HTMLTextAreaElement): void => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // المؤشِّر في النهاية: النصّ فارغ عند الإنشاء، وعند إعادة الفتح يُكمَل
    // من آخره لا من أوّله.
    el.setSelectionRange(el.value.length, el.value.length)
    grow(el)
  }, [node.id])

  /*
   * **المزامنة في اتجاه واحد فقط: من المشهد إلى الحقل، وعند الاختلاف وحده.**
   * كتابة القيمة في كل تصيير تُعيد المؤشِّر إلى النهاية بعد كل حرف، فيستحيل
   * التحرير في وسط النصّ. والاختلاف لا يقع إلّا بعد `⌘Z` أو تغييرٍ خارجي.
   */
  useEffect(() => {
    const el = ref.current
    if (!el || el.value === node.text) return
    el.value = node.text
    el.setSelectionRange(el.value.length, el.value.length)
    grow(el)
  }, [node.text])

  const onInput = (e: JSX.TargetedInputEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget
    const native = e as unknown as InputEvent
    const type = native.inputType ?? ''
    /*
     * اللصق وسطرٌ جديد **حدّا كلمة**: كلاهما نهاية فكرة لا امتداد نوبة.
     * و`data` يأتي `null` في كليهما، فلو مُرّر كما هو لَما انقطعت النوبة
     * ولالتهم الحدُّ الأقصى وحده فقرةً كاملة في علامة واحدة.
     */
    const input =
      type.startsWith('insertFromPaste') || type.startsWith('insertLineBreak')
        ? '\n'
        : (native.data ?? '')

    props.session.edit(el.value, input, now())
    grow(el)
  }

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>): void => {
    const shortcut = isHistoryShortcut(e)
    if (shortcut) {
      e.preventDefault()
      e.stopPropagation()
      // تُغلَق النوبة الجارية أوّلًا، وإلّا تراجعت عن علامة لم تُختم بعد.
      props.session.finish()
      if (shortcut === 'undo') props.onUndo()
      else props.onRedo()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      props.session.finish()
      props.onDone()
    }
  }

  return (
    <textarea
      ref={ref}
      data-text-editor={node.id}
      aria-label="نصّ التعليق"
      dir={direction}
      value={node.text}
      rows={1}
      spellcheck={false}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onBlur={() => {
        props.session.finish()
        props.onDone()
      }}
      style={{
        position: 'absolute',
        insetBlockStart: `${at.y}px`,
        /*
         * `left` فيزيائية عن قصد — والاستثناء الوحيد من قاعدة RTL في المشروع.
         *
         * `at.x` مسافةٌ من **الحافّة اليسرى للقماش** يحسبها `imageToCanvas`
         * من الكاميرا، لا من اتجاه القراءة. و`inset-inline-start` في مستند
         * `rtl` تعني «من اليمين»، فتضع الحقل على مسافة `at.x` من الجهة
         * المقابلة: نصٌّ يبتعد عن موضعه كلّما اقترب منه.
         *
         * واتجاه النصّ **داخل** الحقل محفوظ بـ`dir` أدناه، فلا شيء يُفقَد.
         */
        // eslint-disable-next-line no-restricted-syntax -- إحداثي كاميرا لا خاصية تخطيط
        left: `${at.x}px`,
        inlineSize: `${Math.max(MIN_FIELD_CSS, props.widthCss)}px`,
        font: cssFont({ ...node.font, sizePx: sizeCss }, props.family),
        lineHeight: `${lineHeightCss}px`,
        letterSpacing: '0px',
        color: props.colorHex,
        caretColor: props.colorHex,
        direction,
        textAlign: node.align === 'center' ? 'center' : node.align,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: 0,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        // تُكسَر الكلمات الطويلة على مستوى الحقل كما تفيض في القماش.
        overflowWrap: 'break-word',
      }}
    />
  )
}
