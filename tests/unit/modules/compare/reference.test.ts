import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newZone } from '@/modules/compare/exclusions'
import {
  assignCaptureAsReference,
  assignImageAsReference,
  findReferenceForPage,
  setReferenceExclusions,
  suggestedZonesForPage,
  type PageKey,
} from '@/modules/compare/reference'
import { deviceRect } from '@/shared/geometry'
import { errWith } from '@/shared/result'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, captures, references } from '@/shared/storage/repository'

import type { ElementAnchor } from '@/shared/exclusion-schema'
import type { CaptureRecord } from '@/shared/storage/schema'

const NOW = 1_700_000_000_000

const KEY: PageKey = { origin: 'https://example.com', path: '/pricing', viewport: 'desktop' }

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: NOW,
    origin: 'https://example.com',
    url: 'https://example.com/pricing',
    title: 'التسعير',
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

afterEach(() => {
  vi.restoreAllMocks()
  Object.assign(globalThis.chrome, { extension: { inIncognitoContext: false } })
})

/** يفعّل منع الكتابة كما في التصفّح الخاص — القراءة تبقى تعمل. */
function blockWrites() {
  Object.assign(globalThis.chrome, { extension: { inIncognitoContext: true } })
  setIncognitoWritePolicy(true)
}

describe('findReferenceForPage', () => {
  it('لا مرجع بعد ⇒ null', async () => {
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value).toBeNull()
  })

  it('يجد مرجعًا بمطابقة origin+path+viewport الثلاثة معًا', async () => {
    await references.put({
      id: 'ref1',
      projectId: null,
      origin: KEY.origin,
      path: KEY.path,
      viewport: KEY.viewport,
      blobId: 'ref1',
      exclusions: [],
      createdAt: NOW,
    })
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value?.id).toBe('ref1')
  })

  it('نفس origin بمسار مختلف لا يُطابَق', async () => {
    await references.put({
      id: 'ref1',
      projectId: null,
      origin: KEY.origin,
      path: '/other-page',
      viewport: KEY.viewport,
      blobId: 'ref1',
      exclusions: [],
      createdAt: NOW,
    })
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value).toBeNull()
  })

  it('نفس origin+path بمقاس مختلف لا يُطابَق', async () => {
    await references.put({
      id: 'ref1',
      projectId: null,
      origin: KEY.origin,
      path: KEY.path,
      viewport: 'phone',
      blobId: 'ref1',
      exclusions: [],
      createdAt: NOW,
    })
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value).toBeNull()
  })
})

describe('assignCaptureAsReference', () => {
  it('ينسخ بايتات اللقطة تحت معرِّف مرجع مستقلّ — لا يشارك blobId اللقطة', async () => {
    await captures.put(capture('cap1'))
    await blobs.put({ id: 'cap1', blob: new Blob(['x']), mime: 'image/png', bytes: 1 })

    const assigned = await assignCaptureAsReference('cap1', KEY, null, NOW)
    expect(assigned.ok).toBe(true)
    const record = assigned.ok ? assigned.value : null
    expect(record?.blobId).toBe(record?.id)
    expect(record?.blobId).not.toBe('cap1')

    // بلوب اللقطة الأصلية سليم، وبلوب المرجع منسوخ بمعرِّفه الخاصّ.
    expect((await blobs.get('cap1')).ok).toBe(true)
    expect((await blobs.get(record!.blobId)).ok).toBe(true)
  })

  it('حذف بلوب المرجع لاحقًا لا يمسّ بلوب اللقطة المصدر', async () => {
    await captures.put(capture('cap1'))
    await blobs.put({ id: 'cap1', blob: new Blob(['original']), mime: 'image/png', bytes: 8 })
    const assigned = await assignCaptureAsReference('cap1', KEY, null, NOW)
    const refBlobId = assigned.ok ? assigned.value.blobId : ''

    await blobs.remove(refBlobId)

    expect((await blobs.get('cap1')).ok).toBe(true)
    expect((await blobs.get(refBlobId)).ok).toBe(false)
  })

  it('تعيين ثانٍ على نفس الصفحة يستبدل المرجع بنفس المعرِّف — لا يضيف سجلًّا موازيًا', async () => {
    await captures.put(capture('cap1'))
    await captures.put(capture('cap2', { id: 'cap2' }))
    await blobs.put({ id: 'cap1', blob: new Blob(['a']), mime: 'image/png', bytes: 1 })
    await blobs.put({ id: 'cap2', blob: new Blob(['b']), mime: 'image/png', bytes: 1 })

    const first = await assignCaptureAsReference('cap1', KEY, null, NOW)
    const firstId = first.ok ? first.value.id : ''

    const second = await assignCaptureAsReference('cap2', KEY, null, NOW + 1000)
    expect(second.ok && second.value.id).toBe(firstId)
    expect(second.ok && second.value.createdAt).toBe(NOW) // createdAt الأصلي يبقى — استبدالٌ لا سجلّ جديد.

    const all = await references.getAll()
    expect(all.ok && all.value).toHaveLength(1)
  })

  it('لقطة غير موجودة تُرجع فشلًا — لا مرجع يُكتَب بلا مصدر', async () => {
    const assigned = await assignCaptureAsReference('لا-وجود', KEY, null, NOW)
    expect(assigned.ok).toBe(false)
    const all = await references.getAll()
    expect(all.ok && all.value).toHaveLength(0)
  })
})

describe('assignImageAsReference', () => {
  it('يحفظ صورة مرفوعة مرجعًا جديدًا', async () => {
    const image = new Blob(['png-bytes'], { type: 'image/png' })
    const assigned = await assignImageAsReference(image, KEY, 'proj1', NOW)
    expect(assigned.ok).toBe(true)
    expect(assigned.ok && assigned.value.projectId).toBe('proj1')

    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value?.id).toBe(assigned.ok ? assigned.value.id : '')
  })

  it('يستبدل مرجعًا من لقطة بصورة مرفوعة على نفس الصفحة', async () => {
    await captures.put(capture('cap1'))
    await blobs.put({ id: 'cap1', blob: new Blob(['a']), mime: 'image/png', bytes: 1 })
    const fromCapture = await assignCaptureAsReference('cap1', KEY, null, NOW)
    const id = fromCapture.ok ? fromCapture.value.id : ''

    const image = new Blob(['uploaded'], { type: 'image/png' })
    const fromImage = await assignImageAsReference(image, KEY, null, NOW + 500)
    expect(fromImage.ok && fromImage.value.id).toBe(id)

    const all = await references.getAll()
    expect(all.ok && all.value).toHaveLength(1)
  })
})

describe('المناطق المستثناة مع مرجعها (ADR 0034)', () => {
  const clock = newZone({ kind: 'rect', rect: deviceRect(10, 10, 80, 20) }, 'z-clock', NOW)
  const adAnchor = (selector: string): ElementAnchor => ({
    kind: 'element',
    selector,
    hosts: [],
    fingerprint: { tag: 'aside', attrs: [], textHash: '0a1b2c3d', textLength: 4 },
    rect: deviceRect(0, 400, 300, 250),
  })
  const ad = newZone(adAnchor('aside.ad'), 'z-ad', NOW)

  it('المرجع الجديد يولد بلا مناطق', async () => {
    const assigned = await assignImageAsReference(new Blob(['a']), KEY, null, NOW)
    expect(assigned.ok && assigned.value.exclusions).toEqual([])
  })

  it('تُكتب القائمة كلّها مع المرجع، وتُقرأ معه', async () => {
    await assignImageAsReference(new Blob(['a']), KEY, null, NOW)
    const written = await setReferenceExclusions(KEY, [clock, ad])
    expect(written.ok && written.value.exclusions).toEqual([clock, ad])
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value?.exclusions).toEqual([clock, ad])
  })

  it('واستبدال صورة المرجع يُبقي مناطقه — وصفٌ للصفحة لا للصورة', async () => {
    await assignImageAsReference(new Blob(['a']), KEY, null, NOW)
    await setReferenceExclusions(KEY, [clock])
    const replaced = await assignImageAsReference(new Blob(['b']), KEY, null, NOW + 1)
    expect(replaced.ok && replaced.value.exclusions).toEqual([clock])
  })

  it('لا مرجع ⇒ `not-found` ولا سجلّ يُنشأ لمناطق بلا صورة', async () => {
    const written = await setReferenceExclusions(KEY, [clock])
    expect(!written.ok && written.error.code).toBe('not-found')
    const all = await references.getAll()
    expect(all.ok && all.value).toHaveLength(0)
  })

  it('والتصفّح الخاص يرفض الكتابة ويُبقي القائمة السابقة', async () => {
    await assignImageAsReference(new Blob(['a']), KEY, null, NOW)
    await setReferenceExclusions(KEY, [clock])
    blockWrites()
    const written = await setReferenceExclusions(KEY, [])
    expect(written.ok).toBe(false)
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value?.exclusions).toEqual([clock])
  })

  it('مناطق العنصر من مقاسٍ آخر للصفحة نفسها تُقترح، لا من صفحةٍ أخرى ولا من المقاس نفسه', async () => {
    const phone: PageKey = { ...KEY, viewport: 'phone' }
    const other: PageKey = { ...KEY, path: '/other' }
    await assignImageAsReference(new Blob(['p']), phone, null, NOW)
    await setReferenceExclusions(phone, [clock, ad])
    await assignImageAsReference(new Blob(['o']), other, null, NOW)
    await setReferenceExclusions(other, [newZone(adAnchor('#x'), 'z-other', NOW)])

    const suggested = await suggestedZonesForPage(KEY, [])
    // `clock` مستطيلٌ يخصّ مقاس الهاتف فلا يُقترح؛ و`#x` في صفحةٍ أخرى.
    expect(suggested.ok && suggested.value.map((z) => z.id)).toEqual(['z-ad'])
    // وما في هذا المرجع بمحدِّده لا يُقترح ثانيةً.
    const again = await suggestedZonesForPage(KEY, [{ ...ad, id: 'mine' }])
    expect(again.ok && again.value).toEqual([])
  })
})

/**
 * مسارات الفشل: كل خطوة تُرجع `Result` ويُمرَّر فشلها كما هو، فلا يبقى مرجعٌ
 * نصف مكتوب (سجلّ بلا بايتات أو العكس) ولا يُبتلع سبب الفشل عن المستدعي.
 */
describe('مسارات الفشل', () => {
  it('findReferenceForPage يُمرّر فشل قراءة الفهرس كما هو', async () => {
    vi.spyOn(references, 'byIndex').mockResolvedValueOnce(errWith('unknown', 'تعذّرت قراءة الفهرس'))

    const found = await findReferenceForPage(KEY)

    expect(found.ok).toBe(false)
    expect(!found.ok && found.error.detail).toBe('تعذّرت قراءة الفهرس')
  })

  it('لقطة بلا بايتات تفشل بـnot-found ولا يُكتب مرجع', async () => {
    // وصف اللقطة موجود لكن بلوبها غاب: تلف بيانات يجب أن يظهر لا أن يُخفى بمرجع فارغ.
    await captures.put(capture('cap1'))

    const assigned = await assignCaptureAsReference('cap1', KEY, null, NOW)

    expect(!assigned.ok && assigned.error.code).toBe('not-found')
    const all = await references.getAll()
    expect(all.ok && all.value).toHaveLength(0)
  })

  it('فشل إيجاد المرجع القائم يوقف تعيين اللقطة قبل أي كتابة', async () => {
    await captures.put(capture('cap1'))
    await blobs.put({ id: 'cap1', blob: new Blob(['x']), mime: 'image/png', bytes: 1 })
    vi.spyOn(references, 'byIndex').mockResolvedValueOnce(errWith('unknown', 'فهرس معطوب'))

    const assigned = await assignCaptureAsReference('cap1', KEY, null, NOW)

    expect(!assigned.ok && assigned.error.detail).toBe('فهرس معطوب')
    // لا مرجع كُتب، ولا نسخة بايتات تحت معرِّف جديد — البلوب الوحيد هو الأصل.
    const all = await references.getAll()
    const stored = await blobs.getAll()
    expect(all.ok && all.value).toHaveLength(0)
    expect(stored.ok && stored.value.map((b) => b.id)).toEqual(['cap1'])
  })

  it('منع الكتابة يُرجَع كما هو من تعيين اللقطة ولا يُبقي أثرًا', async () => {
    await captures.put(capture('cap1'))
    await blobs.put({ id: 'cap1', blob: new Blob(['x']), mime: 'image/png', bytes: 1 })
    blockWrites()

    const assigned = await assignCaptureAsReference('cap1', KEY, null, NOW)

    expect(!assigned.ok && assigned.error.code).toBe('incognito-blocked')
    const all = await references.getAll()
    const stored = await blobs.getAll()
    expect(all.ok && all.value).toHaveLength(0)
    expect(stored.ok && stored.value).toHaveLength(1)
  })

  it('فشل إيجاد المرجع القائم يوقف تعيين الصورة قبل أي كتابة', async () => {
    vi.spyOn(references, 'byIndex').mockResolvedValueOnce(errWith('unknown', 'فهرس معطوب'))

    const assigned = await assignImageAsReference(new Blob(['png']), KEY, null, NOW)

    expect(!assigned.ok && assigned.error.detail).toBe('فهرس معطوب')
    const all = await references.getAll()
    const stored = await blobs.getAll()
    expect(all.ok && all.value).toHaveLength(0)
    expect(stored.ok && stored.value).toHaveLength(0)
  })

  it('منع الكتابة يُرجَع كما هو من تعيين الصورة ولا يُبقي أثرًا', async () => {
    blockWrites()

    const assigned = await assignImageAsReference(new Blob(['png']), KEY, null, NOW)

    expect(!assigned.ok && assigned.error.code).toBe('incognito-blocked')
    const found = await findReferenceForPage(KEY)
    expect(found.ok && found.value).toBeNull()
  })
})
