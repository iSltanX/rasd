/**
 * عارض Markdown لحزمة التسليم — ما يقرؤه المطوّر ويُلصق في مساعد برمجة كما هو (ADR 0036 §3).
 *
 * **يقرأ النموذج وحده.** قرارات المحتوى في `model.ts`؛ وهنا الصياغة: ترتيب الأقسام، وعزل القيم التقنية،
 * وحراسة ما كتبته الصفحة من أن يكسر المستند.
 *
 * وثلاث أدوات مصدَّرة (`codeSpan` و`codeFence` و`escapeInline`/`escapeLine`) يعيدها عارض الدليل في 06 ونصّ
 * الـIssue في 12 — لا مهرِّبٌ ثانٍ.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import {
  displayExpected,
  displayTolerance,
  displayValue,
  ISSUE_FORMS,
  KIND_LABEL,
  OUTCOME_LABEL,
  propertyLabel,
  REASON_LABEL,
  STATUS_LABEL,
} from '@/modules/issues/labels'
import { TAILWIND_TARGET } from '@/modules/style-export/tailwind'
import { FSI, isolate, PDI } from '@/shared/bidi/isolate'
import { countText, formatHuman } from '@/shared/bidi/numerals'

import { HANDOFF_SCHEMA } from './schema'

import type { HandoffElement, HandoffEntry, HandoffModel } from './model'
import type { IssueCheck } from '@/shared/issue-schema'

// ── الحراسة ─────────────────────────────────────────────────────

/**
 * ما يكسر السطر: الأسطر الجديدة الثلاثة، وفواصل يونيكود (`U+2028` · `U+2029` · `U+0085`) التي يعرضها محرّرٌ
 * سطرًا جديدًا ويعدّها `$` في تعبيرٍ بعلَم `m` نهاية سطر (المراجعة المستقلّة).
 */
const NEWLINES = /\r\n|\r|\n|\u2028|\u2029|\u0085/gu

/**
 * محارف التحكّم في الاتجاه — التضمين والتجاوز (`U+202A`–`U+202E`) والعزل (`U+2066`–`U+2069`). تُحذف من كل نصٍّ
 * يدخل المستند: `PDI` في عنوان صفحةٍ يُغلق عزلنا مبكّرًا، و`RLO` بعده يقلب بقيّة السطر.
 */
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/gu

const clean = (text: string): string => text.replace(BIDI_CONTROLS, '')

/** أطول سلسلة `` ` `` متّصلة في النصّ. */
function longestTicks(text: string): number {
  let longest = 0
  for (const run of text.matchAll(/`+/gu)) longest = Math.max(longest, run[0].length)
  return longest
}

/**
 * مقطعٌ برمجيّ سطريّ يتّسع لما فيه: سياجه أطول من أطول سلسلة `` ` `` داخله، ومسافةٌ حوله إن بدأ أو انتهى
 * بها (CommonMark). والسطر الجديد يُطوى مسافة — القيمة السطرية لا تكسر القائمة.
 */
export function codeSpan(text: string): string {
  const flat = clean(text).replace(NEWLINES, ' ')
  if (flat === '') return '` `'
  const fence = '`'.repeat(longestTicks(flat) + 1)
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${flat}${pad}${fence}`
}

/**
 * كتلةٌ برمجية سياجها أطول من أطول سلسلة داخلها، وثلاث علامات على الأقلّ.
 *
 * ومحتواها يحمل ما كتبته الصفحة (المحدِّد رأسًا لكتلة CSS)، فتُحذف منه محارف التحكّم في الاتجاه — شيفرةٌ يقلب
 * `RLO` عرضها غير ما تُنفَّذ به (Trojan Source) — وتُطوى فواصل يونيكود مسافةً. والسطر الجديد الحقيقي باقٍ.
 */
export function codeFence(text: string, lang: string): string {
  const body = clean(text).replace(/[\u2028\u2029\u0085]/gu, ' ')
  const fence = '`'.repeat(Math.max(3, longestTicks(body) + 1))
  return `${fence}${lang}\n${body}\n${fence}`
}

/** ما له معنى في Markdown داخل السطر — يُسبَق بشرطة مائلة فيُقرأ حرفًا. */
const INLINE_SPECIAL = /[\\`*_[\]<>|~]/gu

/** نصٌّ حرّ في سطر: المحارف الخاصّة مهرَّبة، والسطر الجديد مطويّ. */
export function escapeInline(text: string): string {
  return clean(text).replace(NEWLINES, ' ').replace(INLINE_SPECIAL, '\\$&')
}

/**
 * سطرٌ يبدأ به بناءٌ في Markdown: عنوان (`#`)، أو قائمة (`-` و`+` و`1.`)، أو خطّ عنوانٍ تحتي (`=`)، أو كتلة
 * برمجية بالإزاحة — يُعطَّل أوّله فيبقى نصًّا.
 */
export function escapeLine(text: string): string {
  return escapeInline(text.trimStart())
    .replace(/^([#=+-])/u, '\\$1')
    .replace(/^(\d{1,9})([.)])/u, '$1\\$2')
}

/** قيمةٌ تقنية تُنسخ: مقطعٌ برمجيّ، والعزل خارجه — فما يُنسخ من داخله نظيفٌ بلا محارف خفيّة. */
const code = (text: string): string => isolate(codeSpan(text))

/**
 * نصٌّ كتبته الصفحة وقد يكون عربيًّا أو لاتينيًّا — عنوان التبويب: مقطعٌ برمجيّ معزولٌ باتجاه أوّل حرفٍ قويّ فيه.
 * **مقطعٌ لا نصٌّ مهرَّب:** الروابط التلقائية في GFM (`https://…` و`www.`) تعمل في النصّ المهرَّب ولا تعمل في المقطع.
 */
const loose = (text: string): string => `${FSI}${codeSpan(text)}${PDI}`

/** اللحظة بـUTC صراحةً: `2026-09-30 12:00 UTC`. */
export function stamp(at: number): string {
  return `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

// ── الأقسام ─────────────────────────────────────────────────────

function fragility(element: HandoffElement): string {
  const notes = [element.unique ? 'فريد' : 'يطابق أكثر من عنصر']
  if (element.positional) notes.push('موضعيّ (يتبع ترتيب العناصر)')
  if (element.inShadow) {
    notes.push(
      element.hosts.length > 0
        ? `داخل Shadow DOM عبر ${element.hosts.map(code).join(' › ')}`
        : 'داخل Shadow DOM',
    )
  }
  return notes.join(' · ')
}

/** القيمة كما تُكتب في السطر: تصريحٌ للنمط واللون، وقيمةٌ للمسافة، ونسبةٌ للتباين. */
function valueText(check: IssueCheck, value: string | null): string {
  if (value === null || value === '') return '—'
  if (check.kind === 'contrast') return code(displayValue('contrast', value))
  if (check.kind === 'spacing') return code(value)
  return code(`${check.property}: ${value}`)
}

function expectedText(check: IssueCheck): string {
  if (check.kind === 'contrast') return code(displayExpected(check))
  if (check.kind === 'spacing') return code(check.expected)
  return code(`${check.property}: ${check.expected}`)
}

function checkLine(check: IssueCheck): string {
  const property =
    check.kind === 'spacing'
      ? `${propertyLabel(check)} ${code(check.property)}`
      : code(propertyLabel(check))
  const tolerance = displayTolerance(check)
  const allowed = tolerance === '—' ? '' : ` · السماح ${isolate(tolerance)}`
  return `- الفحص: ${KIND_LABEL[check.kind]} · ${property}${allowed}`
}

function statusLine(entry: HandoffEntry): string {
  const last = entry.lastCheck
  const checked = last
    ? `آخر فحص ${isolate(stamp(last.at))} — ${last.reason ? REASON_LABEL[last.reason] : OUTCOME_LABEL[last.outcome]}`
    : 'لم تُفحص بعد'
  return `- الحالة: ${STATUS_LABEL[entry.status]} · ${checked}`
}

function facts(entry: HandoffEntry): string {
  const { page, check } = entry
  const { viewport } = page
  const lines = [
    statusLine(entry),
    `- الصفحة: ${code(page.url)}${page.title ? ` — ${loose(page.title)}` : ''}`,
    `- المقاس: ${isolate(`${viewport.width} × ${viewport.height} · DPR ${viewport.dpr}`)} · سُجّلت ${isolate(stamp(entry.createdAt))}`,
    `- المحدِّد: ${code(entry.element.selector)} — ${fragility(entry.element)}`,
  ]
  if (entry.pair) {
    lines.push(`- العنصر الثاني: ${code(entry.pair.selector)} — ${fragility(entry.pair)}`)
  }
  lines.push(checkLine(check), `- الآن: ${valueText(check, check.current)}`)
  // القيمة وقت التسجيل تُذكر حين تغيّر ما رُصد بعدها — وإلا فهي «الآن» نفسها.
  if (entry.lastCheck && check.current !== check.actual) {
    lines.push(`- عند التسجيل: ${valueText(check, check.actual)}`)
  }
  lines.push(`- المتوقَّع: ${expectedText(check)}`)
  return lines.join('\n')
}

function quote(body: string): string {
  return body
    .split(NEWLINES)
    .map((line) => (line.trim() ? `> ${escapeLine(line)}` : '>'))
    .join('\n')
}

function properties(entry: HandoffEntry): string | null {
  const props = entry.properties
  if (!props) return null
  const blocks = [
    '### الخصائص',
    'CSS:',
    codeFence(props.css, 'css'),
    `Tailwind v${TAILWIND_TARGET} — على أساس ${isolate(`1rem = ${props.rootPx}px`)} مفترَضًا:`,
    codeFence(props.tailwind, 'text'),
  ]
  if (props.palette) blocks.push('اللون المتوقَّع متغيّرًا:', codeFence(props.palette, 'css'))
  return blocks.join('\n\n')
}

function entryText(entry: HandoffEntry): string {
  const sections: (string | null)[] = [
    `## ${formatHuman(entry.ordinal)}. ${escapeInline(entry.title)}`,
    facts(entry),
    entry.body.trim() ? quote(entry.body) : null,
    entry.steps.length > 0
      ? `### خطوات الإعادة\n\n${entry.steps.map((step, i) => `${i + 1}. ${escapeLine(step)}`).join('\n')}`
      : null,
    properties(entry),
    entry.image
      ? `### الدليل\n\n![مقتطع حول ${isolate(escapeInline(entry.element.selector))}](${entry.image.name})`
      : null,
  ]
  return sections.filter((s): s is string => s !== null).join('\n\n')
}

/** المستند كاملًا: الرأس، ثمّ المشكلات بترتيبها. */
export function renderMarkdown(model: HandoffModel): string {
  const head = [
    '# حزمة التسليم — رصد',
    [
      `- المصدر: ${escapeInline(model.source)}`,
      `- المشكلات: ${countText(model.entries.length, ISSUE_FORMS)}`,
      `- أُنشئت: ${isolate(stamp(model.generatedAt))} · رصد ${isolate(model.version)} · ${code(HANDOFF_SCHEMA)}`,
    ].join('\n'),
  ].join('\n\n')
  return `${[head, ...model.entries.map(entryText)].join('\n\n')}\n`
}

/**
 * مسارات الصور التي يذكرها المستند — لفحص الحزمة: لا مرجع بلا ملفّ.
 *
 * سطر الصورة يبدأ بـ`![` وينتهي بهدفها، والنصّ البديل قد يحمل `](` من محدِّدٍ مهرَّب — فالهدف آخر السطر لا
 * أوّل قوسٍ فيه.
 */
export function markdownImages(markdown: string): string[] {
  // أسطر CommonMark وحدها (`\n` · `\r\n` · `\r`) — لا علَم `m` الذي يعدّ `U+2028` نهاية سطر.
  return markdown.split(/\r\n|\r|\n/u).flatMap((line) => {
    const m = /^!\[[^\n]*\]\(([^()\s]+)\)$/u.exec(line)
    return m?.[1] ? [m[1]] : []
  })
}
