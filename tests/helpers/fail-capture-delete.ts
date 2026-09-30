import { vi } from 'vitest'

type Transaction = (
  this: IDBDatabase,
  stores: string | string[],
  mode?: IDBTransactionMode,
  options?: IDBTransactionOptions,
) => IDBTransaction

/**
 * يجعل حذف اللقطة نفسه يفشل عند المرّة رقم `nth` — وما عداه يمرّ إلى التنفيذ الحقيقي.
 *
 * حذف اللقطة (`deleteCaptureWithBlob`) معاملة وحيدة تلمس مخزن `guides` بين مخازنها
 * الخمسة، فتُميَّز بها عن كل معاملة أخرى في المستودع. الفشل يُحقَن عند حدّ التخزين
 * (رمي من `IDBDatabase.transaction`) لا بتبديل دالّة الحذف، فيُختبَر المسار كاملًا:
 * `withDb` يحوّل الرمي إلى `Result` فاشل كما يفعل في الإنتاج.
 *
 * يُستعاد بـ`vi.restoreAllMocks()`.
 */
export function failCaptureDeleteAt(nth: number): void {
  // `Reflect.get` لا وصولًا مباشرًا: الأصل يُستدعى لاحقًا بـ`this` صريح لا منفصلًا عن مالكه.
  const original = Reflect.get(IDBDatabase.prototype, 'transaction') as Transaction
  let deletes = 0
  vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (
    this: IDBDatabase,
    stores: string | string[],
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ) {
    if (Array.isArray(stores) && stores.includes('guides')) {
      deletes += 1
      if (deletes === nth) throw new DOMException('فشل الحذف مقصودًا', 'AbortError')
    }
    return original.call(this, stores, mode, options)
  })
}
