/**
 * `CHANGELOG.md` مصدر بطاقة «ما الجديد» — فهو نصّ واجهة، ويُحرس كنصّ واجهة:
 *
 * - لكل نسخة في `package.json` عنوانٌ ببنود؛ وإلا فترقيةٌ إليها تعلّق بطاقةً لا شيء فيها.
 * - البنود نصٌّ خالص: البطاقة تعرضها كما هي، فـ`**` و`` ` `` و`[..](..)` تظهر حروفًا.
 * - لا رقم مرحلة ولا وحدة — القاعدة نفسها في `no-plan-leak.test.ts`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CHANGELOG, displayVersion, entryFor, parseChangelog } from '@/pages/shell/whats-new'
import { compareVersions, isVersion } from '@/shared/version'

import pkg from '../../package.json' with { type: 'json' }

describe('compareVersions — رقمية لا نصّية', () => {
  it.each([
    ['1.10.0', '1.9.0', 1],
    ['1.0', '1.0.0', 0],
    ['2', '1.99.99.99', 1],
    ['0.1.0', '1.0.0', -1],
    ['1.0.0.1', '1.0.0', 1],
  ])('%s مقابل %s', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign)
  })

  it('النسخة غير الصالحة ترمي ولا تُخمَّن', () => {
    expect(isVersion('1.2.3.4.5')).toBe(false)
    expect(isVersion('1.x')).toBe(false)
    expect(() => compareVersions('abc', '1.0')).toThrow()
  })
})

describe('parseChangelog', () => {
  const source = [
    '# سجلّ التغييرات',
    '',
    '- بند في المقدّمة لا يُقرأ',
    '',
    '## 1.1.0 — 2026-10-02',
    '',
    '- الأوّل',
    '- الثاني  ',
    '',
    '## 1.0.0',
    '- قديم',
    '### ملاحظة داخلية',
    '- خارج البنود',
    '## غير-نسخة',
    '- لا يُقرأ',
  ].join('\n')

  it('يقرأ الإصدارات بترتيبها وبنودها وتاريخها', () => {
    expect(parseChangelog(source)).toEqual([
      { version: '1.1.0', date: '2026-10-02', items: ['الأوّل', 'الثاني'] },
      { version: '1.0.0', date: null, items: ['قديم'] },
    ])
  })

  it('البند الملفوف على أسطر يُقرأ كاملًا لا سطره الأوّل وحده', () => {
    const wrapped = ['## 0.2.0', '- بند طويل يبدأ هنا', '  ويكمل في السطر التالي', '- قصير'].join(
      '\n',
    )
    expect(parseChangelog(wrapped)[0]?.items).toEqual([
      'بند طويل يبدأ هنا ويكمل في السطر التالي',
      'قصير',
    ])
  })

  it('entryFor يطابق 1.0 و1.0.0، ولا يعيد إصدارًا بلا بنود', () => {
    const entries = parseChangelog(source)
    expect(entryFor('1.0', entries)?.items).toEqual(['قديم'])
    expect(entryFor('2.0.0', entries)).toBeNull()
    expect(entryFor('x', entries)).toBeNull()
    expect(entryFor('3.0.0', [{ version: '3.0.0', date: null, items: [] }])).toBeNull()
  })

  it('displayVersion يحذف الأصفار الذيلية بعد الرقمين الأوّلين', () => {
    expect(displayVersion('1.0.0')).toBe('1.0')
    expect(displayVersion('0.1.0')).toBe('0.1')
    expect(displayVersion('1.2.3')).toBe('1.2.3')
    expect(displayVersion('1.2.0.0')).toBe('1.2')
  })
})

describe('CHANGELOG.md كما يُضمَّن في الحزمة', () => {
  it('للنسخة الحالية في package.json عنوانٌ ببنود', () => {
    const entry = entryFor(pkg.version)
    expect(entry, `لا عنوان «## ${pkg.version}» ببنود في CHANGELOG.md`).not.toBeNull()
  })

  it('المضمَّن هو الملفّ نفسه لا نسخة منه', () => {
    const onDisk = parseChangelog(readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8'))
    expect(CHANGELOG).toEqual(onDisk)
  })

  it('البنود نصٌّ خالص بلا تنسيق Markdown ولا رقم خطّة داخلي', () => {
    const items = CHANGELOG.flatMap((e) => e.items)
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item, item).not.toMatch(/[*`[\]_<>]/u)
      expect(item, item).not.toMatch(/(?:المرحلة|الوحدة)\s+\d/u)
    }
  })

  it('لا سطر داخل إصدار يسقط صامتًا: عنوانٌ أو بندٌ أو تكملةٌ مُزاحة', () => {
    const lines = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf8').split(/\r?\n/u)
    const first = lines.findIndex((l) => /^## \d/u.test(l))
    const stray = lines
      .slice(first)
      .filter((l) => l.trim() !== '' && !/^#{1,6}\s|^- |^\s+\S/u.test(l))
    expect(stray).toEqual([])
  })

  it('الإصدارات بأحدثها أوّلًا', () => {
    const versions = CHANGELOG.map((e) => e.version)
    const sorted = [...versions].sort((a, b) => compareVersions(b, a))
    expect(versions).toEqual(sorted)
  })
})
