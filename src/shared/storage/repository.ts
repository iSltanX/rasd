/**
 * مستودع عام فوق كل مخزن.
 *
 * كل عملية تُرجع `Result` وتمرّ من `guardWrite` عند الكتابة، فلا يوجد مسار
 * يتجاوز سياسة التصفّح الخاص أو حدّ الحصّة.
 */

import { errWith, ok, type Result } from '../result'

import { database, guardWrite, withDb } from './db'

import type { BlobRecord, RasdDB, StoreName } from './schema'

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
 * فأُغلق في الوحدة التي أنشأت المنهجيّة. (‏`Rasd_Plan.md §6` صفّ 120.)
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

/** يمسح كل المخازن — يخدم «حذف كل البيانات» في المرحلة 20. */
export async function clearAllStores(): Promise<Result<number>> {
  return withDb(async (db) => {
    const names = [...db.objectStoreNames]
    const tx = db.transaction(names as never, 'readwrite')
    await Promise.all([...names.map((n) => tx.objectStore(n as never).clear()), tx.done])
    return names.length
  })
}

export { database }
