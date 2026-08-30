/**
 * تحميل سياق المحرر — منطق بلا JSX، منفصل عمدًا عن `Editor.tsx`.
 *
 * السابقة `pages/popup/context.ts` وعلّتها نفسها: يُختبَر بمحاكاة `chrome.*`
 * وقاعدة بيانات وهمية **بلا تركيب أي مكوّن**. وهذا يهمّ هنا أكثر، لأن مسار
 * التحميل يحمل ثلاثة أوضاع فشل مختلفة (لا معرّف · لقطة محذوفة · مشهد تالف)
 * وكلٌّ منها له عرضٌ مختلف.
 *
 * **الصفحة تقرأ قاعدة البيانات مباشرةً** لا عبر رسالة إلى الخلفية — السابقة
 * المستقرّة منذ المرحلة 7 (`popup/context.ts` يستورد `repository` نفسه).
 * ورحلةُ رسالة لإعادة ما تملكه الصفحة أصلًا تزيد زمن الفتح بلا مقابل.
 */

import { isIrreversible, SCENE_SCHEMA_VERSION, type Scene } from '@/modules/editor/scene'
import { emptyScene, estimateSceneBytes, parseScene } from '@/modules/editor/scene-schema'
import { errText, ok, type Result } from '@/shared/result'
import { annotations, blobs, captures, putIfUnchanged } from '@/shared/storage/repository'

import type { AnnotationRecord, CaptureRecord } from '@/shared/storage/schema'

/** ما يحتاجه المحرر ليفتح — الصورة والوصف والمشهد. */
export interface EditorContext {
  readonly capture: CaptureRecord
  /** عنوان كائن للصورة. **يُبطَل عند تفكيك الصفحة** — انظر `releaseContext`. */
  readonly imageUrl: string
  readonly scene: Scene
  /**
   * `updatedAt` للسجلّ المقروء، أو `null` إن لم يوجد سجلّ.
   *
   * هو ما يُقارَن به عند الحفظ داخل معاملة واحدة، فيُمنع أن يمحو تبويبٌ
   * عملَ آخر. ولذلك يُحمَل في السياق لا يُعاد قراءته وقت الحفظ: القراءة
   * الثانية تُلغي الفائدة كلّها.
   */
  readonly baseUpdatedAt: number | null
  /**
   * المشهد المحفوظ تعذّرت قراءته.
   *
   * الصفحة تفتح على مشهد فارغ **ولا تكتب فوق التالف** حتى يقرّر المستخدم:
   * الكتابة فوق ما لم نفهمه تُتلف عمله نهائيًّا.
   */
  readonly sceneError: string | null
}

/**
 * صانع عناوين الكائنات — يُحقن كي يُختبَر مسار التحميل كاملًا.
 *
 * `URL.createObjectURL` في بيئة الاختبار يرفض ما يعود من قاعدة البيانات
 * الوهمية (النسخ الهيكلي يُعيد كائنًا لا `Blob` بمعنى happy-dom). والمحقون
 * يجعل ما يُختبَر هو **منطق التحميل** لا واجهة المتصفّح.
 */
export interface ObjectUrls {
  create(blob: Blob): string
  revoke(url: string): void
}

const browserUrls: ObjectUrls = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => {
    URL.revokeObjectURL(url)
  },
}

/** يقرأ معرّف اللقطة من عنوان الصفحة. */
export function captureIdFromLocation(href: string): string | null {
  try {
    const value = new URL(href).searchParams.get('capture')
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

/**
 * يحمّل كل ما يحتاجه المحرر.
 *
 * ترتيب الفشل مقصود: غياب المعرّف ثم غياب اللقطة ثم غياب البايتات — كلٌّ
 * منها حالة مختلفة يعرضها المحرر بنصّ مختلف، لا «تعذّر الفتح» واحدة.
 */
export async function loadEditorContext(
  captureId: string,
  urls: ObjectUrls = browserUrls,
): Promise<Result<EditorContext>> {
  const record = await captures.get(captureId)
  if (!record.ok) {
    return errText('not-found', 'هذه اللقطة لم تعد موجودة.', `captures/${captureId}`)
  }

  const blob = await blobs.get(captureId)
  if (!blob.ok) {
    return errText('not-found', 'وصف اللقطة موجود وبايتاتها مفقودة.', `blobs/${captureId}`)
  }

  const stored = await annotations.get(captureId)

  const fresh = emptyScene({
    captureId,
    width: record.value.width,
    height: record.value.height,
    /*
     * كثافة البكسل من سجلّ اللقطة لا من `devicePixelRatio` الحالي: الشاشة
     * التي تُحرَّر عليها اللقطة قد لا تكون التي التُقطت عليها. وقراءتها من
     * الجهاز هنا تجعل الأداة تُنتج نتيجتين للقطة واحدة.
     */
    dpr: record.value.devicePixelRatio,
  })

  let scene = fresh
  let sceneError: string | null = null
  let baseUpdatedAt: number | null = null

  if (stored.ok) {
    baseUpdatedAt = stored.value.updatedAt
    const parsed = parseScene(stored.value.scene)
    if (parsed.ok) scene = parsed.value
    else sceneError = parsed.error.message
  }

  return ok({
    capture: record.value,
    imageUrl: urls.create(blob.value.blob),
    scene,
    baseUpdatedAt,
    sceneError,
  })
}

/**
 * يحرّر عنوان الكائن.
 *
 * `URL.createObjectURL` بلا `revokeObjectURL` تسريبٌ يعيش ما عاشت الصفحة —
 * وصورة لقطة كاملة قد تبلغ مئات الميغابايتات. ولا سابقة له في المستودع
 * اليوم (النافذة تُغلَق بعد ثوانٍ فلا يظهر)، والمحرر يبقى مفتوحًا ساعات.
 */
export function releaseContext(context: EditorContext, urls: ObjectUrls = browserUrls): void {
  urls.revoke(context.imageUrl)
}

/** ملخّص الحجب — يُحسب من المشهد ويُكتب بجواره كي يُقرأ بلا فكّه. */
export function summariseRedaction(scene: Scene): { total: number; irreversible: number } {
  let total = 0
  let irreversible = 0
  for (const node of scene.nodes) {
    if (node.kind !== 'redact') continue
    total += 1
    if (isIrreversible(node.mode)) irreversible += 1
  }
  return { total, irreversible }
}

export type SaveOutcome =
  | { readonly kind: 'saved'; readonly updatedAt: number }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed'; readonly message: string }

/**
 * يحفظ المشهد **بشرط ألّا يكون تبويب آخر قد كتب بيننا**.
 *
 * القراءة والمقارنة والكتابة داخل معاملة واحدة (`putIfUnchanged`)، فالنتيجة
 * منعُ تعارض لا كشفُه بعد وقوعه. و`conflict` حالةٌ تُعرض للمستخدم ويقرّر:
 * الكتابة العمياء تعني ضياع جلسة كاملة بلا رسالة.
 */
export async function saveScene(
  scene: Scene,
  baseUpdatedAt: number | null,
  now = Date.now(),
): Promise<SaveOutcome> {
  const record: AnnotationRecord = {
    captureId: scene.captureId,
    scene,
    updatedAt: now,
    schemaVersion: SCENE_SCHEMA_VERSION,
    redaction: summariseRedaction(scene),
  }

  const written = await putIfUnchanged(
    'annotations',
    scene.captureId,
    record,
    baseUpdatedAt,
    (r) => r.updatedAt,
    estimateSceneBytes(scene),
  )

  if (!written.ok) return { kind: 'failed', message: written.error.message }
  if (!written.value.written) return { kind: 'conflict' }
  return { kind: 'saved', updatedAt: now }
}
