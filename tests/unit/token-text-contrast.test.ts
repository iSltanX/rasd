/**
 * تباين أدوار النصّ مع كل سطوح الواجهة، بالوضعين (`STAGES/24`، `Docs/Engineering.md §6` صفّ 10).
 *
 * الصفّ 10 سجّل `--rasd-text-tertiary` بتباين 4.04–4.35 على الفاتح. حُسم في ترقية التوكنز (`#52636d`)، ويثبّته
 * هذا الاختبار على **المصدر المولَّد** `public/assets/tokens.css` لا على لقطةٍ من مشهد: كل دور نصّ (`primary` ·
 * `secondary` · `tertiary`) على كل سطح (`canvas` · `default` · `raised` · `overlay` · `sunken` · `hover` ·
 * `pressed` · `selected`) ≥ 4.5:1 — حدّ AA لنصّ عادي الحجم. وaxe لا يرى إلا ما رُسم في مشهد، فزوجٌ لم يُرسَم
 * بعد (نصّ ثالثي على سطح مضغوط) يمرّ منه ويسقط هنا.
 *
 * **استثناءٌ مسمّى واحد:** `tertiary` على `pressed` في الفاتح 4.49:1. حالة انتقالية (لحظة الضغط)، والتوكنز
 * مولَّدة من لقطة Figma فلا تعديل يدوي عليها (ADR 0007) — تغيير قيمتها قرار تصميم. والاختبار يُسقط حين يبلغ
 * الزوج 4.5، فيُحذف الاستثناء ولا يبقى مُعلَنًا بلا موضوع.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '..', '..', 'public', 'assets', 'tokens.css'), 'utf8')

const primitives = new Map<string, string>()
for (const m of css.matchAll(/--rasd-color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
  primitives.set(m[1]!, m[2]!)
}

/** كتلة دلالية: من `--rasd-surface-canvas` حتى أوّل `}` — في `:root` الداكن، وفي الفاتحَين. */
function semanticBlocks(): Map<string, Map<string, string>> {
  const lines = css.split('\n')
  const blocks = new Map<string, Map<string, string>>()
  const starts = lines.flatMap((l, i) => (l.includes('--rasd-surface-canvas:') ? [i] : []))
  expect(starts).toHaveLength(3)
  const names = ['dark', 'light (النظام)', 'light (صريح)']
  starts.forEach((start, n) => {
    const vars = new Map<string, string>()
    for (let i = start; i < lines.length && !/^\s*}/.test(lines[i]!); i++) {
      const m = lines[i]!.match(/(--rasd-[a-z0-9-]+):\s*(.+);/)
      if (m) vars.set(m[1]!, m[2]!)
    }
    blocks.set(names[n]!, vars)
  })
  return blocks
}

function resolve(value: string): string {
  const m = value.match(/^var\(--rasd-color-([a-z0-9-]+)\)$/)
  const hex = m ? primitives.get(m[1]!) : value.match(/^#[0-9a-fA-F]{6}$/)?.[0]
  if (!hex) throw new Error(`قيمة لا تُحلّ إلى لون: ${value}`)
  return hex
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const TEXTS = ['primary', 'secondary', 'tertiary'] as const
const SURFACES = [
  'canvas',
  'default',
  'raised',
  'overlay',
  'sunken',
  'hover',
  'pressed',
  'selected',
] as const
const KNOWN_GAP = new Set(['light (النظام)|tertiary|pressed', 'light (صريح)|tertiary|pressed'])

describe('تباين أدوار النصّ مع السطوح', () => {
  const blocks = semanticBlocks()

  it('الكتل الثلاث مقروءة بأدوارها كلّها', () => {
    expect([...blocks.keys()]).toEqual(['dark', 'light (النظام)', 'light (صريح)'])
    for (const vars of blocks.values()) {
      for (const t of TEXTS) expect(vars.has(`--rasd-text-${t}`)).toBe(true)
      for (const s of SURFACES) expect(vars.has(`--rasd-surface-${s}`)).toBe(true)
    }
  })

  for (const [mode, vars] of blocks) {
    it(`${mode}: كل دور نصّ على كل سطح ≥ 4.5:1 عدا الاستثناء المسمّى`, () => {
      const below: string[] = []
      for (const t of TEXTS) {
        for (const s of SURFACES) {
          const ratio = contrast(
            resolve(vars.get(`--rasd-text-${t}`)!),
            resolve(vars.get(`--rasd-surface-${s}`)!),
          )
          const key = `${mode}|${t}|${s}`
          if (KNOWN_GAP.has(key)) {
            // الاستثناء يبقى صادقًا: دون الحدّ فعلًا، وبفارقٍ ضئيل.
            expect(ratio, key).toBeLessThan(4.5)
            expect(ratio, key).toBeGreaterThan(4.4)
          } else if (ratio < 4.5) below.push(`${t} على ${s}: ${ratio.toFixed(2)}`)
        }
      }
      expect(below).toEqual([])
    })
  }

  it('الحالة السالبة: دالّة التباين تكشف زوجًا دون الحدّ', () => {
    // رمادي `#9baeb9` على الأبيض (النصّ الثالثي الداكن على سطح فاتح) = 2.4:1
    expect(contrast('#9baeb9', '#ffffff')).toBeLessThan(3)
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })
})
