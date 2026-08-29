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

/** يحذف اللقطة وبايتاتها معًا — لا بايتات يتيمة تستهلك الحصّة. */
export async function deleteCaptureWithBlob(id: string): Promise<Result<null>> {
  return withDb(async (db) => {
    const tx = db.transaction(['captures', 'blobs'], 'readwrite')
    await Promise.all([
      tx.objectStore('captures').delete(id),
      tx.objectStore('blobs').delete(id),
      tx.done,
    ])
    return null
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
