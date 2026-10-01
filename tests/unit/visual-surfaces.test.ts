// @vitest-environment node
// يقرأ خطوط الأساس من القرص، فلا علاقة له بالـDOM.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
import * as surfaceLib from '../../scripts/lib/visual-surfaces.mjs'

interface Surface {
  id: string
  frame: string
  modes?: string[]
  existing?: Record<string, string>
}
interface Baseline {
  file: string
  frame: string | null
}
/** تعريفات المكتبة غير المكتوبة — تُعلَن هنا مرّة فلا يتسرّب `any` إلى الاختبارات. */
const {
  allBaselines,
  BASELINE_PLATFORM,
  baselineFile,
  baselineShots,
  EXTRA_BASELINES,
  MODES,
  modesOf,
  SURFACES,
} = surfaceLib as unknown as {
  allBaselines: () => Baseline[]
  BASELINE_PLATFORM: string
  baselineFile: (surface: Surface, mode: string) => string
  baselineShots: () => Record<string, string>
  EXTRA_BASELINES: string[]
  MODES: string[]
  modesOf: (surface: Surface) => string[]
  SURFACES: Surface[]
}
const surfacesList = SURFACES
const baselines = () => allBaselines()

const root = join(__dirname, '..', '..')
const dir = join(root, 'tests', 'visual-baselines')

/**
 * أسطح الانحدار البصري (`STAGES/26`): «خطّ أساس لكل سطح، بالوضعين». ما يُقارَن وما يُلتقط وما في المجلّد
 * ثلاثةٌ يجب ألّا تنحرف عن بعضها — وإلا عادت الصور «تُكتب ولا يقرؤها أحد».
 */
describe('أسطح الانحدار البصري', () => {
  it('لكل سطحٍ خطّ أساس بالوضعين — إلا ما اقتُصر على وضعٍ بقرارٍ مكتوب', () => {
    for (const surface of surfacesList) {
      const modes = modesOf(surface)
      if (surface.modes) {
        // الاقتصار على وضعٍ استثناءٌ يُكتب سببه: صفحتا المحرّر «الحجب» و«الاقتصاص» داكنتان فقط منذ المرحلة 15.
        expect(['editor-redact', 'editor-crop']).toContain(surface.id)
        expect(modes).toEqual(['dark'])
      } else {
        expect(modes).toEqual(MODES)
      }
    }
  })

  it('كل خطّ أساس مذكور موجود على القرص وهو PNG ببُعدين — الفكّ الكامل في `visual-compare.test.ts`', () => {
    // الترويسة وحدها (ثلاثون بايتًا): فكّ خمسٍ وثلاثين صورة بـJS صرف تحت التغطية يتجاوز مهلة الاختبار.
    for (const { file } of baselines()) {
      const path = join(dir, file)
      expect(existsSync(path), file).toBe(true)
      const head = readFileSync(path).subarray(0, 24)
      expect(head.subarray(0, 8).toString('hex'), file).toBe('89504e470d0a1a0a')
      expect(head.readUInt32BE(16), file).toBeGreaterThan(0)
      expect(head.readUInt32BE(20), file).toBeGreaterThan(0)
    }
  })

  it('لا صورة في المجلّد بلا سطح — الصورة التي لا يقرؤها أحد هي ما كان قبل هذه المرحلة', () => {
    const expected = new Set(baselines().map((b) => b.file))
    const found: string[] = []
    for (const d of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      for (const f of readdirSync(join(dir, d.name)).filter((n) => n.endsWith('.png'))) {
        found.push(`${d.name}/${f}`)
      }
    }
    expect(found.filter((f) => !expected.has(f))).toEqual([])
  })

  it('لا ملفّان لسطحٍ ووضع، ولا إطارٌ مكرَّر في الوضع نفسه', () => {
    const files = baselines().map((b) => b.file)
    expect(new Set(files).size).toBe(files.length)
    const keys = Object.keys(baselineShots())
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toHaveLength(baselines().filter((b) => b.frame).length)
  })

  it('الأسماء القائمة للمراحل 07 و08 و15 باقية كما هي (`AGENTS.md` §4)', () => {
    const named = Object.fromEntries(
      surfacesList.flatMap((s) =>
        Object.entries(s.existing ?? {}).map(([mode, file]) => [`${s.id}|${mode}`, file]),
      ),
    )
    expect(named).toEqual({
      'popup|light': 'phase-07/popup-default-light-rtl.png',
      'area-select|dark': 'phase-08/area-select-rtl.png',
      'editor-text|dark': 'phase-15/annotating-text-rtl.png',
      'editor-redact|dark': 'phase-15/redact-blur-rtl.png',
      'editor-crop|dark': 'phase-15/crop-square-rtl.png',
    })
    expect(EXTRA_BASELINES).toContain('phase-05/gallery-light-rtl.png')
    expect(EXTRA_BASELINES).toContain('phase-07/popup-states-dark-rtl.png')
  })

  it('منصّة خطوط الأساس macOS — وتغييرها قرارٌ يُكتب مع الخطوط التي تسنده (ADR 0052)', () => {
    expect(BASELINE_PLATFORM).toBe('darwin')
  })

  it('الاسم الجديد `surfaces/<المعرّف>-<الوضع>.png` لما لم يكن له اسمٌ قائم', () => {
    const popup = surfacesList.find((s) => s.id === 'popup')!
    expect(baselineFile(popup, 'dark')).toBe('surfaces/popup-dark.png')
    expect(baselineFile(popup, 'light')).toBe('phase-07/popup-default-light-rtl.png')
  })
})
