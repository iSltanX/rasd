// @vitest-environment node
/**
 * نظام SS (`scripts/ss.mjs`) — كل قاعدة بعيّنة تمرّ وعيّنة تسقط، والمشتقّات تُبنى من المصدر وحده.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  buildModel,
  fill,
  parseStage,
  readStages,
  readTemplates,
  readWaves,
  renderBlock,
  renderBoard,
  validate,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/ss.mjs'

// الوحدة بلا أنواع (`.mjs`)، فتُغلَّف هنا بالأشكال التي تستعملها الاختبارات وحدها.
interface SSStage {
  id: string
  title: string
  status: string
  wave: string
  depends: string[]
  files: string[]
  out: string[]
  closes: string[]
  risks: string[]
  problems: string[]
}
interface Item extends SSStage {
  parallel: string[]
  state: string
  copy: { short: string; full: string; terminal: string }
}
interface Wave {
  letter: string
  gate: string
  solo: boolean
  items: Item[]
  copy: { short: string; full: string; terminal: string }
}
interface Model {
  waves: Wave[]
}
const parse = parseStage as (text: string, file: string) => SSStage
const check = validate as (stages: SSStage[], waves: unknown, templates?: unknown) => string[]
const build = buildModel as (input: Record<string, unknown>) => Model
const block = renderBlock as (model: Model) => string
const board = renderBoard as (model: Model, generated?: string) => string
const fillT = fill as (template: string, values: Record<string, string>) => string
const stagesOf = readStages as () => SSStage[]
const wavesOf = readWaves as () => Record<string, unknown>
const templatesOf = readTemplates as () => Record<string, unknown>

type Overrides = Partial<{
  id: string
  wave: string
  order: number
  depends: string[]
  status: string
  delivery: string
  model: string
  whyModel: string
  size: string
  branch: string
  gate: string
  commit: string
  resume: string
  goal: string
  files: string[]
  closes: string[]
}>

function stageText(o: Overrides = {}): string {
  const id = o.id ?? 'SS1'
  const status = o.status ?? 'pending'
  const head = [
    '---',
    `id: ${id}`,
    `title: مرحلة ${id}`,
    `status: ${status}`,
    `delivery: ${o.delivery ?? (status === 'done' ? 'merged' : 'none')}`,
    `wave: ${o.wave ?? 'A'}`,
    `order: ${o.order ?? 1}`,
    `depends: [${(o.depends ?? []).join(', ')}]`,
    `model: ${o.model ?? 'Sonnet 5.5'}`,
    ...(o.whyModel ? [`why_model: ${o.whyModel}`] : []),
    `size: ${o.size ?? 'S'}`,
    `branch: ${o.branch ?? 'main'}`,
    `gate: ${o.gate ?? 'cone'}`,
    `commit: ${o.commit ?? (status === 'done' ? 'abc1234' : '—')}`,
    'updated: 2026-10-02',
    `resume: ${o.resume ?? 'ابدأ من أوّل مهمّة.'}`,
    '---',
  ]
  const files = o.files ?? ['`src/a.ts`']
  const closes = o.closes ?? ['`pnpm vitest run tests/unit/a.test.ts` أخضر']
  return [
    ...head,
    '',
    `# ${id}`,
    '',
    '## الهدف',
    '',
    o.goal ?? `هدف ${id}.`,
    '',
    '## النطاق',
    '',
    '**الملفّات المتوقَّع تأثّرها**',
    '',
    ...files.map((f) => `- ${f}`),
    '',
    '**خارج النطاق**',
    '',
    '- شيء آخر',
    '',
    '## المهامّ',
    '',
    '1. المهمّة الأولى',
    '',
    '## معايير الإغلاق',
    '',
    ...closes.map((c) => `- ${c}`),
    '',
    '## المخاطر',
    '',
    '- خطر',
    '',
    '## المراجع',
    '',
    '- مرجع',
    '',
  ].join('\n')
}

const stage = (o: Overrides = {}) => parse(stageText(o), `${o.id ?? 'SS1'}.md`)
const WAVES = { A: { why: 'أساس', manual: 'none' }, B: { why: 'توازٍ', manual: 'due' } }
const TEMPLATES = {
  text: '',
  stage:
    'المهمّة: ‹ID› — ‹TITLE› · الفرع ‹BRANCH› · الموجة ‹WAVE›\n‹FILES›\n‹CLOSE›\n‹ROLE›\n‹REPORT›',
  merge: 'إغلاق ‹WAVE› ⇐ ‹NEXT› · ‹STAGES› · ‹GATE› · ‹MERGE_MODEL›\n‹ROLE›',
  report: 'تقرير ‹ID› على ‹BRANCH›',
  roles: { parallel: 'دور متوازٍ ‹BRANCH›', solo: 'دور منفرد ‹ID›', merge: 'دور إغلاق ‹WAVE›' },
}

/** عيّنة سليمة: A منفردة، وB ثلاث مراحل متوازية فوقها. */
function good() {
  return [
    stage({ id: 'SS1', wave: 'A', branch: 'main', gate: 'all' }),
    stage({ id: 'SS2', wave: 'B', order: 1, depends: ['SS1'], branch: 'ss/2-report' }),
    stage({ id: 'SS3', wave: 'B', order: 2, depends: ['SS1'], branch: 'ss/3-packages' }),
    stage({
      id: 'SS4',
      wave: 'B',
      order: 3,
      branch: 'ss/4-brave',
      model: 'Opus 5.5',
      whyModel: 'حجم L',
    }),
  ]
}

describe('قراءة المرحلة', () => {
  it('تقرأ الترويسة والأقسام', () => {
    const s = stage({ id: 'SS7', depends: ['SS1', 'SS3'], files: ['`a`', '`b`'] })
    expect(s.id).toBe('SS7')
    expect(s.depends).toEqual(['SS1', 'SS3'])
    expect(s.files).toEqual(['`a`', '`b`'])
    expect(s.out).toEqual(['شيء آخر'])
    expect(s.closes).toHaveLength(1)
    expect(s.risks).toEqual(['خطر'])
    expect(s.problems).toEqual([])
  })
  it('سطر ترويسة غير مفهوم يُبلَّغ', () => {
    const s = parse(stageText().replace('order: 1', 'order 1'), 'SS1.md')
    expect(s.problems.join(' ')).toContain('غير مفهوم')
  })
})

describe('القواعد — تمرّ على السليم', () => {
  it('العيّنة السليمة بلا مخالفة', () => {
    expect(check(good(), WAVES, TEMPLATES)).toEqual([])
  })
})

describe('كل قاعدة تسقط على مخالفتها', () => {
  const only = (stages: SSStage[], waves: unknown = WAVES) => check(stages, waves).join('\n')
  it('فجوة في الترقيم', () => {
    expect(
      only([stage({ id: 'SS1' }), stage({ id: 'SS3', wave: 'A', order: 2, branch: 'ss/3-x' })]),
    ).toContain('المتوقَّع SS2')
  })
  it('اعتمادية غير موجودة أو على نفسها أو على ما بعدها', () => {
    expect(only([stage({ depends: ['SS9'] })])).toContain('غير موجودة')
    expect(only([stage({ depends: ['SS1'] })])).toContain('تعتمد على نفسها')
    const s = good()
    s[0] = stage({ id: 'SS1', wave: 'A', branch: 'main', depends: ['SS2'] })
    expect(only(s)).toContain('بعدها في الترقيم')
  })
  it('اعتمادية في الموجة نفسها تسقط، وفي موجة أسبق تمرّ', () => {
    const s = good()
    s[2] = stage({ id: 'SS3', wave: 'B', order: 2, depends: ['SS2'], branch: 'ss/3-packages' })
    expect(only(s)).toContain('في الموجة B')
  })
  it('حروف الموجات غير متتابعة', () => {
    const s = [stage({ id: 'SS1' }), stage({ id: 'SS2', wave: 'C', branch: 'main' })]
    expect(only(s, { A: WAVES.A, C: WAVES.B })).toContain('المتوقَّع B')
  })
  it('موجة بلا سطر في waves.json، وسطر بلا موجة', () => {
    expect(only(good(), { A: WAVES.A })).toContain('بلا سطر في waves.json')
    expect(only([stage()], WAVES)).toContain('ولا مرحلة فيها')
  })
  it('order مكرَّر داخل الموجة', () => {
    const s = good()
    s[2] = stage({ id: 'SS3', wave: 'B', order: 1, depends: ['SS1'], branch: 'ss/3-packages' })
    expect(only(s)).toContain('order مكرَّر')
  })
  it('الفرع: المنفردة على main، والمتوازية ss/<n>-slug', () => {
    expect(only([stage({ branch: 'ss/1-x' })])).toContain('main (موجة منفردة)')
    const s = good()
    s[1] = stage({ id: 'SS2', wave: 'B', order: 1, depends: ['SS1'], branch: 'main' })
    expect(only(s)).toContain('ss/2-<slug>')
  })
  it('done تشترط merged وcommit، وغيرها resume', () => {
    expect(only([stage({ status: 'done', delivery: 'branch' })])).toContain('delivery: merged')
    expect(only([stage({ status: 'done', commit: '—' })])).toContain('تشترط commit')
    expect(only([stage({ resume: '—' })])).toContain('resume غائبة')
  })
  it('active واعتماديتها ليست done', () => {
    const s = good()
    s[1] = stage({
      id: 'SS2',
      wave: 'B',
      order: 1,
      depends: ['SS1'],
      branch: 'ss/2-report',
      status: 'active',
    })
    expect(only(s)).toContain('اعتماديتها SS1 ليست done')
  })
  it('active في موجتين', () => {
    const s = good()
    s[0] = stage({ id: 'SS1', wave: 'A', branch: 'main', status: 'active' })
    s[3] = stage({ id: 'SS4', wave: 'B', order: 3, branch: 'ss/4-brave', status: 'active' })
    expect(only(s)).toContain('أكثر من موجة')
  })
  it('نموذج غير معتمد، وأقوى بلا سبب', () => {
    expect(only([stage({ model: 'GPT' })])).toContain('نموذج غير معتمد')
    expect(only([stage({ model: 'Opus 5.5' })])).toContain('بلا why_model')
  })
  it('حجم أو gate أو أقسام غائبة', () => {
    expect(only([stage({ size: 'XXL' })])).toContain('حجم غير معروف')
    expect(only([stage({ gate: 'some' })])).toContain('gate إمّا')
    expect(only([stage({ closes: [] })])).toContain('بلا بند')
    expect(only([stage({ files: [] })])).toContain('فارغة')
  })
  it('دور في الاعتماديات (عبر الموجات)', () => {
    const s = [
      stage({ id: 'SS1', wave: 'A', branch: 'main', depends: [] }),
      stage({ id: 'SS2', wave: 'B', order: 1, depends: ['SS3'], branch: 'ss/2-a' }),
      stage({ id: 'SS3', wave: 'B', order: 2, depends: ['SS2'], branch: 'ss/3-b' }),
    ]
    expect(only(s)).toContain('دور في الاعتماديات')
  })
  it('قوالب غائبة في README', () => {
    expect(check(good(), WAVES, { ...TEMPLATES, stage: null }).join('\n')).toContain('قالب')
  })
})

describe('المشتقّات', () => {
  it('النموذج: التوازي والحالة والبرومبت من المصدر', () => {
    const model = build({
      stages: good(),
      waves: WAVES,
      templates: TEMPLATES,
      tags: new Map([['A', 'abc1234']]),
    })
    expect(model.waves.map((w) => w.letter)).toEqual(['A', 'B'])
    expect(model.waves[0]!.gate).toBe('all')
    expect(model.waves[0]!.items[0]!.state).toBe('ready')
    expect(model.waves[1]!.items[0]!.state).toBe('waiting')
    const ss3 = model.waves[1]!.items[1]!
    expect(ss3.parallel).toEqual(['SS2', 'SS4'])
    expect(ss3.copy.short).toBe('/ss SS3')
    expect(ss3.copy.full).toContain('المهمّة: SS3 — مرحلة SS3 · الفرع ss/3-packages · الموجة B')
    expect(ss3.copy.full).toContain('دور متوازٍ ss/3-packages')
    expect(ss3.copy.full).toContain('تقرير SS3 على ss/3-packages')
    expect(ss3.copy.terminal).toContain('claude --model claude-sonnet-5-5 "/ss SS3"')
    expect(model.waves[1]!.copy.full).toContain('إغلاق B ⇐ — · SS2 — مرحلة SS2')
    expect(model.waves[0]!.items[0]!.copy.full).toContain('دور منفرد SS1')
  })
  it('الكتلة المشتقّة واللوحة تحملان كل مرحلة وأزرار نسخها', () => {
    const model = build({ stages: good(), waves: WAVES, templates: TEMPLATES })
    const text = block(model)
    for (const id of ['SS1', 'SS2', 'SS3', 'SS4'])
      expect(text).toContain(`[${id}](stages/${id}.md)`)
    expect(text).toContain('| B | SS2 · SS3 · SS4 | 3 معًا |')
    const html = board(model, '2026-10-02 00:00')
    expect(html).toContain('dir="rtl"')
    for (const id of ['SS1', 'SS2', 'SS3', 'SS4']) {
      expect(html).toContain(`data-copy="s-${id}-short"`)
      expect(html).toContain(`data-copy="s-${id}-full"`)
      expect(html).toContain(`href="stages/${id}.md"`)
    }
    expect(html).toContain('data-copy="w-B-full"')
    expect(html).not.toContain('data-copy="w-A-full"')
    const data = /<script id="copy-data" type="application\/json">([\s\S]*?)<\/script>/u.exec(
      html,
    )![1]!
    const copy = JSON.parse(data) as Record<string, string>
    expect(copy['s-SS3-full']).toBe(model.waves[1]!.items[1]!.copy.full)
    expect(copy['w-B-short']).toBe('/ss-merge B')
  })
  it('fill يترك المفتاح المجهول كما هو', () => {
    expect(fillT('‹ID› و‹X›', { ID: 'SS1' })).toBe('SS1 و‹X›')
  })
})

describe('المستودع الحقيقي', () => {
  it('Docs/SS سليم بقواعده، ولكل مرحلة بطاقة وبرومبت', () => {
    const stages = stagesOf()
    const waves = wavesOf()
    const templates = templatesOf()
    expect(stages.length).toBeGreaterThan(0)
    expect(check(stages, waves, templates)).toEqual([])
    const model = build({ stages, waves, templates })
    for (const wave of model.waves) {
      for (const item of wave.items) {
        expect(item.copy.full).toContain(`Docs/SS/stages/${item.id}.md`)
        expect(item.copy.full).toContain(item.title)
        expect(item.copy.full).not.toMatch(/‹[A-Z_]+›/u)
      }
      if (!wave.solo) expect(wave.copy.full).not.toMatch(/‹[A-Z_]+›/u)
    }
  })
})

/**
 * CI يسحب الشيفرة بـ`actions/checkout` بعمق 1: نسخة ضحلة بلا وسوم `ss-X/base` ولا فروع `origin/ss/*`.
 * فما يُشتقّ من git لا يُحكم عليه هناك — وكل ما يُشتقّ من المصدر يُحكم عليه حرفيًّا كما في النسخة الكاملة.
 * يُبنى مستودع مؤقّت بالسكربت نفسه ومصدرٍ بموجتين، تُفتح A بوسمها ويُزامَن، ثمّ يُنسخ ضحلًا بلا وسوم.
 */
describe('ss:check بلا مراجع git (نسخة CI الضحلة)', () => {
  const here = join(import.meta.dirname, '..', '..')
  let dir = ''
  let full = ''
  let shallow = ''
  const run = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  const ss = (cwd: string, command: string) =>
    spawnSync(process.execPath, ['scripts/ss.mjs', command], { cwd, encoding: 'utf8' })
  const readme = (cwd: string) => join(cwd, 'Docs', 'SS', 'README.md')
  const edit = (cwd: string, from: string, to: string) => {
    const text = readFileSync(readme(cwd), 'utf8')
    expect(text).toContain(from)
    writeFileSync(readme(cwd), text.replace(from, to))
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rasd-ss-'))
    full = join(dir, 'full')
    shallow = join(dir, 'shallow')
    mkdirSync(join(full, 'scripts'), { recursive: true })
    mkdirSync(join(full, 'Docs', 'SS', 'stages'), { recursive: true })
    for (const file of ['ss.mjs', 'waves-plan.mjs'])
      copyFileSync(join(here, 'scripts', file), join(full, 'scripts', file))
    // القوالب من README الحقيقي؛ والمراحل عيّنة ثابتة كي لا يتعلّق الاختبار بتقدّم الخطّة.
    copyFileSync(join(here, 'Docs', 'SS', 'README.md'), readme(full))
    writeFileSync(join(full, 'Docs', 'SS', 'waves.json'), JSON.stringify(WAVES))
    writeFileSync(join(full, 'Docs', 'SS', 'stages', 'SS1.md'), stageText({ id: 'SS1' }))
    writeFileSync(
      join(full, 'Docs', 'SS', 'stages', 'SS2.md'),
      stageText({ id: 'SS2', wave: 'B', depends: ['SS1'] }),
    )
    run(full, 'init', '-q', '-b', 'main')
    run(full, 'add', '-A')
    run(full, 'commit', '-q', '--no-gpg-sign', '-m', 'المصدر')
    run(full, 'tag', 'ss-A/base')
    expect(ss(full, 'sync').status).toBe(0)
    run(full, 'add', '-A')
    run(full, 'commit', '-q', '--no-gpg-sign', '-m', 'اللوحة')
    expect(readFileSync(readme(full), 'utf8')).toContain('مفتوحة على `ss-A/base`')
    run(dir, 'clone', '-q', '--no-tags', '--depth', '1', `file://${full}`, shallow)
    expect(run(shallow, 'tag', '-l')).toBe('')
  }, 60_000)
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('النسخة الكاملة والضحلة بلا وسوم تعطيان الحكم نفسه', () => {
    expect(ss(full, 'check').status).toBe(0)
    const result = ss(shallow, 'check')
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })

  it('في الضحلة: مخالفة مشتقّة من المصدر تسقط', () => {
    run(shallow, 'checkout', '-q', '--', '.')
    edit(shallow, '| [SS2](stages/SS2.md) | مرحلة SS2 |', '| [SS2](stages/SS2.md) | عنوان آخر |')
    expect(ss(shallow, 'check').status).toBe(1)
  })

  it('في الضحلة: حقل git بقيمة ليست من بدائله يسقط', () => {
    run(shallow, 'checkout', '-q', '--', '.')
    edit(shallow, '| مفتوحة على `ss-A/base` |', '| شيء آخر |')
    expect(ss(shallow, 'check').status).toBe(1)
  })

  it('في الضحلة: مخالفة قاعدة في المصدر تسقط كما كانت', () => {
    run(shallow, 'checkout', '-q', '--', '.')
    const file = join(shallow, 'Docs', 'SS', 'stages', 'SS2.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('depends: [SS1]', 'depends: [SS9]'))
    expect(ss(shallow, 'check').status).toBe(1)
  })

  it('في الكاملة: حقول git تُقارَن — وسمٌ غائب يُسقط ما يدّعي فتح موجته', () => {
    run(full, 'tag', '-d', 'ss-A/base')
    try {
      expect(ss(full, 'check').status).toBe(1)
    } finally {
      run(full, 'tag', 'ss-A/base')
    }
  })
})
