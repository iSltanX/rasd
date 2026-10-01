/**
 * «احذف كل البيانات» — المسار الواحد الذي يُفرغ كل ما يكتبه رصد على هذا الجهاز.
 *
 * أربعة أماكن لا غيرها: **كل مخازن IndexedDB** (المكتبة: اللقطات وبايتاتها والمشاريع والوسوم واللوحات
 * والأدلّة والمراجع والمشكلات)، و`chrome.storage.local` (الإعدادات ومنها المواقع المستثناة)، و
 * `chrome.storage.session` (الوضع النشط في كل تبويب ومهمّة الالتقاط وذاكرة رفض الصلاحية)، و
 * `chrome.storage.sync` إن وُجد — لا يكتب فيه رصد اليوم، ولا يُترك فيه ما قد يكتبه غدًا.
 *
 * **مسارٌ واحد لا أربعة نداءات متفرّقة في الواجهة:** مخزنٌ يُضاف غدًا يُمسح هنا بلا تعديل (`clearAllStores`
 * يقرأ أسماء القاعدة المفتوحة)، واختبار `erase.test.ts` يسقط إن بقي شيءٌ في أيٍّ منها.
 *
 * **ويمضي إلى آخره ولو تعثّر في أوّله:** الحذف طلبُ المستخدم الصريح بعد تأكيدين، فعطلٌ في مكانٍ لا يُبقي
 * الأماكن الأخرى. والتقرير يسمّي ما لم يُحذف (`data / delete-error`)، والإعادة تُكمله — كل خطوة لا تضرّ إن
 * أُعيدت. والقاعدة تُفرَغ لا تُحذف: `deleteDatabase` يُحجب ما دام عامل الخلفية ممسكًا باتّصاله.
 */

import { attempt, err, ok, type Result } from '../result'

import { ATTEMPTS_KEY, forgetLockSnapshot, LOCK_KEY } from './lock-state'
import { clearAllStores } from './repository'

export type ErasePart = 'database' | 'local' | 'session' | 'sync'

export interface EraseFailure {
  /** ما لم يُحذف — وكل ما سواه حُذف. */
  readonly failed: readonly ErasePart[]
}

interface Area {
  clear(): Promise<void>
  get(keys: null): Promise<Record<string, unknown>>
  remove(keys: string[]): Promise<void>
}

/** مفاتيح القفل — تبقى إن تعثّر إفراغ القاعدة (ADR 0043 §4). */
const LOCK_KEYS = new Set([LOCK_KEY, ATTEMPTS_KEY])

/**
 * يُفرغ `local` كلّه، **إلا القفل حين بقيت المكتبة**: إفراغٌ تعثّر ثمّ `clear()` كان يمحو `rasd:lock` فتُفتح المكتبة
 * الباقية بلا رمز (المراجعة المستقلّة، `STAGES/08`). القفل يبقى على ما بقي، وما سواه يُحذف كما طُلب.
 */
async function clearLocal(target: Area, keepLock: boolean): Promise<void> {
  if (!keepLock) return target.clear()
  const keys = Object.keys(await target.get(null)).filter((key) => !LOCK_KEYS.has(key))
  if (keys.length > 0) await target.remove(keys)
}

function area(name: 'local' | 'session' | 'sync'): Area | null {
  const storage = (chrome as { storage?: Partial<Record<string, unknown>> }).storage
  const found = storage?.[name] as Partial<Area> | undefined
  return typeof found?.clear === 'function' ? (found as Area) : null
}

export async function eraseAllData(): Promise<Result<null, EraseFailure>> {
  const failed: ErasePart[] = []

  const database = await clearAllStores()
  if (!database.ok) failed.push('database')

  for (const name of ['local', 'session', 'sync'] as const) {
    const target = area(name)
    // غياب `sync` (بيئة بلا حساب) ليس فشلًا؛ غياب `local` فشل: هو مكان الإعدادات.
    if (!target) {
      if (name === 'local') failed.push(name)
      continue
    }
    const cleared = await attempt(() =>
      name === 'local' ? clearLocal(target, !database.ok) : target.clear(),
    )
    if (!cleared.ok) failed.push(name)
  }
  forgetLockSnapshot()

  return failed.length === 0 ? ok(null) : err({ failed })
}
