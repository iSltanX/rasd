// @vitest-environment node
// يقرأ المخرجات من القرص، فلا علاقة له بالـDOM.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const read = (p: string) => readFileSync(`${root}${p}`, 'utf8')

const snapshot = JSON.parse(read('src/tokens/figma-snapshot.json')) as {
  collections: {
    primitives: { values: Record<string, unknown> }
    semantic: { values: Record<string, Record<string, unknown>> }
    type: { values: Record<string, Record<string, unknown>> }
  }
  textStyles: Record<string, unknown>
  effectStyles: Record<string, unknown>
}
const css = read('public/assets/tokens.css')
const ts = read('src/tokens/tokens.ts')
const w3c = JSON.parse(read('src/tokens/tokens.json')) as Record<string, unknown>

describe('اكتمال اللقطة', () => {
  it('298 متغيّرًا في ثلاث مجموعات', () => {
    const p = Object.keys(snapshot.collections.primitives.values).length
    const s = Object.keys(snapshot.collections.semantic.values).length
    const t = Object.keys(snapshot.collections.type.values).length
    expect(p).toBe(181)
    expect(s).toBe(101)
    expect(t).toBe(16)
    expect(p + s + t).toBe(298)
  })

  it('62 نمط نص و11 نمط تأثير', () => {
    expect(Object.keys(snapshot.textStyles)).toHaveLength(62)
    expect(Object.keys(snapshot.effectStyles)).toHaveLength(11)
  })
})

describe('كل توكن دلالي معرَّف في الوضعين', () => {
  it('لا وضع ناقص — Dark و Light لكل واحد', () => {
    const missing: string[] = []
    for (const [name, modes] of Object.entries(snapshot.collections.semantic.values)) {
      if (modes.Dark === undefined) missing.push(`${name}:Dark`)
      if (modes.Light === undefined) missing.push(`${name}:Light`)
    }
    expect(missing).toEqual([])
  })

  it('كل مرجع يشير إلى أوليّ موجود', () => {
    const primitives = snapshot.collections.primitives.values
    const broken: string[] = []
    for (const [name, modes] of Object.entries(snapshot.collections.semantic.values)) {
      for (const raw of Object.values(modes)) {
        if (raw && typeof raw === 'object' && 'ref' in raw) {
          const ref = (raw as { ref: string }).ref
          if (!(ref in primitives)) broken.push(`${name} → ${ref}`)
        }
      }
    }
    expect(broken).toEqual([])
  })

  it('كل مقياس معرَّف في العربية واللاتينية', () => {
    for (const [name, modes] of Object.entries(snapshot.collections.type.values)) {
      expect(modes.Arabic, `${name} بلا وضع عربي`).toBeDefined()
      expect(modes.Latin, `${name} بلا وضع لاتيني`).toBeDefined()
    }
  })
})

describe('tokens.css', () => {
  it('الداكن على :root — هو الافتراضي في رصد', () => {
    const rootBlock = css.slice(css.indexOf('/* الداكن هو الافتراضي'))
    expect(rootBlock).toContain('--rasd-surface-canvas: var(--rasd-color-ink-1000)')
  })

  it('الفاتح تحت تفضيل النظام وتحت الاختيار الصريح معًا', () => {
    expect(css).toContain('@media (prefers-color-scheme: light)')
    expect(css).toContain(":root:not([data-theme='dark'])")
    expect(css).toContain(":root[data-theme='light']")
  })

  it('كل توكن دلالي له متغيّر CSS', () => {
    for (const name of Object.keys(snapshot.collections.semantic.values)) {
      const variable = `--rasd-${name.replace(/\//g, '-')}`
      expect(css, `${variable} مفقود`).toContain(`${variable}:`)
    }
  })

  it('62 فئة نمط نص', () => {
    const classes = css.match(/^\.t-[a-z0-9-]+ \{/gm) ?? []
    expect(classes).toHaveLength(62)
  })

  it('لا ضجيج فاصلة عائمة من Figma', () => {
    expect(css).not.toMatch(/\d\.\d{6,}/)
    expect(css).toContain('line-height: 1.4;')
    expect(css).toContain('line-height: 1.85;')
  })

  it('تقليل الحركة يُصفّر المدد في الورقة لا في المكوّنات', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    const block = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(block).toContain('--rasd-motion-duration-fast: 0ms')
    expect(block).toContain('--rasd-motion-duration-slower: 0ms')
  })

  it('المونو وكتل الكود تبقى LTR داخل واجهة RTL', () => {
    expect(css).toContain('direction: ltr;')
    expect(css).toContain('unicode-bidi: isolate;')
    expect(css).toContain('bdi[data-technical]')
  })

  it('العربية هي وضع المقاييس الافتراضي', () => {
    const typeBlock = css.slice(css.indexOf('3 · Type'))
    expect(typeBlock).toContain('--rasd-direction: rtl;')
    // تعقّب العربية صفر دائمًا — أي تباعد يقطع اتصال الحروف.
    expect(typeBlock).toContain('--rasd-tracking-display: 0em;')
  })

  it('اللاتينية تحت [lang="en"] فقط', () => {
    expect(css).toContain("[lang='en']")
    const latin = css.slice(css.indexOf("[lang='en']"))
    expect(latin).toContain('--rasd-direction: ltr;')
  })
})

describe('tokens.ts — أنواع حرفية', () => {
  it('اتحاد التوكنز الدلالية كامل', () => {
    for (const name of Object.keys(snapshot.collections.semantic.values)) {
      expect(ts).toContain(`| '${name}'`)
    }
  })

  it('يصدّر خريطة القيم المحسومة للرسم على Canvas', () => {
    expect(ts).toContain('SEMANTIC_HEX')
    expect(ts).toContain('export function resolveColor')
    expect(ts).toContain('"dark": "#070b0d"')
  })
})

describe('tokens.json — صيغة W3C', () => {
  it('يحمل المجموعات الثلاث', () => {
    expect(Object.keys(w3c)).toEqual(expect.arrayContaining(['primitives', 'semantic', 'type']))
  })

  it('يستخدم مراجع بالنقاط لا بالشرطة المائلة', () => {
    const text = JSON.stringify(w3c)
    expect(text).toContain('{color.signal.300}')
    expect(text).not.toContain('{color/signal/300}')
  })
})

describe('التوليد حتمي', () => {
  it('إعادة التشغيل لا تُنتج أي فرق — بايتًا ببايت', () => {
    const files = [
      'src/tokens/tokens.json',
      'src/tokens/tokens.ts',
      'src/tokens/tailwind.tokens.js',
      'public/assets/tokens.css',
    ]
    const before = files.map(read)
    execFileSync('node', ['scripts/tokens-sync.mjs'], { cwd: root, stdio: 'pipe' })
    const after = files.map(read)
    expect(after).toEqual(before)
  })

  it('وضع التحقّق يمرّ بلا انحراف', () => {
    const out = execFileSync('node', ['scripts/tokens-sync.mjs', '--check'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(out).toContain('لا انحراف')
  })
})
