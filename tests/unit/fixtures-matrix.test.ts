// @vitest-environment node
// يقرأ المصفوفة والعيّنات من القرص ويشغّل خادم العيّنات، فلا علاقة له بالـDOM.

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * مصفوفة عيّنات المواقع (`Docs/Engineering.md §5`) ومواءمتها مع المجلّدات (`STAGES/17`).
 *
 * المواءمة جدولٌ في `tests/fixtures/sites/README.md`. وهنا يُثبَت أنه لا يكذب: كل صفّ في المصفوفة له
 * صفّ مواءمة، وكل موضع مسمّى موجود فعلًا، ولا عيّنة تطلب أصلًا خارجيًّا — والأصل الثاني حيٌّ على المنفذ
 * التالي ويخدم ما تطلبه عيّنتاه.
 */
const root = join(__dirname, '..', '..')
const sites = join(root, 'tests', 'fixtures', 'sites')

/** صفوف جدولٍ بترويسته — الخلايا بلا علامات الشيفرة. */
function tableRows(markdown: string, header: RegExp): string[][] {
  const lines = markdown.split('\n')
  const start = lines.findIndex((l) => header.test(l))
  if (start < 0) return []
  const rows: string[][] = []
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break
    rows.push(
      line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim().replace(/`/gu, '')),
    )
  }
  return rows
}

const engineering = readFileSync(join(root, 'Docs', 'Engineering.md'), 'utf8')
const matrixSection = engineering.slice(
  engineering.indexOf('## 5. مصفوفة اختبار المواقع'),
  engineering.indexOf('## 6.'),
)
const matrix = tableRows(matrixSection, /^\| # \| العيّنة \|/u).map(([n, name]) => ({
  n: Number(n),
  name,
}))

const readme = readFileSync(join(sites, 'README.md'), 'utf8')
const mapping = tableRows(readme, /^\| #\s+\| صفّ المصفوفة/u).map(([n, row, place]) => ({
  n: Number(n),
  row,
  place,
}))

describe('مصفوفة العيّنات ومواءمتها', () => {
  it('المصفوفة عشرون صفًّا، والمواءمة عشرون', () => {
    expect(matrix).toHaveLength(20)
    expect(mapping).toHaveLength(20)
  })

  it('كل صفّ في المصفوفة له صفّ مواءمة بالرقم والاسم نفسيهما', () => {
    for (const { n, name } of matrix) {
      const m = mapping.find((r) => r.n === n)
      expect(m, `الصفّ ${n}`).toBeDefined()
      expect(m?.row, `الصفّ ${n}`).toBe(name)
    }
  })

  it.each(mapping.map((m) => [m.n, m.place]))('الصفّ %i: الموضع «%s» موجود', (_, place) => {
    const path = join(sites, String(place))
    expect(existsSync(path), String(place)).toBe(true)
    const page = statSync(path).isDirectory() ? join(path, 'index.html') : path
    expect(existsSync(page), page).toBe(true)
  })
})

/** كل ملفّ في العيّنات بامتداد يُقرأ نصًّا. */
function textFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return textFiles(p)
    return /\.(html|css|js)$/u.test(e.name) ? [p] : []
  })
}

describe('لا عيّنة تطلب أصلًا خارجيًّا', () => {
  /*
   * مساحة اسم SVG ليست طلبًا، وعنوان الأصل الثاني يُحسَب من `location.port` على 127.0.0.1. وأي عنوان
   * غيرهما يعني أن «رصد لا يُصدر أي طلب» لم يعد قابلًا للإثبات على هذه العيّنات.
   */
  // المطابقة تقف عند أوّل فراغ أو قوس، فعنوان الأصل الثاني يُقرأ حتى `location.port`.
  const allowed = /^https?:\/\/(www\.w3\.org\/|127\.0\.0\.1:\$\{Number\(location\.port$)/u

  it.each(textFiles(sites).map((f) => [f.slice(sites.length + 1), f]))('%s', (_, file) => {
    const urls = readFileSync(String(file), 'utf8').match(/https?:\/\/[^\s"'<>)]+/gu) ?? []
    expect(urls.filter((u) => !allowed.test(u))).toEqual([])
  })
})

describe('الأصل الثاني حيّ على المنفذ التالي', () => {
  // منفذان بعيدان عن منفذ الحرّاس (5399/5400) كي لا يتعارض الاختبار مع جولة `verify:wave` جارية.
  const PORT = 5461
  let server: ReturnType<typeof spawn>

  beforeAll(async () => {
    server = spawn(process.execPath, [join(root, 'scripts', 'fixtures-serve.mjs')], {
      env: { ...process.env, RASD_FIXTURES_PORT: String(PORT) },
      stdio: 'ignore',
    })
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) return
      } catch {
        /* لم يجهز */
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  })

  afterAll(() => {
    server.kill()
  })

  it('الأوّل يحمل بصمة الجذر، والثاني يخدم الجذر نفسه', async () => {
    const first = await (await fetch(`http://127.0.0.1:${PORT}/`)).text()
    const second = await (await fetch(`http://127.0.0.1:${PORT + 1}/`)).text()
    expect(first).toContain('rasd fixtures')
    expect(second).toBe(first)
  })

  it('ورقة الأنماط البعيدة تُخدَم من الأصل الثاني بنوعها', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT + 1}/cross-origin-css/remote.css`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/css/u)
    expect(await res.text()).toContain('#remote-styled')
  })

  it('إطار الأصل الثاني يُخدَم', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT + 1}/iframes/frame.html`)
    expect(res.status).toBe(200)
  })
})
