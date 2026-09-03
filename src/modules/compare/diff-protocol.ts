/**
 * عقد الرسائل بين صفحة المقارنة والـworker — يستورده الطرفان. نفس سابقة
 * `modules/editor/blur-protocol.ts` بالضبط (المرحلة 15): `ArrayBuffer` لا
 * `ImageData` (غير قابلة للنقل)، و`WorkerLike` واجهة لا صنف حتى يبقى العميل
 * قابلًا للاختبار بدمية بلا `Worker` حقيقي (غائب في بيئة الاختبار أصلًا).
 *
 * **صورتا الدخل والفرق والمناطق في رحلة واحدة** — `diff.worker.ts` يستدعي
 * `computeDiff` ثم `groupDiffRegions` على قناعها مباشرةً قبل الردّ، فلا رحلة
 * ثانية لنقل القناع نفسه عبر `postMessage` لجلب المناطق.
 */

import type { DiffOptions } from './diff'
import type { RegionOptions } from './regions'
import type { Space } from '@/shared/geometry'

/** صورة خام بمخزن منقول — الأبعاد ترافقه لأن `ArrayBuffer` مسطّح بلا شكل. */
export interface DiffJobImage {
  readonly buffer: ArrayBuffer
  readonly width: number
  readonly height: number
}

/** مستطيل مسطّح للسلك — لا `DeviceRect` حرفيًّا: العلامة الوهمية `space` تُمحى عبر `postMessage` أصلًا (نفس تعليل `shared/geometry.ts`)، فتُعاد هنا صراحةً لا ضمنًا. */
export interface WireRect {
  readonly space: Extract<Space, 'device'>
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface WireExtraStrip {
  readonly cols: WireRect | null
  readonly rows: WireRect | null
}

export interface WireRegion {
  readonly id: number
  readonly rect: WireRect
  readonly pixels: number
}

export interface DiffRequest {
  readonly id: number
  readonly a: DiffJobImage
  readonly b: DiffJobImage
  readonly diffOptions: Partial<DiffOptions>
  readonly regionOptions: Partial<RegionOptions>
}

export interface DiffReply {
  readonly id: number
  readonly diffBuffer: ArrayBuffer
  readonly diffWidth: number
  readonly diffHeight: number
  readonly overlap: WireRect
  readonly diffPixelCount: number
  readonly comparedPixels: number
  readonly diffRatio: number
  readonly extraInA: WireExtraStrip
  readonly extraInB: WireExtraStrip
  readonly regions: readonly WireRegion[]
  readonly ms: number
}

export interface DiffFailure {
  readonly id: number
  readonly error: string
}

export type DiffMessage = DiffReply | DiffFailure

export const isFailure = (m: DiffMessage): m is DiffFailure => 'error' in m

/**
 * ما يحتاجه العميل من `Worker` — واجهة لا صنف (نفس تعليل `blur-protocol.ts`:
 * `Worker` غائب في بيئة الاختبار، فربط العميل به يجعل نصفه غير قابل للاختبار).
 */
export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: 'message', handler: (e: { data: unknown }) => void): void
  addEventListener(type: 'error', handler: (e: unknown) => void): void
  terminate(): void
}
