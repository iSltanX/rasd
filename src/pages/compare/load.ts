/**
 * تحميل لقطة واحدة من IndexedDB — الوصف والبايتات معًا.
 *
 * صفحة الإضافة تقرأ المخزن **مباشرةً** بلا رسائل — نفس نمط `Library.tsx`
 * و`reference.ts`: أصل الصفحة أصل الإضافة نفسه، لا أصل صفحة زارها المستخدم
 * (الصفّ 78 في `Docs/Engineering.md §6` يخصّ سكربت المحتوى وحده).
 */

import { ok, type Result } from '@/shared/result'
import { blobs, captures } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

export interface LoadedCapture {
  readonly record: CaptureRecord
  readonly blob: Blob
  /** `URL.createObjectURL(blob)` — يُلغى (`revokeObjectURL`) حين تُغادَر الصفحة. */
  readonly objectUrl: string
}

/** يُرجع أوّل خطأ يصادفه — الوصف أو البايتات، أيّهما غاب أوّلًا. */
export async function loadCapture(id: string): Promise<Result<LoadedCapture>> {
  const [recordResult, blobResult] = await Promise.all([captures.get(id), blobs.get(id)])
  if (!recordResult.ok) return recordResult
  if (!blobResult.ok) return blobResult

  return ok({
    record: recordResult.value,
    blob: blobResult.value.blob,
    objectUrl: URL.createObjectURL(blobResult.value.blob),
  })
}
