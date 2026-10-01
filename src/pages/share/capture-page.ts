/**
 * صفحة اللقطة المستقلّة — ملفّ HTML واحد يُفتح بلا إنترنت ([ADR 0044](../../../Docs/ADR/0044-local-share.md)).
 *
 * **أخت صفحة الدليل لا نسختها:** السياسة والتهريب وBase64 من `modules/export/guide.ts` نفسها (`GUIDE_HTML_CSP`
 * · `escapeHtml` · `base64`)، فلا تنحرف صفحتان تَعِدان بالوعد نفسه — «لا طلب شبكة من أيّ نوع». والفرق ما تحمله:
 * صورةٌ واحدة مخبوزة من البوّابة نفسها (الحجب والتعليقات فيها)، وسطرُ بياناتٍ يختار المستخدم ما يُحذف منه.
 *
 * **والحذف يسبق الكتابة لا يتبعها:** حقلٌ محذوف لا يُكتب في الصفحة ولا في عنوانها ولا في اسم ملفّها — فالعنوان
 * المحذوف لا يعود من باب اسم الملفّ.
 */

import { filenameStem } from '@/modules/export/filename'
import {
  base64,
  escapeHtml,
  GUIDE_HTML_CSP,
  type GuideHtmlColors,
  type GuideHtmlPalette,
} from '@/modules/export/guide'
import { stamp } from '@/modules/handoff/markdown'
import { formatDimensions } from '@/shared/bidi'

/** ما يُحذف من الصفحة قبل المشاركة — `true` محذوف. */
export interface ShareStrip {
  readonly url: boolean
  readonly title: boolean
  readonly time: boolean
}

/**
 * الافتراضي كما في الإطار `73:361`: الرابط والوقت يُحذفان والعنوان يبقى. **الرابط أوّل ما يُحذف:** استعلامه قد
 * يحمل رمز جلسة أو معرّف مستخدم، والمستلم لا يحتاجه ليرى الواجهة.
 */
export const DEFAULT_SHARE_STRIP: ShareStrip = { url: true, title: false, time: true }

/** الحذف الكامل — حين يفرضه «احذف البيانات الوصفية عند التصدير». */
export const STRIP_ALL: ShareStrip = { url: true, title: true, time: true }

/** عنوان الصفحة حين يُحذف عنوان اللقطة — وصفٌ لا يكشف شيئًا. */
export const ANONYMOUS_TITLE = 'لقطة من رصد'

export interface CapturePageImage {
  readonly bytes: Uint8Array
  readonly mime: 'image/png' | 'image/webp'
  readonly width: number
  readonly height: number
}

export interface CapturePageInput {
  readonly title: string
  readonly url: string
  readonly createdAt: number
  readonly image: CapturePageImage
  readonly strip: ShareStrip
  readonly palette: GuideHtmlPalette
  readonly version: string
}

/** العنوان كما يُكتب — المحذوف أو الفارغ يصير الوصف المحايد. */
export function shownTitle(title: string, strip: ShareStrip): string {
  const trimmed = title.trim()
  return strip.title || trimmed.length === 0 ? ANONYMOUS_TITLE : trimmed
}

/** اسم الملفّ من العنوان المكتوب لا الأصلي — فالمحذوف لا يتسرّب من اسمه. */
export function capturePageFilename(title: string, strip: ShareStrip): string {
  return `${filenameStem(shownTitle(title, strip))}.html`
}

/** ما بقي في الصفحة من بياناتها — سطر النتيجة يقوله كما هو. */
export function keptFields(strip: ShareStrip): readonly ('url' | 'title' | 'time')[] {
  return (['title', 'url', 'time'] as const).filter((k) => !strip[k])
}

const FIELD_LABEL = { title: 'العنوان', url: 'الرابط', time: 'الوقت' } as const

/** «محذوفة» أو «العنوان والرابط في الصفحة» — ما تعرضه النتيجة. */
export function keptLabel(strip: ShareStrip): string {
  const kept = keptFields(strip).map((k) => FIELD_LABEL[k])
  if (kept.length === 0) return 'محذوفة'
  return `${kept.join(' و')} في الصفحة`
}

function colorVars(c: GuideHtmlColors): string {
  return `--canvas:${c.canvas};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--border:${c.border}`
}

/**
 * الصفحة: `dir="rtl"`، بخطوط النظام، بوضعين فاتح وداكن، والصورة بأبعادها الصريحة فلا تقفز عند رسمها. والرابط
 * نصٌّ لا `<a>`: رابطٌ قابل للنقر طلبُ شبكة ينتظر نقرة، والصفحة تَعِد بلا شبكة.
 */
export function renderCapturePage(input: CapturePageInput): string {
  const title = escapeHtml(shownTitle(input.title, input.strip))
  const dims = escapeHtml(formatDimensions(input.image.width, input.image.height))
  const meta: string[] = []
  if (!input.strip.url && input.url) {
    meta.push(`<span dir="ltr" class="url">${escapeHtml(input.url)}</span>`)
  }
  if (!input.strip.time) meta.push(`<span dir="ltr">${escapeHtml(stamp(input.createdAt))}</span>`)
  meta.push(`<span dir="ltr">${dims}</span>`)
  const version = escapeHtml(input.version)
  const { light, dark } = input.palette

  const css = `:root{${colorVars(light)};color-scheme:light dark}@media (prefers-color-scheme:dark){:root{${colorVars(dark)}}}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--canvas);color:var(--text);font:16px/1.7 system-ui,-apple-system,"Segoe UI","Noto Sans Arabic","Geeza Pro",Tahoma,sans-serif}main{max-width:1200px;margin:0 auto;padding:32px 16px 48px}header{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)}h1{margin:0 0 4px;font-size:24px;line-height:1.4}.meta{margin:0;color:var(--muted);font-size:14px;display:flex;flex-wrap:wrap;gap:4px 12px}.url{overflow-wrap:anywhere}figure{margin:0;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px}img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:8px}footer{margin-top:32px;color:var(--muted);font-size:13px;text-align:center}@media print{:root{${colorVars(light)}}figure{border:0;padding:0}}`

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${GUIDE_HTML_CSP}">
<meta name="color-scheme" content="light dark">
<meta name="generator" content="رصد ${version}">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<main>
<header><h1 dir="auto">${title}</h1><p class="meta">${meta.join('')}</p></header>
<figure><img src="data:${input.image.mime};base64,${base64(input.image.bytes)}" width="${input.image.width}" height="${input.image.height}" alt="${title}" fetchpriority="high"></figure>
<footer>أُنشئت برصد <span dir="ltr">${version}</span> — ملفٌّ واحد يُفتح بلا إنترنت</footer>
</main>
</body>
</html>
`
}
