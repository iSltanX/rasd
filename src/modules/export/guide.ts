/**
 * دليل الخطوات بصيغه الأربع — النموذج، وعارض Markdown، والصفحة المستقلّة، وحزمة ZIP، وتخطيط صفحات PDF
 * ([ADR 0041](../../../Docs/ADR/0041-guide-record-and-exports.md)).
 *
 * **النموذج موضع القرار الوحيد** كما في حزمة التسليم (ADR 0036 §1): عنوان كل خطوة وبديله، وهل تُرقَّم، وهل
 * تحمل ملاحظتها، واسم صورتها — يُقرَّر في `buildGuideModel` مرّةً فتخرج الصيغ الأربع واحدة.
 *
 * **ولا كاتبٌ ثانٍ:** Markdown بمهرِّبات عارض التسليم (`escapeInline` و`escapeLine`)، وZIP بكاتب الحزمة
 * (`writeZip`) وقاعدته «لا مرجع بلا ملفّ»، وPDF بصفحات `pdf-document.ts` وحاوية `pdf.ts`. والصور تصل هنا بايتاتٍ
 * مخبوزة من المخرج الواحد (ADR 0015 و0021) — هذا الملفّ لا يرمّز بكسلًا.
 *
 * **والعدّ البشري هندي، والقياس غربي:** رقم الخطوة `formatHuman`، واسم ملفّ الصورة والأبعاد والتاريخ غربية.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { stamp, escapeInline, escapeLine } from '@/modules/handoff/markdown'
import { FSI, isolate, PDI } from '@/shared/bidi/isolate'
import { countText, formatHuman, type CountForms } from '@/shared/bidi/numerals'
import { errText, ok, type Result } from '@/shared/result'

import { filenameStem } from './filename'
import { DOC_FONTS, DOC_MARGIN, layoutDocument, type DocBlock, type DocPage } from './pdf-document'
import {
  MAX_SCALE,
  PAGE_MARGIN,
  rowsPerPage,
  type BreakFinder,
  type ImageWindow,
  type PageBox,
} from './pdf-layout'
import { writeZip } from './zip'

import type { MeasureDoc } from './pdf-document'
import type { GuideExportOptions, GuideFormat, GuideStep } from '@/shared/guide-schema'

// ── النموذج ─────────────────────────────────────────────────────

/** «خطوة واحدة» · «خطوتان» · «٥ خطوات» · «١١ خطوة». */
export const STEP_FORMS: CountForms = {
  one: 'خطوة واحدة',
  two: 'خطوتان',
  many: 'خطوات',
  accusative: 'خطوة',
  singular: 'خطوة',
}

export interface GuideModelStep {
  /** رقم الخطوة من واحد — يُعرض هنديًّا حين يُطلب الترقيم. */
  readonly ordinal: number
  readonly captureId: string
  readonly title: string
  /** فارغةٌ حين أُطفئت الملاحظات أو لم تُكتب. */
  readonly note: string
  /** المسار داخل الحزمة — `images/step-01.png`؛ وفي الصفحة المستقلّة مفتاح بايتاتها. */
  readonly image: string
}

export interface GuideModel {
  readonly title: string
  readonly generatedAt: number
  /** نسخة رصد التي صدّرت الدليل. */
  readonly version: string
  readonly numbered: boolean
  readonly steps: readonly GuideModelStep[]
}

export interface GuideModelInput {
  readonly title: string
  readonly steps: readonly GuideStep[]
  /** عنوان كل لقطة بمعرّفها — بديل عنوان الخطوة الفارغ. */
  readonly captureTitles: ReadonlyMap<string, string>
  readonly options: GuideExportOptions
  readonly generatedAt: number
  readonly version: string
  /** امتداد الصور في الحزمة — PNG للحزمة، وWebP للصفحة المستقلّة. */
  readonly imageExtension?: 'png' | 'webp'
}

/** اسم صورة الخطوة داخل الحزمة — رقمٌ غربيّ مُبطَّن يرتّبها مدير الملفّات كما رُتّبت الخطوات. */
export function stepImageName(ordinal: number, total: number, extension: 'png' | 'webp'): string {
  const width = Math.max(2, String(total).length)
  return `images/step-${String(ordinal).padStart(width, '0')}.${extension}`
}

/** العنوان المعروض: ما كتبه المستخدم، وإلا عنوان صفحة اللقطة، وإلا «الخطوة ٣». */
export function stepTitle(
  step: GuideStep,
  ordinal: number,
  captureTitle: string | undefined,
): string {
  const own = step.title.trim()
  if (own) return own
  const page = captureTitle?.trim()
  return page ? page : `الخطوة ${formatHuman(ordinal)}`
}

export function buildGuideModel(input: GuideModelInput): GuideModel {
  const extension = input.imageExtension ?? 'png'
  const total = input.steps.length
  return {
    title: input.title.trim() || 'دليل بلا عنوان',
    generatedAt: input.generatedAt,
    version: input.version,
    numbered: input.options.numbered,
    steps: input.steps.map((step, i) => ({
      ordinal: i + 1,
      captureId: step.captureId,
      title: stepTitle(step, i + 1, input.captureTitles.get(step.captureId)),
      note: input.options.notes ? step.note.trim() : '',
      image: stepImageName(i + 1, total, extension),
    })),
  }
}

/** عنوان الخطوة برقمها — «١. افتح الصفحة» — أو بلاه. */
export function numberedTitle(model: GuideModel, step: GuideModelStep): string {
  return model.numbered ? `${formatHuman(step.ordinal)}. ${step.title}` : step.title
}

// ── Markdown ────────────────────────────────────────────────────

/** سطور الملاحظة كما كُتبت: كل سطرٍ مهرَّب، والفقرات بسطرٍ فارغ، والسطر داخل الفقرة بفاصلٍ صريح. */
function noteMarkdown(note: string): string {
  return note
    .split(/\r\n|\r|\n|\u2028|\u2029|\u0085/u)
    .map((line) => line.trim())
    .reduce<string[][]>(
      (paras, line) => {
        if (line === '') paras.push([])
        else paras[paras.length - 1]!.push(escapeLine(line))
        return paras
      },
      [[]],
    )
    .filter((para) => para.length > 0)
    .map((para) => para.join('\\\n'))
    .join('\n\n')
}

/**
 * المستند كاملًا. `images: false` يكتب النصّ وحده — صيغة «Markdown» المنفردة لا تحمل ملفًّا بجانبها، فمرجعٌ إلى
 * صورةٍ لا توجد كان سيُعرض صورةً مكسورة. والحزمة تكتبه بصوره.
 */
export function renderGuideMarkdown(
  model: GuideModel,
  options: { readonly images: boolean },
): string {
  const head = [
    `# ${escapeInline(model.title)}`,
    [
      `- الخطوات: ${countText(model.steps.length, STEP_FORMS)}`,
      `- أُنشئ: ${isolate(stamp(model.generatedAt))} · رصد ${isolate(model.version)}`,
    ].join('\n'),
  ].join('\n\n')

  const steps = model.steps.map((step) => {
    const sections = [`## ${escapeInline(numberedTitle(model, step))}`]
    if (step.note) sections.push(noteMarkdown(step.note))
    if (options.images) {
      const alt = escapeInline(`الخطوة ${formatHuman(step.ordinal)} — ${step.title}`)
      sections.push(`![${alt}](${step.image})`)
    }
    return sections.join('\n\n')
  })
  return `${[head, ...steps].join('\n\n')}\n`
}

// ── الحزمة ──────────────────────────────────────────────────────

export const GUIDE_MARKDOWN_NAME = 'guide.md'

export interface GuideZip {
  readonly bytes: Uint8Array<ArrayBuffer>
  readonly files: readonly { readonly name: string; readonly size: number }[]
}

/**
 * المستند وصوره في ملفٍّ واحد بكاتب حزمة التسليم. **لا مرجع بلا ملفّ:** صورةٌ يذكرها المستند غائبةٌ عن `images`
 * تُسقط الحزمة باسمها — لا حزمةٌ تُفتح على صورةٍ مكسورة.
 */
export function assembleGuideZip(
  model: GuideModel,
  images: ReadonlyMap<string, Uint8Array>,
): Result<GuideZip> {
  const missing = model.steps.filter((s) => !images.has(s.captureId)).map((s) => s.image)
  if (missing.length > 0) {
    return errText('not-found', 'صورةٌ يذكرها الدليل غائبة عن الحزمة.', missing.join(' · '))
  }
  const entries = [
    {
      name: GUIDE_MARKDOWN_NAME,
      bytes: new TextEncoder().encode(renderGuideMarkdown(model, { images: true })),
    },
    ...model.steps.map((s) => ({ name: s.image, bytes: images.get(s.captureId)! })),
  ]
  const zipped = writeZip(entries, model.generatedAt)
  if (!zipped.ok) return zipped
  return ok({
    bytes: zipped.value,
    files: entries.map((e) => ({ name: e.name, size: e.bytes.length })),
  })
}

// ── الصفحة المستقلّة ────────────────────────────────────────────

/** ألوان الصفحة بوضعيها — تُحلّ من التوكنز في صفحة الإضافة (`modules/` لا يستورد `tokens/`). */
export interface GuideHtmlColors {
  readonly canvas: string
  readonly surface: string
  readonly text: string
  readonly muted: string
  readonly border: string
  readonly accent: string
  readonly onAccent: string
}

export interface GuideHtmlPalette {
  readonly light: GuideHtmlColors
  readonly dark: GuideHtmlColors
}

export interface GuideHtmlImage {
  readonly bytes: Uint8Array
  readonly mime: 'image/png' | 'image/webp'
  readonly width: number
  readonly height: number
}

const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/gu

/** نصٌّ يدخل HTML: محارف التحكّم في الاتجاه تُحذف (لا تقلب ما بعدها)، والمحارف الخاصّة كيانات. */
export function escapeHtml(text: string): string {
  return text
    .replace(BIDI_CONTROLS, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Base64 بلا `btoa` — يعمل على البايتات مباشرةً، بلا سلسلةٍ ثنائية وسيطة بحجم الصورة. */
export function base64(bytes: Uint8Array): string {
  const out: string[] = []
  let chunk = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    chunk +=
      BASE64[(n >> 18) & 63]! +
      BASE64[(n >> 12) & 63]! +
      (b === undefined ? '=' : BASE64[(n >> 6) & 63]!) +
      (c === undefined ? '=' : BASE64[n & 63]!)
    if (chunk.length >= 8192) {
      out.push(chunk)
      chunk = ''
    }
  }
  out.push(chunk)
  return out.join('')
}

function colorVars(c: GuideHtmlColors): string {
  return `--canvas:${c.canvas};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--border:${c.border};--accent:${c.accent};--on-accent:${c.onAccent}`
}

/**
 * سياسة الصفحة: لا طلب شبكة من أيّ نوع — الصور `data:` والأنماط مضمَّنة، ولا سكربت. فالصفحة تُفتح بلا إنترنت
 * كما تُفتح معه، ولا تتّصل بشيءٍ لو فُتحت من موقعٍ يستضيفها.
 */
export const GUIDE_HTML_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

/**
 * الصفحة المستقلّة: ملفّ HTML واحد بلا اعتماد خارجي، `dir="rtl"`، بخطوط النظام، بوضعين فاتح وداكن.
 *
 * **كل خطوة `<li>` في `<ol>`** — القائمة المرتّبة معنًى يقرؤه قارئ الشاشة («قائمة من ٥ عناصر»)، والرقم المرئي
 * نصٌّ داخلها لا عدّاد CSS، فيُنسخ ويُطبع كما يُرى. والصورة بأبعادها الصريحة فلا تقفز الصفحة عند رسمها.
 */
export function renderGuideHtml(
  model: GuideModel,
  images: ReadonlyMap<string, GuideHtmlImage>,
  palette: GuideHtmlPalette,
): Result<string> {
  const missing = model.steps.filter((s) => !images.has(s.captureId)).map((s) => s.image)
  if (missing.length > 0) {
    return errText('not-found', 'صورةٌ يذكرها الدليل غائبة عن الصفحة.', missing.join(' · '))
  }
  const title = escapeHtml(model.title)
  const count = escapeHtml(countText(model.steps.length, STEP_FORMS))
  const when = escapeHtml(stamp(model.generatedAt))

  const steps = model.steps
    .map((step, i) => {
      const image = images.get(step.captureId)!
      const badge = model.numbered
        ? `<span class="n" aria-hidden="true">${formatHuman(step.ordinal)}</span>`
        : ''
      const label = model.numbered
        ? `<span class="sr">الخطوة ${formatHuman(step.ordinal)}: </span>`
        : ''
      const note = step.note ? `<p class="note" dir="auto">${escapeHtml(step.note)}</p>` : ''
      const alt = escapeHtml(`لقطة الخطوة ${formatHuman(step.ordinal)} — ${step.title}`)
      // الأولى تُفكّ مبكّرًا (أكبر ما في أوّل شاشة)، والباقية حين تقترب من الشاشة.
      const loading = i === 0 ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'
      return `<li class="step"><h2>${badge}${label}<span dir="auto">${escapeHtml(step.title)}</span></h2>${note}<img src="data:${image.mime};base64,${base64(image.bytes)}" width="${image.width}" height="${image.height}" alt="${alt}" ${loading}></li>`
    })
    .join('\n')

  const css = `:root{${colorVars(palette.light)};color-scheme:light dark}@media (prefers-color-scheme:dark){:root{${colorVars(palette.dark)}}}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--canvas);color:var(--text);font:16px/1.7 system-ui,-apple-system,"Segoe UI","Noto Sans Arabic","Geeza Pro",Tahoma,sans-serif}main{max-width:960px;margin:0 auto;padding:32px 16px 48px}header{margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}h1{margin:0 0 4px;font-size:28px;line-height:1.4}.meta{margin:0;color:var(--muted);font-size:14px}ol{list-style:none;margin:0;padding:0;display:grid;gap:20px}.step{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px}h2{display:flex;align-items:center;gap:12px;margin:0 0 8px;font-size:20px;line-height:1.5}.n{flex:none;display:inline-grid;place-items:center;min-width:32px;height:32px;padding:0 8px;border-radius:16px;background:var(--accent);color:var(--on-accent);font-size:16px}.note{margin:0 0 16px;color:var(--muted);white-space:pre-wrap}img{display:block;max-width:100%;height:auto;border:1px solid var(--border);border-radius:8px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}footer{margin-top:32px;color:var(--muted);font-size:13px;text-align:center}@media print{:root{${colorVars(palette.light)}}.step{break-inside:avoid;border:0;padding:0}}`

  const version = escapeHtml(model.version)
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${GUIDE_HTML_CSP}">
<meta name="color-scheme" content="light dark">
<meta name="generator" content="رصد ${version}">
<meta name="description" content="${title} — ${count}">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<main>
<header><h1 dir="auto">${title}</h1><p class="meta">${count} · <span dir="ltr">${when}</span></p></header>
<ol>
${steps}
</ol>
<footer>صُدِّر برصد <span dir="ltr">${version}</span></footer>
</main>
</body>
</html>
`
  return ok(html)
}

// ── PDF ─────────────────────────────────────────────────────────

/** الغلاف: العنوان وسطره، ثمّ فهرس الخطوات بعناوينها. */
export function guideCoverBlocks(model: GuideModel): DocBlock[] {
  const sub = `${countText(model.steps.length, STEP_FORMS)} · ${FSI}${stamp(model.generatedAt)}${PDI}`
  const blocks: DocBlock[] = [{ kind: 'title', text: model.title, sub }]
  if (model.numbered) {
    blocks.push({
      kind: 'items',
      items: model.steps.map((s) => ({
        number: formatHuman(s.ordinal),
        title: s.title,
        chip: null,
        lines: [],
      })),
    })
  } else {
    for (const s of model.steps) blocks.push({ kind: 'text', text: s.title })
  }
  return blocks
}

/** رأس صفحة الخطوة: رقمها وعنوانها وملاحظتها — الصورة تحته على الصفحة نفسها. */
export function stepHeaderBlocks(model: GuideModel, step: GuideModelStep): DocBlock[] {
  if (model.numbered) {
    return [
      {
        kind: 'items',
        items: [
          {
            number: formatHuman(step.ordinal),
            title: step.title,
            chip: null,
            lines: step.note ? [{ text: step.note, mono: false }] : [],
          },
        ],
      },
    ]
  }
  return [
    { kind: 'heading', text: step.title },
    ...(step.note ? [{ kind: 'text', text: step.note } as const] : []),
  ]
}

/** أسفل ما رُسم على الصفحة بالنقاط — حيث تبدأ الصورة تحت الرأس. */
export function docBottom(page: DocPage): number {
  let bottom = DOC_MARGIN
  for (const op of page.ops) {
    const y =
      op.kind === 'text'
        ? op.y + DOC_FONTS[op.font].line * 0.28
        : op.kind === 'rule'
          ? op.y
          : op.kind === 'badge'
            ? op.cy + op.r
            : op.y + op.h
    bottom = Math.max(bottom, y)
  }
  return bottom
}

/** رأس الخطوة مخطَّطًا: صفحاته (واحدة إلا لملاحظةٍ أطول من صفحة) وأسفل آخرها. */
export function layoutStepHeader(
  model: GuideModel,
  step: GuideModelStep,
  box: PageBox,
  measure: MeasureDoc,
): { readonly pages: DocPage[]; readonly bottom: number } {
  const pages = layoutDocument(stepHeaderBlocks(model, step), box, measure)
  return { pages, bottom: docBottom(pages[pages.length - 1]!) }
}

/** الفراغ بين الرأس والصورة. */
export const HEADER_GAP = 12

/** أقلّ ارتفاعٍ للصورة تحت الرأس — ما دونه تبدأ الصورة صفحتها. */
export const MIN_IMAGE_SPACE = 96

/** أدنى تصغيرٍ يُقبل لتسع الصورة تحت رأسها بدل أن تنقسم — ثلثاها بمقياس العرض الكامل. */
export const SHRINK_FLOOR = 2 / 3

export interface StepWindow {
  /** على صفحة الرأس الأخيرة، تحته — أم صفحةٌ لها وحدها. */
  readonly withHeader: boolean
  readonly window: ImageWindow
}

/**
 * نوافذ صورة الخطوة: تحت رأسها إن وسعها ما بقي، أو مصغَّرةً قليلًا لتسعه، وإلا مقسومةً على صفحاتٍ بعرض المحتوى
 * — أوّلها تحت الرأس ما دام فيه متّسع، والقطع في الفراغ بين سطرين بقاطع `pdf-layout.ts` نفسه.
 */
export async function planStepWindows(
  imageWidth: number,
  imageHeight: number,
  box: PageBox,
  headerBottom: number,
  findBreak?: BreakFinder,
): Promise<StepWindow[]> {
  const contentWidth = box.width - PAGE_MARGIN * 2
  const scale = Math.min(contentWidth / imageWidth, MAX_SCALE)
  const xFor = (s: number) => PAGE_MARGIN + (contentWidth - imageWidth * s) / 2
  const top0 = headerBottom + HEADER_GAP
  const space = box.height - PAGE_MARGIN - top0
  const drawn = imageHeight * scale

  if (drawn <= space) {
    return [
      { withHeader: true, window: { top: 0, rows: imageHeight, scale, x: xFor(scale), y: top0 } },
    ]
  }
  if (space >= MIN_IMAGE_SPACE && space / drawn >= SHRINK_FLOOR) {
    const shrunk = space / imageHeight
    return [
      {
        withHeader: true,
        window: { top: 0, rows: imageHeight, scale: shrunk, x: xFor(shrunk), y: top0 },
      },
    ]
  }

  const windows: StepWindow[] = []
  const x = xFor(scale)
  const full = rowsPerPage(scale, box)
  let top = 0
  let first = space >= MIN_IMAGE_SPACE
  while (top < imageHeight) {
    const perPage = first ? Math.max(1, Math.floor(space / scale)) : full
    const y = first ? top0 : PAGE_MARGIN
    const ideal = top + perPage
    if (ideal >= imageHeight) {
      windows.push({ withHeader: first, window: { top, rows: imageHeight - top, scale, x, y } })
      break
    }
    const earliest = Math.max(top + 1, ideal - Math.floor(perPage / 8))
    const found = findBreak ? await findBreak(earliest, ideal) : ideal
    const cut = Number.isFinite(found)
      ? Math.min(ideal, Math.max(earliest, Math.round(found)))
      : ideal
    windows.push({ withHeader: first, window: { top, rows: cut - top, scale, x, y } })
    top = cut
    first = false
  }
  return windows
}

// ── الأسماء والتقدير ────────────────────────────────────────────

const EXTENSION: Readonly<Record<GuideFormat, string>> = {
  pdf: 'pdf',
  zip: 'zip',
  markdown: 'md',
  html: 'html',
}

/** اسم الملفّ من عنوان الدليل — بقاعدة أسماء التصدير نفسها: العربية تبقى عربية. */
export function guideFilename(title: string, format: GuideFormat): string {
  return `${filenameStem(title || 'دليل')}.${EXTENSION[format]}`
}

export const MIME: Readonly<Record<GuideFormat, string>> = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  markdown: 'text/markdown;charset=utf-8',
  html: 'text/html;charset=utf-8',
}

/**
 * الحجم التقديري قبل الخبز — من بايتات الأصول المخزَّنة، لا من الناتج: **تقديرٌ يُعرض بـ«~»**، والرقم الصادق
 * تعرضه شاشة النتيجة من الملفّ المُنتَج. Markdown نصٌّ وحده؛ والصفحة تكتب الصور Base64 (أربعة لكل ثلاثة) بـWebP
 * أصغر من الأصل بنحو النصف؛ والحزمة وPDF بحجم الصور.
 */
export function estimateGuideBytes(format: GuideFormat, sourceBytes: readonly number[]): number {
  const images = sourceBytes.reduce((a, b) => a + b, 0)
  switch (format) {
    case 'markdown':
      return 1024 + sourceBytes.length * 256
    case 'html':
      return Math.round((images * 0.5 * 4) / 3) + 8192
    case 'zip':
    case 'pdf':
      return images + 4096 + sourceBytes.length * 512
  }
}

/** صفحات PDF قبل الخبز — الغلاف ثمّ صفحةٌ لكل خطوة على الأقلّ: حدٌّ أدنى كما في `estimateImagePages`. */
export function estimateGuidePages(steps: number): number {
  return Math.max(1, Math.ceil(steps / COVER_ITEMS_PER_PAGE)) + steps
}

/** بنود الفهرس في صفحة الغلاف تقريبًا — بندٌ بسطر عنوانٍ واحد في A4. */
const COVER_ITEMS_PER_PAGE = 24
