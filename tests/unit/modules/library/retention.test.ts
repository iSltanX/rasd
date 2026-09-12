import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { retentionSweep } from '@/modules/library/retention'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { blobs, captures, guides } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

const DAY = 24 * 60 * 60 * 1000
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

describe('retentionSweep — «حذف السجلّ تلقائيًا بعد مدّة» (§11)', () => {
  it('صفرٌ يعني معطَّل — لا يُحذف شيء مهما قدُم', async () => {
    await captures.put(capture('a', { createdAt: NOW - 900 * DAY }))

    const swept = await retentionSweep(NOW, 0)

    expect(swept.ok && swept.value).toBe(0)
    const count = await captures.count()
    expect(count.ok && count.value).toBe(1)
  })

  it('يحذف ما تجاوز المدّة ويُبقي ما دونها', async () => {
    await captures.put(capture('قديمة', { createdAt: NOW - 40 * DAY }))
    await captures.put(capture('حديثة', { createdAt: NOW - 3 * DAY }))

    const swept = await retentionSweep(NOW, 30)

    expect(swept.ok && swept.value).toBe(1)
    expect((await captures.get('قديمة')).ok).toBe(false)
    expect((await captures.get('حديثة')).ok).toBe(true)
  })

  /*
   * نصّ التصميم حرفيًّا تحت الضابط: «ينطبق على غير المميّزة فقط». ولا فهرس
   * على `favorite` — الترشيح في الذاكرة بعد أن حصر المدى المقروء.
   */
  it('**لا يمسّ المميَّزة** مهما قدُمت', async () => {
    await captures.put(capture('مميّزة', { createdAt: NOW - 900 * DAY, favorite: true }))
    await captures.put(capture('عادية', { createdAt: NOW - 900 * DAY }))

    const swept = await retentionSweep(NOW, 7)

    expect(swept.ok && swept.value).toBe(1)
    expect((await captures.get('مميّزة')).ok, 'حُذفت لقطة ميّزها المستخدم').toBe(true)
  })

  /*
   * الحدّ تمامًا: «أقدم من 7 أيام» تعني ما مضى عليه **أكثر** من سبعة، لا
   * ما مضى عليه سبعة بالضبط — `upperBound(cutoff, true)` مفتوحة عمدًا.
   */
  it('لقطة عمرها المدّة بالضبط تبقى — الحدّ مفتوح لا مغلق', async () => {
    await captures.put(capture('على الحدّ', { createdAt: NOW - 7 * DAY }))

    const swept = await retentionSweep(NOW, 7)

    expect(swept.ok && swept.value).toBe(0)
    expect((await captures.get('على الحدّ')).ok).toBe(true)
  })

  it('والحذف نهائيّ لا إلى المهملات — البايتات تذهب معها', async () => {
    await captures.put(capture('a', { createdAt: NOW - 40 * DAY }))
    await blobs.put({ id: 'a', blob: new Blob(['x']), mime: 'image/png', bytes: 1 })

    await retentionSweep(NOW, 30)

    expect((await captures.get('a')).ok).toBe(false)
    expect((await blobs.get('a')).ok, 'بقيت البايتات بعد حذفٍ وُصف بأنه نهائي').toBe(false)
  })

  /*
   * الوحدة 20.3 — العطل الذي حوّله الحذف الدوري من نادر إلى منهجيّ
   * (`§6` صفّ 120): `deleteCaptureWithBlob` لم تكن تمسّ `guides`، فبطاقة
   * الدليل تعرض عدّادًا يعِد بلقطات لا وجود لها.
   */
  it('**ينظّف إشارات الأدلّة إلى اللقطة المحذوفة** — لا عدّاد يعِد بما لا وجود له', async () => {
    await captures.put(capture('مطموسة', { createdAt: NOW - 40 * DAY }))
    await captures.put(capture('باقية', { createdAt: NOW - 1 * DAY }))
    await guides.put({
      id: 'دليل',
      title: 'خطوات',
      projectId: null,
      captureIds: ['مطموسة', 'باقية'],
      createdAt: NOW,
    })

    await retentionSweep(NOW, 30)

    const guide = await guides.get('دليل')
    expect(guide.ok && guide.value.captureIds).toEqual(['باقية'])
  })
})
