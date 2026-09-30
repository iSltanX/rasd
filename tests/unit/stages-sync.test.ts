// @vitest-environment node
// يشغّل `scripts/stages-sync.mjs` عمليةً كاملة على مجلّدات مؤقّتة — لا DOM.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

/**
 * قواعد `wave` في مزامنة المراحل (ADR 0026) — بحالتيها.
 *
 * الأداة تُشغَّل كما تُشغَّل في البوّابة: عملية `node` بتجاوزَي `RASD_STAGES_DIR` و
 * `RASD_STAGES_OUT` نحو مجلّد مؤقّت، فلا يُمسّ `STAGES/` الحقيقي ولا مشتقّاه. وكل قاعدة
 * جديدة تُثبَت بعيّنة تمرّ عليها وعيّنة تسقط عليها برسالتها.
 */

type Stage = {
  id: number
  status?: 'pending' | 'active' | 'paused' | 'done'
  delivery?: 'none' | 'local' | 'branch' | 'merged'
  depends?: number[]
  wave?: number | string
  commit?: string
}

const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

const pad = (id: number) => String(id).padStart(2, '0')

function stageFile(stage: Stage): string {
  const status = stage.status ?? 'pending'
  const lines = [
    '---',
    `id: ${stage.id}`,
    `title: مرحلة ${pad(stage.id)}`,
    `status: ${status}`,
    `delivery: ${stage.delivery ?? (status === 'done' ? 'merged' : 'none')}`,
    `depends: [${(stage.depends ?? []).join(', ')}]`,
    ...(stage.wave === undefined ? [] : [`wave: ${stage.wave}`]),
    `commit: ${stage.commit ?? (status === 'done' ? 'abc1234' : '—')}`,
    'updated: 2026-09-30',
    `resume: ${status === 'done' ? 'مكتملة.' : 'ابدأ من أوّل مهمّة.'}`,
    '---',
    '',
    `# المرحلة ${pad(stage.id)}`,
    '',
  ]
  return lines.join('\n')
}

/** يكتب مصدرًا مؤقّتًا ويشغّل الأداة عليه؛ `check` يشغّلها بعد المزامنة بـ`--check`. */
function run(stages: Stage[], check = false) {
  const root = mkdtempSync(join(tmpdir(), 'rasd-stages-'))
  roots.push(root)
  const dir = join(root, 'STAGES')
  mkdirSync(dir)
  for (const stage of stages) writeFileSync(join(dir, `${pad(stage.id)}.md`), stageFile(stage))
  writeFileSync(
    join(dir, 'baseline.json'),
    JSON.stringify({ repo: 'x/y', commit: 'abc1234', date: '2026-09-13', summary: 'أساس' }),
  )
  writeFileSync(join(root, 'ROADMAP.md'), '# خارطة\n\n<!-- stages:begin -->\n<!-- stages:end -->\n')
  const env = { ...process.env, RASD_STAGES_DIR: dir, RASD_STAGES_OUT: root }
  const exec = (args: string[]) =>
    spawnSync(process.execPath, ['scripts/stages-sync.mjs', ...args], { env, encoding: 'utf8' })
  let result = exec([])
  if (check && result.status === 0) result = exec(['--check'])
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    read: (name: string) => readFileSync(join(root, name), 'utf8'),
  }
}

const done = (id: number): Stage => ({ id, status: 'done' })

describe('أكثر من مرحلة active', () => {
  it('يجوز حين تحمل كلّها موجة واحدة — والمشتقّان يطابقان', () => {
    const result = run(
      [
        done(1),
        { id: 2, status: 'active', depends: [1], wave: 1 },
        { id: 3, status: 'active', depends: [1], wave: 1 },
      ],
      true,
    )
    expect(result.output).toContain('المشتقّان يطابقان المصدر')
    expect(result.status).toBe(0)
    const status = result.read('STATUS.md')
    expect(status).toContain('[02](STAGES/02.md) — مرحلة 02 (نشطة) · [03](STAGES/03.md)')
    expect(status).toContain('- **الموجة الحالية:** 1 —')
    expect(status).toContain('`wave-01/base`')
  })

  it('يسقط حين تختلف موجاتها', () => {
    const result = run([
      done(1),
      { id: 2, status: 'active', depends: [1], wave: 1 },
      { id: 3, status: 'active', depends: [1], wave: 2 },
    ])
    expect(result.status).toBe(1)
    expect(result.output).toContain('وليست كلّها في موجة واحدة')
  })

  it('مرحلة active واحدة بلا عدّة موجات تمرّ كما كانت', () => {
    const result = run([done(1), { id: 2, status: 'active', depends: [1], wave: 1 }], true)
    expect(result.status).toBe(0)
  })
})

describe('الاعتماديات والموجات', () => {
  it('اعتمادية في موجة أسبق تمرّ', () => {
    const result = run(
      [done(1), { id: 2, depends: [1], wave: 1 }, { id: 3, depends: [2], wave: 2 }],
      true,
    )
    expect(result.status).toBe(0)
  })

  it('اعتمادية في الموجة نفسها تسقط', () => {
    const result = run([
      done(1),
      { id: 2, depends: [1], wave: 1 },
      { id: 3, depends: [2], wave: 1 },
    ])
    expect(result.status).toBe(1)
    expect(result.output).toContain('03.md: في الموجة 1 وتعتمد على 02 في الموجة 1')
  })

  it('اعتمادية في موجة لاحقة تسقط', () => {
    const result = run([
      done(1),
      { id: 2, depends: [3], wave: 1 },
      { id: 3, depends: [1], wave: 2 },
    ])
    expect(result.status).toBe(1)
    expect(result.output).toContain('02.md: في الموجة 1 وتعتمد على 03 في الموجة 2')
  })

  it('اعتمادية مكتملة بلا موجة تمرّ — المراحل 01–04 خارج الموجات', () => {
    const result = run([done(1), { id: 2, depends: [1], wave: 1 }], true)
    expect(result.status).toBe(0)
  })
})

describe('حقل wave نفسه', () => {
  it('مرحلة متبقّية بلا wave تسقط', () => {
    const result = run([done(1), { id: 2, depends: [1] }])
    expect(result.status).toBe(1)
    expect(result.output).toContain('02.md: ليست done وبلا wave')
  })

  it('فجوة في أرقام الموجات تسقط', () => {
    const result = run([
      done(1),
      { id: 2, depends: [1], wave: 1 },
      { id: 3, depends: [1], wave: 3 },
    ])
    expect(result.status).toBe(1)
    expect(result.output).toContain('الموجة 2 غائبة')
  })

  it('رقم موجة غير موجب يسقط', () => {
    const result = run([done(1), { id: 2, depends: [1], wave: 0 }])
    expect(result.status).toBe(1)
    expect(result.output).toContain('wave يجب أن يكون رقم موجة موجبًا')
  })

  it('المرحلة المكتملة تحتفظ بموجتها بلا شرط', () => {
    const result = run([done(1), { id: 2, status: 'done', depends: [1], wave: 1 }], true)
    expect(result.status).toBe(0)
    expect(result.read('STATUS.md')).toContain('لا موجة مفتوحة')
  })
})
