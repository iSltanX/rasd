/**
 * فتح قاعدة البيانات وحارس التصفّح الخاص.
 *
 * كل كتابة تمرّ من `guardWrite`: التصفّح الخاص أولًا (سياسة)، ثم الحصّة (سعة).
 * الترتيب مقصود — رفض السياسة لا يحتاج قراءة قرص.
 */

import { openDB, type IDBPDatabase } from 'idb'

import { isIncognitoContext } from '../env'
import { errWith, ok, toRasdError, type Result } from '../result'

import { libraryLocked } from './lock-state'
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

/**
 * يفتح القاعدة (مرة واحدة) ويشغّل الترحيل عند الحاجة.
 *
 * **الفتح الفاشل لا يُخزَّن:** ترقيةٌ أُجهضت (قرصٌ ممتلئ في خطوةٍ تكتب بيانات، أوّلها النسخة 4) كانت تُرجع
 * الرفضَ نفسه لكل نداءٍ بعدها حتى يُعاد تشغيل العامل. فيُنسى الوعد الفاشل، والنداء التالي يحاول ثانيةً
 * (المراجعة المستقلّة، `STAGES/34`).
 */
export function database(): Promise<IDBPDatabase<RasdDB>> {
  dbPromise ??= openDB<RasdDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // `openDB` نفسه يرفض بإجهاض الترقية؛ ووعد `done` هذا لا ينتظره أحد، فلا يُترك رفضًا يتيمًا.
      transaction.done.catch(() => undefined)
      runMigrations(db, transaction, oldVersion, newVersion ?? DB_VERSION)
    },
    blocked() {
      // تبويب قديم يمسك نسخة سابقة؛ نتركه ونُبلغ بدل الانتظار للأبد.
      console.warn('[رصد] ترقية قاعدة البيانات محجوبة بتبويب آخر')
    },
    terminated() {
      dbPromise = null
    },
  }).catch((error: unknown) => {
    dbPromise = null
    throw error
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

/**
 * يغلّف عملية قاعدة بيانات في `Result` — لا استثناء يعبر الحدّ.
 *
 * **وهنا حارس قفل المكتبة** (ADR 0043 §1): كل مستودعٍ ومعاملةٍ ذرّية وقراءةٍ للنسخ الاحتياطي يمرّ من هنا، فالمكتبة
 * المقفلة لا تُقرأ ولا تُكتب من أيّ سياق — لا في الواجهة وحدها. والفحص قبل فتح القاعدة: لا ترقية ولا اتّصال.
 */
export async function withDb<T>(fn: (db: IDBPDatabase<RasdDB>) => Promise<T>): Promise<Result<T>> {
  if (await libraryLocked()) return errWith('library-locked')
  return run(fn)
}

/**
 * بلا حارس القفل — **لإفراغ القاعدة وحده** (`clearAllStores`، ADR 0043 §4): رمزٌ منسيّ يُفرغ المكتبة ولا يفتحها.
 * لا تقرأ بها سجلًّا: `storage-lock.test.ts` يسقط إن استُعملت في غير ذلك الموضع.
 */
export async function withDbForErase<T>(
  fn: (db: IDBPDatabase<RasdDB>) => Promise<T>,
): Promise<Result<T>> {
  return run(fn)
}

async function run<T>(fn: (db: IDBPDatabase<RasdDB>) => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn(await database()))
  } catch (thrown) {
    return { ok: false, error: toRasdError(thrown, 'unknown') }
  }
}

/** للاختبارات: يغلق القاعدة ويُنسي النسخة المفتوحة. */
export async function closeDatabase() {
  if (!dbPromise) return
  const db = await dbPromise.catch(() => null)
  db?.close()
  dbPromise = null
}
