/**
 * خصائص المشكلة بصيغها الثلاث — من `style-export` نفسه لا من عارضٍ موازٍ (ADR 0036 §2).
 *
 * لقطة الفحص المحفوظة مع المشكلة (`evidence.snapshot`) اسمٌ وقيمة، و`toCss` و`toTailwindText` و`toJson`
 * تأخذ `InspectSnapshot` كاملة. فهذا الملفّ يبني منها لقطةً بقيمٍ «مستعملة» وحدودٍ فارغة، ويمرّرها كما هي.
 *
 * `modules/` منطق خالص: لا DOM ولا `chrome.*`.
 */

import { exportPalette } from '@/modules/colour/export'
import { formatColour, readColour } from '@/modules/colour/formats'
import { toCss, toJson, toTailwindText, type InspectJson } from '@/modules/style-export/css'
import { EMPTY_LIMITS, type InspectSnapshot } from '@/shared/inspect-schema'
import { CONTRAST_PROPERTY, SPACING_PROPERTIES, type IssueRecord } from '@/shared/issue-schema'

/**
 * خطّ الجذر المفترَض — لم يُحفظ مع المشكلة، فيُكتب الافتراض في المخرَج (`rootPx`) ولا يُدّعى أنه قُرئ.
 */
export const ASSUMED_ROOT_PX = 16

export interface HandoffProperties {
  readonly css: string
  readonly tailwind: string
  readonly rootPx: number
  /** اللون المتوقَّع متغيّرَ CSS — للمشكلة اللونية وحدها، وإلا `null`. */
  readonly palette: string | null
  readonly inspect: InspectJson
}

/** مفاتيح اللقطة التي ليست خصائص CSS: جوانب الفجوة بين عنصرين، ونسبة التباين. */
const NOT_CSS: ReadonlySet<string> = new Set([...SPACING_PROPERTIES, CONTRAST_PROPERTY])

/**
 * اللقطة بالشكل الذي يقرؤه `style-export`.
 *
 * **الحدود فارغة و`indexComplete` صادقة بمعناها هنا:** الحدود تصف مصادر القيم في لوحة الفحص (أوراقٌ محجوبة،
 * فهرس قواعد ناقص)، والمشكلة لم تحفظ مصادر أصلًا ولا تعرضها — فلا ملاحظة عن مصدرٍ لا يُعرض. والموضع
 * `x`/`y` هو موضع المستند: إزاحة النافذة وقت التسجيل لم تُحفظ (`Docs/Handoff.md`).
 */
export function snapshotOf(issue: IssueRecord): InspectSnapshot | null {
  const entries = Object.entries(issue.evidence.snapshot).filter(([prop]) => !NOT_CSS.has(prop))
  if (entries.length === 0) return null
  const { rect } = issue.element
  return {
    at: issue.createdAt,
    tag: issue.element.fingerprint.tag,
    label: issue.element.selector,
    selector: issue.element.selector,
    unique: issue.element.unique,
    positional: issue.element.positional,
    inShadow: issue.element.inShadow,
    rect: { ...rect, pageX: rect.x, pageY: rect.y },
    styles: Object.fromEntries(
      entries.map(([prop, value]) => [prop, { value, reliability: 'used' as const }]),
    ),
    limits: { ...EMPTY_LIMITS, indexComplete: true },
  }
}

/** اللون المتوقَّع متغيّرًا عبر `exportPalette` — `null` لغير اللون أو لمتوقَّعةٍ لا تُقرأ لونًا. */
function paletteOf(issue: IssueRecord): string | null {
  if (issue.check.kind !== 'colour') return null
  const reading = readColour(issue.check.expected.trim())
  if (!reading) return null
  const swatch = { hex: formatColour(reading).hex, share: 0, count: 0, neutral: false }
  return exportPalette([swatch], 'css', { prefix: 'expected' })
}

/** الخصائص بصيغها الثلاث، أو `null` حين لا خاصية CSS في لقطة المشكلة (المسافة). */
export function issueProperties(issue: IssueRecord): HandoffProperties | null {
  const snapshot = snapshotOf(issue)
  if (!snapshot) return null
  return {
    css: toCss(snapshot, Object.keys(snapshot.styles)),
    tailwind: toTailwindText(snapshot, ASSUMED_ROOT_PX),
    rootPx: ASSUMED_ROOT_PX,
    palette: paletteOf(issue),
    inspect: toJson(snapshot, ASSUMED_ROOT_PX),
  }
}
