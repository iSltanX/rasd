/**
 * **خزنة الأسرار** — رمز الوصول إلى خدمةٍ مسمّاة لا يُكتب نصًّا صريحًا في أيّ مكان
 * ([ADR 0046](../../../Docs/ADR/0046-named-network-services.md) §5).
 *
 * - **المفتاح:** AES-GCM بطول 256 بتًّا، يُولَّد بـ`crypto.subtle` **غير قابل للتصدير**، ويُحفظ كائن `CryptoKey`
 *   في قاعدة IndexedDB مستقلّة `rasd-vault` — لا في قاعدة المكتبة: فلا يمرّ من حارس القفل، ولا يدخل النسخة
 *   الاحتياطية (`STORE_NAMES`)، ولا يمسّ ترحيلات `rasd`.
 * - **النصّ المشفَّر:** في `chrome.storage.local` تحت `rasd:vault:<الخانة>`: `{ v, keyId, iv, data }` بـbase64.
 *   متّجه تهيئةٍ عشوائي 12 بايتًا لكل حفظ، واسم الخانة بيانٌ مصاحب (AAD) — فنصٌّ نُقل إلى خانةٍ أخرى لا يُفكّ.
 * - **كل حفظٍ مفتاحٌ جديد:** يُكتب المفتاح، ثمّ السجلّ، ثمّ تُحذف المفاتيح السابقة. فحفظٌ تعثّر في منتصفه يترك
 *   السابق مقروءًا كما كان، لا رمزًا نصفه قديم.
 * - **الكتابات متسلسلة بقفلٍ واحد** (`navigator.locks`، عابرٌ للسياقات): حفظان متزامنان كان ثانيهما يحذف مفتاح أوّلهما
 *   بعد أن صار سجلّه هو الحيّ، ونسيانٌ أثناء حفظٍ كان يُبعث سجلًّا بلا مفتاح بعد «اقطع الاتّصال» — رصدتهما المراجعة
 *   المستقلّة (`STAGES/11`). فالحفظ والنسيان وحذف القاعدة تمرّ بالقفل نفسه، **ويُطلب القفل عند النداء قبل أيّ
 *   انتظار** — فترتيب الكتابات ترتيب النداء، لا ترتيب انتهاء التشفير (جولة CI ‏36835982821).
 *
 * **ما تضمنه:** الرمز لا يظهر صريحًا في `chrome.storage` ولا في تصدير الإعدادات ولا في النسخة الاحتياطية ولا في
 * سجلّ — ومن يقرأ `chrome.storage` وحده لا يملك المفتاح. **وما لا تضمنه، ويُقال:** من يملك ملفّ تعريف المتصفّح على
 * القرص يملك القاعدتين معًا، ومن يفتح أدوات المطوّر على الإضافة يستطيع أن يطلب الفكّ — كما في ADR 0043 §1. فالحماية
 * الحقيقية للرمز نطاقه: رمزٌ دقيق الصلاحية على مستودعٍ واحد.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import { base64ToBytes, bytesToBase64 } from '../base64'
import { err, ok, type Result } from '../result'

/** قاعدة المفاتيح — مستقلّة عن قاعدة المكتبة `rasd` وترحيلاتها. */
export const VAULT_DB_NAME = 'rasd-vault'
export const VAULT_DB_VERSION = 1
const KEY_STORE = 'keys'

/** الخانات المعروفة. خانةٌ جديدة قرارٌ في ADR 0046، لا نصٌّ حرّ. */
export type VaultSlot = 'github'

export const VAULT_PREFIX = 'rasd:vault:'
export const vaultKey = (slot: VaultSlot): string => `${VAULT_PREFIX}${slot}`

const RECORD_VERSION = 1
const IV_BYTES = 12

interface VaultRecord {
  readonly v: typeof RECORD_VERSION
  readonly keyId: string
  readonly iv: string
  readonly data: string
}

interface KeyRow {
  readonly id: string
  readonly slot: VaultSlot
  readonly key: CryptoKey
}

interface VaultDB extends DBSchema {
  keys: { key: string; value: KeyRow }
}

/**
 * لماذا لم تُقرأ الخانة. `unreadable` لا يعني «لا رمز»: سجلٌّ بلا مفتاحه أو بمفتاحٍ لا يفكّه — يُعرض «أعد الاتّصال»
 * لا «غير متّصل»، ولا يُمحى صامتًا.
 */
export type VaultFailure = 'storage' | 'crypto' | 'unreadable'

export interface VaultError {
  readonly failure: VaultFailure
  /** اسم الخطأ وحده — لا نصّ يحمل السرّ. */
  readonly detail?: string | undefined
}

const fail = (failure: VaultFailure, error?: unknown): VaultError => ({
  failure,
  detail: error instanceof Error ? error.name : undefined,
})

/** تُفتح لكل عملية وتُغلق بعدها — فـ`deleteDatabase` في «احذف كل البيانات» لا يُحجب باتّصالٍ معلّق. */
async function withVault<T>(work: (db: IDBPDatabase<VaultDB>) => Promise<T>): Promise<T> {
  const db = await openDB<VaultDB>(VAULT_DB_NAME, VAULT_DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE, { keyPath: 'id' })
      }
    },
  })
  try {
    return await work(db)
  } finally {
    db.close()
  }
}

/** اسم القفل — واحدٌ للخزنة كلّها: خانةٌ واحدة اليوم، وحذف القاعدة يمسّ الخانات كلّها. */
const VAULT_LOCK = 'rasd-vault'
let localChain: Promise<unknown> = Promise.resolve()

/**
 * ينفّذ العمل تحت قفل الخزنة. `navigator.locks` يسلسل عبر سياقات الأصل نفسه (الصفحات والعامل)؛ وحيث يغيب (بيئة
 * الاختبار) سلسلةُ وعودٍ في الذاكرة تسلسل داخل السياق الواحد.
 */
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks
  if (locks) return locks.request(VAULT_LOCK, work)
  const next = localChain.then(work)
  localChain = next.catch(() => undefined)
  return next
}

const aad = (slot: VaultSlot) => new TextEncoder().encode(`${VAULT_PREFIX}${slot}`)

/**
 * يحفظ السرّ في خانته مشفَّرًا، ويُبطل ما كان فيها. **يدخل القفل عند النداء، والتشفير داخله:** لو سبق التشفيرُ القفلَ
 * لصار ترتيب الطابور ترتيبَ انتهاء التشفير — فحفظٌ أبطأ تشفيرًا يكتب فوق حفظٍ نودي بعده، ونسيانٌ نودي بعد حفظٍ
 * يسبقه فيُبعث الرمز بعد «اقطع الاتّصال».
 */
export function saveSecret(slot: VaultSlot, secret: string): Promise<Result<null, VaultError>> {
  return serialized(async () => {
    let key: CryptoKey
    let iv: Uint8Array<ArrayBuffer>
    let cipher: ArrayBuffer
    try {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ])
      iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
      cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(slot) },
        key,
        new TextEncoder().encode(secret),
      )
    } catch (error) {
      return err(fail('crypto', error))
    }

    const keyId = crypto.randomUUID()
    const record: VaultRecord = {
      v: RECORD_VERSION,
      keyId,
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(cipher)),
    }

    try {
      await withVault((db) => db.put(KEY_STORE, { id: keyId, slot, key }))
    } catch (error) {
      return err(fail('storage', error))
    }
    try {
      await chrome.storage.local.set({ [vaultKey(slot)]: record })
    } catch (error) {
      // السجلّ السابق باقٍ بمفتاحه؛ المفتاح الجديد يتيمٌ يُزال.
      await removeKeys(slot, (row) => row.id === keyId).catch(() => undefined)
      return err(fail('storage', error))
    }
    // المفاتيح السابقة لا يشير إليها سجلّ بعد الآن — والقفل يضمن ألّا يكتب غيرُنا سجلًّا بينهما. تعثُّر إزالتها لا
    // يُفشل الحفظ: تُزال في الحفظ أو النسيان التالي.
    await removeKeys(slot, (row) => row.id !== keyId).catch(() => undefined)
    return ok(null)
  })
}

/** يقرأ السرّ: `null` حين لا سجلّ أصلًا (غير متّصل)، وخطأٌ حين وُجد ولم يُفكّ. */
export async function readSecret(slot: VaultSlot): Promise<Result<string | null, VaultError>> {
  let stored: unknown
  try {
    stored = (await chrome.storage.local.get(vaultKey(slot)))[vaultKey(slot)]
  } catch (error) {
    return err(fail('storage', error))
  }
  if (stored === undefined) return ok(null)
  if (!isRecord(stored)) return err(fail('unreadable'))

  let row: KeyRow | undefined
  try {
    row = await withVault((db) => db.get(KEY_STORE, stored.keyId))
  } catch (error) {
    return err(fail('storage', error))
  }
  if (!row || row.slot !== slot) return err(fail('unreadable'))

  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(stored.iv), additionalData: aad(slot) },
      row.key,
      base64ToBytes(stored.data),
    )
    return ok(new TextDecoder().decode(plain))
  } catch (error) {
    return err(fail('unreadable', error))
  }
}

/**
 * هل في الخانة سجلّ؟ بلا فكّ. **سجلٌّ موجود ليس رمزًا مقروءًا:** قد يكون `unreadable` — فالواجهة لا تعرض «متّصل»
 * إلا بعد `readSecret` ناجحة، وتعرض «أعد الاتّصال» على `unreadable` (ADR 0046 §5).
 */
export async function hasSecret(slot: VaultSlot): Promise<Result<boolean, VaultError>> {
  try {
    return ok((await chrome.storage.local.get(vaultKey(slot)))[vaultKey(slot)] !== undefined)
  } catch (error) {
    return err(fail('storage', error))
  }
}

/** ينسى الخانة: السجلّ أوّلًا — فسجلٌّ بلا مفتاح «تعذّرت قراءته» لا رمزٌ باقٍ — ثمّ مفاتيحها. */
export function forgetSecret(slot: VaultSlot): Promise<Result<null, VaultError>> {
  return serialized(async () => {
    try {
      await chrome.storage.local.remove(vaultKey(slot))
    } catch (error) {
      return err(fail('storage', error))
    }
    try {
      await removeKeys(slot, () => true)
    } catch (error) {
      return err(fail('storage', error))
    }
    return ok(null)
  })
}

/** مهلة انتظار الحذف إن حجبه اتّصالٌ مفتوح — الطلب يبقى في الطابور ويكتمل حين يُغلق (`withVault` يغلق فورًا). */
const DELETE_BLOCKED_GRACE_MS = 3000

/**
 * يحذف قاعدة المفاتيح كلّها — جزءٌ من «احذف كل البيانات» (`erase.ts`)، يليه إفراغ `local` الذي يحمل السجلّات.
 * ترمي عند الفشل، أو عند حجبٍ لم ينفكّ في مهلته، ونداؤها يحوّل ذلك إلى جزءٍ لم يُحذف. **والحجب لا يُرفض فورًا:** طلب
 * الحذف يبقى في الطابور ويكتمل حين يُغلق الاتّصال الحاجب، فرفضه فورًا كان يقول «لم يُحذف» عمّا حُذف بعد لحظة
 * (المراجعة المستقلّة، `STAGES/11`).
 */
export function deleteVaultDatabase(): Promise<void> {
  return serialized(
    () =>
      new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const request = indexedDB.deleteDatabase(VAULT_DB_NAME)
        request.onsuccess = () => {
          clearTimeout(timer)
          resolve()
        }
        request.onerror = () => {
          clearTimeout(timer)
          reject(request.error ?? new Error('vault-delete-failed'))
        }
        request.onblocked = () => {
          timer = setTimeout(
            () => reject(new Error('vault-delete-blocked')),
            DELETE_BLOCKED_GRACE_MS,
          )
        }
      }),
  )
}

async function removeKeys(slot: VaultSlot, which: (row: KeyRow) => boolean): Promise<void> {
  await withVault(async (db) => {
    const tx = db.transaction(KEY_STORE, 'readwrite')
    let cursor = await tx.store.openCursor()
    while (cursor) {
      if (cursor.value.slot === slot && which(cursor.value)) await cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  })
}

function isRecord(value: unknown): value is VaultRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    r.v === RECORD_VERSION &&
    typeof r.keyId === 'string' &&
    typeof r.iv === 'string' &&
    typeof r.data === 'string'
  )
}
