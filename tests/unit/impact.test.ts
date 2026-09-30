// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  coneOf,
  IMPACT,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/impact.mjs'

/**
 * مخروط الأثر (`scripts/impact.mjs`) — جدولٌ تقرؤه البوّابة A وبوّابة الموجة معًا (ADR 0026).
 * السوالب هنا ما كان يمرّ صامتًا: حارسٌ عُدّل ملفّه كان يُطبع «لا أثر تشغيلي» (الصفّ 151).
 */
describe('مخروط الأثر', () => {
  it('حارس كروم عُدّل ملفّه يلزمه هو', () => {
    expect(coneOf(['scripts/verify-editor.mjs'])).toEqual({
      needed: ['verify:editor'],
      unmapped: 0,
    })
    expect(coneOf(['scripts/verify-compare-diff.mjs']).needed).toEqual(['verify:compare-diff'])
  })

  it('حارسا الحزمة والتوكنز في البوّابة A نفسها — لا حارس كروم', () => {
    expect(coneOf(['scripts/verify-dist.mjs', 'scripts/verify-tokens.mjs'])).toEqual({
      needed: [],
      unmapped: 0,
    })
  })

  it('ما تتشاركه الحرّاس يطلب الطقم كاملًا', () => {
    for (const file of [
      'scripts/lib/cdp.mjs',
      'scripts/live-sw.mjs',
      'scripts/live-fixtures.mjs',
      'scripts/fixtures-serve.mjs',
      'tests/fixtures/sites/picker/index.html',
    ]) {
      expect(coneOf([file]).unmapped, file).toBe(1)
    }
  })

  it('سكربتات الأدوات والاختبارات والتوثيق والمهارات بلا أثر تشغيلي', () => {
    expect(
      coneOf([
        'scripts/gate-a.mjs',
        'scripts/wave-verify.mjs',
        'tests/unit/impact.test.ts',
        'Docs/Waves.md',
        '.claude/skills/stage/SKILL.md',
        '.prettierignore',
        'STAGES/19.md',
      ]),
    ).toEqual({ needed: [], unmapped: 0 })
  })

  it('الشيفرة تبقى على ربطها', () => {
    expect(coneOf(['src/pages/popup/App.tsx']).needed).toEqual(['verify:popup'])
    expect(coneOf(['src/pages/unknown/x.tsx']).unmapped).toBe(1)
  })

  it('كل مدخلٍ مصفوفةٌ أو دالّة أو null صريح', () => {
    for (const entry of IMPACT as Array<{ scripts: unknown }>) {
      expect(
        entry.scripts === null ||
          Array.isArray(entry.scripts) ||
          typeof entry.scripts === 'function',
      ).toBe(true)
    }
  })
})
