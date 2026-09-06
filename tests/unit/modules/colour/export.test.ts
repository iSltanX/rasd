import { describe, expect, it } from 'vitest'

import { exportPalette, type PaletteExportJson, type PaletteFormat } from '@/modules/colour/export'

import type { PaletteSwatch } from '@/shared/messaging/contract'

/**
 * تصدير اللوحة — أربع صيغ بلا بنية منصوصة في `§6.14`، فالاختبار يحرس
 * القرارات البنيوية المتّخذة في `export.ts` نفسها لا نصًّا في الخطّة.
 */

/** لوحة من ثلاثة ألوان — مرتّبة بالحصّة تنازليًّا، كما يضمن `palette.ts`. */
const THREE: readonly PaletteSwatch[] = [
  { hex: '#2b7fff', share: 0.5, count: 500, neutral: false },
  { hex: '#00c950', share: 0.3, count: 300, neutral: false },
  { hex: '#f5f5f5', share: 0.2, count: 200, neutral: true },
]

describe('exportPalette — CSS Variables', () => {
  it('قاعدة :root تحمل تصريحًا لكل لون، بالترتيب نفسه', () => {
    const css = exportPalette(THREE, 'css')
    expect(css).toContain(':root {')
    expect(css).toContain('--palette-1: #2b7fff;')
    expect(css).toContain('--palette-2: #00c950;')
    expect(css).toContain('--palette-3: #f5f5f5;')
    expect(css.trim().endsWith('}')).toBe(true)

    // الترتيب في النصّ نفسه، لا مجرّد الاحتواء.
    const i1 = css.indexOf('--palette-1')
    const i2 = css.indexOf('--palette-2')
    const i3 = css.indexOf('--palette-3')
    expect(i1).toBeLessThan(i2)
    expect(i2).toBeLessThan(i3)
  })

  it('البادئة قابلة للضبط — تفصل لوحتين مصدَّرتين في المشروع نفسه', () => {
    const brand = exportPalette(THREE, 'css', { prefix: 'brand' })
    const accent = exportPalette(THREE, 'css', { prefix: 'accent' })
    expect(brand).toContain('--brand-1: #2b7fff;')
    expect(accent).toContain('--accent-1: #2b7fff;')
    expect(brand).not.toContain('--accent-')
  })

  it('بادئة تحمل مسافات ورموزًا تُنقَّى إلى اسم CSS صالح', () => {
    const css = exportPalette(THREE, 'css', { prefix: '  My Brand! ' })
    expect(css).toContain('--My-Brand-1: #2b7fff;')
  })

  it('بادئة فارغة أو منقّاة إلى فراغ تعود إلى الافتراضي `palette`', () => {
    expect(exportPalette(THREE, 'css', { prefix: '' })).toContain('--palette-1:')
    expect(exportPalette(THREE, 'css', { prefix: '!!!' })).toContain('--palette-1:')
  })

  it('لا بيانات وصفية في CSS — لا `neutral` ولا نسبة حصّة بأي صيغة', () => {
    const css = exportPalette(THREE, 'css')
    expect(css).not.toMatch(/neutral|حياد|share|0\.5\b/)
  })

  it('لوحة فارغة تعطي قاعدة صالحة بلا تصريحات، بلا رمي', () => {
    expect(() => exportPalette([], 'css')).not.toThrow()
    const css = exportPalette([], 'css')
    expect(css).toBe(':root {\n}')
  })
})

describe('exportPalette — JSON', () => {
  it('يُفكّ بـJSON.parse فعليًّا، ويحمل البيانات الوصفية كاملةً', () => {
    const text = exportPalette(THREE, 'json')
    const parsed = JSON.parse(text) as PaletteExportJson

    expect(parsed.schema).toBe('rasd.palette-export/1')
    expect(parsed.prefix).toBe('palette')
    expect(parsed.swatches).toHaveLength(3)

    expect(parsed.swatches[0]).toEqual({
      variable: 'palette-1',
      hex: '#2b7fff',
      share: 0.5,
      count: 500,
      neutral: false,
    })
    expect(parsed.swatches[2]!.neutral).toBe(true)
  })

  it('اسم المتغيّر في JSON يطابق اسمه في CSS (بلا `--`)', () => {
    const css = exportPalette(THREE, 'css', { prefix: 'brand' })
    const json = JSON.parse(exportPalette(THREE, 'json', { prefix: 'brand' })) as PaletteExportJson
    for (const s of json.swatches) expect(css).toContain(`--${s.variable}:`)
  })

  it('الترتيب محفوظ في مصفوفة swatches', () => {
    const json = JSON.parse(exportPalette(THREE, 'json')) as PaletteExportJson
    expect(json.swatches.map((s) => s.hex)).toEqual(['#2b7fff', '#00c950', '#f5f5f5'])
  })

  it('لوحة فارغة تعطي JSON صالحًا بمصفوفة فارغة', () => {
    const parsed = JSON.parse(exportPalette([], 'json')) as PaletteExportJson
    expect(parsed.swatches).toEqual([])
  })
})

describe('exportPalette — Tailwind Config', () => {
  it('يكتب `@theme` بـOKLCH — شكل v4، لا كائن JS ولا صيغة v3', () => {
    const tw = exportPalette(THREE, 'tailwind')
    expect(tw).toContain('@theme {')
    expect(tw).toMatch(/--color-palette-1:\s*oklch\(/)
    expect(tw).toMatch(/--color-palette-2:\s*oklch\(/)
    expect(tw).toMatch(/--color-palette-3:\s*oklch\(/)
    // لا كائن JS من نوع v3 (`module.exports` أو `theme: { colors: … }`).
    expect(tw).not.toContain('module.exports')
    expect(tw).not.toContain('theme:')
  })

  it('يُعلن الإصدار في المخرَج نفسه', () => {
    expect(exportPalette(THREE, 'tailwind')).toContain('Tailwind v4')
  })

  it('البادئة تظهر بعد مجال `color-` الإلزامي، لا بدلًا منه', () => {
    const tw = exportPalette(THREE, 'tailwind', { prefix: 'brand' })
    expect(tw).toContain('--color-brand-1:')
    expect(tw).not.toContain('--brand-1:')
  })

  it('لا اسم من لوحة Tailwind الجاهزة — لا `blue-` ولا `green-` مهما قرُب اللون', () => {
    // THREE[0] قريب جدًّا من `blue-500` الحقيقي في v4 وTHREE[1] من `green-500`
    // — والاختبار يثبت أن التسمية تتجاهل ذلك عمدًا (`colour/tailwind.ts` لا
    // يُستدعى هنا أصلًا).
    const tw = exportPalette(THREE, 'tailwind')
    expect(tw).not.toContain('blue-500')
    expect(tw).not.toContain('green-500')
    // كل قيمة تبدأ بـ`oklch(` حرفيًّا — لا اسم درجة قبلها ولا بدلًا منها.
    expect(tw).toMatch(/--color-palette-1: oklch\(/)
    expect(tw).toMatch(/--color-palette-2: oklch\(/)
  })

  it('لوحة فارغة تعطي كتلة `@theme` صالحة بلا متغيّرات، بلا رمي', () => {
    expect(() => exportPalette([], 'tailwind')).not.toThrow()
    const tw = exportPalette([], 'tailwind')
    expect(tw).toContain('@theme {')
    expect(tw.trim().endsWith('}')).toBe(true)
  })
})

describe('exportPalette — نص قابل للنسخ', () => {
  it('قائمة مرقّمة: القيمة السداسية، ثم الحصّة المئوية، ثم وسم الحيادي عند اللزوم', () => {
    const text = exportPalette(THREE, 'text')
    const lines = text.split('\n')
    expect(lines).toEqual([
      '1. #2b7fff — 50.0%',
      '2. #00c950 — 30.0%',
      '3. #f5f5f5 — 20.0% (حيادي)',
    ])
  })

  it('لا بادئة ولا اسم متغيّر — هذه الصيغة الوحيدة بلا وجهة كودية', () => {
    const withPrefix = exportPalette(THREE, 'text', { prefix: 'brand' })
    const withoutPrefix = exportPalette(THREE, 'text')
    expect(withPrefix).toBe(withoutPrefix)
    expect(withPrefix).not.toContain('--')
  })

  it('لوحة فارغة تعطي سلسلة فارغة، بلا رمي', () => {
    expect(() => exportPalette([], 'text')).not.toThrow()
    expect(exportPalette([], 'text')).toBe('')
  })
})

describe('exportPalette — الصيغ الأربع كلّها لا ترمي على لوحة فارغة', () => {
  const formats: readonly PaletteFormat[] = ['css', 'json', 'tailwind', 'text']
  it.each(formats)('الصيغة %s', (format) => {
    expect(() => exportPalette([], format)).not.toThrow()
  })
})
