/**
 * مشكلات ملاحظات اللقطة — ما تعرضه لوحة الملاحظات عن الملاحظة المرتبطة بمشكلة (ADR 0030).
 *
 * **الربط باتجاه واحد**: سجلّ المشكلة يحمل `note: { captureId, noteId }` والملاحظة (عقدة المشهد) لا تعرف
 * شيئًا. فالمحرّر يقرأ مشكلات لقطته بفهرس `captureId` (`evidence.captureId`) — لقطة الدليل ولقطة الملاحظة
 * واحدة — ثمّ يبني خريطة `noteId ← مشكلة`. وحذف الملاحظة في المحرّر لا يمسّ المشكلة: تبقى بلا ملاحظة تُعرض
 * هنا.
 *
 * منطق بلا JSX كي يُختبَر بقاعدة وهمية بلا تركيب مكوّن، وسابقته `context.ts`.
 */

import { propertyLabel } from '@/modules/issues/labels'
import { parseIssue } from '@/modules/issues/schema'
import { issues } from '@/shared/storage/repository'

import type { IssueRecord } from '@/shared/issue-schema'

/** مشكلاتٌ مربوطة بملاحظات لقطةٍ، بمعرّف الملاحظة. */
export type NoteIssues = ReadonlyMap<string, IssueRecord>

export const NO_NOTE_ISSUES: NoteIssues = new Map()

/**
 * يبني الخريطة من سجلّات خام — كلٌّ يمرّ من `parseIssue` والمعطوب يُتجاهَل.
 *
 * لا تُقبل مشكلةٌ ملاحظتها في لقطةٍ أخرى ولو كان دليلها هنا، فالربط يُقرأ بلقطة الملاحظة. وإن ربطت
 * مشكلتان الملاحظةَ نفسها فأحدثهما تحديثًا هي المعروضة، لا آخرُ ما قرأه المؤشّر.
 */
export function indexNoteIssues(captureId: string, records: readonly unknown[]): NoteIssues {
  const byNote = new Map<string, IssueRecord>()
  for (const raw of records) {
    const parsed = parseIssue(raw)
    if (!parsed.ok) continue
    const issue = parsed.value
    if (!issue.note || issue.note.captureId !== captureId) continue
    const seen = byNote.get(issue.note.noteId)
    if (!seen || issue.updatedAt > seen.updatedAt) byNote.set(issue.note.noteId, issue)
  }
  return byNote
}

/**
 * مشكلاتٌ دليلها هذه اللقطة — بملاحظة أو بلا ملاحظة — مرتَّبةً بزمن تسجيلها: ما تصدّره «حزمة التسليم» من
 * المحرّر (ADR 0036). كلٌّ يمرّ من `parseIssue` والمعطوب يُتجاهَل.
 */
export function evidenceIssues(captureId: string, records: readonly unknown[]): IssueRecord[] {
  const out: IssueRecord[] = []
  for (const raw of records) {
    const parsed = parseIssue(raw)
    if (parsed.ok && parsed.value.evidence.captureId === captureId) out.push(parsed.value)
  }
  return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export interface CaptureIssues {
  readonly notes: NoteIssues
  readonly evidence: readonly IssueRecord[]
}

const NO_CAPTURE_ISSUES: CaptureIssues = { notes: NO_NOTE_ISSUES, evidence: [] }

/**
 * يقرأ مشكلات لقطةٍ بفهرس `captureId` مرّةً: خريطة ملاحظاتها، ومشكلات دليلها.
 *
 * **لا يفشل**: فشل القراءة يعطي فراغًا، فلا يمنع تعليقًا أن يُفتح لأن حالة مشكلةٍ تعذّرت قراءتها.
 */
export async function loadCaptureIssues(captureId: string): Promise<CaptureIssues> {
  try {
    const found = await issues.byIndex('captureId', captureId)
    if (!found.ok) return NO_CAPTURE_ISSUES
    return {
      notes: indexNoteIssues(captureId, found.value),
      evidence: evidenceIssues(captureId, found.value),
    }
  } catch {
    return NO_CAPTURE_ISSUES
  }
}

/** خريطة ملاحظات اللقطة وحدها — `loadCaptureIssues` بلا مشكلات الدليل. */
export async function loadNoteIssues(captureId: string): Promise<NoteIssues> {
  return (await loadCaptureIssues(captureId)).notes
}

/**
 * سطر الموضوع تحت الملاحظة: `.hero-actions · gap` — المحدِّد والخاصية بخطّ القياس.
 *
 * فحص المسافة يُعرض `gap` وفحص التباين `color / background` أيًّا كانت الخاصّية المخزَّنة، وما عداهما
 * خاصية CSS كما هي.
 */
export function noteIssueSubject(issue: Pick<IssueRecord, 'element' | 'check'>): string {
  const property = issue.check.kind === 'spacing' ? 'gap' : propertyLabel(issue.check)
  return `${issue.element.selector} · ${property}`
}
