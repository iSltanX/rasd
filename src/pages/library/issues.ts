/**
 * مكتبة المشكلات — قراءتها وتصفيتها وتغييرها، منطق بلا JSX منفصل عن `parts/Issue*.tsx` عمدًا.
 *
 * نمط `context.ts` و`projects.ts` المجاورَين: يُختبَر بقاعدة وهمية بلا تركيب مكوّن، والصفحة تقرأ
 * IndexedDB مباشرةً لأنها صفحة إضافة تملك التخزين (`AGENTS.md` §4).
 *
 * **كل سجلّ مقروء يمرّ من `parseIssue`** (ADR 0030 §4): السجلّ غير المقروء أو الأحدث من هذه الإضافة لا
 * يُعرض ولا يُكتب فوقه، ويُعدّ ليقول الواجهة إن شيئًا سقط بدل أن تبدو القائمة كاملة.
 *
 * **الكتابة عبر `updateIssues` لا `get` ثم `put`:** الخلفية تكتب نتيجة إعادة الفحص من تبويب آخر بينما
 * الصفحة مفتوحة، وقراءةٌ قديمة تُكتب فوق ذلك تُضيّع حدثًا من التاريخ. `updateIssues` تقرأ وتكتب في معاملة
 * واحدة، وتمرّ من `guardWrite` كسائر المستودعات فسياسة التصفّح الخاص والحصّة تسريان.
 */

import { propertyLabel } from '@/modules/issues/labels'
import { parseIssue } from '@/modules/issues/schema'
import { withManualStatus } from '@/modules/issues/status'
import { formatHuman } from '@/shared/bidi/numerals'
import { ISSUE_LIMITS, type IssueRecord, type IssueStatus } from '@/shared/issue-schema'
import { errText, ok, type Result } from '@/shared/result'
import {
  blobs,
  captures,
  issues,
  projects,
  thumbnails,
  updateIssues,
} from '@/shared/storage/repository'

// ── القراءة ─────────────────────────────────────────────────────

export interface LoadedIssues {
  /** الأحدث تعديلًا أوّلًا. */
  readonly issues: IssueRecord[]
  /** سجلّات لم تُقرأ (تالفة أو من نسخة أحدث) — لا تُعرض، ويُقال عددها. */
  readonly unreadable: number
}

/** الأحدث تعديلًا أوّلًا، وعند التساوي الأحدث تسجيلًا — ترتيبٌ ثابت لا يتبدّل بين قراءتين. */
export function sortNewest(list: readonly IssueRecord[]): IssueRecord[] {
  return [...list].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  )
}

export async function loadIssues(): Promise<Result<LoadedIssues>> {
  const all = await issues.getAll()
  if (!all.ok) return all
  const readable: IssueRecord[] = []
  let unreadable = 0
  for (const raw of all.value) {
    const parsed = parseIssue(raw)
    if (parsed.ok) readable.push(parsed.value)
    else unreadable += 1
  }
  return ok({ issues: sortNewest(readable), unreadable })
}

/** مشكلة واحدة بمعرّفها — الغائبة `not-found` والتالفة `invalid-data` برسالتها، فيفرّق التفصيل بينهما. */
export async function loadIssue(id: string): Promise<Result<IssueRecord>> {
  const found = await issues.get(id)
  if (!found.ok) return found
  return parseIssue(found.value)
}

// ── العرض ───────────────────────────────────────────────────────

const DAY = new Intl.DateTimeFormat('ar-EG-u-nu-arab', { dateStyle: 'medium' })
const DAY_AND_TIME = new Intl.DateTimeFormat('ar-EG-u-nu-arab', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** يومٌ بأرقام هندية: التاريخ عدٌّ بشريّ لا قياس (`Docs/Design.md`، سياسة الأرقام). */
export function formatDay(at: number): string {
  return DAY.format(at)
}

/** يومٌ وساعة — للتاريخ المطلق بجوار الزمن النسبي. */
export function formatDayAndTime(at: number): string {
  return DAY_AND_TIME.format(at)
}

/**
 * هل يُفتح رابط الصفحة في تبويب؟ `http:` و`https:` وحدهما — رابطٌ محفوظٌ من صفحةٍ أخرى (`file:` أو `chrome:`
 * أو `javascript:`) لا تفتحه المكتبة بزرّ، فالمشكلة تبقى تُقرأ ولا يُفتح ما لا يُؤمَن فتحه.
 */
export function isOpenableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** هل لقطة الملاحظة المرتبطة باقية؟ حذفها يُسقط مشهدها والملاحظة معه فيُقرأ الربط «لا ملاحظة» (ADR 0030 §5). */
export async function noteAvailable(note: NonNullable<IssueRecord['note']>): Promise<boolean> {
  return (await captures.get(note.captureId)).ok
}

// ── التصفية ─────────────────────────────────────────────────────

/** «كل المشاريع» و«كل الصفحات». */
export const ANY = ''
/** «بلا مشروع» — قيمةٌ لا يبلغها معرّف مشروع (`randomUUID`). */
export const NO_PROJECT = '__none__'

export interface IssueFilters {
  readonly query: string
  /** `ANY` · `NO_PROJECT` · أو معرّف مشروع. */
  readonly project: string
  /** `ANY` أو `pageKey` — الأصل والمسار. */
  readonly page: string
  readonly status: IssueStatus | 'all'
}

export const DEFAULT_ISSUE_FILTERS: IssueFilters = {
  query: '',
  project: ANY,
  page: ANY,
  status: 'all',
}

/** مفتاح الصفحة: الأصل والمسار — بلا استعلام ولا جزء، كفهرس `origin` وحقل `path`. */
export function pageKey(page: Pick<IssueRecord['page'], 'origin' | 'path'>): string {
  return `${page.origin}${page.path}`
}

/** المضيف والمسار `northwind.example/pricing` — أصلٌ تالف يُعرض كما هو. */
export function pageLabel(page: Pick<IssueRecord['page'], 'origin' | 'path'>): string {
  let host = page.origin
  try {
    host = new URL(page.origin).host || page.origin
  } catch {
    /* يبقى الأصل كما خُزِّن */
  }
  return `${host}${page.path}`
}

/** الصفحات المتمايزة بين المشكلات، مرتَّبة بما يقرؤه المستخدم لا بمفتاحها. */
export function pageOptions(
  list: readonly IssueRecord[],
): { readonly value: string; readonly label: string }[] {
  const seen = new Map<string, string>()
  for (const issue of list) seen.set(pageKey(issue.page), pageLabel(issue.page))
  return [...seen]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** البحث في العنوان والمحدِّد والخاصية ورابط الصفحة، بلا اعتبار حالة الأحرف. */
export function matchesQuery(issue: IssueRecord, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    issue.title,
    issue.element.selector,
    issue.check.property,
    propertyLabel(issue.check),
    issue.page.url,
  ].some((field) => field.toLowerCase().includes(needle))
}

/** كل المرشّحات ما عدا الحالة — منها تُعدّ رقاقات الحالات. */
export function filterIssuesBase(
  list: readonly IssueRecord[],
  filters: IssueFilters,
): IssueRecord[] {
  return list.filter((issue) => {
    if (filters.project === NO_PROJECT && issue.projectId !== null) return false
    if (
      filters.project !== ANY &&
      filters.project !== NO_PROJECT &&
      issue.projectId !== filters.project
    ) {
      return false
    }
    if (filters.page !== ANY && pageKey(issue.page) !== filters.page) return false
    return matchesQuery(issue, filters.query)
  })
}

/** ما يُعرض في الجدول: المرشّحات كلّها، والحالة آخرها. */
export function filterIssues(list: readonly IssueRecord[], filters: IssueFilters): IssueRecord[] {
  const base = filterIssuesBase(list, filters)
  return filters.status === 'all' ? base : base.filter((issue) => issue.status === filters.status)
}

// ── الكتابة ─────────────────────────────────────────────────────

/**
 * يقرأ المشكلة ويكتب ما تُرجعه `change` في معاملة واحدة. الغائبة أو غير المقروءة لا تُكتب — والفشل يُقال
 * بسببه لا يُبتلع.
 */
async function mutate(
  id: string,
  change: (issue: IssueRecord) => IssueRecord,
): Promise<Result<IssueRecord>> {
  const written = await updateIssues([id], (raw) => {
    const parsed = parseIssue(raw)
    return parsed.ok ? change(parsed.value) : null
  })
  if (!written.ok) return written
  const [issue] = written.value
  return issue
    ? ok(issue)
    : errText('not-found', 'المشكلة لم تعد موجودة أو تعذّرت قراءتها.', `issues/${id}`)
}

/** تغيير الحالة يدويًّا بعد تحقّق المستخدم — يُكتب في التاريخ حدثًا `manual` (ADR 0030 §2). */
export function setStatus(
  id: string,
  status: IssueStatus,
  now = Date.now(),
): Promise<Result<IssueRecord>> {
  return mutate(id, (issue) => withManualStatus(issue, status, now))
}

/** إسناد المشكلة إلى مشروع أو فكّها (`null`). مشروعٌ حُذف والصفحة مفتوحة لا يُكتب معرّفًا يتيمًا. */
export async function setProject(
  id: string,
  projectId: string | null,
  now = Date.now(),
): Promise<Result<IssueRecord>> {
  if (projectId !== null) {
    const found = await projects.get(projectId)
    if (!found.ok) return errText('not-found', 'المشروع لم يعد موجودًا.', `projects/${projectId}`)
  }
  return mutate(id, (issue) =>
    issue.projectId === projectId ? issue : { ...issue, projectId, updatedAt: now },
  )
}

/**
 * خطوات الإعادة من نصٍّ بخطوة في كل سطر. السطر الفارغ يُسقط، والحدّان (عشرون خطوة × خمسمئة حرف) هما
 * حدّا مخطّط `parseIssue` — ما جاوزهما يُقال هنا بدل أن يسقط عند الكتابة برسالة غامضة.
 */
export function parseSteps(text: string): Result<string[]> {
  const steps = text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  if (steps.length > ISSUE_LIMITS.steps) {
    return errText(
      'invalid-data',
      `أكثر من ${formatHuman(ISSUE_LIMITS.steps)} خطوة — اختصر الخطوات.`,
    )
  }
  const tooLong = steps.findIndex((step) => step.length > ISSUE_LIMITS.step)
  if (tooLong !== -1) {
    return errText(
      'invalid-data',
      `الخطوة ${formatHuman(tooLong + 1)} أطول من ${formatHuman(ISSUE_LIMITS.step)} حرف.`,
    )
  }
  return ok(steps)
}

/** خطوات الإعادة تُكتب من المكتبة: نموذج الطبقة لم يعد يجمعها. */
export function setSteps(
  id: string,
  steps: readonly string[],
  now = Date.now(),
): Promise<Result<IssueRecord>> {
  return mutate(id, (issue) => {
    const same =
      issue.steps.length === steps.length && issue.steps.every((step, i) => step === steps[i])
    return same ? issue : { ...issue, steps: [...steps], updatedAt: now }
  })
}

// ── لقطة الدليل ─────────────────────────────────────────────────

export interface EvidenceImage {
  readonly blob: Blob
  /**
   * أبعاد اللقطة الأصلية حين تكون الصورة مصغَّرةً بديلةً — إحداثيات `crop` ببكسل الأصل لا المصغَّرة، فتُقاس
   * النسبة عليها. `null` للصورة الأصلية (تُقاس على أبعادها الطبيعية حين تُحمَّل)، وللمصغَّرة التي فُقد
   * سجلّ لقطتها: لا أصل يُقاس عليه فلا يُرسم إطار بمقاسٍ مخمَّن.
   */
  readonly originalSize: { readonly width: number; readonly height: number } | null
  readonly thumbnail: boolean
}

/**
 * لقطة الدليل: الأصل من `blobs`، وإلا المصغَّرة. `null` حين حُذفت من المكتبة — والمشكلة تبقى (ADR 0030 §5).
 */
export async function loadEvidence(captureId: string): Promise<EvidenceImage | null> {
  const full = await blobs.get(captureId)
  if (full.ok) return { blob: full.value.blob, originalSize: null, thumbnail: false }
  const thumb = await thumbnails.get(captureId)
  if (!thumb.ok) return null
  const capture = await captures.get(captureId)
  return {
    blob: thumb.value.blob,
    originalSize: capture.ok ? { width: capture.value.width, height: capture.value.height } : null,
    thumbnail: true,
  }
}
