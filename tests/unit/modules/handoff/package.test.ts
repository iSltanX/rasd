import { describe, expect, it } from 'vitest'

import { buildHandoff, imagesOf } from '@/modules/handoff/model'
import {
  assembleHandoff,
  JSON_NAME,
  MARKDOWN_NAME,
  packageName,
  referencedImages,
} from '@/modules/handoff/package'

import { unzip } from '../../../helpers/unzip'

import { COLOUR_ISSUE, CONTRAST_ISSUE, KNOWN_ISSUE, META, OPTIONS, SPACING_ISSUE } from './fixture'

import type { IssueRecord } from '@/shared/issue-schema'

/**
 * الحزمة (ADR 0037): تُفكّ بأداة قياسية، وفيها Markdown وJSON وكل صورة يذكرانها بالاسم نفسه — ويسقط التجميع
 * لو غاب ملفٌّ مُشار إليه.
 */

const ALL = [KNOWN_ISSUE, SPACING_ISSUE, CONTRAST_ISSUE, COLOUR_ISSUE]

/** بايتات صورةٍ لكل لقطة دليل — محتواها لا يهمّ هنا، اسمها وحضورها يهمّان. */
function bakedFor(issues: readonly IssueRecord[], size = 2048): Map<string, Uint8Array> {
  const model = buildHandoff(issues, OPTIONS, META)
  return new Map(
    imagesOf(model).map((img, i) => [
      img.name,
      Uint8Array.from({ length: size }, (_, j) => (i * 131 + j) % 256),
    ]),
  )
}

describe('assembleHandoff', () => {
  it('تُفكّ بـ`unzip`، وفيها المستندان وكل صورة يذكرانها بالاسم نفسه ولا غيرها', () => {
    const images = bakedFor(ALL)
    const built = assembleHandoff(buildHandoff(ALL, OPTIONS, META), images)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const out = unzip(built.value.bytes)
    try {
      expect(out.test).toContain('No errors detected')
      const referenced = referencedImages(built.value.markdown, built.value.json)
      expect(referenced).toHaveLength(ALL.length)
      expect(out.names).toEqual([MARKDOWN_NAME, JSON_NAME, ...referenced])
      expect(out.read(MARKDOWN_NAME).toString('utf8')).toBe(built.value.markdown)
      expect(out.read(JSON_NAME).toString('utf8')).toBe(built.value.json)
      for (const name of referenced) {
        expect(new Uint8Array(out.read(name))).toEqual(images.get(name))
      }
      // المستندان يذكران المجموعة نفسها: لا صورة في أحدهما غائبة عن الآخر.
      const json = JSON.parse(built.value.json) as { issues: { evidence: { image: string } }[] }
      expect(new Set(json.issues.map((i) => i.evidence.image))).toEqual(new Set(referenced))
    } finally {
      out.dispose()
    }
  })

  it('السالبة: صورةٌ مذكورة غائبة تُسقط التجميع باسمها، ولا تُكتب حزمة', () => {
    const images = bakedFor(ALL)
    const [dropped] = images.keys()
    images.delete(dropped!)
    const built = assembleHandoff(buildHandoff(ALL, OPTIONS, META), images)
    expect(built.ok).toBe(false)
    if (!built.ok) {
      expect(built.error.code).toBe('not-found')
      expect(built.error.detail).toContain(dropped)
    }
  })

  it('بلا صور: لا مرجع ولا ملفّ صورة، ولو مُرِّرت صورٌ مخبوزة', () => {
    const built = assembleHandoff(
      buildHandoff(ALL, { ...OPTIONS, images: false }, META),
      bakedFor(ALL),
    )
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.value.files.map((f) => f.name)).toEqual([MARKDOWN_NAME, JSON_NAME])
  })

  it('يعرض ما فيها وحجم كلٍّ قبل التنزيل، ومجموعها دون حجم الحزمة بقدر الرؤوس وحدها', () => {
    const built = assembleHandoff(buildHandoff(ALL, OPTIONS, META), bakedFor(ALL))
    if (!built.ok) throw new Error(built.error.message)
    const sum = built.value.files.reduce((n, f) => n + f.size, 0)
    const names = built.value.files.reduce((n, f) => n + new TextEncoder().encode(f.name).length, 0)
    expect(built.value.bytes.length).toBe(sum + 76 * built.value.files.length + names * 2 + 22)
  })

  it('حزمة 20 مشكلة تُبنى في أقلّ من ثانية — النموذج والعارضان والتجميع', () => {
    const issues = Array.from({ length: 20 }, (_, i) => ({
      ...ALL[i % ALL.length]!,
      id: `issue-${i}`,
      evidence: { ...ALL[i % ALL.length]!.evidence, captureId: `capture-${i}` },
    }))
    const images = bakedFor(issues, 120_000)
    const started = performance.now()
    const built = assembleHandoff(buildHandoff(issues, OPTIONS, META), images)
    const ms = performance.now() - started
    expect(built.ok).toBe(true)
    if (built.ok) expect(built.value.files).toHaveLength(22)
    expect(ms).toBeLessThan(1000)
  })
})

describe('packageName', () => {
  it('بتاريخ المستخدم المحلّي، وبأرقام غربية', () => {
    const at = new Date(2026, 8, 30, 12, 0).getTime()
    expect(packageName(at)).toBe('rasd-handoff-2026-09-30.zip')
  })
})
