import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  createGuide,
  deleteTemplate,
  loadGuide,
  loadTemplates,
  matchingTemplate,
  moveStep,
  NEW_GUIDE_TITLE,
  saveGuide,
  saveTemplate,
} from '@/pages/library/guides'
import {
  DEFAULT_GUIDE_OPTIONS,
  GUIDE_LIMITS,
  guideSteps,
  stepTextFrom,
  stepTextOf,
} from '@/shared/guide-schema'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, captures, guides, templates } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

const NOW = 1_780_000_000_000

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://shop.example',
    url: `https://shop.example/${id}`,
    title: `لقطة ${id}`,
    kind: 'viewport',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 1440,
    height: 900,
    devicePixelRatio: 2,
    favorite: false,
    archived: false,
    trashedAt: null,
    ...over,
  }
}

beforeEach(async () => {
  setIncognitoWritePolicy(false)
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  await new Promise((r) => setTimeout(r, 0))
})

describe('shared/guide-schema', () => {
  it('سجلٌّ بشكل ما قبل النسخة 5 يُقرأ خطواتٍ بعناوين فارغة لا انهيارًا', () => {
    expect(guideSteps({ captureIds: ['a', 'b'] })).toEqual([
      { captureId: 'a', title: '', note: '' },
      { captureId: 'b', title: '', note: '' },
    ])
    expect(guideSteps({})).toEqual([])
  })

  it('معرّفٌ اسمه `__proto__` لا يقرأ نموذج الكائن، والقاموس لا يكتب إلا ما فيه نصّ', () => {
    expect(stepTextOf({}, '__proto__')).toEqual({ title: '', note: '' })
    const text = stepTextFrom([
      { captureId: '__proto__', title: 'خطوة', note: '' },
      { captureId: 'b', title: '', note: '' },
    ])
    expect(Object.keys(text)).toEqual(['__proto__'])
    expect(stepTextOf(text, '__proto__').title).toBe('خطوة')
    expect(Object.getPrototypeOf(text)).toBe(Object.prototype)
  })
})

describe('createGuide', () => {
  it('الخطوات بترتيب الالتقاط لا بترتيب التحديد، والمشروع المشترك للّقطات', async () => {
    await captures.putMany([
      capture('late', { createdAt: NOW + 2, projectId: 'p1' }),
      capture('early', { createdAt: NOW, projectId: 'p1' }),
      capture('mid', { createdAt: NOW + 1, projectId: 'p1' }),
    ])
    const created = await createGuide(['late', 'early', 'mid', 'early'], NOW)
    if (!created.ok) throw new Error(created.error.message)
    expect(created.value.captureIds).toEqual(['early', 'mid', 'late'])
    expect(created.value.projectId).toBe('p1')
    expect(created.value.title).toBe(NEW_GUIDE_TITLE)
    expect(created.value.stepText).toEqual({})
    const stored = await guides.get(created.value.id)
    expect(stored.ok && stored.value).toEqual(created.value)
  })

  it('لقطاتٌ من مشروعين: دليلٌ بلا مشروع', async () => {
    await captures.putMany([capture('a', { projectId: 'p1' }), capture('b', { projectId: 'p2' })])
    const created = await createGuide(['a', 'b'], NOW)
    expect(created.ok && created.value.projectId).toBeNull()
  })

  it('لا تحديد، أو لقطةٌ غائبة، أو فوق الحدّ: لا يُكتب دليل', async () => {
    expect((await createGuide([], NOW)).ok).toBe(false)
    await captures.put(capture('a'))
    const missing = await createGuide(['a', 'غائبة'], NOW)
    expect(missing.ok).toBe(false)
    const many = Array.from({ length: GUIDE_LIMITS.steps + 1 }, (_, i) => `c${i}`)
    expect((await createGuide(many, NOW)).ok).toBe(false)
    const all = await guides.getAll()
    expect(all.ok && all.value).toEqual([])
  })
})

describe('loadGuide وsaveGuide', () => {
  it('يقرأ كل خطوة بلقطتها وبايتات أصلها، والغائبة بلا لقطة', async () => {
    await captures.put(capture('a'))
    await blobs.put({ id: 'a', blob: new Blob(['x']), mime: 'image/png', bytes: 4321 })
    await guides.put({
      id: 'g',
      title: 'دليل',
      projectId: null,
      captureIds: ['a', 'gone'],
      createdAt: NOW,
      stepText: { a: { title: 'افتح', note: '' } },
      updatedAt: NOW,
    })
    const view = await loadGuide('g')
    if (!view.ok) throw new Error(view.error.message)
    expect(
      view.value.steps.map((s) => [s.captureId, s.title, s.capture?.id ?? null, s.bytes]),
    ).toEqual([
      ['a', 'افتح', 'a', 4321],
      ['gone', '', null, null],
    ])
    expect((await loadGuide('غائب')).ok).toBe(false)
  })

  it('يكتب العنوان والترتيب والنصّ معًا، والخطوة المُزالة لا يبقى نصّها، والطويل يُقصّ إلى حدّه', async () => {
    const guide = {
      id: 'g',
      title: 'قديم',
      projectId: null,
      captureIds: ['a', 'b', 'c'],
      createdAt: NOW,
      stepText: { c: { title: 'ستُزال', note: 'سرّ' } },
      updatedAt: NOW,
    }
    await guides.put(guide)
    const saved = await saveGuide(
      guide,
      '  جديد  ',
      [
        { captureId: 'b', title: 'ب'.repeat(GUIDE_LIMITS.stepTitle + 10), note: '' },
        { captureId: 'a', title: '', note: 'ملاحظة' },
      ],
      NOW + 9,
    )
    if (!saved.ok) throw new Error(saved.error.message)
    const stored = await guides.get('g')
    expect(stored.ok && stored.value).toEqual(saved.value)
    expect(saved.value.title).toBe('جديد')
    expect(saved.value.captureIds).toEqual(['b', 'a'])
    expect(Object.keys(saved.value.stepText).sort()).toEqual(['a', 'b'])
    expect(saved.value.stepText.b?.title).toHaveLength(GUIDE_LIMITS.stepTitle)
    expect(saved.value.updatedAt).toBe(NOW + 9)
  })

  it('عنوانٌ فارغ يُحفظ بالعنوان الافتراضي', async () => {
    const guide = {
      id: 'g',
      title: 'x',
      projectId: null,
      captureIds: [],
      createdAt: NOW,
      stepText: {},
      updatedAt: NOW,
    }
    const saved = await saveGuide(guide, '   ', [], NOW)
    expect(saved.ok && saved.value.title).toBe(NEW_GUIDE_TITLE)
  })
})

describe('moveStep', () => {
  it('ينقل ولا يغيّر الأصل، وموضعٌ خارج المدى لا يفعل شيئًا', () => {
    const list = ['أ', 'ب', 'ج', 'د']
    expect(moveStep(list, 0, 2)).toEqual(['ب', 'ج', 'أ', 'د'])
    expect(moveStep(list, 3, 0)).toEqual(['د', 'أ', 'ب', 'ج'])
    expect(moveStep(list, 1, 9)).toEqual(list)
    expect(list).toEqual(['أ', 'ب', 'ج', 'د'])
  })
})

describe('القوالب', () => {
  const options = { ...DEFAULT_GUIDE_OPTIONS, format: 'html' as const, notes: false }

  it('يحفظ باسمه ويُستعاد، والاسم نفسه يستبدل القالب لا يكرّره', async () => {
    const first = await saveTemplate(' تقرير الفريق ', options, NOW)
    if (!first.ok) throw new Error(first.error.message)
    expect(first.value.name).toBe('تقرير الفريق')
    const again = await saveTemplate('تقرير الفريق', { ...options, format: 'pdf' }, NOW + 5)
    if (!again.ok) throw new Error(again.error.message)
    expect(again.value.id).toBe(first.value.id)
    expect(again.value.createdAt).toBe(NOW)
    const list = await loadTemplates()
    expect(list.ok && list.value.map((t) => [t.name, t.options.format])).toEqual([
      ['تقرير الفريق', 'pdf'],
    ])
  })

  it('مرتّبةٌ بالاسم، وتُحذف', async () => {
    await saveTemplate('ب', options, NOW)
    const a = await saveTemplate('أ', options, NOW)
    const list = await loadTemplates()
    expect(list.ok && list.value.map((t) => t.name)).toEqual(['أ', 'ب'])
    if (a.ok) await deleteTemplate(a.value.id)
    const after = await loadTemplates()
    expect(after.ok && after.value.map((t) => t.name)).toEqual(['ب'])
  })

  it('لا اسم، أو اسمٌ أطول من حدّه، أو فوق عدد القوالب: يُرفض ولا يُكتب', async () => {
    expect((await saveTemplate('   ', options, NOW)).ok).toBe(false)
    expect((await saveTemplate('س'.repeat(GUIDE_LIMITS.templateName + 1), options, NOW)).ok).toBe(
      false,
    )
    await templates.putMany(
      Array.from({ length: GUIDE_LIMITS.templates }, (_, i) => ({
        id: `t${i}`,
        name: `قالب ${i}`,
        options,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    )
    const over = await saveTemplate('واحدٌ زائد', options, NOW)
    expect(over.ok).toBe(false)
    // والاسم القائم يُحدَّث ولو بلغت الحدّ.
    expect((await saveTemplate('قالب 3', DEFAULT_GUIDE_OPTIONS, NOW)).ok).toBe(true)
  })

  it('matchingTemplate: القالب الذي تطابق إعداداته الحاضرة، وإلا لا شيء', () => {
    const t = { id: 't', name: 'x', options, createdAt: NOW, updatedAt: NOW }
    expect(matchingTemplate([t], options)).toBe(t)
    expect(matchingTemplate([t], { ...options, numbered: false })).toBeNull()
  })
})
