// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

// @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
import * as raw from '../../../scripts/lib/release-pack.mjs'

interface Entry {
  path: string
  data: Buffer
}
interface Facts {
  version: string
  dependencies: string[]
  target?: 'chromium' | 'firefox'
}
interface Packed {
  problems?: string[]
  zip?: Buffer
  sha?: string
  name?: string
  prerelease?: boolean
  count?: number
}
interface LintMessage {
  code: string
  file?: string
  message?: string
}
interface LintReport {
  errors: LintMessage[]
  warnings: LintMessage[]
  notices: LintMessage[]
}
/** تعريفات المكتبة غير المكتوبة — تُعلَن هنا مرّة فلا يتسرّب `any` إلى الاختبارات. */
const {
  chromeVersionProblem,
  lintProblems,
  pack,
  packSource,
  packageName,
  packageProblems,
  parseTag,
  sha256,
  sourceProblems,
  tagProblems,
  tarFiles,
  zip,
} = raw as unknown as {
  chromeVersionProblem: (version: string) => string | null
  lintProblems: (report: unknown) => string[]
  pack: (
    o: Facts & {
      files: Entry[]
      tag?: string
      tags?: string[]
      verify: () => boolean
      lint?: (() => string[]) | null
    },
  ) => Packed
  packSource: (o: {
    tar: Buffer
    readme: string
    version: string
    tag?: string
    tags?: string[]
  }) => Packed
  packageName: (label: string, kind?: 'chromium' | 'firefox' | 'source') => string
  packageProblems: (files: Entry[], facts: Facts) => string[]
  parseTag: (tag: string) => { version: string; prerelease: string | null } | null
  sha256: (data: Buffer) => string
  sourceProblems: (o: {
    dirty: string[]
    tag?: string | null
    head: string
    tagCommit?: string | null
  }) => string[]
  tagProblems: (tag: string, version: string, tags: string[]) => string[]
  tarFiles: (tar: Buffer) => Entry[]
  zip: (files: Entry[]) => Buffer
}

/**
 * حزمة الإصدار (`STAGES/27`): الضغط حتمي، والفحص يرفض ما لا يُشحن، والوسم لا يُنقص النسخة.
 * كل قاعدة بحالتين: حزمة سليمة تمرّ، وأخرى معيبة بعيبٍ واحد تسقط باسمه.
 */

const file = (path: string, text: string) => ({ path, data: Buffer.from(text, 'utf8') })

const LICENSES = [
  'Rasd — third-party software notices',
  '',
  '  preact@10.0.0 — MIT',
  '  idb@8.0.0 — ISC',
  '',
  '='.repeat(72),
  '',
  'preact@10.0.0',
].join('\n')

/** حزمة سليمة صغيرة — كل اختبار سالب يُفسد فيها شيئًا واحدًا. */
const healthy = () => [
  file('manifest.json', JSON.stringify({ manifest_version: 3, version: '1.2.3' })),
  file('THIRD_PARTY_LICENSES.txt', LICENSES),
  file('assets/settings-abc.js', 'export const a = 1\n'),
  file('assets/ViewportGallery-abc.js', 'export const b = 2\n'),
  file('src/pages/popup/index.html', '<!doctype html><title>رصد</title>'),
]
const facts = { version: '1.2.3', dependencies: ['preact', 'idb'] }

describe('zip — ضغط حتمي', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('المحتوى نفسه بأي ترتيب يعطي البايتات نفسها', () => {
    const files = healthy()
    expect(sha256(zip(files))).toBe(sha256(zip([...files].reverse())))
  })

  it('تغيير بايت واحد يغيّر البصمة', () => {
    const files = healthy()
    const changed = files.map((f) =>
      f.path === 'assets/settings-abc.js' ? file(f.path, 'export const a = 2\n') : f,
    )
    expect(sha256(zip(changed))).not.toBe(sha256(zip(files)))
  })

  it('أداة unzip تقرؤه سليمًا وتستخرج المحتوى كما هو', () => {
    dir = mkdtempSync(join(tmpdir(), 'rasd-zip-'))
    const archive = join(dir, 'a.zip')
    const files = healthy()
    writeFileSync(archive, zip(files))
    expect(execFileSync('unzip', ['-tq', archive], { encoding: 'utf8' })).toContain('No errors')
    const names = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n')
    expect(names).toEqual(files.map((f) => f.path).sort())
    for (const f of files) {
      expect(execFileSync('unzip', ['-p', archive, f.path])).toEqual(f.data)
    }
  })
})

describe('packageProblems — ما لا يُشحن', () => {
  it('الحزمة السليمة بلا عيوب — وبينها ViewportGallery لا تُحسب صفحة معاينة', () => {
    expect(packageProblems(healthy(), facts)).toEqual([])
  })

  it.each([
    ['src/pages/popup-preview/index.html', 'popup-preview'],
    ['src/pages/capture-preview/index.html', 'capture-preview'],
    ['src/pages/gallery/index.html', 'gallery'],
    ['assets/gallery-abc.js', 'gallery'],
  ])('صفحة المعاينة %s تُرفض', (path, label) => {
    const problems = packageProblems([...healthy(), file(path, 'x')], facts)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(label)
  })

  it('خريطة المصدر والإشارة إليها تُرفضان', () => {
    const problems = packageProblems(
      [
        ...healthy(),
        file('assets/settings-abc.js.map', '{}'),
        file('assets/editor-abc.js', 'x\n//# sourceMappingURL=editor-abc.js.map\n'),
      ],
      facts,
    )
    expect(problems).toEqual([
      'خريطة مصدر في الحزمة: assets/settings-abc.js.map',
      'إشارة إلى خريطة مصدر في: assets/editor-abc.js',
    ])
  })

  it('نسخة البيان التي تخالف package.json تُرفض — المصدر واحد', () => {
    const files = healthy().map((f) =>
      f.path === 'manifest.json' ? file(f.path, JSON.stringify({ version: '1.2.2' })) : f,
    )
    expect(packageProblems(files, facts)).toEqual([
      'نسخة البيان «1.2.2» لا تطابق package.json «1.2.3» — المصدر واحد',
    ])
  })

  it('بيانٌ مفقود أو تالف يُرفض', () => {
    const without = healthy().filter((f) => f.path !== 'manifest.json')
    expect(packageProblems(without, facts)).toEqual(['لا manifest.json في الحزمة'])
    const broken = healthy().map((f) => (f.path === 'manifest.json' ? file(f.path, '{') : f))
    expect(packageProblems(broken, facts)).toEqual(['manifest.json ليس JSON صالحًا'])
  })

  it('ملفّ التراخيص المفقود، أو الذي لا يذكر اعتماديةً، يُرفض', () => {
    const without = healthy().filter((f) => f.path !== 'THIRD_PARTY_LICENSES.txt')
    expect(packageProblems(without, facts)).toEqual(['لا THIRD_PARTY_LICENSES.txt في الحزمة'])
    expect(
      packageProblems(healthy(), { ...facts, dependencies: ['preact', 'idb', 'culori'] }),
    ).toEqual(['THIRD_PARTY_LICENSES.txt لا يذكر: culori'])
  })
})

describe('chromeVersionProblem — صيغة النسخة التي يقبلها Chrome', () => {
  it.each(['0.1.0', '1.0.0', '1.2.3.4', '65535.0.0'])('%s مقبولة', (v) => {
    expect(chromeVersionProblem(v)).toBeNull()
  })
  it.each(['1.2.3-beta', '01.2.3', '1.2.3.4.5', '65536.0.0', '0.0.0', 'v1.2.3', ''])(
    '%s مرفوضة',
    (v) => {
      expect(chromeVersionProblem(v)).not.toBeNull()
    },
  )
})

describe('tagProblems — الوسم يطابق النسخة ولا يُنقصها', () => {
  it('parseTag يميّز الإصدار من التجريبي', () => {
    expect(parseTag('v1.2.3')).toEqual({ version: '1.2.3', prerelease: null })
    expect(parseTag('v1.2.3-trial.1')).toEqual({ version: '1.2.3', prerelease: 'trial.1' })
    expect(parseTag('1.2.3')).toBeNull()
    expect(parseTag('v1.2')).toBeNull()
  })

  it('الإصدار الأوّل والإصدار الأعلى يمرّان', () => {
    expect(tagProblems('v1.2.3', '1.2.3', [])).toEqual([])
    expect(tagProblems('v1.2.3', '1.2.3', ['v1.2.3', 'v1.2.2', 'v0.9.10', 'wave-01/base'])).toEqual(
      [],
    )
  })

  it('وسمٌ لا يطابق package.json يُرفض', () => {
    expect(tagProblems('v1.2.4', '1.2.3', [])).toEqual([
      'الوسم «v1.2.4» لا يطابق نسخة package.json «1.2.3»',
    ])
  })

  it('نسخةٌ لا تعلو إصدارًا سابقًا تُرفض — ومقارنة الأعداد لا النصوص', () => {
    expect(tagProblems('v1.2.3', '1.2.3', ['v1.10.0'])).toHaveLength(1)
    expect(tagProblems('v1.2.3', '1.2.3', ['v1.2.3-trial.1', 'v1.2.30'])).toHaveLength(1)
  })

  it('التجريبي يطابق النسخة ولا يُقاس بالسلسلة، والوسم المشوَّه يُرفض', () => {
    expect(tagProblems('v1.2.3-trial.1', '1.2.3', ['v9.0.0'])).toEqual([])
    expect(tagProblems('release-1', '1.2.3', [])).toHaveLength(1)
  })
})

describe('pack — الفحص قبل الضغط', () => {
  it('سقوط verify:dist يرفض الضغط قبل أي فحص آخر', () => {
    const verify = vi.fn(() => false)
    expect(pack({ files: healthy(), ...facts, verify })).toEqual({
      problems: ['فحص الحزمة (verify:dist) سقط — لا ضغط'],
    })
    expect(verify).toHaveBeenCalledOnce()
  })

  it('عيبٌ في الحزمة أو الوسم يرفض الضغط', () => {
    const files = [...healthy(), file('assets/x.js.map', '{}')]
    expect(pack({ files, ...facts, verify: () => true }).problems).toHaveLength(1)
    expect(
      pack({ files: healthy(), ...facts, tag: 'v2.0.0', verify: () => true }).problems,
    ).toEqual(['الوسم «v2.0.0» لا يطابق نسخة package.json «1.2.3»'])
  })

  it('الحزمة السليمة تُضغط باسم نسختها وبصمتها', () => {
    const result = pack({ files: healthy(), ...facts, verify: () => true })
    expect(result.name).toBe('rasd-1.2.3.zip')
    expect(result.prerelease).toBe(false)
    expect(result.sha).toBe(sha256(zip(healthy())))
  })

  it('الوسم التجريبي يسمّي الحزمة بلاحقته ويعلّمها تجريبية', () => {
    const result = pack({ files: healthy(), ...facts, tag: 'v1.2.3-trial.1', verify: () => true })
    expect(result.name).toBe('rasd-1.2.3-trial.1.zip')
    expect(result.prerelease).toBe(true)
  })
})

// ═══ SS3 — حزمة Firefox وحزمة المصدر ═════════════════════════════════

/** بيان Firefox سليم صغير: النسخة نفسها ومعها `gecko.id`. */
const firefoxFiles = (manifest: object) =>
  healthy().map((f) =>
    f.path === 'manifest.json'
      ? file(f.path, JSON.stringify({ version: '1.2.3', ...manifest }))
      : f,
  )
const GECKO = { browser_specific_settings: { gecko: { id: 'rasd@example.com' } } }

describe('حزمة Firefox — gecko.id إلزامي', () => {
  const firefox = { ...facts, target: 'firefox' as const }

  it('بيانٌ فيه gecko.id يمرّ، وبيان Chromium بلا gecko.id يمرّ كما كان', () => {
    expect(packageProblems(firefoxFiles(GECKO), firefox)).toEqual([])
    expect(packageProblems(healthy(), facts)).toEqual([])
  })

  it.each([
    ['بلا browser_specific_settings', {}],
    ['بلا gecko', { browser_specific_settings: {} }],
    ['gecko.id فارغ', { browser_specific_settings: { gecko: { id: '' } } }],
    ['gecko.id ليس نصًّا', { browser_specific_settings: { gecko: { id: 7 } } }],
  ])('حزمة Firefox %s تُرفض', (_label, manifest) => {
    expect(packageProblems(firefoxFiles(manifest), firefox)).toEqual([
      'حزمة Firefox بلا browser_specific_settings.gecko.id — التوقيع يشترطه',
    ])
  })

  it('الفحص المشترك يسري عليها: خريطة مصدر ونسخة بيان مخالفة', () => {
    const files = [...firefoxFiles(GECKO), file('assets/x.js.map', '{}')]
    expect(packageProblems(files, firefox)).toEqual(['خريطة مصدر في الحزمة: assets/x.js.map'])
    const wrong = firefoxFiles({ ...GECKO, version: '9.9.9' })
    expect(packageProblems(wrong, firefox)).toHaveLength(1)
  })
})

describe('packageName — اسم كل حزمة', () => {
  it('Chromium بلا لاحقة، وFirefox والمصدر بلاحقتهما', () => {
    expect(packageName('1.2.3')).toBe('rasd-1.2.3.zip')
    expect(packageName('1.2.3', 'firefox')).toBe('rasd-1.2.3-firefox.zip')
    expect(packageName('1.2.3-trial.2', 'source')).toBe('rasd-1.2.3-trial.2-source.zip')
  })
})

describe('pack لـFirefox — verify ثمّ web-ext lint ثمّ الوسم', () => {
  const firefox = { ...facts, target: 'firefox' as const }

  it('الحزمة السليمة تُضغط باسم -firefox وبالبصمة الحتمية نفسها', () => {
    const lint = vi.fn(() => [])
    const result = pack({ files: firefoxFiles(GECKO), ...firefox, verify: () => true, lint })
    expect(result.name).toBe('rasd-1.2.3-firefox.zip')
    expect(result.sha).toBe(sha256(zip(firefoxFiles(GECKO))))
    expect(lint).toHaveBeenCalledOnce()
  })

  it('عيبُ مدقّق AMO يرفض الضغط باسمه', () => {
    const result = pack({
      files: firefoxFiles(GECKO),
      ...firefox,
      verify: () => true,
      lint: () => ['web-ext lint — خطأ MANIFEST_FIELD_INVALID (manifest.json): …'],
    })
    expect(result.zip).toBeUndefined()
    expect(result.problems).toEqual([
      'web-ext lint — خطأ MANIFEST_FIELD_INVALID (manifest.json): …',
    ])
  })

  it('سقوط verify:dist يمنع تشغيل المدقّق أصلًا', () => {
    const lint = vi.fn(() => [])
    const result = pack({ files: firefoxFiles(GECKO), ...firefox, verify: () => false, lint })
    expect(result.problems).toEqual(['فحص الحزمة (verify:dist) سقط — لا ضغط'])
    expect(lint).not.toHaveBeenCalled()
  })

  it('الوسم التجريبي يسمّي حزمة Firefox بلاحقته', () => {
    const result = pack({
      files: firefoxFiles(GECKO),
      ...firefox,
      tag: 'v1.2.3-trial.1',
      verify: () => true,
    })
    expect(result.name).toBe('rasd-1.2.3-trial.1-firefox.zip')
    expect(result.prerelease).toBe(true)
  })
})

describe('lintProblems — تقرير web-ext lint', () => {
  const warn = (code: string, file = 'content.js') => ({ code, file, message: 'Unsafe assignment' })
  const report = (over: Partial<LintReport> = {}): LintReport => ({
    errors: [],
    warnings: [warn('UNSAFE_VAR_ASSIGNMENT'), warn('UNSAFE_VAR_ASSIGNMENT', 'assets/RasdMark.js')],
    notices: [],
    ...over,
  })

  it('صفر خطأ مع تحذيرَي innerHTML المعروفين يمرّ', () => {
    expect(lintProblems(report())).toEqual([])
    expect(lintProblems(report({ warnings: [] }))).toEqual([])
  })

  it('خطأٌ واحد يُرفض باسم رمزه وملفّه', () => {
    const problems = lintProblems(
      report({
        errors: [{ code: 'MANIFEST_FIELD_INVALID', file: 'manifest.json', message: 'bad' }],
      }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('MANIFEST_FIELD_INVALID')
    expect(problems[0]).toContain('manifest.json')
  })

  it('تحذيرٌ ثالث من innerHTML، أو تحذيرٌ من نوعٍ آخر، أو ملاحظة، يُرفض', () => {
    const third = report({
      warnings: [...report().warnings, warn('UNSAFE_VAR_ASSIGNMENT', 'assets/new.js')],
    })
    expect(lintProblems(third)).toEqual(['web-ext lint — 3 تحذير UNSAFE_VAR_ASSIGNMENT والمسموح 2'])
    const other = report({ warnings: [warn('KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION')] })
    expect(lintProblems(other)).toEqual([
      'web-ext lint — 1 تحذير KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION والمسموح 0',
    ])
    expect(lintProblems(report({ notices: [warn('NOTE')] }))).toHaveLength(1)
  })

  it.each([
    null,
    undefined,
    'x',
    {},
    { errors: [], warnings: [] },
    { errors: 0, warnings: [], notices: [] },
  ])('تقريرٌ فاسد %j يُرفض لا يُعدّ نظيفًا', (bad) => {
    expect(lintProblems(bad)).toEqual(['تقرير web-ext lint فاسد — لا أخطاء ولا تحذيرات مقروءة'])
  })
})

describe('sourceProblems — حزمة المصدر من التزامٍ لا من شجرة', () => {
  const head = 'a'.repeat(40)

  it('شجرةٌ نظيفة بلا وسم، أو بوسمٍ يشير إلى HEAD، تمرّ', () => {
    expect(sourceProblems({ dirty: [], head })).toEqual([])
    expect(sourceProblems({ dirty: [], head, tag: 'v1.2.3', tagCommit: head })).toEqual([])
  })

  it('شجرةٌ غير نظيفة تُرفض بعدّ المداخل وأمثلتها', () => {
    const problems = sourceProblems({ dirty: [' M src/a.ts', '?? new.txt'], head })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('2 مدخلًا')
    expect(problems[0]).toContain('src/a.ts')
  })

  it('وسمٌ يشير إلى غير HEAD أو غير موجود يُرفض', () => {
    expect(
      sourceProblems({ dirty: [], head, tag: 'v1.2.3', tagCommit: 'b'.repeat(40) }),
    ).toHaveLength(1)
    expect(sourceProblems({ dirty: [], head, tag: 'v1.2.3', tagCommit: null })).toHaveLength(1)
  })
})

describe('حزمة المصدر — git archive ثمّ الضغط الحتمي', () => {
  let repo: string | null = null
  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true })
    repo = null
  })

  const git = (cwd: string, ...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      {
        cwd,
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
      },
    )

  /** مستودعٌ مؤقّت فيه ملفّ عربي ومسارٌ فوق مئة حرف (يكتبه git بترويسة pax) والتزامٌ واحد. */
  function makeRepo(extra?: (dir: string) => void) {
    repo = mkdtempSync(join(tmpdir(), 'rasd-src-'))
    git(repo, 'init', '-q')
    const longDir = join('docs', 'a'.repeat(60), 'b'.repeat(60))
    mkdirSync(join(repo, longDir), { recursive: true })
    mkdirSync(join(repo, 'src'))
    writeFileSync(join(repo, 'package.json'), '{"name":"x"}\n')
    writeFileSync(join(repo, 'src', 'رصد.ts'), 'export const a = 1\n')
    writeFileSync(join(repo, longDir, 'long.md'), 'long\n')
    writeFileSync(join(repo, 'SOURCE-README.md'), 'قديم\n')
    extra?.(repo)
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'init')
    return { dir: repo, longPath: `${longDir.split('\\').join('/')}/long.md` }
  }
  const archive = (dir: string) => git(dir, 'archive', '--format=tar', 'HEAD')

  it('tarFiles يقرأ ملفّات الالتزام كما هي — بما فيها الاسم العربي والمسار الطويل', () => {
    const { dir, longPath } = makeRepo()
    const files = tarFiles(archive(dir))
    const byPath = new Map(files.map((f) => [f.path, f.data.toString('utf8')]))
    expect([...byPath.keys()].sort()).toEqual(
      ['SOURCE-README.md', 'package.json', 'src/رصد.ts', longPath].sort(),
    )
    expect(byPath.get('src/رصد.ts')).toBe('export const a = 1\n')
    expect(byPath.get(longPath)).toBe('long\n')
    expect(longPath.length).toBeGreaterThan(100)
  })

  it('packSource يضع README البناء في الجذر بدل نسخةٍ قديمة، وunzip يقرؤه سليمًا', () => {
    const { dir } = makeRepo()
    const result = packSource({ tar: archive(dir), readme: 'بناء\n', version: '1.2.3' })
    expect(result.name).toBe('rasd-1.2.3-source.zip')
    expect(result.count).toBe(4)
    const out = mkdtempSync(join(tmpdir(), 'rasd-srcz-'))
    try {
      const path = join(out, 's.zip')
      writeFileSync(path, result.zip as Buffer)
      expect(execFileSync('unzip', ['-tq', path], { encoding: 'utf8' })).toContain('No errors')
      expect(execFileSync('unzip', ['-p', path, 'SOURCE-README.md'], { encoding: 'utf8' })).toBe(
        'بناء\n',
      )
      expect(execFileSync('unzip', ['-p', path, 'src/رصد.ts'], { encoding: 'utf8' })).toBe(
        'export const a = 1\n',
      )
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('الالتزام نفسه يعطي البصمة نفسها، وتغيير ملفّ في الالتزام التالي يغيّرها', () => {
    const { dir } = makeRepo()
    const first = packSource({ tar: archive(dir), readme: 'r', version: '1.2.3' })
    expect(packSource({ tar: archive(dir), readme: 'r', version: '1.2.3' }).sha).toBe(first.sha)
    writeFileSync(join(dir, 'package.json'), '{"name":"y"}\n')
    git(dir, 'commit', '-qam', 'next')
    expect(packSource({ tar: archive(dir), readme: 'r', version: '1.2.3' }).sha).not.toBe(first.sha)
  })

  it('الوسم يُفحص بقواعده: ما لا يطابق النسخة يُرفض قبل أي أرشفة', () => {
    expect(
      packSource({ tar: Buffer.alloc(0), readme: 'r', version: '1.2.3', tag: 'v2.0.0' }),
    ).toEqual({
      problems: ['الوسم «v2.0.0» لا يطابق نسخة package.json «1.2.3»'],
    })
    const trial = packSource({
      tar: Buffer.alloc(1024),
      readme: 'r',
      version: '1.2.3',
      tag: 'v1.2.3-trial.1',
    })
    expect(trial.name).toBe('rasd-1.2.3-trial.1-source.zip')
    expect(trial.prerelease).toBe(true)
  })

  it('رابطٌ رمزي في الالتزام يُرفض باسمه — المصدر ملفّات عادية وحدها', () => {
    const { dir } = makeRepo((d) => symlinkSync('package.json', join(d, 'link.json')))
    expect(() => tarFiles(archive(dir))).toThrow(/link\.json/)
  })
})
