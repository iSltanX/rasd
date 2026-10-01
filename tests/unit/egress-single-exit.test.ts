// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { codeOnly } from '../helpers/code-only'

/**
 * **مخرج الشبكة الواحد لا يُتجاوز** — ADR 0046 §4.
 *
 * `localOnly` نافذٌ في `shared/egress.ts`، وإنفاذٌ في المخرج لا يحمي من طلبٍ لا يمرّ به. فهذا يمسح `src/` كلّه —
 * بلا تعليقاته — بحثًا عن كل بدائيّة شبكة: `fetch` (نداءً أو اسمًا) و`XMLHttpRequest` و`WebSocket` و`sendBeacon` و
 * `EventSource`. **وهو سلكُ إنذارٍ لا حدّ:** `window['fetch']` أو صورةٌ بعنوانٍ بعيد لا يراهما — والحدّ الثاني سياسة
 * أمن المحتوى (ADR 0046 §4).
 * ما وُجد خارج القائمة أدناه يُسقطه، وما في القائمة يُعدّ: نداءٌ زائد في ملفٍّ مسموح يُسقطه أيضًا.
 *
 * والقائمة جلبٌ من أصل الإضافة نفسه (`chrome.runtime.getURL`) لا يخرج من الجهاز — وسياسة أمن المحتوى في الصفحة
 * المضيفة لا تُعنى به لأن الطلب من العالم المعزول. **ويحمرّ:** أُضيف `fetch('https://x.io')` إلى
 * `src/modules/export/download.ts` فسقط باسم الملفّ (الدليل في سجلّ `STAGES/11`).
 */

const SRC = fileURLToPath(new URL('../../src', import.meta.url))

const ALLOWED: Record<string, { count: number; why: string }> = {
  'shared/egress.ts': { count: 1, why: 'المخرج نفسه — الشروط الأربعة قبل الطلب' },
  'content/host.ts': {
    count: 1,
    why: 'ورقة التوكنز من أصل الإضافة (`chrome.runtime.getURL`) — لا تخرج من الجهاز',
  },
  'shared/bidi/fonts.ts': {
    count: 1,
    why: 'بايتات الخطّ من أصل الإضافة (`chrome.runtime.getURL`) — لا تخرج من الجهاز',
  },
}

/**
 * `fetch` اسمًا لا نداءً وحده: `{ fetch }` و`= fetch` و`fetch.bind` حقنُ اعتماديةٍ شائع يمرّ من `fetch(` — رصدته
 * المراجعة المستقلّة. ومفتاح الكائن (`fetch:`) مستثنى: اسمٌ لا قيمة.
 */
const PRIMITIVES =
  /\bfetch\b(?!\s*:)|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bEventSource\b/gu

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx|js|mjs)$/u.test(name) && !/\.test\./u.test(name) ? [full] : []
  })
}

/**
 * الشيفرة بلا تعليقاتها، بمحلّل TypeScript (`tests/helpers/code-only.ts`) — كان تعبيرًا نمطيًّا يبتلع شيفرةً بعد `/*`
 * أو `//` داخل سلسلة (`STAGES/25`).
 */
const code = (source: string, file = 'source.ts'): string => codeOnly(source, file)

function scan(): Map<string, number> {
  const found = new Map<string, number>()
  for (const file of walk(SRC)) {
    const hits = code(readFileSync(file, 'utf8'), file).match(PRIMITIVES)?.length ?? 0
    if (hits > 0) found.set(relative(SRC, file).split('\\').join('/'), hits)
  }
  return found
}

describe('بدائيّات الشبكة في src/', () => {
  const found = scan()

  it('لا شيء خارج المخرج وقائمته', () => {
    const outside = [...found.keys()].filter((file) => !(file in ALLOWED))
    expect(outside, 'طلبٌ لا يمرّ من shared/egress.ts — ADR 0046 §4').toEqual([])
  })

  it('ولا نداءٌ زائد في ملفٍّ مسموح', () => {
    for (const [file, { count }] of Object.entries(ALLOWED)) {
      expect(found.get(file) ?? 0, file).toBe(count)
    }
  })

  it('المسح يرى ما يجب أن يراه — `code()` لا يحذف نداءً بعد عنوان', () => {
    expect(code("fetch('https://x.io') // تعليق").match(PRIMITIVES)).toHaveLength(1)
    expect(code('/* fetch(x) */ const a = 1 // fetch(y)').match(PRIMITIVES)).toBeNull()
    expect(code('navigator.sendBeacon(u)').match(PRIMITIVES)).toHaveLength(1)
    for (const alias of [
      'const f = fetch',
      'deps = { fetch }',
      'g(impl = fetch)',
      'fetch.call(null, u)',
    ]) {
      expect(code(alias).match(PRIMITIVES), alias).toHaveLength(1)
    }
    expect(code('const deps = { fetch: egressFetch }').match(PRIMITIVES)).toBeNull()
    expect(code("const g = 'https://x/*'\nfetch(u)\n/** doc */").match(PRIMITIVES)).toHaveLength(1)
  })
})
