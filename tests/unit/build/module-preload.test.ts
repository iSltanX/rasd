import { describe, expect, it } from 'vitest'

import { modulePreloadLinks, staticImportGraph } from '../../../scripts/module-preload.ts'

type Bundle = Parameters<typeof staticImportGraph>[1]

/** حزمة مصغّرة بشكل مخرَج Rollup: قطع بـ`imports` الساكنة و`dynamicImports`، وأصل غير قطعة. */
function bundle(): Bundle {
  const chunk = (fileName: string, imports: string[], dynamicImports: string[] = []) => ({
    type: 'chunk',
    fileName,
    imports,
    dynamicImports,
  })
  return {
    'assets/popup.js': chunk(
      'assets/popup.js',
      ['assets/ui.js', 'assets/repo.js'],
      ['assets/lazy.js'],
    ),
    'assets/ui.js': chunk('assets/ui.js', ['assets/preact.js']),
    'assets/repo.js': chunk('assets/repo.js', ['assets/preact.js', 'assets/site-match.js']),
    'assets/preact.js': chunk('assets/preact.js', []),
    'assets/site-match.js': chunk('assets/site-match.js', ['assets/popup.js']),
    'assets/lazy.js': chunk('assets/lazy.js', ['assets/heavy.js']),
    'assets/heavy.js': chunk('assets/heavy.js', []),
    'assets/popup.css': { type: 'asset', fileName: 'assets/popup.css' },
  } as unknown as Bundle
}

describe('staticImportGraph', () => {
  it('كل قطعة يبلغها المدخل ساكنًا، في كل المستويات، بلا تكرار ولا المدخل نفسه', () => {
    expect(staticImportGraph('assets/popup.js', bundle()).sort()).toEqual([
      'assets/preact.js',
      'assets/repo.js',
      'assets/site-match.js',
      'assets/ui.js',
    ])
  })

  it('الاستيراد الديناميكي لا يُحمَّل مسبقًا — لا هو ولا ما يستورده', () => {
    const graph = staticImportGraph('assets/popup.js', bundle())
    expect(graph).not.toContain('assets/lazy.js')
    expect(graph).not.toContain('assets/heavy.js')
  })

  it('مدخل بلا استيراد ⇐ لا روابط', () => {
    expect(staticImportGraph('assets/heavy.js', bundle())).toEqual([])
  })
})

describe('modulePreloadLinks', () => {
  it('يضيف رابط modulepreload لكل قطعة في رأس الصفحة، وفي البناء وحده', () => {
    const plugin = modulePreloadLinks()
    expect(plugin.apply).toBe('build')
    const hook = plugin.transformIndexHtml as {
      handler: (html: string, ctx: unknown) => { attrs: Record<string, unknown> }[] | undefined
    }
    const b = bundle()
    const tags = hook.handler('', { bundle: b, chunk: b['assets/popup.js'] }) ?? []
    expect(tags.map((t) => t.attrs.href).sort()).toEqual([
      '/assets/preact.js',
      '/assets/repo.js',
      '/assets/site-match.js',
      '/assets/ui.js',
    ])
    expect(tags.every((t) => t.attrs.rel === 'modulepreload')).toBe(true)
    // خادم التطوير بلا حزمة — لا روابط.
    expect(hook.handler('', {})).toBeUndefined()
  })
})
