import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { renderJson, toHandoffJson } from '@/modules/handoff/json'
import { buildHandoff } from '@/modules/handoff/model'
import { HANDOFF_SCHEMA, parseHandoff } from '@/modules/handoff/schema'

import { validate } from '../../../helpers/json-schema'

import { COLOUR_ISSUE, CONTRAST_ISSUE, KNOWN_ISSUE, META, OPTIONS, SPACING_ISSUE } from './fixture'

/**
 * JSON الحزمة عقدٌ خارجي (ADR 0036 §4): يمرّ بمخطّطه المنشور، والقارئ يرفض ما بعده برسالة.
 *
 * **المخطّط المنشور هو الحكم لا القارئ وحده:** الأداة الخارجية تقرأ `Docs/Schemas/…json` لا شيفرتنا، فمخرَجٌ
 * يقبله القارئ ويرفضه المنشور كسرٌ للعقد. والاثنان يُسقطان المخالفة نفسها — السالبة أدناه تثبت ذلك.
 */

const ROOT = process.cwd()
const SCHEMA = JSON.parse(
  readFileSync(join(ROOT, 'Docs/Schemas/rasd.handoff-1.schema.json'), 'utf8'),
) as Record<string, unknown>

const ALL = [KNOWN_ISSUE, SPACING_ISSUE, CONTRAST_ISSUE, COLOUR_ISSUE]

const output = (options = OPTIONS) =>
  JSON.parse(renderJson(buildHandoff(ALL, options, META))) as Record<string, unknown>

type Mutable = Record<string, unknown> & { issues: Record<string, unknown>[] }

describe('المخطّط المنشور rasd.handoff/1', () => {
  it('المخرَج يمرّ بالمخطّط المنشور وبالقارئ، بكل أنواع الفحص وكل تركيبات الخيارات', () => {
    for (const images of [true, false]) {
      for (const properties of [true, false]) {
        for (const keepQuery of [true, false]) {
          const json = output({ images, properties, keepQuery })
          expect(validate(SCHEMA, json)).toEqual([])
          const read = parseHandoff(json)
          expect(read.ok, read.ok ? '' : read.error.message).toBe(true)
        }
      }
    }
  })

  it('المخرَج النصّي هو الكائن نفسه، والأزمنة ISO بـUTC', () => {
    const model = buildHandoff(ALL, OPTIONS, META)
    const json = toHandoffJson(model)
    expect(JSON.parse(renderJson(model))).toEqual(json)
    expect(json.schema).toBe(HANDOFF_SCHEMA)
    expect(json.generatedAt).toBe('2026-09-30T12:00:00.000Z')
    expect(json.issues[0]?.createdAt).toBe('2026-09-28T10:12:00.000Z')
  })

  it('الرابط بلا استعلام ما لم يُطلب، والخيارات مكتوبة في المخرَج', () => {
    const plain = output() as Mutable
    const page = plain.issues[0]?.page as { url: string }
    expect(page.url).toBe('https://northwind.com/pricing')
    expect(plain.options).toEqual(OPTIONS)
    const kept = output({ ...OPTIONS, keepQuery: true }) as Mutable
    expect((kept.issues[0]?.page as { url: string }).url).toContain('?plan=pro')
  })

  it('المسافة والتباين بلا خصائص CSS حين لا تصريح فيهما، واللون يحمل لوحته', () => {
    const json = output() as Mutable
    const byId = (id: string) => json.issues.find((i) => i.id === id)!
    expect(byId(SPACING_ISSUE.id).properties).toBeNull()
    const contrast = byId(CONTRAST_ISSUE.id).properties as { css: string }
    expect(contrast.css).not.toContain('color/background-color')
    const colour = byId(COLOUR_ISSUE.id).properties as { palette: string }
    expect(colour.palette).toContain('--expected-1: #6d28d9;')
    const known = byId(KNOWN_ISSUE.id).properties as { inspect: { schema: string }; rootPx: number }
    expect(known.inspect.schema).toBe('rasd.inspect/1')
    expect(known.rootPx).toBe(16)
  })

  it('السالبة: حقلٌ غائب أو زائد أو قيمةٌ خارج مفرداتها يُسقطها المنشور والقارئ معًا', () => {
    const cases: [string, (j: Mutable) => void][] = [
      ['حقلٌ مطلوب غائب', (j) => delete j.issues[0]!.check],
      ['حقلٌ زائد', (j) => (j.issues[0]!.extra = 1)],
      ['حالةٌ خارج مفرداتها', (j) => (j.issues[0]!.status = 'closed')],
      ['زمنٌ بلا منطقة', (j) => (j.generatedAt = '2026-09-30 12:00')],
      ['صورةٌ خارج مجلّدها', (j) => (j.issues[0]!.evidence = { image: '../x.png', crop: {} })],
      ['نوع خاطئ', (j) => (j.issues[0]!.ordinal = '1')],
    ]
    for (const [name, mutate] of cases) {
      const json = output() as Mutable
      mutate(json)
      expect(validate(SCHEMA, json), name).not.toEqual([])
      expect(parseHandoff(json).ok, name).toBe(false)
    }
  })
})

describe('القارئ', () => {
  it('يرفض النسخة الأحدث برسالة تقول ماذا يفعل المستخدم', () => {
    const json = { ...output(), schema: 'rasd.handoff/2' }
    const read = parseHandoff(json)
    expect(read.ok).toBe(false)
    if (!read.ok) {
      expect(read.error.message).toContain('أحدث')
      expect(read.error.message).toContain('rasd.handoff/2')
      expect(read.error.message).toContain('حدّث')
    }
  })

  it('يرفض ما ليس حزمة تسليم — بلا وسم، أو بوسم عقدٍ آخر', () => {
    for (const raw of [null, 42, {}, { schema: 'rasd.inspect/1' }, { schema: 'rasd.handoff/x' }]) {
      const read = parseHandoff(raw)
      expect(read.ok).toBe(false)
      if (!read.ok) expect(read.error.message).toContain('ليس حزمة تسليم')
    }
  })
})

describe('الوثيقة المنشورة', () => {
  it('كل حقلٍ في المخطّط مذكورٌ في `Docs/Handoff.md` — فلا يُضاف حقلٌ بلا وثيقته', () => {
    const doc = readFileSync(join(ROOT, 'Docs/Handoff.md'), 'utf8')
    const defs = SCHEMA.$defs as Record<string, { properties?: Record<string, unknown> }>
    const keys = [
      ...Object.keys(SCHEMA.properties as object),
      ...Object.keys(defs.issue?.properties ?? {}),
      ...Object.keys(defs.element?.properties ?? {}),
    ]
    for (const key of keys) expect(doc, key).toContain(`\`${key}\``)
    expect(doc).toContain(HANDOFF_SCHEMA)
  })
})
