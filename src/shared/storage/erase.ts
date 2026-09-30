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

import { clearAllStores } from './repository'

export type ErasePart = 'database' | 'local' | 'session' | 'sync'

export interface EraseFailure {
  /** ما لم يُحذف — وكل ما سواه حُذف. */
  readonly failed: readonly ErasePart[]
}

interface Area {
  clear(): Promise<void>
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
    const cleared = await attempt(() => target.clear())
    if (!cleared.ok) failed.push(name)
  }

  return failed.length === 0 ? ok(null) : err({ failed })
}
