/**
 * تجميع حزمة التسليم — Markdown وJSON والصور في ملفّ واحد بأسماء ثابتة (ADR 0037).
 *
 * **لا مرجع بلا ملفّ:** كل صورة يذكرها المستندان يجب أن تكون بين الصور المخبوزة بالاسم نفسه، وإلا رُفضت
 * الحزمة بأسماء ما غاب — لا حزمةٌ يفتحها المطوّر فيجد صورةً مكسورة. **ولا JSON يخالف مخطّطه:** ما يكتبه
 * العارض يقرؤه القارئ قبل أن يُكتب (ADR 0036 §4).
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`. البايتات تأتي مخبوزةً من مخرج الترميز الواحد في الصفحة.
 */

import { writeZip } from '@/modules/export/zip'
import { errText, ok, type Result } from '@/shared/result'

import { renderJson } from './json'
import { markdownImages, renderMarkdown } from './markdown'
import { parseHandoff } from './schema'

import type { HandoffModel } from './model'

export const MARKDOWN_NAME = 'rasd-handoff.md'
export const JSON_NAME = 'rasd-handoff.json'

export interface HandoffPackage {
  readonly markdown: string
  readonly json: string
  /** الحزمة كاملةً — ZIP بلا ضغط. */
  readonly bytes: Uint8Array<ArrayBuffer>
  /** ما فيها بالترتيب، وحجم كلٍّ — للعرض قبل التنزيل. */
  readonly files: readonly { readonly name: string; readonly size: number }[]
}

/** اسم الحزمة المقترَح — `rasd-handoff-2026-09-30.zip` بتاريخ المستخدم المحلّي. */
export function packageName(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `rasd-handoff-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.zip`
}

/** الصور التي يذكرها المستندان — بلا تكرار، بترتيب أوّل ذكر. */
export function referencedImages(markdown: string, json: string): string[] {
  const parsed = JSON.parse(json) as { issues?: { evidence?: { image?: string } | null }[] }
  const fromJson = (parsed.issues ?? []).flatMap((i) =>
    i.evidence?.image ? [i.evidence.image] : [],
  )
  return [...new Set([...markdownImages(markdown), ...fromJson])]
}

/**
 * يبني الحزمة من النموذج والصور المخبوزة بأسمائها.
 *
 * `images` قد تحمل ما لا يُذكر (خيار «مقتطع اللقطة» أُطفئ بعد الخبز) — فلا يُضمّ إلا المذكور.
 */
export function assembleHandoff(
  model: HandoffModel,
  images: ReadonlyMap<string, Uint8Array>,
): Result<HandoffPackage> {
  const markdown = renderMarkdown(model)
  const json = renderJson(model)

  const read = parseHandoff(JSON.parse(json))
  if (!read.ok) return read

  const referenced = referencedImages(markdown, json)
  const missing = referenced.filter((name) => !images.has(name))
  if (missing.length > 0) {
    return errText('not-found', 'صورةٌ يذكرها التسليم غائبة عن الحزمة.', missing.join(' · '))
  }

  const encoder = new TextEncoder()
  const entries = [
    { name: MARKDOWN_NAME, bytes: encoder.encode(markdown) },
    { name: JSON_NAME, bytes: encoder.encode(json) },
    ...referenced.map((name) => ({ name, bytes: images.get(name) ?? new Uint8Array() })),
  ]
  const zipped = writeZip(entries, model.generatedAt)
  if (!zipped.ok) return zipped
  return ok({
    markdown,
    json,
    bytes: zipped.value,
    files: entries.map((e) => ({ name: e.name, size: e.bytes.length })),
  })
}
