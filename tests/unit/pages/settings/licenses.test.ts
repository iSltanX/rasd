// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LICENSES } from '@/pages/settings/parts/licenses'

/**
 * «عن رصد» يعرض تراخيص ما في الحزمة. قائمة مكتوبة بيد تنحرف عند أوّل تبعية تُضاف،
 * فيقارنها هذا الاختبار بـ`package.json` وبرخصة كل حزمة كما في `node_modules`.
 */

const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

/** تبعيات الحزمة التي لا سطر لها في القائمة. */
function missing(deps: readonly string[]): string[] {
  const listed = new Set(LICENSES.filter((l) => l.kind === 'library').map((l) => l.name))
  return deps.filter((d) => !listed.has(d))
}

describe('تراخيص «عن رصد»', () => {
  it('كل تبعية في package.json لها سطر في القائمة', () => {
    expect(missing(Object.keys(pkg.dependencies))).toEqual([])
  })

  it('المقارنة تستطيع أن تسقط: تبعية مضافة بلا سطر تُكشف', () => {
    expect(missing([...Object.keys(pkg.dependencies), 'left-pad'])).toEqual(['left-pad'])
  })

  it('رخصة كل مكتبة مباشرة تطابق ما في حزمتها', () => {
    for (const name of Object.keys(pkg.dependencies)) {
      const meta = JSON.parse(
        readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'),
      ) as { license?: string }
      const entry = LICENSES.find((l) => l.name === name)
      expect(entry?.license, name).toBe(meta.license)
    }
  })

  it('الخطوط الثلاثة مرخّصة OFL', () => {
    expect(LICENSES.filter((l) => l.kind === 'font').map((l) => l.name)).toEqual([
      'Almarai',
      'Cairo',
      'Geist Mono',
    ])
  })
})
