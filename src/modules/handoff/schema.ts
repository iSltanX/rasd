/**
 * قارئ مخطّط `rasd.handoff/1` — الصورة التنفيذية لما نشره `Docs/Schemas/rasd.handoff-1.schema.json`
 * (ADR 0036 §4).
 *
 * **الوسم أوّل ما يُقرأ.** `rasd.handoff/N` بـ`N` أكبر من المعروف يُرفض برسالة قبل أي تحقّق: قراءةٌ ناقصة
 * لنسخةٍ لا نعرفها أسوأ من رفضٍ صريح — قاعدة `parseIssue` نفسها. **والكائنات مغلقة:** حقلٌ زائد في مخرَجنا
 * خطأٌ لا توسيعٌ صامت للعقد، إلا `properties.inspect` فعقده `rasd.inspect/1` يملكه `style-export`.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import * as v from 'valibot'

import { CHECK_KINDS, CHECK_OUTCOMES, ISSUE_STATUSES, RECHECK_REASONS } from '@/shared/issue-schema'
import { errText, ok, type Result } from '@/shared/result'

import type { HandoffJson } from './json'

export const HANDOFF_VERSION = 1

export const HANDOFF_SCHEMA = `rasd.handoff/${HANDOFF_VERSION}` as const

const instant = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u))
const number = v.pipe(v.number(), v.finite())
const size = v.pipe(number, v.minValue(0))

const BoxSchema = v.strictObject({ x: number, y: number, width: size, height: size })

const ElementSchema = v.strictObject({
  selector: v.pipe(v.string(), v.minLength(1)),
  unique: v.boolean(),
  positional: v.boolean(),
  inShadow: v.boolean(),
  hosts: v.array(v.string()),
  rect: BoxSchema,
})

const IssueSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1)),
  ordinal: v.pipe(number, v.integer(), v.minValue(1)),
  title: v.pipe(v.string(), v.minLength(1)),
  body: v.string(),
  status: v.picklist(ISSUE_STATUSES),
  createdAt: instant,
  lastCheck: v.nullable(
    v.strictObject({
      at: instant,
      outcome: v.picklist(CHECK_OUTCOMES),
      observed: v.nullable(v.string()),
      reason: v.nullable(v.picklist(RECHECK_REASONS)),
    }),
  ),
  page: v.strictObject({
    url: v.string(),
    title: v.string(),
    viewport: v.strictObject({ width: size, height: size, dpr: size }),
  }),
  element: ElementSchema,
  pair: v.nullable(ElementSchema),
  check: v.strictObject({
    kind: v.picklist(CHECK_KINDS),
    property: v.pipe(v.string(), v.minLength(1)),
    actual: v.string(),
    expected: v.pipe(v.string(), v.minLength(1)),
    tolerance: size,
    current: v.nullable(v.string()),
  }),
  steps: v.array(v.string()),
  properties: v.nullable(
    v.strictObject({
      css: v.string(),
      tailwind: v.string(),
      rootPx: size,
      palette: v.nullable(v.string()),
      inspect: v.looseObject({ schema: v.literal('rasd.inspect/1') }),
    }),
  ),
  evidence: v.nullable(
    v.strictObject({
      image: v.pipe(v.string(), v.regex(/^images\/issue-\d{2,}\.png$/u)),
      crop: v.nullable(BoxSchema),
    }),
  ),
})

const HandoffSchema = v.strictObject({
  schema: v.literal(HANDOFF_SCHEMA),
  generatedAt: instant,
  generator: v.strictObject({
    name: v.literal('rasd'),
    version: v.pipe(v.string(), v.minLength(1)),
  }),
  source: v.string(),
  options: v.strictObject({ images: v.boolean(), properties: v.boolean(), keepQuery: v.boolean() }),
  issues: v.array(IssueSchema),
})

const NOT_HANDOFF = 'هذا الملفّ ليس حزمة تسليم من رصد.'

/** يقرأ JSON حزمة تسليم. الأحدث من هذا القارئ يُرفض برسالة تقول ما يُفعل. */
export function parseHandoff(raw: unknown): Result<HandoffJson> {
  const tag = (raw as { schema?: unknown } | null)?.schema
  const m = typeof tag === 'string' ? /^rasd\.handoff\/(\d+)$/u.exec(tag) : null
  if (!m?.[1]) return errText('invalid-data', NOT_HANDOFF, `schema: ${String(tag)}`)
  const version = Number(m[1])
  if (version > HANDOFF_VERSION) {
    return errText(
      'invalid-data',
      `حزمة تسليم من نسخة أحدث (rasd.handoff/${version}) — حدّث رصد لقراءتها.`,
      `${m[0]} > ${HANDOFF_SCHEMA}`,
    )
  }
  const parsed = v.safeParse(HandoffSchema, raw)
  if (!parsed.success) {
    const where = parsed.issues
      .slice(0, 3)
      .map((i) => `${v.getDotPath(i) ?? '(الجذر)'}: ${i.message}`)
      .join(' · ')
    return errText('invalid-data', 'حزمة التسليم لا تطابق مخطّطها.', where)
  }
  return ok(parsed.output as HandoffJson)
}
