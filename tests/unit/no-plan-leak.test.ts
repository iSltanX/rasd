/**
 * **نصٌّ يراه المستخدم لا يحمل رقم مرحلة ولا رقم وحدة داخلية.**
 *
 * العلّة: نافذة التصدير كانت تعرض «يصل في الوحدة 19.3» و«مسجَّل في §6» تلميحًا
 * على صيغة معطَّلة، وشاشة الخصوصية «يُبنى في الوحدة 20.5» — أرقام خطّة داخلية
 * لا معنى لها عند المستخدم، وتتقادم مع أي إعادة تخطيط.
 *
 * القاعدة ثنائية بلا حكم لغوي: كل سطر في `src/` **ليس تعليقًا** ويحوي
 * «المرحلة N» أو «الوحدة N» مخالفة. التعليقات مستثناة: الإحالة التاريخية فيها
 * توثيق للمطوّر لا نصّ واجهة.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = process.cwd()
const LEAK = /(?:المرحلة|الوحدة)\s+\d/u
const COMMENT_LINE = /^\s*(?:\*|\/\/|\/\*|<!--|\{\/\*)/u

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'tokens' ? [] : walk(path)
    return /\.(?:ts|tsx|html)$/u.test(entry.name) ? [path] : []
  })
}

/** يُسقط التعليق الذيلي `// …` و`/* … *\/` داخل السطر، فلا يبقى إلا ما يُنفَّذ أو يُعرَض. */
function stripTrailingComment(line: string): string {
  return line.replace(/\/\*.*?\*\//gu, '').replace(/(^|\s)\/\/.*$/u, '$1')
}

export function findLeaks(text: string): number[] {
  const hits: number[] = []
  let inBlock = false
  text.split('\n').forEach((line, index) => {
    if (inBlock) {
      if (/\*\/|-->/u.test(line)) inBlock = false
      return
    }
    if (COMMENT_LINE.test(line)) {
      if (/^\s*(?:\/\*|<!--|\{\/\*)/u.test(line) && !/\*\/|-->/u.test(line)) inBlock = true
      return
    }
    if (LEAK.test(stripTrailingComment(line))) hits.push(index + 1)
  })
  return hits
}

describe('لا رقم خطّة داخلي في نصّ يراه المستخدم', () => {
  it('الكاشف يمسك النصّ المعروض ويعفي التعليق', () => {
    expect(findLeaks("const reason = 'يصل في الوحدة 19.3'")).toEqual([1])
    expect(findLeaks('<p>تُبنى في المرحلة 20.</p>')).toEqual([1])
    expect(findLeaks(' * بُني في المرحلة 7\n// الوحدة 20.1\nconst a = 1 // المرحلة 3')).toEqual([])
    expect(findLeaks('/*\nالمرحلة 5\n*/\nconst b = 2')).toEqual([])
  })

  it('صفر مخالفة في src/', () => {
    const leaks = walk(join(root, 'src')).flatMap((file) =>
      findLeaks(readFileSync(file, 'utf8')).map((line) => `${relative(root, file)}:${line}`),
    )
    expect(leaks).toEqual([])
  })
})
