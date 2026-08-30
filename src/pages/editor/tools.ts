/**
 * الأدوات — تحويل إيماءة المؤشِّر إلى عقدة مشهد.
 *
 * **بلا JSX وبلا DOM**: تستقبل نقطتين بفضاء الصورة وتُرجع عقدة. وهذا يجعل
 * «ماذا يُنشئ سحبٌ من هنا إلى هنا» سؤالًا يُجاب في اختبار وحدة، بينما
 * `Stage.tsx` يبقى وصلًا رفيعًا بين الأحداث وهذه الدوالّ.
 *
 * تعيش في `pages/` لا `modules/` لأنها تقرأ الإعدادات وتولّد معرّفات — أي
 * أنها **سياسة تطبيق** لا منطقًا خالصًا؛ والأشكال الناتجة وحدها هي البيانات.
 */

import { defaultStrength } from '@/modules/editor/redact'
import {
  cssToImage,
  asNodeId,
  type AnnotationColor,
  type FontSpec,
  type Scene,
  type SceneNode,
} from '@/modules/editor/scene'
import { finalizeStroke } from '@/modules/editor/smoothing'
import { devicePoint, deviceRect, type DevicePoint } from '@/shared/geometry'

/** الأدوات المبنيّة. */
export type ToolName =
  | 'select'
  | 'arrow'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'freehand'
  | 'pin'
  | 'redact'
  | 'text'
  | 'note'
  | 'measure'
  /** وضعٌ لا أداة رسم: لا يُنشئ عقدة، بل يغيّر نافذة التصدير. */
  | 'crop'

/** أدوات تُنشئ عقدة بالسحب — `select` ليست منها. */
export const DRAW_TOOLS: readonly ToolName[] = [
  'arrow',
  'line',
  'rect',
  'ellipse',
  'freehand',
  'pin',
  'redact',
  'text',
  'note',
  'measure',
]

export interface ToolSettings {
  readonly colorToken: AnnotationColor
  /** لون التغطية — منفصل عن لون التعليق: أحدهما يُخفي والآخر يُشير. */
  readonly coverToken: AnnotationColor
  /** بكسل CSS — يُضرب بكثافة اللقطة عند الإنشاء. */
  readonly strokeWidthCss: number
  readonly fontSizeCss: number
  readonly pinShape: Scene['meta']['pinShape']
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  colorToken: 'tool/annotate/solid',
  coverToken: 'status/danger/solid',
  strokeWidthCss: 3,
  fontSizeCss: 16,
  pinShape: 'circle',
}

/** يولّد معرّفًا. يُحقن في الاختبار كي تكون النتائج حتمية. */
export type IdFactory = () => string

const browserIds: IdFactory = () => crypto.randomUUID()

function strokeOf(settings: ToolSettings, dpr: number) {
  return {
    colorToken: settings.colorToken,
    /*
     * **الضرب بكثافة البكسل هو الحدّ الوحيد الذي تعبره القيمة.**
     * `strokeWidthCss` رقمٌ يختاره إنسان من شريط تمرير، أي بكسل CSS.
     * ورسمه كما هو على لقطة كثافتها 2 يعطي خطًّا بنصف السمك المقصود —
     * فتُنتج الأداة نتيجتين مختلفتين حسب شاشة الالتقاط، بلا رسالة.
     */
    widthPx: cssToImage(settings.strokeWidthCss, dpr),
    dash: [] as number[],
    opacity: 1,
  }
}

/** عرض بطاقة الملاحظة حين تُوضع بنقرة — من ملفّ التصميم. */
export const NOTE_DEFAULT_WIDTH_CSS = 240

export const NOTE_PADDING_CSS = 12

/**
 * مواصفة الخطّ.
 *
 * `family` هنا **اسم منطقي يُحفَظ**، والعائلة الفعلية تُحقن لحظة الرسم من
 * `RenderStyle.textFamily`. مشهدٌ يحمل سلسلة `font-family` كاملة يُقيَّد
 * بالخطوط المثبّتة على جهاز مُنشئه — ويُرسم بخطّ بديل عند غيره بلا إشعار.
 */
function fontOf(settings: ToolSettings, dpr: number): FontSpec {
  return {
    family: 'ui',
    sizePx: cssToImage(settings.fontSizeCss, dpr),
    weight: 400,
    letterSpacingPx: 0,
  }
}

export interface CreateInput {
  readonly tool: ToolName
  readonly from: DevicePoint
  readonly to: DevicePoint
  readonly scene: Scene
  readonly settings: ToolSettings
  /** نقاط المسار الحرّ المسطَّحة — للأداة الحرّة وحدها. */
  readonly points?: readonly number[]
  readonly ids?: IdFactory
}

/** أصغر سحبة تُنشئ شكلًا — دونها نقرة لا سحب. */
export const MIN_DRAG_CSS = 3

/**
 * ينشئ عقدة من إيماءة.
 *
 * `null` حين لا تُنشئ الأداة شيئًا (`select`)، أو حين تكون الإيماءة أصغر من
 * أن تكون سحبًا — وأشكالٌ بمقاس 2×2 بكسل تتراكم في المشهد بلا أن يقصدها
 * أحد، وهي عين علّة `MIN_SELECTION` في المرحلة 8.
 */
export function createNode(input: CreateInput): SceneNode | null {
  const { tool, from, to, scene, settings } = input
  if (tool === 'select') return null

  const dpr = scene.source.dpr
  const id = asNodeId((input.ids ?? browserIds)())
  const stroke = strokeOf(settings, dpr)
  const base = { id, locked: false, rotation: 0, hidden: false, stroke } as const

  const box = deviceRect(
    Math.min(from.x, to.x),
    Math.min(from.y, to.y),
    Math.abs(to.x - from.x),
    Math.abs(to.y - from.y),
  )
  const minImage = cssToImage(MIN_DRAG_CSS, dpr)
  const tiny = box.width < minImage && box.height < minImage

  switch (tool) {
    case 'pin':
      // الدبّوس نقرة لا سحب — فلا حدّ أدنى عليه.
      return {
        ...base,
        kind: 'pin',
        at: to,
        shape: settings.pinShape,
        ordinal: 0,
        noteId: null,
        radiusPx: cssToImage(13, dpr),
      }

    case 'rect':
      return tiny ? null : { ...base, kind: 'rect', rect: box, radiusPx: 0, fill: 'none' }

    case 'ellipse':
      return tiny ? null : { ...base, kind: 'ellipse', rect: box, fill: 'none' }

    case 'redact':
      return tiny
        ? null
        : {
            id,
            locked: false,
            rotation: 0,
            stroke,
            kind: 'redact',
            rect: box,
            /*
             * التغطية افتراضًا — **الوعد الوحيد الذي تفي به الأداة**. ومن
             * أراد طمسًا بدّل النمط صراحةً وقرأ تحذيره.
             */
            mode: 'cover',
            strength: defaultStrength('cover'),
            coverToken: settings.coverToken,
          }

    case 'line':
      return tiny ? null : { ...base, kind: 'line', a: from, b: to }

    case 'arrow':
      return tiny
        ? null
        : {
            ...base,
            kind: 'arrow',
            a: from,
            b: to,
            head: 'end',
            headSizePx: cssToImage(12, dpr) + stroke.widthPx,
          }

    case 'freehand': {
      const raw = input.points ?? [from.x, from.y, to.x, to.y]
      if (raw.length < 4) return null
      /*
       * **التنعيم عند الإنشاء لا عند الرسم.** لو نُعِّم في الرسّام لأُعيد
       * حسابه في كل إطار — ولحُفظت العيّنات الخام كلّها في IndexedDB،
       * فتجاوز مسارٌ واحد `MAX_SCENE_BYTES` وحده.
       */
      const { points, epsilon } = finalizeStroke(raw, false, cssToImage(1, dpr))
      return { ...base, kind: 'freehand', points, closed: false, epsilon }
    }

    case 'text':
      return {
        ...base,
        kind: 'text',
        /*
         * **زاوية الصندوق لا نهاية السحبة.** `to` هو موضع الإفلات، وقد يقع
         * يمين البداية أو يسارها. ووضعُ النصّ عنده يجعل السطر ينمو من حيث
         * انتهت اليد لا من حيث بدأت: سحبةٌ من اليسار إلى اليمين تُنشئ نصًّا
         * **خارج** المستطيل الذي رسمه المستخدم بعرضه. قِيس حيًّا في كروم.
         *
         * والنقرة لا تتأثّر: `from === to` فالزاوية هي النقطة نفسها.
         */
        at: devicePoint(box.x, box.y),
        text: '',
        font: fontOf(settings, dpr),
        /*
         * سحبةٌ تُحدّد عرض اللفّ، ونقرةٌ تعني «بلا لفّ» (صفر). فالمستخدم
         * يملك الأمرين بإيماءة واحدة، بلا مقبض إضافي ولا وضع ثانٍ.
         */
        maxWidthPx: box.width >= minImage ? box.width : 0,
        align: 'start',
        // `'auto'` تُحسَم لحظة الرسم من أوّل محرف قويّ — والنصّ هنا فارغ بعد.
        dir: 'auto',
      }

    case 'crop':
      // الاقتصاص وضعٌ لا أداة رسم: لا يُنشئ عقدة، بل يكتب في `meta.crop`.
      return null

    case 'measure':
      return tiny
        ? null
        : {
            ...base,
            kind: 'measure',
            a: box,
            /*
             * مستطيلٌ واحد أوّلًا — «كم مقاس هذا؟». والثاني يُضاف بسحبة
             * ثانية فيصير السؤال «كم بينهما؟». وبدء المستخدم بسؤالين معًا
             * يجعل أبسط قياسٍ يحتاج إيماءتين.
             */
            b: null,
            show: 'size',
          }

    case 'note':
      return {
        ...base,
        kind: 'note',
        at: devicePoint(box.x, box.y),
        widthPx: box.width >= minImage ? box.width : cssToImage(NOTE_DEFAULT_WIDTH_CSS, dpr),
        title: '',
        body: '',
        tag: null,
        font: fontOf(settings, dpr),
        paddingPx: cssToImage(NOTE_PADDING_CSS, dpr),
        pinId: null,
      }
  }
}

/**
 * يزيح عقدة — الأساس الذي يقوم عليه السحب.
 *
 * كل صنف يحمل هندسته في حقول مختلفة، فالإزاحة ليست عمليّة واحدة. وتركُها
 * لكل مستدعٍ يعني تكرارها في السحب وفي الأسهم وفي المحاذاة لاحقًا.
 */
export function translateNode(node: SceneNode, dx: number, dy: number): SceneNode {
  const move = (p: DevicePoint) => devicePoint(p.x + dx, p.y + dy)
  switch (node.kind) {
    case 'rect':
    case 'ellipse':
    case 'redact':
      return {
        ...node,
        rect: deviceRect(node.rect.x + dx, node.rect.y + dy, node.rect.width, node.rect.height),
      }
    case 'line':
    case 'arrow':
      return { ...node, a: move(node.a), b: move(node.b) }
    case 'freehand': {
      const points = node.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy))
      return { ...node, points }
    }
    case 'pin':
    case 'text':
    case 'note':
      return { ...node, at: move(node.at) }
    case 'measure':
      return {
        ...node,
        a: deviceRect(node.a.x + dx, node.a.y + dy, node.a.width, node.a.height),
        b: node.b ? deviceRect(node.b.x + dx, node.b.y + dy, node.b.width, node.b.height) : null,
      }
  }
}

/** وسم العلامة في التاريخ — يظهر في «تراجع عن …». */
export const TOOL_LABEL: Readonly<Record<ToolName, string>> = {
  select: 'تحريك',
  arrow: 'سهم',
  line: 'خطّ',
  rect: 'مستطيل',
  ellipse: 'دائرة',
  freehand: 'تحديد حرّ',
  pin: 'دبّوس',
  // الأداة واحدة والأنماط ثلاثة — والتسمية تشملها ولا تَعِد بأقواها.
  redact: 'حجب وطمس',
  text: 'نصّ',
  note: 'ملاحظة',
  measure: 'قياس',
  // الاقتصاص وضعٌ لا أداة رسم — لا يُنشئ عقدة، بل يغيّر نافذة التصدير.
  crop: 'اقتصاص',
}
