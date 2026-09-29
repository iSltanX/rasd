import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { horizontalLockup, MARK_CUT, MARK_SYMBOL, markCutFor, WORDMARK } from '@/ui/mark-geometry'

/**
 * الشعار المشحون هو شعار الهوية نفسه — لا نسخة تُرسم مرّتين.
 *
 * `Docs/Brand/svg/` مخرَج `Docs/Brand/build.mjs`، ومكوّنات Figma `Rasd Symbol · v3`
 * و`Rasd Lockup · v3` مبنيّة من سلاسل المسارات نفسها. فمقارنة ما يرسمه `RasdMark`
 * بتلك الملفّات مقارنةٌ بالمرجع المعتمد لا بنسخة أخرى من الأرقام.
 */

const BRAND_SVG = join(process.cwd(), 'Docs', 'Brand', 'svg')

/** قيم `d` بترتيبها في ملفّ SVG مودَع. */
function pathsOf(file: string): string[] {
  const svg = readFileSync(join(BRAND_SVG, file), 'utf8')
  return [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1] ?? '')
}

describe('هندسة الشعار v3 مطابقة لأصول الهوية المودَعة', () => {
  it('القصّ العادي يطابق rasd-symbol-mono.svg: الحلقة ثم النقطة', () => {
    expect([MARK_SYMBOL.regular.ring, MARK_SYMBOL.regular.nuqta]).toEqual(
      pathsOf('rasd-symbol-mono.svg'),
    )
  })

  it('القصّ الصغير يطابق rasd-symbol-small-mono.svg', () => {
    expect([MARK_SYMBOL.small.ring, MARK_SYMBOL.small.nuqta]).toEqual(
      pathsOf('rasd-symbol-small-mono.svg'),
    )
  })

  it('المقارنة تستطيع أن تسقط: القصّ الصغير لا يطابق ملفّ العادي', () => {
    expect([MARK_SYMBOL.small.ring, MARK_SYMBOL.small.nuqta]).not.toEqual(
      pathsOf('rasd-symbol-mono.svg'),
    )
  })

  it('القفل الأفقي يطابق rasd-lockup-horizontal-mono.svg: الكتابة وموضعها والرمز', () => {
    const svg = readFileSync(join(BRAND_SVG, 'rasd-lockup-horizontal-mono.svg'), 'utf8')
    const lockup = horizontalLockup()
    expect(svg).toContain(`viewBox="0 0 ${lockup.width} ${lockup.height}"`)
    expect(svg).toContain(
      `transform="translate(${lockup.word.x} ${lockup.word.y}) scale(${lockup.word.scale})"`,
    )
    expect(pathsOf('rasd-lockup-horizontal-mono.svg')).toEqual([
      WORDMARK.paths.join(' '),
      lockup.mark.ring,
      lockup.mark.nuqta,
    ])
  })

  it('القصّ يتبع المقاس: الصغير حتى 20 بكسل، والعادي من 24', () => {
    expect([16, 20, 24, 32, 40].map(markCutFor)).toEqual([
      'small',
      'small',
      'regular',
      'regular',
      'regular',
    ])
    expect(MARK_CUT.small.G).toBeGreaterThan(MARK_CUT.regular.G)
  })
})
