/**
 * المشهد — بيانات خالصة تصف ما رُسم فوق اللقطة، ولا ترسم شيئًا.
 *
 * **الفصل الجوهري في المرحلة كلّها يبدأ هنا:** المشهد **يصف** الحجب
 * («تغطية عند س,ص بمقاس ع×ف»)، و`bake.ts` وحدها **تنفّذه** على نسخة بكسلات
 * تُدمَّر بعد الترميز. هذا ما يجعل تراجعًا كاملًا وحجبًا غير قابل للعكس
 * يجتمعان بلا تسوية — التوتّر مشروح في
 * [ADR 0015](../../../Docs/ADR/0015-redaction-single-exit.md).
 *
 * **بيانات خالصة بالمعنى الحرفي**: لا دوالّ، ولا أصناف، ولا مراجع إلى DOM.
 * المشهد يعبر `structuredClone` إلى IndexedDB، وهي تُسقط النماذج الأوّلية
 * وترمي على الدوالّ. وكل قيمة هنا إمّا رقم أو نصّ أو مصفوفة منها.
 *
 * **وكل الإحداثيات بفضاء `device`** — أي بكسل الصورة. اللقطة تُحفَظ بدقّة
 * الجهاز بلا إعادة تحجيم (`modules/capture/crop.ts`)، فبكسل الصورة **هو**
 * بكسل الجهاز، ولا فضاء خامس يُخترَع لهوية بلا تحويل.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import { type ANNOTATION_COLORS } from '@/shared/settings/schema'

import type { DevicePoint, DeviceRect } from '@/shared/geometry'

/**
 * نسخة شكل المشهد — تُزاد عند أي تغيير بنيوي.
 *
 * `AnnotationRecord.scene` مكتوب `unknown` في مخطَّط قاعدة البيانات، ونظام
 * الترحيل يعمل على **المخازن** لا على شكل حقل داخلها. فبلا وسمٍ في المشهد
 * نفسه، أوّل تغيير بنيوي بعد الشحن يُقرأ بقارئ جديد **بلا كشف**: مشهد قديم
 * يُعرض خطأً أو ينهار. الحقل يُدفع ثمنه سطرًا اليوم، وترحيلًا مستحيلًا بعده.
 */
export const SCENE_SCHEMA_VERSION = 1

/** معرّف عقدة — نصّ موسوم كي لا يُخلَط بـ`captureId` أو بأي نصّ آخر. */
export type NodeId = string & { readonly __nodeId: unique symbol }

export const asNodeId = (raw: string): NodeId => raw as NodeId

/**
 * اللون **اسم توكن** من قائمة مغلقة، لا `string` ولا سداسي.
 *
 * `ANNOTATION_COLORS` سبعة توكنات مفروضة بـ`v.picklist` في إعدادات المشروع.
 * وتوسيعها إلى `string` تنازلٌ مجّاني: `resolveColor` لا تقبل إلّا توكنًا
 * معروفًا، فتحويلٌ قسريّ ثم بحثٌ عن مفتاح غير موجود يعطي `TypeError` على
 * مشهد اجتاز التحقّق بنجاح — أي عطلًا بعيدًا عن سببه بمرحلتين.
 *
 * والحلّ إلى سداسي يقع في طبقة الصفحة، لأن قاعدة اللنت تمنع `modules/` من
 * استيراد `tokens/`. وهذا صحيح: اللون هنا **قرار**، وهناك **قيمة**.
 */
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number]

export interface StrokeStyle {
  readonly colorToken: AnnotationColor
  /**
   * بكسل **صورة** لا بكسل CSS.
   *
   * المصدر `settings.annotation.strokeWidth` وهو بكسل CSS بحكم أصله (رقمٌ
   * يختاره إنسان من شريط تمرير). فيُضرب بكثافة البكسل عند الإنشاء — وإلّا
   * رُسم خطٌّ سمكه 3 على لقطة كثافتها 2 بسمك 1.5 CSS: **نصف المقصود**،
   * والأداة تُنتج نتيجتين حسب شاشة الالتقاط بلا رسالة.
   */
  readonly widthPx: number
  readonly dash: readonly number[]
  readonly opacity: number
}

export interface FontSpec {
  readonly family: string
  /** بكسل صورة. المصدر `settings.annotation.fontSize` (10–72 بكسل CSS) × كثافة البكسل. */
  readonly sizePx: number
  readonly weight: number
  /**
   * **صفر دائمًا** — والنوع نفسه يفرضه.
   *
   * عقد صفحة التصميم: العربية لا تُباعَد حروفها. وقِيس أن كروم يطبّق
   * `letterSpacing = '3px'` على `ABC` (39.01 → 48.01) **ويتجاهله** على
   * `مرحبا` (42.93 → 42.93). فقيمةٌ غير صفرية على سطر مختلط تجعله يُقاس
   * بشيء ويُرسم بآخر — واللفّ يعتمد على القياس.
   */
  readonly letterSpacingPx: 0
}

/**
 * ما تشترك فيه كل العقد — **بلا `hidden`**.
 *
 * الحقل يعيش في `HideableBase` وحدها، وهذا هو الحدّ الأمني بعينه: انظر
 * `RedactNode`.
 */
interface NodeBase {
  readonly id: NodeId
  readonly locked: boolean
  /** راديان حول مركز الصندوق. الإصابة تدوّر **النقطة** عكسيًّا لا الشكل. */
  readonly rotation: number
  readonly stroke: StrokeStyle
}

/**
 * كل ما يجوز إخفاؤه من لوحة الطبقات.
 *
 * **الفصل عن `NodeBase` هو الحدّ الأمني، لا ترتيبًا للأنواع.** لو ورثت عقدة
 * الحجب حقل `hidden` لبقي سؤالٌ بلا جواب صحيح: هل يحترمه الخبز؟ إن احترمه
 * فنقرةٌ على أيقونة عين تُنتج تصديرًا **غير محجوب** بلا تحذير؛ وإن تجاهله
 * فما يُعرض ليس ما يُصدَّر. والمخرج الوحيد أن لا تملك اللوحة حقلًا ترسمه،
 * ولا `bake()` حقلًا تتخطّاه.
 */
interface HideableBase extends NodeBase {
  readonly hidden: boolean
}

export interface RectNode extends HideableBase {
  readonly kind: 'rect'
  readonly rect: DeviceRect
  readonly radiusPx: number
  readonly fill: 'none' | 'solid'
}

export interface EllipseNode extends HideableBase {
  readonly kind: 'ellipse'
  readonly rect: DeviceRect
  readonly fill: 'none' | 'solid'
}

export interface LineNode extends HideableBase {
  readonly kind: 'line'
  readonly a: DevicePoint
  readonly b: DevicePoint
}

export interface ArrowNode extends HideableBase {
  readonly kind: 'arrow'
  /** الذيل. */
  readonly a: DevicePoint
  /** الرأس. */
  readonly b: DevicePoint
  readonly head: 'end' | 'both'
  /** بفضاء الصورة — فرأس السهم لا يكبر ولا يصغر مع تكبير العرض. */
  readonly headSizePx: number
}

export interface FreehandNode extends HideableBase {
  readonly kind: 'freehand'
  /**
   * أزواج `x,y` مسطَّحة، لا مصفوفة نقاط موسومة.
   *
   * النقطة الموسومة تُسلسَل إلى `{"space":"device","x":123.5,"y":456.5},` —
   * تسعة وثلاثون محرفًا — مقابل `123.5,456.5,` أي اثني عشر. **3.3× أصغر**
   * في IndexedDB، والوسم لا يضيع لأن فضاء المشهد كلّه واحد ومعلن في
   * ترويسة الملفّ. ومسار حرّ واحد يحمل مئات النقاط، فالفرق بنيوي لا تجميلي.
   */
  readonly points: readonly number[]
  readonly closed: boolean
  /** عتبة تبسيط المسار — تُحفَظ كي تُعاد الحساب على المسار الأصلي إن لزم. */
  readonly epsilon: number
}

export interface TextNode extends HideableBase {
  readonly kind: 'text'
  readonly at: DevicePoint
  /**
   * النصّ المنطقي **بلا محارف عزل**.
   *
   * العزل يُركَّب لحظة الرسم لا في البيانات: محارف العزل داخل النصّ المحفوظ
   * تُنسَخ مع النصّ إلى محرّرات أخرى وتظهر فيها، وتفسد المقارنة والبحث.
   */
  readonly text: string
  readonly font: FontSpec
  /** صفر يعني: بلا لفّ. */
  readonly maxWidthPx: number
  readonly align: 'start' | 'center' | 'end'
  /**
   * `'auto'` يُحسَم قبل الرسم، **ولا يُترك للوراثة أبدًا**.
   *
   * مقيس: `ctx.direction` الافتراضي في صفحة المحرر `rtl` لأنه يرث
   * `dir="rtl"` من المستند. فنصّ لاتيني خالص يُرسم بلا ضبط صريح يُقلَب —
   * وعلامات الترقيم الطرفية تقفز إلى الطرف الخطأ.
   */
  readonly dir: 'rtl' | 'ltr' | 'auto'
}

/**
 * تصنيف الملاحظة — القاموس الثلاثي المضمَر في لوحة الملاحظات.
 *
 * **مصفوفة يُشتقّ منها النوع، لا نوعٌ تُكرَّر قائمته.** القائمة يحتاجها
 * المخطَّط للتحقّق، والقائمة الجانبية للترشيح، والرسّام للتسمية — وثلاث
 * نسخ يدوية تتباعد: يُضاف تصنيف رابع فيقبله المخطَّط ولا يظهر له زرّ.
 */
export const NOTE_TAGS = ['type', 'spacing', 'token'] as const

export type NoteTag = (typeof NOTE_TAGS)[number]

/**
 * تسمية التصنيف — هنا لا في طبقة الصفحة.
 *
 * الوسم يُرسم **داخل البطاقة على القماش** ويظهر في القائمة الجانبية معًا.
 * ونسختان تجعلان الصورة المصدَّرة تقول «الخط» واللوحة تقول شيئًا آخر —
 * وسابقة `OBSCURE_LABEL` هنا للسبب نفسه.
 */
export const NOTE_TAG_LABEL: Readonly<Record<NoteTag, string>> = {
  type: 'الخطّ',
  spacing: 'المسافات',
  token: 'الرموز',
}

export interface NoteNode extends HideableBase {
  readonly kind: 'note'
  readonly at: DevicePoint
  /** العرض من المستخدم. **الارتفاع غير مخزَّن** — انظر أدناه. */
  readonly widthPx: number
  readonly title: string
  readonly body: string
  readonly tag: NoteTag | null
  readonly font: FontSpec
  readonly paddingPx: number
  /**
   * الربط بالدبّوس **بالهوية لا بالرقم**.
   *
   * لو رُبط بالرقم لعادت الملاحظة بعد التراجع مربوطةً بدبّوس آخر: احذف
   * الدبّوس «٣» من خمسة، فيصير «٤» ثالثًا؛ ثم تراجَع، فتجد الملاحظة التي
   * كانت للثالث معلّقة على من صار ثالثًا. ترقيمٌ صحيح شكلًا **مخرَّب
   * دلاليًّا**، بلا خطأ ولا رسالة.
   */
  readonly pinId: NodeId | null
}

export interface PinNode extends HideableBase {
  readonly kind: 'pin'
  readonly at: DevicePoint
  readonly shape: 'circle' | 'square' | 'pin'
  /**
   * الرقم المعروض — **مخزَّن رغم كونه مشتقًّا**.
   *
   * الاشتقاق من موضع العقدة في المصفوفة يخلط محورين مستقلّين بنصّ الخطّة:
   * ترتيب **الأرقام** («إعادة ترتيب الأرقام») وترتيب **الطبقات** («إعادة
   * ترتيب» في قائمة الطبقات). رفعُ دبّوس فوق سهم في لوحة الطبقات كان
   * سيغيّر رقمه.
   *
   * والتخزين لا يكلّف صحّةً لأن الفرق يحمل العقدة كاملة لحظة التنفيذ، فلا
   * يحتاج التراجع إلى إعادة اشتقاق.
   */
  readonly ordinal: number
  readonly noteId: NodeId | null
  readonly radiusPx: number
}

export type ObscureMode = 'cover' | 'pixelate' | 'blur'

/**
 * **`cover` وحدها.** والقرار مسنود لا مذوق:
 *
 * البكسلة **بلا انتشار** — تغيير بكسل في الأصل يمسّ كتلته وحدها، فبحثٌ
 * تراجعي على نصّ معروف الخطّ يستردّه حرفًا حرفًا. والضبابي التفافٌ خطّي،
 * أي عاملٌ قابل للعكس رياضيًّا حتى التكميم والقصّ.
 *
 * ومع ذلك تُدمَّر بكسلات الثلاثة في الملفّ المصدَّر — الفرق أن **الوعد**
 * بعدم القابلية للعكس مقصور على التغطية. تفصيله في ADR 0015.
 */
export const isIrreversible = (mode: ObscureMode): boolean => mode === 'cover'

/** التسمية المعروضة — «حجب» للتغطية وحدها، و«طمس» للآخرين. */
export const OBSCURE_LABEL: Readonly<Record<ObscureMode, string>> = {
  cover: 'حجب (تغطية)',
  pixelate: 'طمس (بكسلة)',
  blur: 'طمس (ضبابي)',
}

/**
 * عقدة الحجب — ترث `NodeBase` لا `HideableBase`.
 *
 * الغياب مقصود ومُحكم بالنوع: لا حقل `hidden` يُكتَب، فلا أيقونة عين تُرسم،
 * فلا مسار يُنتج تصديرًا غير محجوب.
 */
export interface RedactNode extends NodeBase {
  readonly kind: 'redact'
  readonly rect: DeviceRect
  readonly mode: ObscureMode
  /** `blur` ⇒ الانحراف المعياري بالبكسل · `pixelate` ⇒ ضلع الخليّة · `cover` ⇒ مُهمَل. */
  readonly strength: number
  /**
   * لون التغطية كتوكن.
   *
   * والشفافية **تُفرَض معتمة داخل دالّة التغطية** مهما كان `stroke.opacity`:
   * تغطيةٌ بتسعين بالمئة تُفكّ حسابيًّا بمعرفة لون الغطاء، وملفّ التصميم
   * يرسم ثلاثة من أربعة حجوب بهذه الشفافية بالضبط.
   */
  readonly coverToken: AnnotationColor
}

export interface MeasureNode extends HideableBase {
  readonly kind: 'measure'
  readonly a: DeviceRect
  /** `null` يعني قياس بُعد واحد لا فجوة بين اثنين. */
  readonly b: DeviceRect | null
  readonly show: 'gap' | 'size'
}

export type SceneNode =
  | RectNode
  | EllipseNode
  | LineNode
  | ArrowNode
  | FreehandNode
  | TextNode
  | NoteNode
  | PinNode
  | RedactNode
  | MeasureNode

export type NodeKind = SceneNode['kind']

/** كل ما يجوز إخفاؤه — يُشتقّ بالاستبعاد فلا تنشأ قائمتان تتباعدان. */
export type HideableNode = Exclude<SceneNode, RedactNode>

/** هل تملك هذه العقدة حقل الإخفاء؟ حارس نوع، لا فحص حقل يدوي. */
export const isHideable = (n: SceneNode): n is HideableNode => n.kind !== 'redact'

export interface SceneMeta {
  /**
   * الاقتصاص **منطقي**: حقل جذر واحد، لا إزاحة على مئتَي عقدة.
   *
   * الإزاحة تحوّل أرخص عملية في المحرر إلى أثقل خطوة في التاريخ (فرقٌ يحمل
   * كل عقدة)، وتفقد القدرة على توسيع الاقتصاص ثانيةً بلا خسارة. ويُطبَّق
   * مرّة أخيرة داخل `bake()`.
   */
  readonly crop: DeviceRect | null
  readonly pinStart: number
  readonly pinShape: PinNode['shape']
}

export interface Scene {
  readonly schemaVersion: number
  readonly captureId: string
  /**
   * مصدر اللقطة — و`dpr` **حقل إلزامي** لا اختياري.
   *
   * بدونه تُعرض القياسات مضاعفة على لقطة كثافتها 2 (فجوة تصميمية 16px
   * تُقاس 32 بكسل جهاز)، ويُرسم سمك الخطّ وحجم الخطّ بنصف المقصود. أي أن
   * الأداة تُنتج نتيجتين مختلفتين حسب شاشة الالتقاط — والمستخدم لا يرى
   * سببًا.
   */
  readonly source: { readonly width: number; readonly height: number; readonly dpr: number }
  readonly meta: SceneMeta
  /** الترتيب = ترتيب الرسم. الأخير أعلى. */
  readonly nodes: readonly SceneNode[]
  /**
   * يتصاعد مع كل حفظ ناجح.
   *
   * يُقرأ داخل معاملة واحدة قبل الكتابة، فيكشف أن تبويبًا آخر كتب بيننا —
   * بلا فكّ المشهد ولا مقارنته.
   */
  readonly revision: number
}

/**
 * حدود صريحة تُفرَض في `scene-ops` — القاعدة لا تتضخّم صمتًا.
 *
 * `unlimitedStorage` ممنوحة دائمًا في هذا المشروع، فحارس الحصّة **لا يحجب
 * عمليًّا**. ومشهدٌ ينتفخ لا يُبلَّغ عنه: يظهر بطئًا في المكتبة بعد شهور،
 * لا خطأً عند وقوعه.
 */
export const MAX_FREEHAND_POINTS = 512
export const MAX_SCENE_NODES = 2000
export const MAX_SCENE_BYTES = 4 * 1024 * 1024

/** بكسل CSS مؤلَّف بيد الإنسان ⇒ بكسل صورة. الحدّ الوحيد الذي تعبره الكثافة. */
export const cssToImage = (n: number, dpr: number): number => n * dpr

/** والعكس — لعرض القياس، وللنداء على `modules/measure/` بعتباته CSS. */
export const imageToCss = (n: number, dpr: number): number => n / dpr
