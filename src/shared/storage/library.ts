/**
 * المكتبة كلّها دفعةً واحدة — قراءةٌ متّسقة للنسخ الاحتياطي، ودمجٌ ذرّي للاستعادة (ADR 0039).
 *
 * **معاملةٌ واحدة في كلٍّ منهما.** القراءة على معاملات منفصلة قد تلتقط لقطةً بلا بايتاتها إن حُذفت بين
 * مخزنين؛ والكتابة على معاملات منفصلة تترك استعادةً فشلت في منتصفها مكتبةً نصفها من الملفّ. فالنسخة صورةُ
 * لحظةٍ واحدة، والاستعادة كلّها أو لا شيء.
 */

import { guardWrite, withDb } from './db'
import { abortQuietly } from './repository'
import { STORE_NAMES, type RasdDB, type StoreName } from './schema'

import type { Result } from '../result'

/** سجلّات كل مخزن باسمه. */
export type LibraryRecords = { [S in StoreName]: RasdDB[S]['value'][] }

export type StoreCounts = Record<StoreName, number>

export function emptyCounts(): StoreCounts {
  return Object.fromEntries(STORE_NAMES.map((name) => [name, 0])) as StoreCounts
}

/** مفتاح السجلّ في مخزنه — `keyPath` كما عرّفته خطوة الترحيل الأولى. */
export function keyOf(store: StoreName, record: object): string {
  const r = record as Record<string, unknown>
  const key = store === 'annotations' ? r.captureId : store === 'tags' ? r.name : r.id
  return String(key)
}

/** يقرأ كل المخازن في معاملة قراءة واحدة. الصور `Blob` كما في القاعدة — لا تُحمَّل بايتاتها هنا. */
export async function readLibrary(): Promise<Result<LibraryRecords>> {
  return withDb(async (db) => {
    const tx = db.transaction([...STORE_NAMES], 'readonly')
    const lists = await Promise.all(STORE_NAMES.map((name) => tx.objectStore(name).getAll()))
    await tx.done
    return Object.fromEntries(STORE_NAMES.map((name, i) => [name, lists[i]])) as LibraryRecords
  })
}

/** عدد السجلّات في كل مخزن — ما يعرضه تأكيد الحذف وما يقرّر «لا شيء لتنسخه». */
export async function libraryCounts(): Promise<Result<StoreCounts>> {
  return withDb(async (db) => {
    const tx = db.transaction([...STORE_NAMES], 'readonly')
    const counts = await Promise.all(STORE_NAMES.map((name) => tx.objectStore(name).count()))
    await tx.done
    return Object.fromEntries(STORE_NAMES.map((name, i) => [name, counts[i]])) as StoreCounts
  })
}

export interface MergeReport {
  /** ما كُتب من الملفّ في كل مخزن. */
  readonly added: StoreCounts
  /** ما وُجد في المكتبة بمفتاحه نفسه فبقي كما هو. */
  readonly kept: StoreCounts
}

/**
 * يضيف المكتبة `incoming` إلى القائمة — **إضافةٌ لا استبدال**، في معاملة واحدة.
 *
 * - سجلٌّ مفتاحه موجود يبقى كما هو ولا يُكتب فوقه: ما في المكتبة الآن أحدث من ملفٍّ أُخذ قبله أو مساوٍ له،
 *   و«اللقطة الموجودة في الاثنين لا تتكرّر» (إطار `data / restore-preview`).
 * - **الوسوم تُحسب من اللقطات بعد الدمج** لا تُنسخ: العدّاد مخزَّنٌ لتسريع لوحة الوسوم (`library/tags.ts`)، وهو
 *   مشتقٌّ معنًى. نسخُ عدّادٍ من الملفّ فوق مكتبةٍ فيها بعض لقطاته يعدّها مرّتين أو لا يعدّها.
 * - `incomingBytes` يمرّ من `guardWrite` كأيّ كتابة: التصفّح الخاص ثمّ الحصّة، قبل أن يُفتح شيء.
 *
 * وفشلٌ في أيّ طلب يُجهض المعاملة كلّها صراحةً: لا مكتبة نصفها من الملفّ.
 */
export async function mergeLibrary(
  incoming: LibraryRecords,
  incomingBytes: number,
): Promise<Result<MergeReport>> {
  const guard = await guardWrite(incomingBytes)
  if (!guard.ok) return guard

  return withDb(async (db) => {
    const tx = db.transaction([...STORE_NAMES], 'readwrite')
    const added = emptyCounts()
    const kept = emptyCounts()
    const writes: Promise<unknown>[] = []
    try {
      for (const name of STORE_NAMES) {
        if (name === 'tags') continue
        const store = tx.objectStore(name)
        const present = new Set((await store.getAllKeys()).map(String))
        for (const record of incoming[name]) {
          const key = keyOf(name, record)
          if (present.has(key)) {
            kept[name] += 1
            continue
          }
          present.add(key)
          const write = store.put(record)
          write.catch(() => undefined)
          writes.push(write)
          added[name] += 1
        }
      }

      // الطلبات مرتّبة داخل المعاملة: هذه القراءة ترى ما كُتب أعلاه.
      const counts = new Map<string, number>()
      for (const capture of await tx.objectStore('captures').getAll()) {
        for (const tag of new Set(capture.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
      const tags = tx.objectStore('tags')
      const before = new Set((await tags.getAllKeys()).map(String))
      writes.push(tags.clear())
      for (const [tag, count] of counts) {
        writes.push(tags.put({ name: tag, count }))
        if (before.has(tag)) kept.tags += 1
        else added.tags += 1
      }
      await Promise.all([...writes, tx.done])
    } catch (thrown) {
      abortQuietly(tx)
      throw thrown
    }
    return { added, kept }
  })
}

/** مجموع السجلّات — «المكتبة فارغة» حين يكون صفرًا. */
export function totalRecords(counts: StoreCounts): number {
  return STORE_NAMES.reduce((sum, name) => sum + counts[name], 0)
}
