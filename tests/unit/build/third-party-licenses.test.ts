// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { build, type Rolldown } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

import {
  dependencyDirs,
  LICENSES_FILE,
  listedPackages,
  packageOf,
  readPackage,
  renderLicenses,
  thirdPartyLicenses,
} from '../../../scripts/third-party-licenses.ts'

/**
 * ملفّ تراخيص الطرف الثالث (`STAGES/27`): يُولَّد ممّا حُزم فعلًا، ويذكر كل اعتمادية في `package.json`،
 * وناتجه حتمي. والبناء الثاني (`content.js`) يدمج فيه ما حزمه هو.
 */

const root = process.cwd()
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>
}

describe('packageOf — اسم الحزمة من مسار الوحدة', () => {
  it.each([
    ['/r/node_modules/.pnpm/preact@10.29.8/node_modules/preact/dist/preact.mjs', 'preact'],
    [
      '/r/node_modules/.pnpm/@preact+signals@2/node_modules/@preact/signals/dist/s.mjs',
      '@preact/signals',
    ],
    ['C:\\r\\node_modules\\idb\\build\\index.js?commonjs-proxy', 'idb'],
  ])('%s ← %s', (id, name) => {
    expect(packageOf(id)).toBe(name)
  })

  it.each(['/r/src/shared/env.ts', '\0vite/preload-helper.js', '/r/node_modules/.pnpm/lock.yaml'])(
    '%s ليست من حزمة',
    (id) => {
      expect(packageOf(id)).toBeNull()
    },
  )
})

describe('dependencyDirs و readPackage', () => {
  it('الإغلاق يبلغ التبعيات غير المباشرة تحت pnpm', () => {
    const dirs = dependencyDirs(root)
    for (const name of Object.keys(pkg.dependencies)) expect(dirs.has(name), name).toBe(true)
    expect(dirs.has('pako')).toBe(true)
    expect(readPackage('pako', dirs.get('pdf-lib')!).license).toBe('(MIT AND Zlib)')
  })

  it('حزمةٌ لا تُبلغ تُسقط بدل أن تُحذف صامتةً', () => {
    expect(() => readPackage('no-such-package-rasd', root)).toThrow('لم تُعثر')
  })
})

describe('renderLicenses — ناتج حتمي يُقرأ فهرسه آليًّا', () => {
  const a = { name: 'b-lib', version: '1.0.0', license: 'MIT', homepage: null, text: 'B' }
  const b = { name: '@a/lib', version: '2.0.0', license: 'ISC', homepage: 'https://x', text: 'A' }

  it('الترتيب بالاسم أيًّا كان ترتيب الإدخال', () => {
    expect(renderLicenses([a, b], [])).toBe(renderLicenses([b, a], []))
    expect(listedPackages(renderLicenses([a, b], [{ name: 'Cairo', text: 'OFL' }]))).toEqual([
      '@a/lib',
      'b-lib',
    ])
  })
})

describe('الملحق في بناءٍ حقيقي', () => {
  // المدخل داخل المشروع كي تُحلّ الحزم من `node_modules` — و`.cache` مجلّدٌ مخفيّ لا يُحسب حزمة.
  const scratch = () => {
    const cache = join(root, 'node_modules', '.cache')
    mkdirSync(cache, { recursive: true })
    return mkdtempSync(join(cache, 'rasd-licenses-'))
  }
  let dir: string | null = null
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  const run = async (entry: string, mode: 'emit' | 'merge', outDir: string) => {
    const result = await build({
      root: dir!,
      configFile: false,
      logLevel: 'silent',
      plugins: [thirdPartyLicenses({ root, mode })],
      build: {
        outDir,
        write: false,
        emptyOutDir: false,
        minify: false,
        lib: { entry, formats: ['es'], fileName: () => 'out.js' },
      },
    })
    const output = (Array.isArray(result) ? result[0] : result) as Rolldown.RolldownOutput
    const asset = output.output.find((o) => o.fileName === LICENSES_FILE)
    return asset?.type === 'asset' ? String(asset.source) : null
  }

  it('يذكر ما حُزم وكل اعتمادية في package.json — ولا يذكر ما لم يُحزم من الإغلاق', async () => {
    dir = scratch()
    const entry = join(dir, 'entry.js')
    writeFileSync(entry, `import { h } from 'preact'\nexport default h\n`)
    const text = await run(entry, 'emit', join(dir, 'out'))
    const listed = listedPackages(text!)
    for (const name of Object.keys(pkg.dependencies)) expect(listed, name).toContain(name)
    // `pngjs` في إغلاق `pixelmatch` (لأداتها السطرية) ولا يبلغها مصدرٌ محزوم.
    expect(listed).not.toContain('pngjs')
    expect(text).toContain('Almarai (font) — OFL-1.1')
    expect(text).not.toContain(root)
  })

  it('الدمج يضيف ما حزمه البناء الثاني إلى ما كتبه الأوّل', async () => {
    dir = scratch()
    const outDir = join(dir, 'out')
    mkdirSync(outDir)
    writeFileSync(join(outDir, LICENSES_FILE), renderLicenses([readPackage('culori', root)], []))
    const entry = join(dir, 'entry.js')
    writeFileSync(entry, `export { signal } from '@preact/signals'\n`)
    const listed = listedPackages((await run(entry, 'merge', outDir))!)
    expect(listed).toContain('culori')
    expect(listed).toContain('@preact/signals-core')
  })

  it('الدمج بلا ملفٍّ من البناء الأوّل يُسقط البناء', async () => {
    dir = scratch()
    const entry = join(dir, 'entry.js')
    writeFileSync(entry, `export const x = 1\n`)
    await expect(run(entry, 'merge', join(dir, 'empty'))).rejects.toThrow(LICENSES_FILE)
  })
})
