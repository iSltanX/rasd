/**
 * محتوى صفحة «تفاصيل اللقطة» في PDF — بيانات الصفحة وقائمة الملاحظات، كتلًا يرسمها `doc-render.ts`.
 *
 * **قائمة الملاحظات تقرأ المشكلات بحالتها وقيمتيها** (`STAGES/32`): ملاحظةٌ مربوطة بمشكلة تحمل رقاقة الحالة
 * بلونها في الواجهة، وسطر المحدِّد والخاصية، وسطر القيمتين «الآن · المتوقَّع» **دائمًا** — حتى «تحتاج تحققًا»
 * التي تعرض في الواجهة سببها بدل قيمتيها: الورقة تُقرأ بعيدًا عن الأداة، فيُكتب السبب سطرًا ثالثًا ولا يحلّ
 * محلّ القيمتين.
 *
 * **وبيانات الصفحة بيانات وصفية:** الرابط والعنوان ووقت الالتقاط والمشروع. فحين يكون
 * `privacy.stripMetadataOnExport` مفعَّلًا لا تُبنى هذه الكتل أصلًا، والنافذة تعطّل مفتاحها بسببه — لا يُحذف
 * قاموس `Info` ثمّ يُطبع الرابط نفسه في الصفحة.
 */

import { isHideable, NOTE_TAG_LABEL, type Scene } from '@/modules/editor/scene'
import {
  displayExpected,
  displayValue,
  REASON_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
} from '@/modules/issues/labels'
import { currentValue } from '@/modules/issues/status'
import { formatDimensions } from '@/shared/bidi'
import { isolate } from '@/shared/bidi/isolate'
import { formatHuman } from '@/shared/bidi/numerals'

import { noteIssueSubject, type NoteIssues } from '../editor/note-issues'
import { orderedNotes } from '../editor/notes'
import { formatCaptureTime } from '../editor/page-meta'

import type { PdfMetadata } from '@/modules/export/pdf'
import type { DocBlock, DocItem, DocLine } from '@/modules/export/pdf-document'
import type { IssueRecord } from '@/shared/issue-schema'
import type { CaptureRecord } from '@/shared/storage/schema'

/** سطر القيمتين — الرقمان معزولان: `12px` بين كلمتين عربيتين يقلب ما حوله بلا عزل. */
export function issueValues(issue: IssueRecord): string {
  const now = displayValue(issue.check.kind, currentValue(issue))
  return `الآن ${isolate(now)} · المتوقَّع ${isolate(displayExpected(issue.check))}`
}

function noteItem(
  number: string,
  title: string,
  body: string,
  tag: string | null,
  issue: IssueRecord | undefined,
): DocItem {
  const lines: DocLine[] = []
  if (body) lines.push({ text: body, mono: false })
  if (tag) lines.push({ text: `التصنيف: ${tag}`, mono: false })
  if (issue) {
    lines.push({ text: noteIssueSubject(issue), mono: true })
    lines.push({ text: issueValues(issue), mono: false })
    const reason = issue.lastCheck?.reason
    if (issue.status === 'needs-verification' && reason) {
      lines.push({ text: REASON_LABEL[reason], mono: false })
    }
  }
  return {
    number,
    title,
    chip: issue ? { text: STATUS_LABEL[issue.status], tone: STATUS_TONE[issue.status] } : null,
    lines,
  }
}

/**
 * قائمة الملاحظات مرقَّمةً برقم دبّوسها — ترتيب القائمة الجانبية في المحرّر نفسه (`orderedNotes`).
 *
 * **المخفيّ لا يُدرج:** ملاحظةٌ مخفيّة لا تُخبز في الصورة، وإدراجها في القائمة يُرسل ما أخفاه صاحبه قصدًا.
 * وملاحظةٌ بلا دبّوس تُذيَّل بعلامة «·» لا برقمٍ مخترَع.
 */
export function notesSection(scene: Scene, noteIssues: NoteIssues): DocBlock[] {
  const entries = orderedNotes(scene).filter((e) => !(isHideable(e.note) && e.note.hidden))
  if (entries.length === 0) return []
  const items = entries.map(({ note, pin }) => {
    const title = note.title.trim()
    const body = note.body.trim()
    return noteItem(
      pin ? formatHuman(pin.ordinal) : '·',
      title || body.split('\n', 1)[0] || 'ملاحظة فارغة',
      title ? body : body.split('\n').slice(1).join('\n').trim(),
      note.tag ? NOTE_TAG_LABEL[note.tag] : null,
      noteIssues.get(note.id),
    )
  })
  return [
    { kind: 'heading', text: `الملاحظات · ${formatHuman(entries.length)}` },
    { kind: 'items', items },
  ]
}

export interface PageMetaInput {
  readonly capture: CaptureRecord
  readonly projectName: string | null
  readonly browser: string
}

/** بيانات الصفحة: الرابط كاملًا لا مقصوصًا — الورقة لا تُمرَّر فوقها لتُقرأ بقيّته. */
export function pageMetaSection(input: PageMetaInput): DocBlock[] {
  const { capture } = input
  return [
    { kind: 'heading', text: 'بيانات الصفحة' },
    {
      kind: 'rows',
      rows: [
        { label: 'العنوان', value: capture.title || 'صفحة بلا عنوان', mono: false },
        { label: 'الرابط', value: capture.url, mono: true },
        { label: 'وقت الالتقاط', value: formatCaptureTime(capture.createdAt), mono: true },
        {
          label: 'المقاس',
          value: `${formatDimensions(capture.width, capture.height)} @${capture.devicePixelRatio}×`,
          mono: true,
        },
        { label: 'المتصفّح', value: input.browser, mono: true },
        ...(input.projectName ? [{ label: 'المشروع', value: input.projectName, mono: false }] : []),
      ],
    },
  ]
}

export interface DetailsInput extends PageMetaInput {
  readonly pageMeta: boolean
  readonly notes: boolean
  readonly scene: Scene
  readonly noteIssues: NoteIssues
}

/** صفحة التفاصيل كاملة — أو لا شيء حين لا مفتاح مفعَّل ولا ملاحظات، فلا تُضاف صفحةٌ فارغة. */
export function captureDetails(input: DetailsInput): DocBlock[] {
  const meta = input.pageMeta ? pageMetaSection(input) : []
  const notes = input.notes ? notesSection(input.scene, input.noteIssues) : []
  if (meta.length === 0 && notes.length === 0) return []
  return [
    { kind: 'title', text: input.pageMeta ? 'تفاصيل اللقطة' : 'الملاحظات', sub: null },
    ...meta,
    ...notes,
  ]
}

/** عدد الملاحظات الظاهرة — يعطّل مفتاح القائمة حين لا شيء يُدرج. */
export function visibleNoteCount(scene: Scene): number {
  return orderedNotes(scene).filter((e) => !(isHideable(e.note) && e.note.hidden)).length
}

/**
 * قاموس `Info` للقطة: عنوانها، ورابطها موضوعًا، واسم مشروعها كلمةً مفتاحية — عربيةً كما هي.
 * و`null` حين يُطلب الحذف: لا قاموس أصلًا (`modules/export/pdf.ts`).
 */
export function captureMetadata(
  capture: CaptureRecord,
  projectName: string | null,
  strip: boolean,
  now: Date,
): PdfMetadata | null {
  if (strip) return null
  return {
    title: capture.title || 'لقطة من رصد',
    subject: capture.url,
    keywords: projectName ? [projectName] : [],
    createdAt: now,
  }
}
