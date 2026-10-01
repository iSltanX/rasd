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
      'scripts/lib/live-sw.mjs',
      'scripts/lib/live-fixtures.mjs',
      'scripts/runtime-budgets.mjs',
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
    expect(coneOf(['src/pages/popup/App.tsx']).needed).toEqual([
      'verify:popup',
      'verify:accessibility',
      'verify:visual',
    ])
    // الإتاحة (`STAGES/24`) والانحدار البصري (`STAGES/26`): صفحتا الإعدادات والتعريف لا حارس وظيفيّ لهما غيرهما
    expect(coneOf(['src/pages/settings/Settings.tsx'])).toEqual({
      needed: ['verify:accessibility', 'verify:visual'],
      unmapped: 0,
    })
    expect(coneOf(['src/pages/unknown/x.tsx']).unmapped).toBe(1)
  })

  it('الشبكة (`STAGES/25`): المخرج وعميل البلاغات يلزمهما `verify:network`، ونافذة البلاغ معها حارسا الواجهة، والتكاملات حرّاس مداخلها', () => {
    for (const file of ['src/shared/egress.ts', 'src/modules/report/client.ts']) {
      expect(coneOf([file])).toEqual({ needed: ['verify:network'], unmapped: 0 })
    }
    expect(coneOf(['src/pages/settings/parts/report/ReportDialog.tsx'])).toEqual({
      needed: ['verify:accessibility', 'verify:visual', 'verify:network'],
      unmapped: 0,
    })
    // مُنشئ الـIssue يُفتح من نافذة التسليم في مسار التصدير وتقرير المقارنة والمشاركة — فحرّاس مداخلها معه.
    for (const file of [
      'src/pages/integrations/IssueComposer.tsx',
      'src/modules/export/integrations/github.ts',
    ]) {
      expect(coneOf([file]).needed, file).toEqual([
        'verify:accessibility',
        'verify:visual',
        'verify:network',
        'verify:editor',
        'verify:library',
        'verify:export',
        'verify:share',
      ])
    }
    expect(coneOf(['src/shared/permission-policy.ts']).needed).toEqual([
      'verify:load',
      'verify:network',
    ])
  })

  it('الانحدار البصري (`STAGES/26`): مقارنٌ أو مولِّد لقطات أو صورة مرجعية عُدّلت يلزمها `verify:visual` وحده', () => {
    for (const file of [
      'scripts/lib/visual-compare.mjs',
      'scripts/lib/visual-surfaces.mjs',
      'scripts/design-shots.mjs',
      'scripts/design-shots/overlay.mjs',
      'tests/visual-baselines/surfaces/popup-dark.png',
      'scripts/verify-visual.mjs',
      'src/pages/popup-preview/PopupPreview.tsx',
      'src/pages/gallery/Gallery.tsx',
    ]) {
      expect(coneOf([file]), file).toEqual({ needed: ['verify:visual'], unmapped: 0 })
    }
    // ونواة الحرّاس تبقى تطلب الطقم كاملًا — المدخل الجديد لا يبتلع `scripts/lib/` كلّها.
    expect(coneOf(['scripts/lib/cdp.mjs']).unmapped).toBe(1)
    // والطبقة فوق الصفحة بصريّة كما هي أثرٌ على الصفحة المضيفة.
    expect(coneOf(['src/ui/overlay/measure/Panel.tsx']).needed).toContain('verify:visual')
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
