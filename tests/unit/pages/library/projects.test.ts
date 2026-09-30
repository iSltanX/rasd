import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  createProject,
  deleteProject,
  loadProjects,
  moveCapturesToProject,
  moveColorsToProject,
  moveGuidesToProject,
  movePalettesToProject,
  moveReferencesToProject,
  renameProject,
  setProjectColor,
} from '@/pages/library/projects'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import {
  captures,
  colors,
  guides,
  issues,
  palettes,
  projects,
  references,
} from '@/shared/storage/repository'

import { issueFixture } from '../../modules/issues/fixture'

import type { CaptureRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://example.com',
    url: 'https://example.com/page',
    title: 'صفحة',
    kind: 'area',
    status: 'ready',
    projectId: null,
    tags: [],
    width: 800,
    height: 600,
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

describe('createProject / renameProject / setProjectColor', () => {
  it('ينشئ مشروعًا بمعرِّف فريد ويقرؤه من loadProjects', async () => {
    const created = await createProject('موقع العميل', '#0090FF', NOW)
    expect(created.ok).toBe(true)

    const all = await loadProjects()
    expect(all.ok && all.value).toHaveLength(1)
    expect(all.ok && all.value[0]?.name).toBe('موقع العميل')
    expect(all.ok && all.value[0]?.color).toBe('#0090FF')
  })

  it('يعيد التسمية ويحدِّث updatedAt', async () => {
    const created = await createProject('اسم أوّلي', '#0090FF', NOW)
    const id = created.ok ? created.value.id : ''
    const renamed = await renameProject(id, 'اسم جديد', NOW + 1000)
    expect(renamed.ok).toBe(true)

    const found = await projects.get(id)
    expect(found.ok && found.value.name).toBe('اسم جديد')
    expect(found.ok && found.value.updatedAt).toBe(NOW + 1000)
  })

  it('يغيِّر اللون بلا مسّ الاسم', async () => {
    const created = await createProject('مشروع', '#0090FF', NOW)
    const id = created.ok ? created.value.id : ''
    await setProjectColor(id, '#E5484D', NOW + 500)

    const found = await projects.get(id)
    expect(found.ok && found.value.color).toBe('#E5484D')
    expect(found.ok && found.value.name).toBe('مشروع')
  })

  it('إعادة التسمية على معرِّف غير موجود تفشل', async () => {
    const result = await renameProject('لا-وجود', 'اسم')
    expect(result.ok).toBe(false)
  })
})

describe('moveCapturesToProject', () => {
  it('ينقل لقطات مُحدَّدة إلى مشروع', async () => {
    await captures.putMany([capture('a'), capture('b'), capture('c')])
    const created = await createProject('هدف', '#0090FF', NOW)
    const projectId = created.ok ? created.value.id : ''

    const moved = await moveCapturesToProject(['a', 'b'], projectId)
    expect(moved.ok && moved.value).toBe(2)

    const a = await captures.get('a')
    const c = await captures.get('c')
    expect(a.ok && a.value.projectId).toBe(projectId)
    expect(c.ok && c.value.projectId).toBeNull()
  })

  it('null ينقل إلى «بلا مشروع»', async () => {
    await captures.put(capture('a', { projectId: 'p1' }))
    await moveCapturesToProject(['a'], null)
    const a = await captures.get('a')
    expect(a.ok && a.value.projectId).toBeNull()
  })

  it('معرِّفات غير موجودة تُتجاهَل بصمت — لا فشل كامل بسبب واحد', async () => {
    await captures.put(capture('a'))
    const moved = await moveCapturesToProject(['a', 'لا-وجود'], 'p1')
    expect(moved.ok && moved.value).toBe(1)
  })
})

describe('moveColorsToProject / movePalettesToProject / moveReferencesToProject / moveGuidesToProject', () => {
  it('moveColorsToProject ينقل الألوان المُحدَّدة بلا مسّ الباقي', async () => {
    await colors.putMany([
      {
        id: 'c1',
        hex: '#111',
        name: '',
        note: '',
        source: 'pixel',
        projectId: null,
        sourceUrl: null,
        createdAt: NOW,
      },
      {
        id: 'c2',
        hex: '#222',
        name: '',
        note: '',
        source: 'pixel',
        projectId: null,
        sourceUrl: null,
        createdAt: NOW,
      },
    ])
    const created = await createProject('هدف', '#0090FF', NOW)
    const projectId = created.ok ? created.value.id : ''

    const moved = await moveColorsToProject(['c1'], projectId)
    expect(moved.ok && moved.value).toBe(1)

    const c1 = await colors.get('c1')
    const c2 = await colors.get('c2')
    expect(c1.ok && c1.value.projectId).toBe(projectId)
    expect(c2.ok && c2.value.projectId).toBeNull()
  })

  it('movePalettesToProject بـnull ينقل إلى «بلا مشروع»', async () => {
    await palettes.put({ id: 'p1', name: 'ل', colors: ['#111'], projectId: 'old', createdAt: NOW })
    await movePalettesToProject(['p1'], null)
    const p1 = await palettes.get('p1')
    expect(p1.ok && p1.value.projectId).toBeNull()
  })

  it('moveReferencesToProject ينقل المراجع المُحدَّدة', async () => {
    await references.put({
      id: 'r1',
      projectId: null,
      origin: 'https://a.com',
      path: '/',
      viewport: 'desktop',
      blobId: 'b1',
      exclusions: [],
      createdAt: NOW,
    })
    const created = await createProject('هدف', '#0090FF', NOW)
    const projectId = created.ok ? created.value.id : ''

    const moved = await moveReferencesToProject(['r1'], projectId)
    expect(moved.ok && moved.value).toBe(1)
    const r1 = await references.get('r1')
    expect(r1.ok && r1.value.projectId).toBe(projectId)
  })

  it('moveGuidesToProject ينقل الأدلة المُحدَّدة، ومعرِّف غير موجود يُتجاهَل بصمت', async () => {
    await guides.put({
      id: 'g1',
      title: 'دليل',
      projectId: null,
      captureIds: [],
      createdAt: NOW,
      stepText: {},
      updatedAt: NOW,
    })
    const created = await createProject('هدف', '#0090FF', NOW)
    const projectId = created.ok ? created.value.id : ''

    const moved = await moveGuidesToProject(['g1', 'لا-وجود'], projectId)
    expect(moved.ok && moved.value).toBe(1)
    const g1 = await guides.get('g1')
    expect(g1.ok && g1.value.projectId).toBe(projectId)
  })
})

describe('deleteProject — ينقل المحتوى قبل الحذف', () => {
  async function seedProjectWithContent(projectId: string) {
    await captures.put(capture('cap1', { projectId }))
    await colors.put({
      id: 'col1',
      hex: '#111',
      name: '',
      note: '',
      source: 'pixel',
      projectId,
      sourceUrl: null,
      createdAt: NOW,
    })
    await palettes.put({ id: 'pal1', name: 'ل', colors: ['#111'], projectId, createdAt: NOW })
    await references.put({
      id: 'ref1',
      projectId,
      origin: 'https://a.com',
      path: '/',
      viewport: 'desktop',
      blobId: 'b1',
      exclusions: [],
      createdAt: NOW,
    })
    await guides.put({
      id: 'gd1',
      title: 'دليل',
      projectId,
      captureIds: [],
      createdAt: NOW,
      stepText: {},
      updatedAt: NOW,
    })
  }

  it('ينقل محتوى الخمسة مخازن إلى مشروع آخر ثم يحذف المشروع', async () => {
    const source = await createProject('مصدر', '#0090FF', NOW)
    const target = await createProject('هدف', '#E5484D', NOW)
    const sourceId = source.ok ? source.value.id : ''
    const targetId = target.ok ? target.value.id : ''
    await seedProjectWithContent(sourceId)

    const deleted = await deleteProject(sourceId, targetId)
    expect(deleted.ok).toBe(true)

    const cap = await captures.get('cap1')
    const col = await colors.get('col1')
    const pal = await palettes.get('pal1')
    const ref = await references.get('ref1')
    const gd = await guides.get('gd1')

    expect((await projects.get(sourceId)).ok).toBe(false)
    expect(cap.ok && cap.value.projectId).toBe(targetId)
    expect(col.ok && col.value.projectId).toBe(targetId)
    expect(pal.ok && pal.value.projectId).toBe(targetId)
    expect(ref.ok && ref.value.projectId).toBe(targetId)
    expect(gd.ok && gd.value.projectId).toBe(targetId)
  })

  it('نقل المحتوى إلى null (بلا مشروع) يعمل أيضًا', async () => {
    const source = await createProject('مصدر', '#0090FF', NOW)
    const sourceId = source.ok ? source.value.id : ''
    await seedProjectWithContent(sourceId)

    const deleted = await deleteProject(sourceId, null)
    expect(deleted.ok).toBe(true)

    const cap = await captures.get('cap1')
    expect(cap.ok && cap.value.projectId).toBeNull()
  })

  it('نقل مشروع إلى نفسه يُرفَض صراحةً — لا حذف يقع', async () => {
    const source = await createProject('مصدر', '#0090FF', NOW)
    const sourceId = source.ok ? source.value.id : ''

    const result = await deleteProject(sourceId, sourceId)
    expect(result.ok).toBe(false)

    // لم يُحذف — لأن الرفض وقع قبل أي خطوة تنفيذية.
    expect((await projects.get(sourceId)).ok).toBe(true)
  })

  it('المشكلات تنتقل مع المشروع المحذوف — أو تصير «بلا مشروع» — ولا تبقى معلَّقةً بمعرّفٍ ميّت', async () => {
    const source = await createProject('المتجر', '#0090FF', NOW)
    const target = await createProject('المنصّة', '#30A46C', NOW)
    const sourceId = source.ok ? source.value.id : ''
    const targetId = target.ok ? target.value.id : ''
    await issues.putMany([
      issueFixture({ id: 'i1', projectId: sourceId }),
      issueFixture({ id: 'i2', projectId: sourceId }),
      issueFixture({ id: 'i3', projectId: null }),
    ])

    expect((await deleteProject(sourceId, targetId)).ok).toBe(true)
    const moved = await issues.getAll()
    expect(moved.ok && moved.value.map((i) => [i.id, i.projectId])).toEqual([
      ['i1', targetId],
      ['i2', targetId],
      ['i3', null],
    ])

    expect((await deleteProject(targetId, null)).ok).toBe(true)
    const freed = await issues.getAll()
    expect(freed.ok && freed.value.every((i) => i.projectId === null)).toBe(true)
  })

  it('مشروعٌ بلا محتوى يُحذف بلا أي إعادة تعيين', async () => {
    const source = await createProject('فارغ', '#0090FF', NOW)
    const sourceId = source.ok ? source.value.id : ''
    const deleted = await deleteProject(sourceId, null)
    expect(deleted.ok).toBe(true)
    expect((await projects.get(sourceId)).ok).toBe(false)
  })
})

/** اللوحة والنظرة بترتيب واحد — الإنشاء — لا بترتيب المفتاح العشوائي (`STAGES/04`). */
describe('loadProjects — بترتيب الإنشاء', () => {
  it('الأقدم أوّلًا مهما كان ترتيب المفاتيح', async () => {
    const { projects: repo } = await import('@/shared/storage/repository')
    await repo.put({ id: 'z-old', name: 'الأقدم', color: '#000000', createdAt: 1, updatedAt: 1 })
    await repo.put({ id: 'a-new', name: 'الأحدث', color: '#000000', createdAt: 3, updatedAt: 3 })
    await repo.put({ id: 'm-mid', name: 'الأوسط', color: '#000000', createdAt: 2, updatedAt: 2 })
    const { loadProjects } = await import('@/pages/library/projects')
    const loaded = await loadProjects()
    expect(loaded.ok && loaded.value.map((p) => p.name)).toEqual(['الأقدم', 'الأوسط', 'الأحدث'])
  })
})
