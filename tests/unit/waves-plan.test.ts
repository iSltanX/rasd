// @vitest-environment node
// يقرأ `Docs/Waves.md` و`STAGES/` من القرص — لا DOM.

import { describe, expect, it } from 'vitest'

import {
  checkPlan,
  parsePlan,
  range,
  readPlan,
  readStages,
  scopeFiles,
  // @ts-expect-error — سكربت أدوات بلا تعريفات أنواع؛ يُستورَد لدوالّه الخالصة.
} from '../../scripts/waves-plan.mjs'

/**
 * خطّة الموجات (ADR 0026) تتّسق مع ترويسات المراحل — والفحص يسقط على كل مخالفة.
 *
 * الموجب: الخطّة الحقيقية والترويسات الحقيقية بلا مخالفة. والسوالب: الخطّة نفسها بعد تحريفٍ واحد
 * موضعي في نصّها أو في ترويسة، فيثبت أن كل قاعدة تحرس شيئًا فعلًا.
 */
type Stage = { id: number; wave: number | null; status: string; depends: number[] }

const text = readPlan().text as string
const stages = readStages() as Stage[]

/** سطر جدول بنمط مرن المسافات — المحاذاة يكتبها prettier فلا تُثبَّت هنا. */
function line(pattern: RegExp): string {
  const found = pattern.exec(text)?.[0] ?? ''
  expect(found, `النمط ${pattern} غائب من الخطّة`).not.toBe('')
  return found
}

/** يحرّف نصّ الخطّة في موضع واحد ويعيد مخالفاتها — ويسقط إن لم يجد الموضع. */
function mutated(from: string, to: string, list: Stage[] = stages): string[] {
  expect(text.includes(from), `الموضع «${from}» غائب من الخطّة`).toBe(true)
  return checkPlan(parsePlan(text.replace(from, to)), list) as string[]
}

const withHeader = (id: number, patch: Partial<Stage>) =>
  stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage))

describe('الخطّة الحقيقية', () => {
  it('تتّسق مع الترويسات بلا مخالفة', () => {
    expect(checkPlan(readPlan(), stages)).toEqual([])
  })

  it('تغطّي كل مرحلة متبقّية مرّة واحدة، والمكتملة قبلها خارجها', () => {
    const plan = readPlan()
    const planned = plan.waves.flatMap((wave: { stages: number[] }) => wave.stages).sort()
    // المكتملة في موجةٍ أُغلقت تبقى في صفّها وترويستها تحمل `wave`؛ والمكتملة قبل الخطّة بلا `wave`.
    const inPlan = stages
      .filter((stage) => stage.status !== 'done' || stage.wave !== null)
      .map((stage) => stage.id)
      .sort()
    expect(planned).toEqual(inPlan)
    expect(planned).not.toContain(4)
  })

  it('29 و30 في آخر موجتين، وكل اعتمادياتهما قبلهما', () => {
    const plan = readPlan()
    const last = plan.waves.length
    const waveOf = (id: number) =>
      (
        plan.waves.find((wave: { stages: number[] }) => wave.stages.includes(id)) as {
          wave: number
        }
      ).wave
    expect(waveOf(29)).toBe(last - 1)
    expect(waveOf(30)).toBe(last)
  })
})

describe('كل قاعدة تسقط على مخالفتها', () => {
  it('موجةٌ في الخطّة تخالف ترويسة المرحلة', () => {
    expect(checkPlan(readPlan(), withHeader(19, { wave: 2 })).join('\n')).toContain(
      'المرحلة 19: الخطّة تضعها في الموجة 1 وترويستها 2',
    )
  })

  it('مرحلةٌ غائبة عن صفّ موجتها', () => {
    const row = line(/^\| 2 +\| 32 · 16 /mu)
    expect(mutated(row, row.replace('32 · 16', '32     ')).join('\n')).toContain(
      'المرحلة 16 ليست في أي صفّ من جدول الموجات',
    )
  })

  it('صاحبة الترحيل ليست أوّل الدمج', () => {
    const row = line(/^\| 3 +\| 34 · 14 · 33 · 20 /mu)
    expect(mutated(row, row.replace('34 · 14', '14 · 34')).join('\n')).toContain(
      'صاحبة الترحيل 34 ليست أوّل الدمج',
    )
  })

  it('موجةٌ تمسّ الحزمة بفحص المخروط وحده', () => {
    const row = line(/^\| 1 +\| 19 · 09 · 15 · 31 +\| `all` /mu)
    expect(mutated(row, row.replace('`all`', '`cone`')).join('\n')).toContain(
      'الموجة 1 تمسّ الحزمة',
    )
  })

  it('معلمُ إصدار بلا جولة يدوية واجبة', () => {
    const row = line(/^\| 11 +\|.*\n/mu)
    expect(mutated(row, row.replace('وجوبًا', 'مستحقّة')).join('\n')).toContain(
      'الموجة 11 (27): الجولة اليدوية',
    )
  })

  it('بصمة التزام في الخطّة', () => {
    expect(mutated('## الملخّص', '## الملخّص\n\nالأساس fe57cbf').join('\n')).toContain(
      'بصمة التزام في الخطّة «fe57cbf»',
    )
  })

  it('كتلتا صفوف §6 متداخلتان', () => {
    expect(mutated('162–171', '160–171').join('\n')).toContain(
      'صفوف §6 للمرحلة 09 (160–171) تتداخل',
    )
  })

  it('مرحلة منفردة على فرعٍ لا على main', () => {
    const row = line(/^\| 23 +\| 9 +\| `main` /mu)
    expect(mutated(row, row.replace('`main`', '`stage/23-permissions`')).join('\n')).toContain(
      'المرحلة 23: فرعها «stage/23-permissions» والمتوقَّع main',
    )
  })

  it('فرعٌ يحمل ما ليس اسمًا — يدخل أمر الطرفية كما هو', () => {
    expect(
      mutated('`stage/19-bundle-budget`', '`stage/19-x && touch pwned #`').join('\n'),
    ).toContain('المرحلة 19: فرعها «stage/19-x && touch pwned #»')
  })

  it('اعتمادية في الموجة نفسها', () => {
    // 19 غير مكتملة هنا أيًّا كانت ترويستها اليوم: الاعتمادية على المكتملة لا تُحسب.
    const pending = withHeader(15, { depends: [19] }).map((stage) =>
      stage.id === 19 ? { ...stage, status: 'active' } : stage,
    )
    expect(checkPlan(readPlan(), pending).join('\n')).toContain(
      'المرحلة 15 (الموجة 1) تعتمد على 19 (1)',
    )
  })

  it('ملفٌّ حسّاس بين مرحلتين متوازيتين بلا ضرورة مكتوبة', () => {
    const plan = readPlan()
    const withContract = (readStages() as Array<Stage & { sections: Record<string, string> }>).map(
      (stage) =>
        stage.id === 5
          ? {
              ...stage,
              sections: {
                ...stage.sections,
                النطاق: (stage.sections['النطاق'] ?? '').replace(
                  '**خارج النطاق**',
                  '- `src/shared/storage/`\n\n**خارج النطاق**',
                ),
              },
            }
          : stage,
    )
    expect(checkPlan(plan, withContract).join('\n')).toContain(
      'الموجة 4: 07 و05 تمسّان src/shared/storage/ بلا ضرورة مكتوبة',
    )
  })
})

describe('قراءة الخطّة', () => {
  it('الكتل تُقرأ بأرقامها', () => {
    expect(range('152–161')).toEqual([152, 161])
    expect(range('`0030–0032`')).toEqual([30, 32])
    expect(range('0027')).toEqual([27, 27])
    expect(range('التالي الحرّ')).toBeNull()
  })

  it('ملفّات النطاق تُقرأ من مواصفة المرحلة', () => {
    const stage = (readStages() as Array<{ id: number }>).find((s) => s.id === 19)
    expect(scopeFiles(stage)).toContain('`vite.content.config.ts`')
  })
})
