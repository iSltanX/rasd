import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PAGE_PATHS } from '@/shared/page-paths'

/**
 * كل صفحة إضافة بشيفرة تطبّق السمة والكثافة من الإعدادات وتتبع تغيّرها — `Docs/Engineering.md
 * §6` الصفّ 110. كانت المكتبة والمحرّر والمقارنة بلا `applyTheme`، فاختيار «داكن» أو «مضغوطة»
 * في الإعدادات لا يصلها.
 */
const root = join(__dirname, '..', '..', '..')

/** صفحة تشترك وتطبّق — الشرطان معًا. */
function wiresTheme(source: string): boolean {
  return /watchSettings\(/.test(source) && /applyTheme\(/.test(source)
}

describe('ربط السمة في صفحات الإضافة', () => {
  it('كل صفحة مسجَّلة لها مدخل شيفرة تشترك في الإعدادات وتطبّق السمة', () => {
    const missing: string[] = []
    for (const path of Object.values(PAGE_PATHS)) {
      const main = join(root, path.replace(/index\.html$/, 'main.tsx'))
      if (!existsSync(main)) continue // صفحة ساكنة بلا شيفرة (التأهيل حتى STAGES/09، والخفيّة)
      if (!wiresTheme(readFileSync(main, 'utf8'))) missing.push(path)
    }
    expect(missing).toEqual([])
  })

  it('الحارس يسقط على مدخل بلا اشتراك — الحالة السالبة', () => {
    expect(wiresTheme('render(<Library />, root)')).toBe(false)
    expect(wiresTheme('watchSettings(() => undefined)')).toBe(false)
    expect(wiresTheme('watchSettings((s) => applyTheme(s))')).toBe(true)
  })

  it('كل مدخل صفحة في المستودع معروف لـPAGE_PATHS أو من صفحات التطوير', () => {
    // صفحات التطوير، ومجلّدات مكوّنات مشتركة بلا مدخل: القشرة ونافذتا التصدير وحزمة التسليم.
    const dev = new Set([
      'gallery',
      'popup-preview',
      'capture-preview',
      'shell',
      'export',
      'handoff',
    ])
    const shipped = new Set(Object.values(PAGE_PATHS).map((p) => p.split('/')[2]))
    const dirs = readdirSync(join(root, 'src', 'pages'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    expect(dirs.filter((d) => !dev.has(d) && !shipped.has(d))).toEqual([])
  })
})
