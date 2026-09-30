/**
 * بحث المكتبة — عبر خمسة أنواع محتوى، بتطبيع عربي ومطابقة جزئية (§10.4).
 *
 * **بلا فهرس نصّ كامل منفصل**: الحقول المفحوصة قليلة العدد وقصيرة (عنوان،
 * رابط، وسوم، ملاحظة)، وبناء فهرس مقلوب (inverted index) وصيانته عند كل
 * كتابة أثقل من مسح المرشَّحين في الذاكرة بمطابقة نصّية مباشرة على هذا
 * الحجم. الفهرس الحقيقي هنا فهارس IndexedDB **البنيوية** (المشروع، النوع،
 * الحالة) التي تضيّق المرشَّحين قبل أن يبدأ البحث النصّي أصلًا — لا فهرسٌ نصّي
 * موازٍ. والقياس في `search.test.ts` يثبت زمن 5000 سجلّ لا يفترضه.
 *
 * `modules/` منطق خالص: دوال المطابقة محضة بلا قراءة تخزين، والاستعلام
 * المتّصل بالمخازن في طرف الملفّ وحده — الفصل يجعل كل دالة مطابقة قابلة
 * للاختبار بمصفوفة عادية بلا `fake-indexeddb`.
 */

import { guideSteps } from '@/shared/guide-schema'
import { ok, type Result } from '@/shared/result'
import { captures, colors, guides, palettes, references } from '@/shared/storage/repository'

import { matchesQuery } from './normalize'

import type {
  CaptureRecord,
  ColorRecord,
  GuideRecord,
  PaletteRecord,
  ReferenceRecord,
} from '@/shared/storage/schema'

export type LibraryTab = 'captures' | 'references' | 'colors' | 'palettes' | 'guides'

/** نص اللقطة القابل للبحث: العنوان، الرابط، والوسوم — لا الملاحظات (لا حقل لها على السجلّ بعد). */
function captureText(record: CaptureRecord): string {
  return `${record.title} ${record.url} ${record.tags.join(' ')}`
}

/** نص اللون القابل للبحث: القيمة السداسية، الاسم، والملاحظة — حيث يُكتب اسم متغيّر CSS المُلتقَط. */
function colorText(record: ColorRecord): string {
  return `${record.hex} ${record.name} ${record.note}`
}

function paletteText(record: PaletteRecord): string {
  return `${record.name} ${record.colors.join(' ')}`
}

function referenceText(record: ReferenceRecord): string {
  return `${record.origin} ${record.path}`
}

/** العنوان وعناوين الخطوات وملاحظاتها — «الدفع» يجد الدليل الذي كُتبت فيه خطوةٌ عنه. */
function guideText(record: GuideRecord): string {
  return [record.title, ...guideSteps(record).flatMap((s) => [s.title, s.note])].join(' ')
}

export function searchCaptures(records: readonly CaptureRecord[], query: string): CaptureRecord[] {
  return records.filter((record) => matchesQuery(captureText(record), query))
}

export function searchColors(records: readonly ColorRecord[], query: string): ColorRecord[] {
  return records.filter((record) => matchesQuery(colorText(record), query))
}

export function searchPalettes(records: readonly PaletteRecord[], query: string): PaletteRecord[] {
  return records.filter((record) => matchesQuery(paletteText(record), query))
}

export function searchReferences(
  records: readonly ReferenceRecord[],
  query: string,
): ReferenceRecord[] {
  return records.filter((record) => matchesQuery(referenceText(record), query))
}

export function searchGuides(records: readonly GuideRecord[], query: string): GuideRecord[] {
  return records.filter((record) => matchesQuery(guideText(record), query))
}

/** يجلب من المخزن المناسب لتبويب، ويبحث فيه — الطبقة الوحيدة التي تمسّ IndexedDB في هذا الملفّ. */
export async function searchTab(
  tab: LibraryTab,
  query: string,
): Promise<
  Result<CaptureRecord[] | ColorRecord[] | PaletteRecord[] | ReferenceRecord[] | GuideRecord[]>
> {
  switch (tab) {
    case 'captures': {
      const all = await captures.getAll()
      if (!all.ok) return all
      return ok(searchCaptures(all.value, query))
    }
    case 'colors': {
      const all = await colors.getAll()
      if (!all.ok) return all
      return ok(searchColors(all.value, query))
    }
    case 'palettes': {
      const all = await palettes.getAll()
      if (!all.ok) return all
      return ok(searchPalettes(all.value, query))
    }
    case 'references': {
      const all = await references.getAll()
      if (!all.ok) return all
      return ok(searchReferences(all.value, query))
    }
    case 'guides': {
      const all = await guides.getAll()
      if (!all.ok) return all
      return ok(searchGuides(all.value, query))
    }
  }
}
