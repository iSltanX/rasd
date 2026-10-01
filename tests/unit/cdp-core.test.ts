// @vitest-environment node
// يقرأ سكربتات الحرّاس من القرص، فلا علاقة له بالـDOM.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// @ts-expect-error — سكربت أدوات بلا تعريفات أنواع.
import { guardDeps } from '../../scripts/guards-sync.mjs'
import {
  createReport,
  sabotageList,
  unpackedExtensionId,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/lib/cdp.mjs'

/**
 * النواة المشتركة للحرّاس (`STAGES/17`، ADR 0042): كل حارس كروم فوقها، والتحميل فيها وحدها.
 *
 * هذا ما يُبقي معيار القبول صادقًا بعد إغلاق المرحلة: `Extensions.loadUnpacked` صفرٌ خارج النواة،
 * وحارسٌ جديد يُكتب بنسخة من الإقلاع القديم يسقط هنا قبل أن يصل CI.
 */
const root = join(__dirname, '..', '..')
const scripts = join(root, 'scripts')
const read = (rel: string): string | null =>
  existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null

/** حرّاس كروم: كل `verify-*.mjs` عدا الساكنَين اللذين يجريان في البوّابة A. */
const chromeGuards = readdirSync(scripts)
  .filter((f) => /^verify-[a-z-]+\.mjs$/u.test(f))
  .filter((f) => f !== 'verify-dist.mjs' && f !== 'verify-tokens.mjs')

describe('الحرّاس فوق النواة المشتركة', () => {
  it('خمسة وعشرون حارس كروم — والعدد مثبَّت كي يظهر حارسٌ جديد (`accessibility` في `STAGES/24` و`memory` في `STAGES/21` و`lighthouse` في `STAGES/22` و`visual` في `STAGES/26`)', () => {
    expect(chromeGuards).toHaveLength(25)
  })

  it.each(chromeGuards)('%s لا يحمّل الإضافة بنفسه', (file) => {
    expect(read(`scripts/${file}`)).not.toContain('Extensions.loadUnpacked')
  })

  it.each(chromeGuards)('%s يستورد النواة — فبصمته تشملها', (file) => {
    expect(guardDeps(`scripts/${file}`, read)).toContain('scripts/lib/cdp.mjs')
  })

  it('النواة وحدها تحمّل الإضافة', () => {
    expect(read('scripts/lib/cdp.mjs')).toContain("'Extensions.loadUnpacked'")
  })
})

describe('دوالّ النواة الخالصة', () => {
  /*
   * المعرّف مرجعيّ: هو ما حسبه كروم فعلًا لمسارٍ ثابت في جولة `verify:load` — أوّل 16 بايتًا من
   * SHA-256 للمسار، كل نصف بايت إلى a–p.
   */
  it('معرّف الإضافة غير المضغوطة حتميّ من المسار ومن الأحرف a–p', () => {
    const id = unpackedExtensionId('/tmp/rasd-dist')
    expect(id).toMatch(/^[a-p]{32}$/u)
    expect(unpackedExtensionId('/tmp/rasd-dist')).toBe(id)
    expect(unpackedExtensionId('/tmp/rasd-dist2')).not.toBe(id)
  })

  it('قائمة التخريب تُقرأ من البيئة، والفراغ لا شيء', () => {
    expect(sabotageList({})).toEqual([])
    expect(sabotageList({ RASD_GUARD_SABOTAGE: '' })).toEqual([])
    expect(sabotageList({ RASD_GUARD_SABOTAGE: 'content.js, service-worker-loader.js,' })).toEqual([
      'content.js',
      'service-worker-loader.js',
    ])
  })

  it('التقرير يعدّ الإخفاقات وحدها', () => {
    const r = createReport()
    r.ok('أ')
    r.note('ب')
    r.fail('ج')
    expect(r.errors).toEqual(['ج'])
    expect(r.lines).toEqual(['  ✓ أ', '  · ب', '  ✗ ج'])
  })
})
