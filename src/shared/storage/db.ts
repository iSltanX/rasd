/**
 * فتح قاعدة البيانات وحارس التصفّح الخاص.
 *
 * كل كتابة تمرّ من `guardWrite`: التصفّح الخاص أولًا (سياسة)، ثم الحصّة (سعة).
 * الترتيب مقصود — رفض السياسة لا يحتاج قراءة قرص.
 */

import { openDB, type IDBPDatabase } from 'idb'

import { isIncognitoContext } from '../env'
import { errWith, ok, toRasdError, type Result } from '../result'

import { runMigrations } from './migrations'
import { assertWritable } from './quota'
import { DB_NAME, DB_VERSION, type RasdDB } from './schema'

let dbPromise: Promise<IDBPDatabase<RasdDB>> | null = null

/** يمنع الحفظ في التصفّح الخاص. يضبطه المستخدم في المرحلة 20. */
let blockIncognitoWrites = true

export function setIncognitoWritePolicy(blocked: boolean) {
  blockIncognitoWrites = blocked
}

export function incognitoWritesBlocked(): boolean {
  return blockIncognitoWrites && isIncognitoContext()
}

/** يفتح القاعدة (مرة واحدة) ويشغّل الترحيل عند الحاجة. */
export function database(): Promise<IDBPDatabase<RasdDB>> {
  dbPromise ??= openDB<RasdDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      runMigrations(db, transaction, oldVersion, newVersion ?? DB_VERSION)
    },
    blocked() {
      // تبويب قديم يمسك نسخة سابقة؛ نتركه ونُبلغ بدل الانتظار للأبد.
      console.warn('[رصد] ترقية قاعدة البيانات محجوبة بتبويب آخر')
    },
    terminated() {
      dbPromise = null
    },
  })
  return dbPromise
}

/** بوّابة موحَّدة قبل أي كتابة. */
export async function guardWrite(incomingBytes = 0): Promise<Result<null>> {
  if (incognitoWritesBlocked()) {
    return errWith('incognito-blocked', 'الحفظ التلقائي معطَّل في التصفّح الخاص')
  }
  /*
   * استيراد ساكن لا ديناميكي.
   *
   * Vite يغلّف كل `import()` بمساعِد `__vitePreload`، وهو يلمس `document`
   * و`window` — وكلاهما غائب في الـservice worker، فيرمي
   * `ReferenceError: window is not defined` عند أوّل كتابة. العطل كامن منذ
   * المرحلة 3 وكشفته المرحلة 8، أوّل من يكتب في القاعدة من الخلفية فعليًا.
   *
   * والتأجيل لم يكن يشتري شيئًا: `quota.ts` لا يستورد إلا `result`، ولا
   * دورة استيراد تُتفادى هنا.
   */
  const quota = await assertWritable(incomingBytes)
  if (!quota.ok) return quota
  return ok(null)
}

/** يغلّف عملية قاعدة بيانات في `Result` — لا استثناء يعبر الحدّ. */
export async function withDb<T>(fn: (db: IDBPDatabase<RasdDB>) => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn(await database()))
  } catch (thrown) {
    return { ok: false, error: toRasdError(thrown, 'unknown') }
  }
}

/** للاختبارات: يغلق القاعدة ويُنسي النسخة المفتوحة. */
export async function closeDatabase() {
  if (!dbPromise) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}
