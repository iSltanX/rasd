/**
 * مستودع عام فوق كل مخزن.
 *
 * كل عملية تُرجع `Result` وتمرّ من `guardWrite` عند الكتابة، فلا يوجد مسار
 * يتجاوز سياسة التصفّح الخاص أو حدّ الحصّة.
 */

import { errWith, ok, type Result } from '../result'

import { database, guardWrite, withDb } from './db'

import type { IssueRecord } from '../issue-schema'
import type { AnnotationRecord, BlobRecord, CaptureRecord, RasdDB, StoreName } from './schema'

type RecordOf<S extends StoreName> = RasdDB[S]['value']
type KeyOf<S extends StoreName> = RasdDB[S]['key']

export interface Repository<S extends StoreName> {
  get(key: KeyOf<S>): Promise<Result<RecordOf<S>>>
  getAll(limit?: number): Promise<Result<RecordOf<S>[]>>
  put(value: RecordOf<S>, sizeHint?: number): Promise<Result<KeyOf<S>>>
  putMany(values: RecordOf<S>[], sizeHint?: number): Promise<Result<number>>
  remove(key: KeyOf<S>): Promise<Result<null>>
  clear(): Promise<Result<null>>
  count(): Promise<Result<number>>
  /** استعلام عبر فهرس — الطريق الوحيد للتصفية بلا مسح كامل. */
  byIndex(index: string, query?: IDBKeyRange | IDBValidKey): Promise<Result<RecordOf<S>[]>>
  /**
   * أحدث `count` سجلًّا يقبلها `accept`، من آخر الفهرس إلى أوّله — بمؤشّر عكسيّ يتوقّف عند العدد.
   *
   * `byIndex` ثمّ `slice(-n)` تقرأ المخزن كلّه لتُبقي سجلّين: قِيس في `STAGES/04` أن وصول بيانات
   * النافذة يتأخّر 20ms على جهاز التطوير بخمسة آلاف لقطة، ويزيد بزيادتها.
   */
  latest(
    index: string,
    count: number,
    accept?: (record: RecordOf<S>) => boolean,
  ): Promise<Result<RecordOf<S>[]>>
}

export function repository<S extends StoreName>(store: S): Repository<S> {
  return {
    async get(key) {
      const found = await withDb(async (db) => db.get(store, key as never))
      if (!found.ok) return found
      if (found.value === undefined) return errWith('not-found', `${store}/${String(key)}`)
      return ok(found.value as RecordOf<S>)
    },

    async getAll(limit) {
      return withDb(async (db) => (await db.getAll(store, undefined, limit)) as RecordOf<S>[])
    },

    async put(value, sizeHint = 0) {
      const guard = await guardWrite(sizeHint)
      if (!guard.ok) return guard
      return withDb(async (db) => (await db.put(store, value as never)) as KeyOf<S>)
    },

    async putMany(values, sizeHint = 0) {
      const guard = await guardWrite(sizeHint)
      if (!guard.ok) return guard
      return withDb(async (db) => {
        // معاملة واحدة: إمّا كلها أو لا شيء.
        const tx = db.transaction(store, 'readwrite')
        await Promise.all([...values.map((v) => tx.store.put(v as never)), tx.done])
        return values.length
      })
    },

    async remove(key) {
      return withDb(async (db) => {
        await db.delete(store, key)
        return null
      })
    },

    async clear() {
      return withDb(async (db) => {
        await db.clear(store)
        return null
      })
    },

    async count() {
      return withDb(async (db) => db.count(store))
    },

    async byIndex(index, query) {
      return withDb(
        async (db) =>
          (await db.getAllFromIndex(store, index as never, query as never)) as RecordOf<S>[],
      )
    },

    async latest(index, count, accept = () => true) {
      return withDb(async (db) => {
        const found: RecordOf<S>[] = []
        if (count <= 0) return found
        let cursor = await db
          .transaction(store)
          .store.index(index as never)
          .openCursor(null, 'prev')
        while (cursor) {
          const record = cursor.value as RecordOf<S>
          if (accept(record)) found.push(record)
          if (found.length >= count) break
          cursor = await cursor.continue()
        }
        return found
      })
    },
  }
}

export const captures = repository('captures')
export const blobs = repository('blobs')
export const projects = repository('projects')
export const colors = repository('colors')
export const palettes = repository('palettes')
export const references = repository('references')
export const annotations = repository('annotations')
export const guides = repository('guides')
export const tags = repository('tags')
export const thumbnails = repository('thumbnails')
export const issues = repository('issues')

/**
 * يسجّل مشكلةً مع لقطة دليلها وملاحظتها في **معاملة واحدة** (ADR 0030 §3).
 *
 * أربعة مخازن تُكتب معًا أو لا يُكتب منها شيء: مشكلةٌ بلا لقطة تعِد بدليلٍ غائب، ولقطةٌ بلا مشكلة تملأ
 * المكتبة بصورٍ لم يطلبها أحد حين يفشل التسجيل بعد الالتقاط. و`annotation` اختيارية: مربّع «أضف ملاحظة
 * مرتبطة» في النموذج.
 */
export async function putIssueWithEvidence(
  capture: CaptureRecord,
  blob: Blob,
  annotation: AnnotationRecord | null,
  issue: IssueRecord,
): Promise<Result<string>> {
  const guard = await guardWrite(blob.size)
  if (!guard.ok) return guard

  return withDb(async (db) => {
    const tx = db.transaction(['captures', 'blobs', 'annotations', 'issues'], 'readwrite')
    const blobRecord: BlobRecord = { id: capture.id, blob, mime: blob.type, bytes: blob.size }
    // الطلبات تُجمَع واحدًا واحدًا لا في مصفوفةٍ حرفية: رميٌ متزامن في أحدها يقع قبل أن يشترك `Promise.all`
    // في ما سبقه، فيرفضها الإجهاض بلا مستمع.
    const requests: Promise<unknown>[] = []
    try {
      requests.push(tx.objectStore('captures').put(capture))
      requests.push(tx.objectStore('blobs').put(blobRecord))
      if (annotation) requests.push(tx.objectStore('annotations').put(annotation))
      requests.push(tx.objectStore('issues').put(issue))
      await Promise.all([...requests, tx.done])
    } catch (thrown) {
      for (const request of requests) request.catch(() => undefined)
      abortQuietly(tx)
      throw thrown
    }
    return issue.id
  })
}

/**
 * يقرأ مشكلاتٍ بمعرّفاتها ويكتب ما يُرجعه `apply` لكلٍّ منها، **في معاملة واحدة**.
 *
 * القراءة والكتابة معًا لا على دورتين: جولتا فحص من تبويبين على الصفحة نفسها تتلاحقان على المخزن ولا
 * تتداخلان، فلا يضيع حدثٌ من التاريخ بكتابةٍ عمياء فوقه. و`apply` يُرجع `null` لما لا يُكتب — مشكلةٌ ليست
 * لصفحة المُرسِل مثلًا — ولا يسقط الباقي بسببه.
 */
export async function updateIssues(
  ids: readonly string[],
  apply: (issue: IssueRecord) => IssueRecord | null,
): Promise<Result<IssueRecord[]>> {
  const guard = await guardWrite(0)
  if (!guard.ok) return guard

  return withDb(async (db) => {
    const tx = db.transaction('issues', 'readwrite')
    const written: IssueRecord[] = []
    try {
      for (const id of ids) {
        const current = await tx.store.get(id)
        if (!current) continue
        const next = apply(current)
        if (!next) continue
        await tx.store.put(next)
        written.push(next)
      }
      await tx.done
    } catch (thrown) {
      abortQuietly(tx)
      throw thrown
    }
    return written
  })
}

/**
 * يقرأ مرجع صفحةٍ ويكتب ما يُرجعه `apply` له، **في معاملة واحدة** — علّة `updateIssues` نفسها (ADR 0034).
 *
 * كتابة المناطق المستثناة كانت قراءةً ثمّ كتابةً على معاملتين، و`guardWrite` ينتظر `estimate()` بينهما: فحذفٌ
 * يقع في الفجوة يترك سجلًّا يتيمًا بلا بايتاته، وتعيينٌ يقع فيها يُكتب فوقه بقديمه (المراجعة المستقلّة،
 * `STAGES/34`). و`null` حين لا مرجع لهذا المفتاح — لا شيء يُكتب.
 */
export async function updateReferenceFor(
  key: { readonly origin: string; readonly path: string; readonly viewport: string },
  apply: (record: RasdDB['references']['value']) => RasdDB['references']['value'],
): Promise<Result<RasdDB['references']['value'] | null>> {
  const guard = await guardWrite(0)
  if (!guard.ok) return guard

  return withDb(async (db) => {
    const tx = db.transaction('references', 'readwrite')
    try {
      const sameOrigin = await tx.store.index('origin').getAll(key.origin)
      const current = sameOrigin.find((r) => r.path === key.path && r.viewport === key.viewport)
      const next = current ? apply(current) : null
      if (next) await tx.store.put(next)
      await tx.done
      return next
    } catch (thrown) {
      abortQuietly(tx)
      throw thrown
    }
  })
}

/**
 * رميٌ متزامن داخل المعاملة (مفتاحٌ لا يقبله IndexedDB، أو `apply` ترمي) يخرج قبل `tx.done` فلا يُجهضها —
 * فتُثبَّت الكتابات التي سبقته وحدها. الإجهاض الصريح يعيد «كلّها أو لا شيء» (المراجعة المستقلّة). والمعاملة
 * المنتهية أصلًا لا تُجهَض، فيُبتلع ذلك الرمي وحده.
 */
export function abortQuietly(tx: { abort(): void; done: Promise<void> }): void {
  try {
    tx.abort()
  } catch {
    /* انتهت المعاملة قبل الإجهاض — لا شيء يُتراجَع عنه */
  }
  tx.done.catch(() => undefined)
}

/**
 * يحفظ لقطة: الوصف في `captures` والبايتات في `blobs`، بمعاملة واحدة.
 *
 * الفصل مقصود — انظر `schema.ts`. الحفظ الذرّي يمنع سجلًّا بلا صورة.
 */
export async function putCaptureWithBlob(
  record: RasdDB['captures']['value'],
  blob: Blob,
): Promise<Result<string>> {
  const guard = await guardWrite(blob.size)
  if (!guard.ok) return guard

  return withDb(async (db) => {
    const tx = db.transaction(['captures', 'blobs'], 'readwrite')
    const blobRecord: BlobRecord = {
      id: record.id,
      blob,
      mime: blob.type,
      bytes: blob.size,
    }
    await Promise.all([
      tx.objectStore('captures').put(record),
      tx.objectStore('blobs').put(blobRecord),
      tx.done,
    ])
    return record.id
  })
}

/**
 * يحذف اللقطة وبايتاتها **ومشهد تعليقها ومصغَّرتها** معًا.
 *
 * الثالث أُضيف في المرحلة 15، وأثره أمني لا تنظيمي: مشهدُ تعليق يصف مواضع
 * الحجب («تغطية عند س,ص») يبقى بعد زوال صورته، فيصف ما كان حسّاسًا في لقطة
 * لم تعد موجودة. والسجلّ اليتيم لا يظهر في أي واجهة، فلا أحد يحذفه يدويًّا —
 * وينطبق المنطق نفسه حرفيًّا على المصغَّرة المضافة في المرحلة 18: مصغَّرة
 * بلا لقطة أصلية بايتاتٌ ميتة لا يشير إليها شيء.
 */
/**
 * يحفظ مرجعًا: الوصف في `references` والبايتات في `blobs`، بمعاملة واحدة —
 * نفس نمط `putCaptureWithBlob` أعلاه حرفيًّا (المرحلة 16، §8.1).
 *
 * **`record.blobId` يجب أن يكون معرِّفًا خاصًّا بالمرجع — لا معرِّف لقطة
 * مصدرها.** حين يُعيَّن مرجعٌ من لقطة محفوظة، تُنسَخ بايتاتها تحت معرِّف
 * جديد (`modules/compare/reference.ts`) بدل مشاركة `blobId` نفسه: لو
 * شارك المرجع بلوب اللقطة، لكان حذف المرجع لاحقًا (`deleteReferenceWithBlob`
 * أدناه) يحذف بلوب اللقطة **الحيّة** معه — بيانات مستخدم حقيقية تضيع بفعلٍ
 * على كائن آخر لا صلة له ظاهريًا.
 */
export async function putReferenceWithBlob(
  record: RasdDB['references']['value'],
  blob: Blob,
): Promise<Result<string>> {
  const guard = await guardWrite(blob.size)
  if (!guard.ok) return guard

  return withDb(async (db) => {
    const tx = db.transaction(['references', 'blobs'], 'readwrite')
    const blobRecord: BlobRecord = {
      id: record.blobId,
      blob,
      mime: blob.type,
      bytes: blob.size,
    }
    await Promise.all([
      tx.objectStore('references').put(record),
      tx.objectStore('blobs').put(blobRecord),
      tx.done,
    ])
    return record.id
  })
}

/**
 * يحذف مرجعًا وبايتاته معًا — نفس منطق `deleteCaptureWithBlob` أعلاه
 * حرفيًّا: `blobId` بلا سجلّ `blobs` مطابق له بايتاتٌ ميتة لا يشير إليها
 * شيء (المرحلة 18، دورة إكمال الحذف والنقل بلا مشروع).
 */
export async function deleteReferenceWithBlob(id: string, blobId: string): Promise<Result<null>> {
  return withDb(async (db) => {
    const tx = db.transaction(['references', 'blobs'], 'readwrite')
    await Promise.all([
      tx.objectStore('references').delete(id),
      tx.objectStore('blobs').delete(blobId),
      tx.done,
    ])
    return null
  })
}

/**
 * يحذف لقطةً وكلَّ ما يشير إليها في معاملة واحدة.
 *
 * **والمخزن الخامس (`guides`) أُضيف في الوحدة 20.3، وليس تجميلًا.**
 * `GuideRecord.captureIds` مصفوفة مُعرِّفات تُعرَض للمستخدم عدّادًا
 * («12 لقطة») في `GuideCard`. وحذف لقطة كان يتركها في المصفوفة، فيصير
 * العدّاد يعِد بما لا وجود له. كان العطل نادرًا ما دام الحذف يدويًّا؛
 * والحذف الدوري (`modules/library/retention.ts`) يحوّله من نادر إلى منهجيّ —
 * فأُغلق في الوحدة التي أنشأت المنهجيّة. (‏`Docs/Engineering.md §6` صفّ 120.)
 *
 * والأدلّة تُقرأ وتُكتب داخل المعاملة نفسها: تنظيفٌ بعدها كان سيترك نافذةً
 * تُقرأ فيها حالةٌ نصفُها محذوف.
 */
export async function deleteCaptureWithBlob(id: string): Promise<Result<null>> {
  return withDb(async (db) => {
    const tx = db.transaction(
      ['captures', 'blobs', 'annotations', 'thumbnails', 'guides'],
      'readwrite',
    )
    const guideStore = tx.objectStore('guides')
    const affected = (await guideStore.getAll()).filter((guide) => guide.captureIds.includes(id))
    await Promise.all([
      tx.objectStore('captures').delete(id),
      tx.objectStore('blobs').delete(id),
      tx.objectStore('annotations').delete(id),
      tx.objectStore('thumbnails').delete(id),
      ...affected.map((guide) =>
        guideStore.put({ ...guide, captureIds: guide.captureIds.filter((c) => c !== id) }),
      ),
      tx.done,
    ])
    return null
  })
}

/**
 * نتيجة كتابة مشروطة — التمييز بين «كُتب» و«سبقني غيري» لا يُبتلع.
 *
 * **والفشل يحمل ما وجده.** «سبقني غيري» بلا قيمةِ ذلك الغير لا يُملي فعلًا:
 * من أراد الكتابة فوقه لا يعرف بماذا يشترط، فيمرّر `null` — وهو شرطُ «لا
 * سجلّ»، فيفشل أبدًا. الحقل يحوّل بلاغًا إلى قرار قابل للتنفيذ.
 */
export type ConditionalWrite<K> =
  | { readonly written: true; readonly key: K }
  | { readonly written: false; readonly actual: number | null }

/**
 * كتابة مشروطة بأن السجلّ لم يتغيّر — **منعُ تعارض لا كشفُه**.
 *
 * المشكلة حقيقية لا نظرية: المحرر صفحة إضافة، ولا شيء يمنع فتح تبويبين على
 * اللقطة نفسها. و`put` كتابةٌ عمياء، فآخر كاتب يفوز **صمتًا** وتضيع جلسة
 * كاملة بلا رسالة.
 *
 * والحلّ أن تقع القراءة والمقارنة والكتابة داخل **معاملة `readwrite`
 * واحدة**. معاملات IndexedDB مُسلسَلة على المخزن الواحد، فالدورة كاملةً
 * ذرّية — وهذا مقارنةٌ-وتبديل حقيقي. أمّا دورة موزَّعة على ثلاث معاملات
 * فلا تضمن شيئًا: التبويب الآخر يكتب بين قراءتنا وكتابتنا.
 *
 * `expected === null` يعني: توقّعتُ ألّا يكون السجلّ موجودًا (أوّل حفظ).
 */
export async function putIfUnchanged<S extends StoreName>(
  store: S,
  key: RasdDB[S]['key'],
  value: RasdDB[S]['value'],
  expected: number | null,
  read: (record: RasdDB[S]['value']) => number,
  sizeHint = 0,
): Promise<Result<ConditionalWrite<RasdDB[S]['key']>>> {
  const guard = await guardWrite(sizeHint)
  if (!guard.ok) return guard

  return withDb(async (db) => {
    const tx = db.transaction(store, 'readwrite')
    const current = await tx.store.get(key)

    const actual = current === undefined ? null : read(current)
    if (actual !== expected) {
      /*
       * الإجهاض صريح: ترك المعاملة تنتهي بلا كتابة يعمل، لكنه يترك القارئ
       * يظنّ أن شيئًا كُتب.
       *
       * و`tx.done` **يُنتظَر ويُبتلَع رفضه**: `idb` يرفض ذلك الوعد بـ
       * `AbortError` عند الإجهاض، وتركه بلا معالج يعطي رفضًا غير ملتقَط —
       * لا يُسقط العملية لكنه يُسقط أي عدّاد أخطاء عامّ، ويظهر ضجيجًا في
       * سجلّ الاختبارات وفي وحدة التحكّم عند المستخدم. والإجهاض هنا **نتيجة
       * متوقَّعة** لا عطل.
       */
      tx.abort()
      await tx.done.catch(() => undefined)
      return { written: false, actual } as const
    }

    const written = await tx.store.put(value)
    await tx.done
    return { written: true, key: written } as const
  })
}

/**
 * يمسح كل المخازن في معاملة واحدة — نصف مسار «احذف كل البيانات» (`erase.ts`).
 *
 * **بأسماء القاعدة المفتوحة لا بـ`STORE_NAMES`:** مخزنٌ أضافه ترحيلٌ ونُسي في القائمة يُمسح كذلك — والحذف
 * الكامل أسوأ مكانٍ لإغفال مخزن.
 */
export async function clearAllStores(): Promise<Result<number>> {
  return withDb(async (db) => {
    const names = [...db.objectStoreNames]
    const tx = db.transaction(names as never, 'readwrite')
    await Promise.all([...names.map((n) => tx.objectStore(n as never).clear()), tx.done])
    return names.length
  })
}

export { database }
