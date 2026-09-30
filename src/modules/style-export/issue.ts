/**
 * مخرجات لقطة المشكلة — `toCss` و`toTailwind` كما هما، ومعهما اختصارات الصندوق التي تحفظها المشكلة
 * (ADR 0036 §2).
 *
 * **لماذا ملفٌّ منفصل لا وسيطٌ في `css.ts`:** لوحة الفحص تقرأ الطويلة المنطقية (`padding-block-start`…)
 * والمشكلة تحفظ ما يكتبه المطوّر (`padding` و`margin` و`gap` و`border-radius`). و`toCss` يُسقط ما خارج
 * مجموعات اللوحة بقرارٍ محروس، و`toTailwind` لا يقابل الاختصار. وتوسيعهما يدخل `content.js` لأن الطبقة
 * تستوردهما — قِيس: 309 بايتات مضغوطة، ومعيار `STAGES/33` أن لا يتغيّر. فهنا **تركيبٌ فوقهما** تستورده صفحات
 * الإضافة وحدها، ولا يُعاد فيه قرارٌ منهما: سطر التصريح وقاعدة القيم الابتدائية (`hasValue`) منهما.
 *
 * **والجهات تبقى فيزيائية كما في الاختصار** (`pt` · `pr` · `pb` · `pl`): تحويلها منطقيةً يحتاج اتجاه الصفحة
 * ونمط كتابتها، ولم يُحفظا مع المشكلة — والتخمين يكتب `ps` حيث يلزم `pr` في صفحةٍ عربية.
 *
 * `modules/` منطق خالص: لا `chrome.*` ولا استيراد من طبقة تشغيل.
 */

import { GROUP_ORDER, INSPECT_GROUPS, type InspectSnapshot } from '@/shared/inspect-schema'

import { hasValue, toCss } from './css'
import { mapSpacing, toTailwind, type Mapped, type TailwindOutput } from './tailwind'

/** الاختصارات التي تقابلها هذه الوحدة. */
export const SHORTHANDS: ReadonlySet<string> = new Set([
  'padding',
  'margin',
  'gap',
  'border-radius',
])

/** اختصارا الصندوق وبادئتاهما. */
const BOX: Readonly<Record<string, string>> = { padding: 'p', margin: 'm' }

/**
 * يقابل اختصارًا بأدوات Tailwind v4 — `null` لما ليس اختصارًا.
 *
 * القيمة الواحدة أداةٌ واحدة، والمتناظرة محوران (`py` و`px`)، والمختلفة جهاتٌ أربع فيزيائية. وكل طولٍ يمرّ من
 * `mapSpacing` نفسه: السلّم أو القيمة الصريحة مع سببها، ولا تخمين.
 */
export function mapShorthand(prop: string, value: string, rootPx: number): Mapped[] | null {
  const v = value.trim()
  const box = BOX[prop]
  if (box) {
    const parts = v ? v.split(/\s+/u) : []
    const [t, r = t, b = t, l = r] = parts
    if (
      parts.length > 4 ||
      t === undefined ||
      r === undefined ||
      b === undefined ||
      l === undefined
    ) {
      return [{ kind: 'untranslatable', prop, value: v, why: 'اختصارٌ لا يُقرأ جهاتٍ أربعًا' }]
    }
    if (t === r && r === b && b === l) return [mapSpacing(box, t, rootPx)]
    if (t === b && r === l) {
      return [mapSpacing(`${box}y`, t, rootPx), mapSpacing(`${box}x`, r, rootPx)]
    }
    return [
      mapSpacing(`${box}t`, t, rootPx),
      mapSpacing(`${box}r`, r, rootPx),
      mapSpacing(`${box}b`, b, rootPx),
      mapSpacing(`${box}l`, l, rootPx),
    ]
  }
  if (prop === 'gap') {
    if (!v || v === 'normal') return []
    const parts = v.split(/\s+/u)
    const [row, column = row] = parts
    if (parts.length > 2 || row === undefined || column === undefined) {
      return [{ kind: 'untranslatable', prop, value: v, why: 'اختصارٌ لا يُقرأ صفًّا وعمودًا' }]
    }
    if (row === column) return [mapSpacing('gap', row, rootPx)]
    return [mapSpacing('gap-y', row, rootPx), mapSpacing('gap-x', column, rootPx)]
  }
  if (prop === 'border-radius') {
    if (!v) return []
    return [
      {
        kind: 'arbitrary',
        cls: `rounded-[${v.replace(/\s+/gu, '_')}]`,
        why: 'سلّم الحواف مسمّى — القيمة الصريحة لا تكذب',
      },
    ]
  }
  return null
}

/**
 * كتلة CSS للمشكلة: مخرج `toCss` كما هو، ثمّ ما سُمّي خارج مجموعات اللوحة بترتيب تسميته قبل القوس الأخير.
 * ما لم يُسمَّ يبقى خارجًا كما في `toCss`، والقيمة الابتدائية تُسقَط بقاعدته.
 */
export function issueCss(snapshot: InspectSnapshot, named: readonly string[]): string {
  const grouped = new Set(GROUP_ORDER.flatMap((g) => INSPECT_GROUPS[g]))
  const extra = named.flatMap((prop) => {
    const entry = snapshot.styles[prop]
    return !grouped.has(prop) && hasValue(entry) ? [`  ${prop}: ${entry.value};`] : []
  })
  const css = toCss(snapshot)
  if (extra.length === 0) return css
  const end = css.lastIndexOf('\n}')
  return `${css.slice(0, end)}\n${extra.join('\n')}${css.slice(end)}`
}

/**
 * أدوات Tailwind للمشكلة: `toTailwind` على ما ليس اختصارًا، ثمّ الاختصارات بعده بترتيبها — كلٌّ في قائمته
 * الثلاث (السلّم · الصريح · المتعذّر) كما يصنّف `toTailwind`.
 */
export function issueTailwind(
  styles: Readonly<Record<string, string>>,
  rootPx: number,
): TailwindOutput {
  const rest = Object.fromEntries(Object.entries(styles).filter(([p]) => !SHORTHANDS.has(p)))
  const base = toTailwind(rest, rootPx)
  const classes = [...base.classes]
  const arbitrary = [...base.arbitrary]
  const untranslatable = [...base.untranslatable]
  for (const [prop, value] of Object.entries(styles)) {
    for (const m of mapShorthand(prop, value, rootPx) ?? []) {
      if (m.kind === 'untranslatable') {
        untranslatable.push({ prop: m.prop, value: m.value, why: m.why })
        continue
      }
      classes.push(m.cls)
      if (m.kind === 'arbitrary') arbitrary.push({ cls: m.cls, why: m.why })
    }
  }
  return { classes, arbitrary, untranslatable, target: base.target }
}

/**
 * نصّ Tailwind للّصق بصيغة `toTailwindText` نفسها: الأصناف سطرًا، ثمّ ما تعذّر تعليقًا باسمه وسببه — فالمتعذّر
 * يُقال ولا يسقط صامتًا. ولا ملاحظات حدود: لقطة المشكلة لا تحمل حدودًا (`handoff/properties.ts`).
 */
export function issueTailwindText(out: TailwindOutput): string {
  const lines = [out.classes.join(' ')]
  if (out.untranslatable.length > 0) {
    lines.push('', `{/* بلا مقابل في Tailwind v${out.target}: */}`)
    for (const u of out.untranslatable) lines.push(`{/*   ${u.prop}: ${u.value} — ${u.why} */}`)
  }
  return lines.join('\n')
}
