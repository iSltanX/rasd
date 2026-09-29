/**
 * إشارات التصدير — ثلاثة حدودٍ حسبتها المرحلة 15 ولم يقرأها أحد.
 *
 * ملفّ المرحلة 15 السابق (تاريخ Git) يسمّيها في قسم «ما لم يُقَس» ويُسنِدها إلى المرحلة 19 بالاسم:
 * `BakeReport.warnings` · `SmoothResult.truncated` · `WrapResult.overflow`.
 * الثلاثة محسوبة ومختبَرة ولها تعليقٌ يقول «يُبلَّغ ولا يُخفى» — **وصفر
 * مستهلك إنتاجي لأيٍّ منها** حتى هذا الملفّ.
 *
 * **ولا تُجمَع من مكانٍ واحد، لأنها لا تُحسب في زمنٍ واحد:**
 *
 * | الإشارة | متى تُحسب | كيف تصل هنا |
 * | --- | --- | --- |
 * | `warnings` | أثناء الخبز | من `BakeReport` مباشرةً |
 * | `overflow` | عند تخطيط النصّ | تُقرأ من ذاكرة التخطيط بالعقدة |
 * | `truncated` | عند إنهاء الشخطة | **تُشتقّ** من العقدة — لا تُحفَظ فيها |
 *
 * **والاشتقاق الثالث حدٌّ معلَن.** `finalizeStroke` تقتطع حين يستنفد التصعيد
 * سقفه، فتُخرج مسارًا عدد نقاطه `MAX_FREEHAND_POINTS` بالضبط وعتبتُه
 * `MAX_EPSILON_PX`. والمحدِّد هنا يطابق هذين معًا. ويبقى التباسٌ نظري واحد:
 * مسارٌ صعّد حتى السقف ثمّ استقرّ عند العدد الأقصى **بالضبط** بلا اقتطاع
 * يُقرأ مقتطعًا. أثرُه إشارةٌ إعلامية زائدة لا نتيجةٌ خاطئة، وإزالتُه تحتاج
 * حقلًا جديدًا في مخطَّط المشهد — وهو ترحيل تخزين خارج نطاق هذه الوحدة.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { MAX_FREEHAND_POINTS } from '../editor/scene'
import { MAX_EPSILON_PX, pointCount } from '../editor/smoothing'

import type { BakeReport } from '../editor/bake'
import type { NoteNode, Scene, TextNode } from '../editor/scene'
import type { TextLayoutCache } from '../editor/text-layout'

/** درجة الإشارة — تحكم لونها في الواجهة، ولا تحكم عرضها. */
export type SignalTone = 'warning' | 'info'

export interface ExportSignal {
  readonly kind: 'redact-outside' | 'path-truncated' | 'text-overflow'
  readonly tone: SignalTone
  /** نصّ عربي **جاهز للعرض** — الواجهة تعرضه ولا تبنيه. */
  readonly text: string
  /** كم مرّة وقعت — عدٌّ بشري، تُنسّقه الواجهة بأرقام هندية. */
  readonly count: number
}

export interface SignalInput {
  readonly scene: Scene
  readonly layout: TextLayoutCache
  readonly report: BakeReport
}

const isWrappable = (kind: string): boolean => kind === 'text' || kind === 'note'

/**
 * يجمع الإشارات الثلاث في قائمةٍ واحدة جاهزة للعرض.
 *
 * **الترتيب بالأهمّية لا بالمصدر**: ما يمسّ الحجب أوّلًا، لأنه الوحيد الذي
 * يعني أن شيئًا قُصد إخفاؤه ولم يُخفَ. ثمّ ما يمسّ الشكل.
 *
 * وقائمةٌ فارغة معلومةٌ لا فراغ: الواجهة تقول «لا ملاحظات» ولا تُخفي القسم،
 * فغيابُ القسم يُقرأ «لم يُفحَص» لا «فُحص ولم يُوجَد».
 */
export function collectSignals(input: SignalInput): readonly ExportSignal[] {
  const signals: ExportSignal[] = []

  if (input.report.warnings.length > 0) {
    signals.push({
      kind: 'redact-outside',
      tone: 'warning',
      text: 'منطقة حجب وقعت خارج نافذة التصدير فلم تُطبَّق — راجع الاقتصاص.',
      count: input.report.warnings.length,
    })
  }

  const truncated = input.scene.nodes.filter(
    (node) =>
      node.kind === 'freehand' &&
      node.epsilon >= MAX_EPSILON_PX &&
      pointCount(node.points) === MAX_FREEHAND_POINTS,
  ).length

  if (truncated > 0) {
    signals.push({
      kind: 'path-truncated',
      tone: 'info',
      text: 'شخطةٌ حرّة بلغت حدّ النقاط فاقتُطع ذيلها — الشكل المصدَّر هو المعروض.',
      count: truncated,
    })
  }

  const overflowing = input.scene.nodes.filter(
    (node) => isWrappable(node.kind) && input.layout.get(node as TextNode | NoteNode).overflow,
  ).length

  if (overflowing > 0) {
    signals.push({
      kind: 'text-overflow',
      tone: 'info',
      text: 'نصٌّ فيه ذرّة أعرض من سطرها تفيض ولا تُكسَر — قيمة سداسية أو رابط طويل.',
      count: overflowing,
    })
  }

  return signals
}
