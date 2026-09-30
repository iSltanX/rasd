// @vitest-environment node

import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  BUDGETS,
  gzipBytes,
  htmlRefs,
  judge,
  pageGraph,
  staticImports,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/bundle-budget.mjs'

/**
 * ميزانيتا الحزمة (`scripts/bundle-budget.mjs`، ADR 0027). السالبة الحاسمة: حشوٌ لا يُضغط
 * فوق السقف يُسقط الحكم، وقطعةٌ مستورَدة ساكنًا خلف قطعة أخرى تُعدّ في النافذة — وإلا نمت
 * الحزمة من الباب الخلفي والرقم المطبوع ثابت.
 */

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function fixture(files: Record<string, string | Buffer>): string {
  const root = mkdtempSync(join(tmpdir(), 'rasd-budget-'))
  dirs.push(root)
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return root
}

describe('الاستيراد الساكن في وحدة مبنيّة', () => {
  it('يلتقط صيغ Vite المصغَّرة كلّها', () => {
    const code = [
      'import{C as e,O as t}from"./TechnicalValue-ClkjZS8m.js";',
      'import"./side-effect.js";',
      'import*as n from"./star.js";',
      'import r from"./default.js";',
      'export{a as b}from"./re-export.js";',
      "export*from'./re-all.js';",
    ].join('')
    expect(staticImports(code).sort()).toEqual(
      [
        './TechnicalValue-ClkjZS8m.js',
        './side-effect.js',
        './star.js',
        './default.js',
        './re-export.js',
        './re-all.js',
      ].sort(),
    )
  })

  it('لا يعدّ import() الديناميكي ولا import.meta ولا نصًّا فيه كلمة from', () => {
    const code =
      'const m=()=>import("./lazy.js");const u=import.meta.url;const s=`copied from "x"`;export default"./not-an-import.js";'
    expect(staticImports(code)).toEqual([])
  })
})

describe('مراجع صفحة HTML', () => {
  it('السكربت و modulepreload وأوراق الأنماط — لا الأيقونة ولا الروابط الأخرى', () => {
    const html = `
      <link rel="icon" href="/icons/icon-16.png" />
      <link rel="stylesheet" href="/assets/tokens.css" />
      <script type="module" crossorigin src="/assets/entry.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/chunk.js">
      <link rel="preconnect" href="https://example.com">`
    expect(htmlRefs(html)).toEqual(['/assets/tokens.css', '/assets/entry.js', '/assets/chunk.js'])
  })
})

describe('مخطّط إقلاع الصفحة', () => {
  it('يتبع الاستيراد الساكن إلى آخره، ويتحمّل الدورات، ويترك الكسول والخطوط', () => {
    const root = fixture({
      'page/index.html':
        '<link rel="stylesheet" href="/assets/fonts.css"><script type="module" src="/assets/entry.js"></script>',
      'assets/fonts.css': "@font-face{src:url('./fonts/a.woff2')}",
      'assets/fonts/a.woff2': randomBytes(64),
      'assets/entry.js': 'import{a}from"./a.js";const l=()=>import("./lazy.js");',
      'assets/a.js': 'import{b}from"./b.js";export const a=1;',
      // `b` لا تذكرها HTML ولا modulepreload: تصل من خلف `a` وحدها.
      'assets/b.js': 'import{a}from"./a.js";export const b=2;',
      'assets/lazy.js': 'export const heavy=1;',
    })
    const graph = pageGraph(root, 'page/index.html')
    expect(graph.files.sort()).toEqual(
      ['assets/a.js', 'assets/b.js', 'assets/entry.js', 'assets/fonts.css'].sort(),
    )
    expect(graph.missing).toEqual([])
  })

  it('مرجعٌ بلا ملفّ يُعاد مفقودًا لا يُتجاهَل', () => {
    const root = fixture({
      'page/index.html': '<script type="module" src="/assets/entry.js"></script>',
      'assets/entry.js': 'import{x}from"./gone.js";',
    })
    expect(pageGraph(root, 'page/index.html').missing).toEqual(['assets/gone.js'])
  })
})

describe('الحكم على الميزانية', () => {
  /** سقف المحتوى مكتوبًا هنا رقمًا: الاختبار الأوّل يثبت أنه ما في السكربت. */
  const CONTENT = 120_000

  it('السقفان كما كُتبا: المحتوى 120,000 والنافذة 80,000 بايت مضغوطة', () => {
    expect(BUDGETS).toEqual({ content: CONTENT, popup: 80_000 })
  })

  it('المساواة داخل السقف، وبايتٌ فوقه يُسقط', () => {
    expect(judge(CONTENT, CONTENT).ok).toBe(true)
    const over = judge(CONTENT + 1, CONTENT)
    expect(over.ok).toBe(false)
    expect(over.over).toBe(1)
  })

  it('حشوٌ عمدي لا يُضغط يرفع الرقم بقدره فيُسقط السقف', () => {
    const base = Buffer.from('var x=1;'.repeat(20_000))
    const padded = Buffer.concat([base, randomBytes(CONTENT)])
    expect(judge(gzipBytes(base), CONTENT).ok).toBe(true)
    const verdict = judge(gzipBytes(padded), CONTENT)
    expect(verdict.ok).toBe(false)
    expect(verdict.bytes).toBeGreaterThan(CONTENT)
  })
})
