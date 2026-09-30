/**
 * مخرَجا النسخ: CSS وJSON.
 *
 * **ما يُنسَخ هو المجموعة المنتقاة لا الأنماط المحسوبة كلّها.**
 * `getComputedStyle` يعدّد 2461 خاصّية في Chrome، ونسخها كلّها يعطي
 * المستخدم ألفي سطر أغلبها قيم ابتدائية لا تصف هذا العنصر بشيء — وهو مخرَج
 * لا يُلصَق في مشروع.
 *
 * **والحدود تُكتب في المخرَج نفسه لا في الواجهة وحدها.** المستخدم ينسخ
 * النصّ إلى مكان آخر، فيجب أن يحمل معه ما لم نستطع الجزم به: عنصر بلا
 * تخطيط، أو حركة جارية، أو أوراق محجوبة.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import {
  GROUP_ORDER,
  INSPECT_GROUPS,
  type InspectSnapshot,
  type StyleValue,
} from '@/shared/inspect-schema'

import { toTailwind, type TailwindOutput } from './tailwind'

/** حدود تُكتب تعليقًا في رأس المخرَج. */
function limitNotes(snapshot: InspectSnapshot): string[] {
  const out: string[] = []
  const l = snapshot.limits

  if (l.unlaid) out.push('العنصر بلا تخطيط — النسب لم تُحلّ إلى قيم مستعمَلة.')
  if (l.animating > 0) out.push(`حركة جارية على ${l.animating} خاصّية — القيم لحظية.`)
  if (l.unreadableSheets > 0) {
    out.push(
      `${l.unreadableSheets} ورقة أنماط تعذّرت قراءتها` +
        (l.unreadableOrigins.length > 0 ? ` (${l.unreadableOrigins.join('، ')})` : '') +
        ' — القيم صحيحة ومصادرها غير معروفة.',
    )
  }
  if (!l.indexComplete) out.push('فهرس القواعد غير مكتمل — مصدر بعض القيم غير محسوم.')
  if (l.interactiveStateUnknown) {
    out.push('حالات :hover و:focus و:active لم تُقيَّم تحت طبقة الفحص.')
  }
  if (l.closedShadowHost) out.push('العنصر داخل جذر ظلّ مغلق — قواعده غير مقروءة.')
  if (l.opaqueFrame) out.push('العنصر داخل إطار عابر للأصل.')
  return out
}

/** كل خاصية في مجموعات اللوحة. */
const GROUPED: ReadonlySet<string> = new Set(GROUP_ORDER.flatMap((g) => INSPECT_GROUPS[g]))

/**
 * يبني كتلة CSS جاهزة للّصق.
 *
 * المحدِّد رأسًا، والخصائص مجموعةً مجموعةً بترتيب اللوحة نفسه — فما يراه
 * المستخدم في اللوحة هو ما يجده في المخرَج.
 *
 * **و`extra` إضافةٌ مسمّاة لا بابٌ مفتوح.** ما خارج المجموعات يُسقَط كما
 * كان (نسخ كل ما يعيده `getComputedStyle` آلاف الأسطر)، إلا ما يسمّيه
 * المستدعي بعينه فيُلحق بعد المجموعات بترتيبه. لوحة الفحص لا تسمّي شيئًا؛
 * وحزمة التسليم تسمّي اختصارات لقطة المشكلة (`padding` · `margin` ·
 * `border-radius`)، وإلا خرجت بلا الخاصية التي سُجّلت عليها (ADR 0036 §2).
 */
export function toCss(snapshot: InspectSnapshot, extra: readonly string[] = []): string {
  const lines: string[] = []

  for (const note of limitNotes(snapshot)) lines.push(`/* ${note} */`)
  if (lines.length > 0) lines.push('')

  lines.push(`${snapshot.selector} {`)

  const named = extra.filter((p) => !GROUPED.has(p))
  for (const prop of [...GROUP_ORDER.flatMap((g) => INSPECT_GROUPS[g]), ...named]) {
    const entry = snapshot.styles[prop]
    if (!hasValue(entry)) continue
    const flag = entry.reliability === 'used' ? '' : `  /* ${reliabilityNote(entry)} */`
    lines.push(`  ${prop}: ${entry.value};${flag}`)
  }

  lines.push('}')
  return lines.join('\n')
}

function hasValue(entry: StyleValue | undefined): entry is StyleValue {
  if (!entry) return false
  const v = entry.value.trim()
  return v !== '' && v !== 'none' && v !== 'normal' && v !== 'auto'
}

function reliabilityNote(entry: StyleValue): string {
  return entry.reliability === 'animating' ? 'قيمة لحظية — حركة جارية' : 'العنصر بلا تخطيط'
}

/** الشكل الكامل الذي يُنسَخ JSON. */
export interface InspectJson {
  readonly schema: 'rasd.inspect/1'
  readonly at: number
  readonly element: {
    readonly tag: string
    readonly label: string
    readonly selector: string
    readonly unique: boolean
    readonly positional: boolean
    readonly inShadow: boolean
  }
  readonly rect: InspectSnapshot['rect']
  readonly styles: Readonly<Record<string, StyleValue>>
  readonly tailwind: TailwindOutput
  readonly limits: InspectSnapshot['limits']
  readonly notes: readonly string[]
}

/**
 * يبني الكائن الكامل.
 *
 * **الحدود حقلٌ فيه لا تعليق**: JSON يُقرأ آليًّا، ومن يقرؤه يجب أن يستطيع
 * التفريق بين قيمة موثوقة وأخرى لحظية بلا تحليل نصّ.
 */
export function toJson(snapshot: InspectSnapshot, rootPx: number): InspectJson {
  const plain: Record<string, string> = {}
  for (const [prop, entry] of Object.entries(snapshot.styles)) plain[prop] = entry.value

  return {
    schema: 'rasd.inspect/1',
    at: snapshot.at,
    element: {
      tag: snapshot.tag,
      label: snapshot.label,
      selector: snapshot.selector,
      unique: snapshot.unique,
      positional: snapshot.positional,
      inShadow: snapshot.inShadow,
    },
    rect: snapshot.rect,
    styles: snapshot.styles,
    tailwind: toTailwind(plain, rootPx),
    limits: snapshot.limits,
    notes: limitNotes(snapshot),
  }
}

/** نصّ Tailwind الجاهز للّصق، مع ما تعذّر. */
export function toTailwindText(snapshot: InspectSnapshot, rootPx: number): string {
  const plain: Record<string, string> = {}
  for (const [prop, entry] of Object.entries(snapshot.styles)) plain[prop] = entry.value

  const out = toTailwind(plain, rootPx)
  const lines: string[] = []

  for (const note of limitNotes(snapshot)) lines.push(`{/* ${note} */}`)
  lines.push(out.classes.join(' '))

  if (out.untranslatable.length > 0) {
    lines.push('')
    lines.push(`{/* بلا مقابل في Tailwind v${out.target}: */}`)
    for (const u of out.untranslatable) lines.push(`{/*   ${u.prop}: ${u.value} — ${u.why} */}`)
  }

  return lines.join('\n')
}
