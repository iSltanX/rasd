/**
 * تعيين المرجع وإيجاده — §8.1: أي لقطة محفوظة أو صورة مرفوعة من الجهاز
 * تصبح مرجعًا لصفحة بعينها، بمفتاح `origin + path + viewport`.
 *
 * **`modules/` يلمس `IndexedDB` هنا عمدًا** — نفس سابقة `modules/library/
 * search.ts`: «الطبقة الوحيدة التي تلمس IndexedDB» تبقى منطقًا خالصًا ما
 * دامت بلا DOM ولا `chrome.*`؛ `PageKey` يُبنى من الطبقة التي تقرأ الصفحة
 * فعليًا (`content/`) وتُمرَّر إلى هنا جاهزةً — لا قراءة `location`/
 * `document` في هذا الملفّ.
 *
 * **مرجعٌ واحد لكل صفحة لا يتراكم**: لا فهرس مركَّب على الحقول الثلاثة في
 * `schema.ts` (فهارس `references` منفصلة: `projectId`·`viewport`·`origin`
 * وحدها) — فالإيجاد يُصفِّي بعد فهرس `origin` بدل مسحٍ كامل. وكل تعيين
 * جديد على نفس `PageKey` **يستبدل** المرجع القائم بمعرِّفه نفسه (يُبقي
 * `createdAt` الأصلي) لا يضيف سجلًّا موازيًا — تعيين مرجع لصفحة مرّتين
 * يعني «غيّر رأيي» لا «أضِف بديلًا».
 */

import { ok, type Result } from '@/shared/result'
import { blobs, captures, putReferenceWithBlob, references } from '@/shared/storage/repository'

import type { ReferenceRecord, Viewport } from '@/shared/storage/schema'

export interface PageKey {
  readonly origin: string
  readonly path: string
  readonly viewport: Viewport
}

export async function findReferenceForPage(key: PageKey): Promise<Result<ReferenceRecord | null>> {
  const found = await references.byIndex('origin', key.origin)
  if (!found.ok) return found
  const match = found.value.find((r) => r.path === key.path && r.viewport === key.viewport)
  return ok(match ?? null)
}

/** يبني سجلّ المرجع الجديد — معرِّفٌ يستبدل الموجود إن وُجد، أو معرِّفٌ جديد وإلا. */
function buildRecord(
  existing: ReferenceRecord | null,
  key: PageKey,
  projectId: string | null,
  now: number,
): ReferenceRecord {
  const id = existing?.id ?? crypto.randomUUID()
  return {
    id,
    projectId,
    origin: key.origin,
    path: key.path,
    viewport: key.viewport,
    // نفس معرِّف المرجع — لا معرِّف اللقطة المصدر ولا أي معرِّف مشترك، انظر
    // تعليل putReferenceWithBlob في repository.ts.
    blobId: id,
    createdAt: existing?.createdAt ?? now,
  }
}

/**
 * يعيّن لقطة محفوظة مرجعًا — ينسخ بايتاتها تحت معرِّف مرجع مستقلّ، فحذف
 * المرجع لاحقًا لا يمسّ اللقطة الأصلية ولا العكس.
 */
export async function assignCaptureAsReference(
  captureId: string,
  key: PageKey,
  projectId: string | null,
  now = Date.now(),
): Promise<Result<ReferenceRecord>> {
  const capture = await captures.get(captureId)
  if (!capture.ok) return capture
  const blob = await blobs.get(captureId)
  if (!blob.ok) return blob

  const existing = await findReferenceForPage(key)
  if (!existing.ok) return existing

  const record = buildRecord(existing.value, key, projectId, now)
  const written = await putReferenceWithBlob(record, blob.value.blob)
  if (!written.ok) return written
  return ok(record)
}

/** يعيّن صورة مرفوعة (إفلات/لصق/اختيار ملفّ) مرجعًا — نفس منطق الاستبدال أعلاه. */
export async function assignImageAsReference(
  image: Blob,
  key: PageKey,
  projectId: string | null,
  now = Date.now(),
): Promise<Result<ReferenceRecord>> {
  const existing = await findReferenceForPage(key)
  if (!existing.ok) return existing

  const record = buildRecord(existing.value, key, projectId, now)
  const written = await putReferenceWithBlob(record, image)
  if (!written.ok) return written
  return ok(record)
}
