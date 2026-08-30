/**
 * عقد الرسائل بين الصفحة والـworker — يستورده الطرفان.
 *
 * يعيش في `modules/` لأنه المكان الوحيد الذي يراه الاثنان: `workers/` لا
 * يستورد من `pages/`، و`pages/` لا يستورد من `workers/` إلّا عنوان الملفّ.
 *
 * **و`ArrayBuffer` لا `ImageData`.** `ImageData` ليست في قائمة `Transferable`؛
 * القابل للنقل `data.buffer` وحده. و`postMessage(req, [imageData])` يرمي
 * `DataCloneError` — **ولا اختبار وحدة يمسكه** لأن `Worker` غير موجود في
 * بيئة الاختبار أصلًا (مقيس: `typeof Worker === 'undefined'` في happy-dom).
 * فالعقد نفسه هو الحارس: النوع لا يسمح بتمرير `ImageData`.
 */

import type { PixelRect, RGBA } from './pixel-ops'
import type { ObscureMode } from './scene'

/**
 * عملية طمس واحدة بفضاء بكسلات المخزن المستهدَف.
 *
 * **بفضاء المخزن لا فضاء المشهد**: الاقتصاص مطروح والمقياس مضروب قبل أن
 * تُبنى. تمريرُ إحداثيات المشهد وترك التحويل للمنفِّذ يعني أن المعاينة
 * والخبز يحوّلان مرّتين في مكانين — وأوّل اختلاف بينهما غطاءٌ يقع في المكان
 * الخطأ، وهو تسريبٌ لا يراه فحص تباين لأنه يقرأ المستطيل الذي رسمه هو.
 */
export interface ObscureOp {
  readonly rect: PixelRect
  readonly mode: ObscureMode
  /** `blur` ⇒ σ بالبكسل · `pixelate` ⇒ ضلع الخليّة · `cover` ⇒ مُهمَل. */
  readonly strength: number
  readonly cover: RGBA
}

export interface BlurRequest {
  readonly id: number
  readonly buffer: ArrayBuffer
  readonly width: number
  readonly height: number
  readonly ops: readonly ObscureOp[]
}

export interface BlurReply {
  readonly id: number
  readonly buffer: ArrayBuffer
  readonly ms: number
}

export interface BlurFailure {
  readonly id: number
  readonly error: string
}

export type BlurMessage = BlurReply | BlurFailure

export const isFailure = (m: BlurMessage): m is BlurFailure => 'error' in m

/**
 * ما يحتاجه العميل من `Worker` — واجهة لا صنف.
 *
 * `Worker` غير موجود في بيئة الاختبار، فربط العميل به يجعل نصفه غير قابل
 * للاختبار. والواجهة تُحقّقها `Worker` الحقيقية وتُحقّقها دمية.
 */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: 'message', handler: (e: { data: unknown }) => void): void
  addEventListener(type: 'error', handler: (e: unknown) => void): void
  terminate(): void
}
