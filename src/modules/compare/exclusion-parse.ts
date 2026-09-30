/**
 * حدّ الثقة للمناطق المستثناة الواردة من الصفحة (ADR 0034) — نفس قاعدة `modules/issues/schema.ts`.
 *
 * **ما يأتي من الصفحة ليس منطقةً حتى يُثبَت.** سكربت المحتوى يعمل فوق صفحةٍ قد تكون معادية، فالقائمة
 * تُتحقَّق هنا بحدود عددٍ وطول قبل أن تُكتب مع المرجع، والمستطيلات الحيّة قبل أن تبلغ القناع.
 *
 * مفصولٌ عن `exclusions.ts` لأن ذاك تستورده الطبقة، و`valibot` لا مكان له في `content.js`: الخلفية وحدها
 * تتحقّق.
 */

import * as v from 'valibot'

import { EXCLUSION_LIMITS, type ExclusionZone } from '@/shared/exclusion-schema'
import { errText, ok, type Result } from '@/shared/result'

import type { DeviceRect } from '@/shared/geometry'

const finite = v.pipe(v.number(), v.finite())
const size = v.pipe(finite, v.minValue(0))
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(100))

const DeviceRectSchema = v.object({
  space: v.literal('device'),
  x: finite,
  y: finite,
  width: size,
  height: size,
})

const AnchorSchema = v.variant('kind', [
  v.object({ kind: v.literal('rect'), rect: DeviceRectSchema }),
  v.object({
    kind: v.literal('element'),
    selector: v.pipe(v.string(), v.minLength(1), v.maxLength(EXCLUSION_LIMITS.selector)),
    hosts: v.pipe(
      v.array(v.pipe(v.string(), v.maxLength(EXCLUSION_LIMITS.selector))),
      v.maxLength(16),
    ),
    fingerprint: v.object({
      tag: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
      attrs: v.pipe(v.array(v.pipe(v.string(), v.maxLength(128))), v.maxLength(64)),
      textHash: v.pipe(v.string(), v.regex(/^[0-9a-f]{8}$/)),
      textLength: v.pipe(finite, v.integer(), v.minValue(0)),
    }),
    rect: DeviceRectSchema,
  }),
])

const ZonesSchema = v.pipe(
  v.array(
    v.object({
      id,
      label: v.nullable(v.pipe(v.string(), v.maxLength(EXCLUSION_LIMITS.label))),
      createdAt: v.pipe(finite, v.minValue(0)),
      anchor: AnchorSchema,
    }),
  ),
  v.maxLength(EXCLUSION_LIMITS.zones),
  v.check((zones) => new Set(zones.map((z) => z.id)).size === zones.length, 'معرِّفٌ مكرَّر'),
)

const LiveRectsSchema = v.pipe(
  v.record(id, DeviceRectSchema),
  v.check((r) => Object.keys(r).length <= EXCLUSION_LIMITS.zones, 'مستطيلاتٌ فوق الحدّ'),
)

function issuesOf(error: v.BaseIssue<unknown>[]): string {
  return error
    .slice(0, 3)
    .map((i) => `${v.getDotPath(i) ?? '(الجذر)'}: ${i.message}`)
    .join(' · ')
}

/** يتحقّق من قائمة مناطق وصلت من الصفحة لتُكتب مع مرجعها — ما ليس في المخطّط يُسقَط لا يُخزَّن. */
export function parseExclusions(raw: unknown): Result<ExclusionZone[]> {
  const parsed = v.safeParse(ZonesSchema, raw)
  if (!parsed.success)
    return errText('invalid-data', 'المناطق المستثناة غير صالحة.', issuesOf(parsed.issues))
  return ok(parsed.output)
}

/** يتحقّق من مستطيلات العنصر الحيّة المرافقة لطلب الفرق — معرِّفٌ ومستطيلٌ بفضاء الجهاز لا غير. */
export function parseLiveRects(raw: unknown): Result<Record<string, DeviceRect>> {
  const parsed = v.safeParse(LiveRectsSchema, raw ?? {})
  if (!parsed.success)
    return errText('invalid-data', 'مستطيلات المناطق غير صالحة.', issuesOf(parsed.issues))
  return ok(parsed.output)
}
