// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
}
interface Packed {
  problems?: string[]
  zip?: Buffer
  sha?: string
  name?: string
  prerelease?: boolean
}
/** تعريفات المكتبة غير المكتوبة — تُعلَن هنا مرّة فلا يتسرّب `any` إلى الاختبارات. */
const { chromeVersionProblem, pack, packageProblems, parseTag, sha256, tagProblems, zip } =
  raw as unknown as {
    chromeVersionProblem: (version: string) => string | null
    pack: (
      o: Facts & { files: Entry[]; tag?: string; tags?: string[]; verify: () => boolean },
    ) => Packed
    packageProblems: (files: Entry[], facts: Facts) => string[]
    parseTag: (tag: string) => { version: string; prerelease: string | null } | null
    sha256: (data: Buffer) => string
    tagProblems: (tag: string, version: string, tags: string[]) => string[]
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
