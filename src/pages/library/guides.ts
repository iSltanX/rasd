/**
 * الدليل وقوالبه في المكتبة — الإنشاء من لقطات محدَّدة، والقراءة للعرض، والحفظ، وقوالب التصدير.
 *
 * منطقٌ بلا JSX بنمط `projects.ts` و`bulk-delete.ts`: يُختبر بقاعدة وهمية بلا تركيب مكوّن، والصفحة تقرأ القاعدة
 * مباشرةً كما تقرؤها منذ المرحلة 7.
 *
 * **الترتيب والعضوية في `captureIds`، والنصّ في `stepText`** (ADR 0041). فكل حفظٍ يكتب الاثنين من قائمة الخطوات
 * نفسها بـ`stepTextFrom` — لا نصٌّ يبقى لخطوةٍ أُزيلت.
 */

import {
  GUIDE_LIMITS,
  guideSteps,
  stepTextFrom,
  type GuideExportOptions,
  type GuideStep,
  type TemplateRecord,
} from '@/shared/guide-schema'
import { errText, ok, type Result } from '@/shared/result'
import { blobs, captures, guides, templates, writeGuide } from '@/shared/storage/repository'

import type { CaptureRecord, GuideRecord } from '@/shared/storage/schema'

/** عنوان الدليل الجديد — يُحرَّر في مكانه أوّل ما يُفتح. */
export const NEW_GUIDE_TITLE = 'دليل جديد'

/**
 * ينشئ دليلًا من لقطات محدَّدة، **بترتيب التقاطها** — الخطوات تُروى كما جرت، والمستخدم يعيد ترتيبها بعد.
 *
 * ومشروع الدليل مشروع لقطاته إن اتّفقت كلّها عليه، وإلا بلا مشروع: دليلٌ يجمع مشروعين لا يُنسب إلى أحدهما.
 * واللقطة التي لا تُقرأ تُسقط الإنشاء باسمها ولا يُكتب دليلٌ ناقص.
 */
export async function createGuide(
  ids: readonly string[],
  now: number,
): Promise<Result<GuideRecord>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return errText('invalid-data', 'حدّد لقطة واحدة على الأقلّ.')
  if (unique.length > GUIDE_LIMITS.steps) {
    return errText('invalid-data', `الدليل يتّسع لـ${GUIDE_LIMITS.steps} خطوة على الأكثر.`)
  }
  const found: CaptureRecord[] = []
  for (const id of unique) {
    const record = await captures.get(id)
    if (!record.ok) return record
    found.push(record.value)
  }
  found.sort((a, b) => a.createdAt - b.createdAt)
  const projectIds = new Set(found.map((c) => c.projectId))
  const guide: GuideRecord = {
    id: crypto.randomUUID(),
    title: NEW_GUIDE_TITLE,
    projectId: projectIds.size === 1 ? (found[0]?.projectId ?? null) : null,
    captureIds: found.map((c) => c.id),
    createdAt: now,
    stepText: {},
    updatedAt: now,
  }
  const written = await guides.put(guide)
  if (!written.ok) return written
  return ok(guide)
}

/** الخطوة كما تعرضها الصفحة: نصّها ولقطتها — `null` حين لم تعد اللقطة في المكتبة. */
export interface GuideStepView extends GuideStep {
  readonly capture: CaptureRecord | null
  /** بايتات أصلها كما خُزّنت — للحجم التقديري قبل الخبز؛ `null` حين غاب. */
  readonly bytes: number | null
}

export interface GuideView {
  readonly guide: GuideRecord
  readonly steps: readonly GuideStepView[]
}

export async function loadGuide(id: string): Promise<Result<GuideView>> {
  const found = await guides.get(id)
  if (!found.ok) return found
  const steps: GuideStepView[] = []
  for (const step of guideSteps(found.value)) {
    const record = await captures.get(step.captureId)
    if (!record.ok && record.error.code !== 'not-found') return record
    const blob = record.ok ? await blobs.get(step.captureId) : null
    steps.push({
      ...step,
      capture: record.ok ? record.value : null,
      bytes: blob?.ok ? blob.value.bytes : null,
    })
  }
  return ok({ guide: found.value, steps })
}

/** يقصّ النصّ إلى حدّه — ما يُكتب لا يتجاوز ما يقبله استيراد النسخة الاحتياطية (`records.ts`). */
const clip = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text)

/**
 * يحفظ العنوان والخطوات بترتيبها — ترتيب الصفحة ونصّها، **وعضوية القاعدة** (`writeGuide`): لقطةٌ حذفها الحذف
 * الدوري بعد أن قُرئ الدليل لا تعود بحفظه. والنتيجة ما كُتب فعلًا، فتعرضه الصفحة.
 */
export async function saveGuide(
  guide: GuideRecord,
  title: string,
  steps: readonly GuideStep[],
  now: number,
): Promise<Result<GuideRecord>> {
  const clean = steps.map((s) => ({
    captureId: s.captureId,
    title: clip(s.title, GUIDE_LIMITS.stepTitle),
    note: clip(s.note, GUIDE_LIMITS.note),
  }))
  const next: GuideRecord = {
    ...guide,
    title: clip(title.trim() || NEW_GUIDE_TITLE, GUIDE_LIMITS.title),
    captureIds: clean.map((s) => s.captureId),
    stepText: stepTextFrom(clean),
    updatedAt: now,
  }
  return writeGuide(next)
}

/** ينقل خطوةً من موضعٍ إلى آخر — دالّةٌ خالصة للسحب والأزرار معًا. */
export function moveStep<T>(steps: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) {
    return [...steps]
  }
  const next = [...steps]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as T)
  return next
}

// ── القوالب ─────────────────────────────────────────────────────

/** القوالب بأسمائها مرتّبةً — ترتيب القائمة لا ترتيب المعرّف العشوائي. */
export async function loadTemplates(): Promise<Result<TemplateRecord[]>> {
  const all = await templates.getAll()
  if (!all.ok) return all
  return ok([...all.value].sort((a, b) => a.name.localeCompare(b.name, 'ar')))
}

/**
 * يحفظ قالبًا باسمه. **الاسم نفسه يستبدل القالب لا يكرّره** — الفهرس فريد، و«احفظ قالبًا» باسمٍ قائم تحديثٌ
 * لإعداداته. ولا قالب بلا اسم، ولا أكثر من الحدّ.
 */
export async function saveTemplate(
  name: string,
  options: GuideExportOptions,
  now: number,
): Promise<Result<TemplateRecord>> {
  const trimmed = name.trim()
  if (!trimmed) return errText('invalid-data', 'اكتب اسمًا للقالب.')
  if (trimmed.length > GUIDE_LIMITS.templateName) {
    return errText('invalid-data', `الاسم أطول من ${GUIDE_LIMITS.templateName} حرفًا.`)
  }
  const same = await templates.byIndex('name', trimmed)
  if (!same.ok) return same
  const existing = same.value[0]
  if (!existing) {
    const count = await templates.count()
    if (!count.ok) return count
    if (count.value >= GUIDE_LIMITS.templates) {
      return errText('invalid-data', 'بلغت القوالب حدّها — احذف قالبًا لا تستعمله.')
    }
  }
  const record: TemplateRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    name: trimmed,
    options: { ...options },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  const written = await templates.put(record)
  if (!written.ok) return written
  return ok(record)
}

export async function deleteTemplate(id: string): Promise<Result<null>> {
  return templates.remove(id)
}

/** القالب الذي تطابق إعداداته الحاضرة — ما تعرضه قائمة «القالب»، وإلا «بلا قالب». */
export function matchingTemplate(
  list: readonly TemplateRecord[],
  options: GuideExportOptions,
): TemplateRecord | null {
  return (
    list.find(
      (t) =>
        t.options.format === options.format &&
        t.options.pageSize === options.pageSize &&
        t.options.numbered === options.numbered &&
        t.options.notes === options.notes,
    ) ?? null
  )
}
