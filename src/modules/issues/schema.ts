/**
 * مخطّطات المشكلة — حدّ الثقة للسجلّ المقروء من القاعدة وللحمولة الواردة من الصفحة (ADR 0030).
 *
 * **ما يأتي من الصفحة ليس مشكلةً حتى يُثبَت.** سكربت المحتوى يعمل فوق صفحةٍ قد تكون معادية، فالمسودّة
 * ونتائج الفحص تُتحقَّق هنا بحدود طولٍ وعدد قبل أن تُكتب — نفس قاعدة `palette/save`. والسجلّ المقروء من
 * القاعدة يُتحقَّق كذلك: نسخةٌ أحدث من قارئها تُرفض برسالة، لأن قراءتها ناقصةً ثمّ كتابتها يُتلفها.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import * as v from 'valibot'

import {
  CHECK_KINDS,
  CHECK_OUTCOMES,
  ISSUE_LIMITS,
  ISSUE_SCHEMA_VERSION,
  ISSUE_STATUSES,
  MAX_ISSUE_HISTORY,
  MAX_RECHECK,
  RECHECK_REASONS,
  type IssueDraft,
  type IssueRecord,
  type RecheckResult,
} from '@/shared/issue-schema'
import { errText, ok, type Result } from '@/shared/result'

const finite = v.pipe(v.number(), v.finite())
const size = v.pipe(finite, v.minValue(0))
const text = (max: number) => v.pipe(v.string(), v.maxLength(max))
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(100))

const BoxSchema = v.object({ x: finite, y: finite, width: size, height: size })

const DeviceRectSchema = v.object({
  space: v.literal('device'),
  x: finite,
  y: finite,
  width: size,
  height: size,
})

const IdentitySchema = v.object({
  selector: v.pipe(v.string(), v.minLength(1), v.maxLength(ISSUE_LIMITS.selector)),
  unique: v.boolean(),
  positional: v.boolean(),
  inShadow: v.boolean(),
  hosts: v.pipe(v.array(text(ISSUE_LIMITS.selector)), v.maxLength(16)),
  fingerprint: v.object({
    tag: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
    attrs: v.pipe(v.array(text(128)), v.maxLength(64)),
    textHash: v.pipe(v.string(), v.regex(/^[0-9a-f]{8}$/)),
    textLength: v.pipe(finite, v.integer(), v.minValue(0)),
  }),
  rect: BoxSchema,
})

const CheckSchema = v.object({
  kind: v.picklist(CHECK_KINDS),
  property: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  actual: text(ISSUE_LIMITS.value),
  expected: v.pipe(v.string(), v.minLength(1), v.maxLength(ISSUE_LIMITS.value)),
  tolerance: v.pipe(finite, v.minValue(0), v.maxValue(1000)),
})

const SnapshotSchema = v.pipe(
  v.record(v.pipe(v.string(), v.maxLength(64)), text(ISSUE_LIMITS.value)),
  v.check((r) => Object.keys(r).length <= ISSUE_LIMITS.snapshot, 'لقطة فحص أكبر من حدّها'),
)

const status = v.picklist(ISSUE_STATUSES)
const outcome = v.picklist(CHECK_OUTCOMES)
const reason = v.nullable(v.picklist(RECHECK_REASONS))
const observed = v.nullable(text(ISSUE_LIMITS.value))

const HistorySchema = v.variant('kind', [
  v.object({ kind: v.literal('created'), at: finite, status, observed: text(ISSUE_LIMITS.value) }),
  v.object({ kind: v.literal('check'), at: finite, status, outcome, observed, reason }),
  v.object({ kind: v.literal('manual'), at: finite, status }),
])

const IssueSchema = v.object({
  id,
  schemaVersion: v.literal(ISSUE_SCHEMA_VERSION),
  projectId: v.nullable(id),
  createdAt: finite,
  updatedAt: finite,
  page: v.object({
    url: text(4096),
    origin: text(1024),
    path: text(4096),
    title: text(1024),
    viewport: v.object({ width: size, height: size, dpr: v.pipe(finite, v.minValue(0.1)) }),
  }),
  element: IdentitySchema,
  pair: v.nullable(IdentitySchema),
  check: CheckSchema,
  status,
  lastCheck: v.nullable(v.object({ at: finite, outcome, observed, reason })),
  history: v.pipe(v.array(HistorySchema), v.maxLength(MAX_ISSUE_HISTORY)),
  evidence: v.object({ captureId: id, snapshot: SnapshotSchema, crop: BoxSchema }),
  note: v.nullable(v.object({ captureId: id, noteId: id })),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(ISSUE_LIMITS.title)),
  body: text(ISSUE_LIMITS.body),
  steps: v.pipe(v.array(text(ISSUE_LIMITS.step)), v.maxLength(ISSUE_LIMITS.steps)),
})

const DraftSchema = v.pipe(
  v.object({
    element: IdentitySchema,
    pair: v.nullable(IdentitySchema),
    check: CheckSchema,
    snapshot: SnapshotSchema,
    title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(ISSUE_LIMITS.title)),
    body: text(ISSUE_LIMITS.body),
    steps: v.pipe(v.array(text(ISSUE_LIMITS.step)), v.maxLength(ISSUE_LIMITS.steps)),
    projectId: v.nullable(id),
    withNote: v.boolean(),
    shot: v.object({
      rect: DeviceRectSchema,
      element: DeviceRectSchema,
      dpr: v.pipe(finite, v.minValue(0.1), v.maxValue(16)),
    }),
    viewport: v.object({ width: size, height: size }),
  }),
  v.check(
    (d) => (d.check.kind === 'spacing') === (d.pair !== null),
    'فحص المسافة وحده يحمل عنصرًا ثانيًا',
  ),
)

const RecheckSchema = v.pipe(
  v.array(v.object({ id, outcome, observed, reason })),
  v.maxLength(MAX_RECHECK),
)

function issuesOf(error: v.BaseIssue<unknown>[]): string {
  return error
    .slice(0, 3)
    .map((i) => `${v.getDotPath(i) ?? '(الجذر)'}: ${i.message}`)
    .join(' · ')
}

/** يتحقّق من سجلّ مقروء من القاعدة. الأحدث من قارئه يُرفض صراحةً. */
export function parseIssue(raw: unknown): Result<IssueRecord> {
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion
  if (typeof version === 'number' && version > ISSUE_SCHEMA_VERSION) {
    return errText(
      'invalid-data',
      'سجلّ مشكلة من نسخة أحدث من هذه الإضافة — حدّثها لقراءته.',
      `schemaVersion ${version} > ${ISSUE_SCHEMA_VERSION}`,
    )
  }
  const parsed = v.safeParse(IssueSchema, raw)
  if (!parsed.success)
    return errText('invalid-data', 'سجلّ مشكلة غير مقروء.', issuesOf(parsed.issues))
  return ok(parsed.output as IssueRecord)
}

/** يتحقّق من مسودّة وصلت من الصفحة. */
export function parseDraft(raw: unknown): Result<IssueDraft> {
  const parsed = v.safeParse(DraftSchema, raw)
  if (!parsed.success)
    return errText('invalid-data', 'بيانات المشكلة غير صالحة.', issuesOf(parsed.issues))
  return ok(parsed.output as IssueDraft)
}

/** يتحقّق من نتائج جولة فحص وصلت من الصفحة. */
export function parseRecheck(raw: unknown): Result<RecheckResult[]> {
  const parsed = v.safeParse(RecheckSchema, raw)
  if (!parsed.success)
    return errText('invalid-data', 'نتائج الفحص غير صالحة.', issuesOf(parsed.issues))
  return ok(parsed.output)
}
