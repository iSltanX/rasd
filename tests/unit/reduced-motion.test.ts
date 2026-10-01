/**
 * `prefers-reduced-motion` يُصفّر المدد (`STAGES/24`) — الشطر الساكن من الإثبات.
 *
 * التوكنز تُصفَّر في ورقتها مرّة (`tokens.test.ts`)، فكل مدّة تمرّ منها صفر تحت التفضيل. يبقى ما لا يمرّ
 * منها: مدّةٌ حرفيّة (`200ms` · `1.6s`) في ملفّ CSS. هذا الاختبار يقرأ كل ملفّات `src/**\/*.css` ويشترط:
 *
 *  1. كل قاعدة بمدّة حرفيّة خارج `@media (prefers-reduced-motion: reduce)` لها في الملفّ نفسه قاعدة تحت
 *     التفضيل بالمحدِّد نفسه تُلغيها (`transition: none` · `animation: none` · مدّة صفر).
 *  2. المدّة الحرفيّة تحت التفضيل **استثناءٌ مسمّى**: مؤشّر التحميل يبقى يدور — إيقافه يُخفي أن شيئًا يجري.
 *  3. كل مدّة غير حرفيّة تمرّ من توكنز `--rasd-motion-duration-*` وحدها، فلا متغيّرٌ آخر يفلت من التصفير.
 *
 * ولا حركة من الشيفرة: لا `.animate(` ولا `behavior: 'smooth'` في `src/` — التمرير الناعم لا يمرّ من
 * `prefers-reduced-motion` في CSS. والشطر الحيّ (المدد المحسوبة صفرًا في كروم تحت المحاكاة) في `verify:accessibility`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return cssFiles(path)
    return name.endsWith('.css') ? [path] : []
  })
}

interface Rule {
  readonly selector: string
  readonly body: string
  readonly reduced: boolean
}

/** قواعد ملفٍّ مسطَّحةً، مع وسم ما كان داخل `@media (prefers-reduced-motion: reduce)`. */
function rulesOf(source: string): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  const walk = (text: string, reduced: boolean): void => {
    let i = 0
    while (i < text.length) {
      const open = text.indexOf('{', i)
      if (open === -1) return
      let depth = 1
      let j = open + 1
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') depth--
        j++
      }
      const head = text.slice(i, open).trim()
      const inner = text.slice(open + 1, j - 1)
      if (head.startsWith('@media'))
        walk(inner, reduced || /prefers-reduced-motion:\s*reduce/.test(head))
      else if (head.startsWith('@')) {
        // `@keyframes` وأخواتها: لا مدد فيها
      } else rules.push({ selector: head.replace(/\s+/g, ' '), body: inner, reduced })
      i = j
    }
  }
  walk(css, false)
  return rules
}

const TIME = /(?<![\w-])\d*\.?\d+m?s\b/
const MOTION_DECL = /(?:^|;|\s)(transition|animation)(?:-duration)?\s*:\s*([^;]+)/g

function motionDeclarations(body: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = []
  for (const m of body.matchAll(MOTION_DECL)) out.push({ name: m[1]!, value: m[2]!.trim() })
  return out
}

/** الاستثناءات المسمّاة: مؤشّر تحميل لا يُوقَف، ويبطؤ تحت التفضيل. */
const ESSENTIAL_MOTION = new Set(['src/ui/components/Spinner/Spinner.module.css|.svg'])

const files = cssFiles(SRC).map((path) => ({
  rel: relative(ROOT, path),
  rules: rulesOf(readFileSync(path, 'utf8')),
}))

/** `transition: none` أو `animation: none` أو مدّة صفر. */
function cancels(body: string): boolean {
  return motionDeclarations(body).some(
    (d) => /^none\b/.test(d.value) || /^0(ms|s)?\b/.test(d.value),
  )
}

describe('تقليل الحركة في ملفّات CSS', () => {
  it('الملفّات المقروءة كثيرة — لا يمرّ الاختبار على قائمة فارغة', () => {
    expect(files.length).toBeGreaterThan(80)
    const withMotion = files.filter((f) => f.rules.some((r) => motionDeclarations(r.body).length))
    expect(withMotion.length).toBeGreaterThan(15)
    const literal = files.flatMap((f) =>
      f.rules.filter(
        (r) => !r.reduced && motionDeclarations(r.body).some((d) => TIME.test(d.value)),
      ),
    )
    expect(literal.length).toBeGreaterThanOrEqual(3)
  })

  it('كل مدّة حرفيّة خارج التفضيل يُلغيها تصفيرٌ بالمحدِّد نفسه تحته', () => {
    const missing: string[] = []
    for (const f of files) {
      for (const rule of f.rules.filter((r) => !r.reduced)) {
        const literal = motionDeclarations(rule.body).filter((d) => TIME.test(d.value))
        if (!literal.length) continue
        const cancelled = f.rules.some(
          (r) =>
            r.reduced &&
            cancels(r.body) &&
            rule.selector
              .split(',')
              .every((s) => r.selector.split(',').some((t) => t.trim() === s.trim())),
        )
        if (!cancelled)
          missing.push(`${f.rel} ${rule.selector}: ${literal.map((d) => d.value).join(' | ')}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('مدّةٌ حرفيّة تحت التفضيل لا تكون إلا في الاستثناء المسمّى', () => {
    const stray: string[] = []
    for (const f of files) {
      for (const rule of f.rules.filter((r) => r.reduced)) {
        if (!motionDeclarations(rule.body).some((d) => TIME.test(d.value))) continue
        if (!ESSENTIAL_MOTION.has(`${f.rel}|${rule.selector}`))
          stray.push(`${f.rel} ${rule.selector}`)
      }
    }
    expect(stray).toEqual([])
  })

  it('كل مدّة غير حرفيّة تمرّ من توكنز المدد وحدها', () => {
    const offToken: string[] = []
    for (const f of files) {
      for (const rule of f.rules.filter((r) => !r.reduced)) {
        for (const d of motionDeclarations(rule.body)) {
          if (TIME.test(d.value) || /^none\b/.test(d.value)) continue
          const vars = [...d.value.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!)
          const durationVars = vars.filter((v) => !v.startsWith('--rasd-motion-ease'))
          if (durationVars.some((v) => !v.startsWith('--rasd-motion-duration-'))) {
            offToken.push(`${f.rel} ${rule.selector}: ${d.value}`)
          }
        }
      }
    }
    expect(offToken).toEqual([])
  })

  it('الحالة السالبة: مدّة حرفيّة بلا تصفير تُكشف', () => {
    const [bad] = rulesOf('.a { transition: opacity 200ms ease; }').filter((r) => !r.reduced)
    expect(motionDeclarations(bad!.body).some((d) => TIME.test(d.value))).toBe(true)
    const reducedOnly = rulesOf(
      '.a { transition: opacity 200ms; } @media (prefers-reduced-motion: reduce) { .b { transition: none; } }',
    )
    const hasCancel = reducedOnly.some((r) => r.reduced && r.selector === '.a' && cancels(r.body))
    expect(hasCancel).toBe(false)
  })
})

describe('لا حركة من الشيفرة', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return sources(path)
      return /\.(ts|tsx)$/.test(name) ? [path] : []
    })

  it('لا `.animate(` ولا تمريرٌ ناعم في `src/`', () => {
    const hits: string[] = []
    for (const path of sources(SRC)) {
      const text = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      if (/\.animate\(/.test(text) || /behavior:\s*['"]smooth['"]/.test(text))
        hits.push(relative(ROOT, path))
    }
    expect(hits).toEqual([])
  })
})
