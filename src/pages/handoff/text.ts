/**
 * نصوص نافذة الحزمة — منطقٌ بلا JSX يُختبَر وحده (نمط `library/issues.ts`).
 *
 * العدّ البشري بأرقام هندية وقاعدة العدد العربية (`countText`)، والقياسات والأسماء التقنية غربية.
 */

import { ISSUE_FORMS } from '@/modules/issues/labels'
import { countText, formatHuman, type CountForms } from '@/shared/bidi/numerals'

import type { HandoffModel } from '@/modules/handoff/model'
import type { IssueRecord } from '@/shared/issue-schema'

const IMAGE_FORMS: CountForms = {
  one: 'صورة واحدة',
  two: 'صورتان',
  many: 'صور',
  accusative: 'صورة',
  singular: 'صورة',
}

/** «صورتان وملفّان: Markdown · JSON» — ما في الحزمة قبل التنزيل. */
export function contentsLabel(images: number): string {
  return images > 0
    ? `${countText(images, IMAGE_FORMS)} وملفّان: Markdown · JSON`
    : 'ملفّان: Markdown · JSON'
}

/** سطر النجاح: «ملفّ واحد فيه صورتان ونسختان: Markdown · JSON.» */
export function doneLabel(images: number): string {
  return images > 0
    ? `ملفّ واحد فيه ${countText(images, IMAGE_FORMS)} ونسختان: Markdown · JSON.`
    : 'ملفّ واحد فيه نسختان: Markdown · JSON.'
}

/** «مشكلتان — حالتهما كما هي في المكتبة». */
export function issuesLabel(count: number): string {
  const pronoun = count === 1 ? 'حالتها' : count === 2 ? 'حالتهما' : 'حالاتها'
  return `${countText(count, ISSUE_FORMS)} — ${pronoun} كما هي في المكتبة`
}

/** سطر التقدّم: «يُرمَّز مقتطع المشكلة ٢» و«٢ من ٣». */
export function progressLabel(done: number, total: number): { step: string; count: string } {
  return {
    step: `يُرمَّز مقتطع المشكلة ${formatHuman(Math.min(done + 1, total))}`,
    count: `${formatHuman(done)} من ${formatHuman(total)}`,
  }
}

/** ما بقي جاهزًا في مشكلةٍ لم يفشل دليلها: «مقتطع · خصائص · خطوات». */
export function readyParts(model: HandoffModel, id: string): string {
  const entry = model.entries.find((e) => e.id === id)
  if (!entry) return ''
  const parts: string[] = []
  if (entry.image) parts.push('مقتطع')
  if (entry.properties) parts.push('خصائص')
  if (entry.steps.length > 0) parts.push('خطوات')
  return parts.length > 0 ? parts.join(' · ') : 'القيمتان والمحدِّد'
}

/** رسالة الفشل باسم المشكلة — لقطةٌ فُقدت تُقال بما يُفعل بها، وغيرها برسالة عطله. */
export function failureText(
  issue: Pick<IssueRecord, 'title'>,
  failure: { readonly code: string; readonly message: string },
): string {
  return failure.code === 'not-found'
    ? `لقطة الدليل للمشكلة «${issue.title}» لم تعد في المكتبة. أزلها من الحزمة، أو أعد تسجيلها من الصفحة.`
    : `المشكلة «${issue.title}»: ${failure.message}`
}
