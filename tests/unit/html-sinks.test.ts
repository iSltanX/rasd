// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { codeOnly } from '../helpers/code-only'

/**
 * **لا مَصبَّ HTML ولا تقييم نصٍّ في `src/` إلا ما سُمّي هنا بسببه** (`STAGES/25`، ADR 0056).
 *
 * رصد يقرأ صفحاتٍ لا يملكها — عناوينها ونصوصها وأسماء أصنافها — ويعرض ما قرأه في طبقته وصفحاته. فنصٌّ من صفحةٍ
 * معادية يصير شيفرةً في أصل الإضافة إن مرّ من مَصبٍّ يفسّره HTML. والواجهة كلّها Preact يهرّب ما يكتبه، وما يُبنى
 * نصًّا (صفحة المشاركة ودليل HTML) يمرّ من `escapeHtml` ومحروسٌ بحالاتٍ معادية في اختباراته — فهذا يمسح ما بقي:
 * كل `innerHTML` و`outerHTML` و`insertAdjacentHTML` و`dangerouslySetInnerHTML` و`document.write` و`srcdoc` و
 * `createContextualFragment` و`setHTMLUnsafe` و`parseHTMLUnsafe` و`DOMParser`، وكل `eval` و`new Function`.
 *
 * **سلكُ إنذارٍ لا حدّ**، كنظيره `egress-single-exit.test.ts`: الوصول المحسوب (`el['inner' + 'HTML']`) لا يراه. والحدّ
 * الثاني سياسة أمن المحتوى في البيان: لا `unsafe-eval` ولا `unsafe-inline`. وما في القائمة يُعدّ، فمَصبٌّ ثانٍ في ملفٍّ
 * مسموح يُسقطه أيضًا. **ويحمرّ:** أُضيف `el.innerHTML = title` إلى ملفٍّ في `src/` فسقط باسمه (سجلّ `STAGES/25`).
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url))

const ALLOWED: Record<string, { count: number; why: string }> = {
  'ui/icons/Icon.tsx': {
    count: 1,
    why: 'رسم الأيقونة من `icon-data.ts` المولَّد عند البناء من لقطة Figma (`pnpm icons:sync`) — ثابتٌ في الحزمة لا يمرّ به نصّ صفحة ولا مستخدم',
  },
}

/**
 * المصابّ بأسمائها كلمةً كاملة لا جزءًا من اسمٍ أطول. و`eval` اسمًا أينما ورد (`window.eval` و`(0, eval)` كذلك)،
 * و`Function(` بلا `new` أيضًا، ومؤقّتٌ يُعطى نصًّا بدل دالّة.
 */
const SINKS =
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|createContextualFragment|setHTMLUnsafe|parseHTMLUnsafe|DOMParser|srcdoc)\b|\bdocument\.write(?:ln)?\b|\beval\b|\bFunction\s*\(|\bset(?:Timeout|Interval)\s*\(\s*['"`]/gu

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx|js|mjs)$/u.test(name) && !/\.test\./u.test(name) ? [full] : []
  })
}

/** الشيفرة بلا تعليقاتها، بمحلّل TypeScript (`tests/helpers/code-only.ts`). */
const code = (source: string, file = 'source.tsx'): string => codeOnly(source, file)

function scan(): Map<string, number> {
  const found = new Map<string, number>()
  for (const file of walk(SRC)) {
    const hits = code(readFileSync(file, 'utf8'), file).match(SINKS)?.length ?? 0
    if (hits > 0) found.set(relative(SRC, file).split('\\').join('/'), hits)
  }
  return found
}

describe('مصابّ HTML وتقييم النصّ في src/', () => {
  const found = scan()

  it('لا شيء خارج القائمة المسمّاة', () => {
    const outside = [...found.keys()].filter((file) => !(file in ALLOWED))
    expect(outside, 'مَصبُّ HTML أو تقييم نصٍّ بلا سببٍ مكتوب — ADR 0056').toEqual([])
  })

  it('ولا مَصبٌّ زائد في ملفٍّ مسموح', () => {
    for (const [file, { count }] of Object.entries(ALLOWED)) {
      expect(found.get(file) ?? 0, file).toBe(count)
    }
  })

  it('المسح يرى ما يجب أن يراه، ولا يرى التعليق ولا الاسم الأطول', () => {
    for (const sink of [
      'el.innerHTML = t',
      'el.outerHTML = t',
      "el.insertAdjacentHTML('beforeend', t)",
      '<div dangerouslySetInnerHTML={{ __html: t }} />',
      'document.write(t)',
      'document.writeln(t)',
      'frame.srcdoc = t',
      'range.createContextualFragment(t)',
      'el.setHTMLUnsafe(t)',
      'Document.parseHTMLUnsafe(t)',
      'new DOMParser().parseFromString(t, "text/html")',
      'eval(t)',
      'window.eval(t)',
      '(0, eval)(t)',
      'const f = new Function("a", t)',
      'const g = Function(t)',
      "setTimeout('alert(1)', 0)",
    ]) {
      expect(code(sink).match(SINKS), sink).toHaveLength(1)
    }
    for (const clean of [
      '// el.innerHTML = t',
      '/* eval(t) */ const a = 1',
      'const innerHTMLish = 1',
      'retrieval(t)',
      'el.textContent = t',
      'setTimeout(() => run(), 0)',
      'const isFunction = typeof x === "function"',
    ]) {
      expect(code(clean).match(SINKS), clean).toBeNull()
    }
    // ما أخفاه حذف التعليقات بالتعبير النمطي (المراجعة المستقلّة): `/*` و`//` داخل سلسلة لا يبتلعان ما بعدهما.
    for (const hidden of [
      "const g = 'assets/*'\nel.innerHTML = t\n/** doc */",
      "const u = 'a//b'; el.innerHTML = t",
      'const r = /\\/\\/x/u; el.innerHTML = t',
      'const t2 = `//${a}`; el.innerHTML = t',
    ]) {
      expect(code(hidden).match(SINKS), hidden).toHaveLength(1)
    }
    expect(code('<p>// innerHTML نصٌّ لا شيفرة</p>').match(SINKS)).toHaveLength(1)
  })
})
