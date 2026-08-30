import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadRecent } from '@/pages/popup/context'
import { annotations, clearAllStores, putCaptureWithBlob } from '@/shared/storage/repository'

import type { CaptureRecord } from '@/shared/storage/schema'

/**
 * **أوّل مسار حيّ ينقض وعد المرحلة — ويُغلَق هنا.**
 *
 * النافذة كانت تعرض بلوب اللقطة **السليم كاملًا** لآخر لقطتين. فيفتح
 * المستخدم المحرر، ويغطّي كلمة مرور، ويحفظ — ثمّ تعرضها النافذة مكشوفة
 * على شاشته وعلى أي شاشة يشاركها.
 *
 * والمرحلة 15 هي التي تخلق التوقّع، فهي التي تملك واجب إغلاقه: من يَعِد
 * «لا يمكن استرجاع ما تحتها» لا يترك مسارًا يعرضها كاملة على بُعد نقرة.
 */

const capture = (id: string, createdAt: number): CaptureRecord => ({
  id,
  createdAt,
  origin: 'https://probe.test',
  url: 'https://probe.test/p',
  title: `لقطة ${id}`,
  kind: 'viewport',
  status: 'ready',
  projectId: null,
  tags: [],
  width: 100,
  height: 100,
  devicePixelRatio: 1,
  favorite: false,
  archived: false,
  trashedAt: null,
})

const bytes = (): Blob => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })

beforeEach(async () => {
  await clearAllStores()
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: () => undefined,
  })
})

describe('مصغَّرة النافذة والحجب', () => {
  it('لقطةٌ بلا تعليق تُعرَض بمصغَّرتها', async () => {
    await putCaptureWithBlob(capture('a', 1), bytes())
    const recent = await loadRecent()

    expect(recent).toHaveLength(1)
    expect(recent[0]!.withheld).toBe(false)
    expect(recent[0]!.thumbUrl).toBe('blob:fake')
  })

  it('ولقطةٌ عُلِّق عليها بلا حجب تُعرَض كذلك', async () => {
    await putCaptureWithBlob(capture('b', 2), bytes())
    await annotations.put({
      captureId: 'b',
      scene: {},
      updatedAt: 2,
      schemaVersion: 1,
      redaction: { total: 3, irreversible: 0 },
    })

    const recent = await loadRecent()
    expect(recent[0]!.withheld).toBe(false)
    expect(recent[0]!.thumbUrl).toBe('blob:fake')
  })

  it('**ولقطةٌ فيها تغطيةٌ واحدة لا تُعرَض بأصلها قطّ**', async () => {
    await putCaptureWithBlob(capture('c', 3), bytes())
    await annotations.put({
      captureId: 'c',
      scene: {},
      updatedAt: 3,
      schemaVersion: 1,
      redaction: { total: 1, irreversible: 1 },
    })

    const recent = await loadRecent()
    expect(recent[0]!.withheld).toBe(true)
    expect(recent[0]!.thumbUrl).toBeNull()
  })

  it('**والقرار يُقرأ من حقل مسطَّح لا بفكّ المشهد**', async () => {
    // المشهد هنا نصٌّ لا يُفكّ أصلًا؛ ولو احتاج الحارس تحليله لَانهار.
    await putCaptureWithBlob(capture('d', 4), bytes())
    await annotations.put({
      captureId: 'd',
      scene: 'ليس مشهدًا صالحًا',
      updatedAt: 4,
      schemaVersion: 99,
      redaction: { total: 1, irreversible: 1 },
    })

    const recent = await loadRecent()
    expect(recent[0]!.withheld).toBe(true)
  })

  it('وسجلٌّ قديم بلا حقل حجب يُقرأ «لا حجب» ولا يُعطِّل النافذة', async () => {
    await putCaptureWithBlob(capture('e', 5), bytes())
    await annotations.put({ captureId: 'e', scene: {}, updatedAt: 5 })

    const recent = await loadRecent()
    expect(recent[0]!.withheld).toBe(false)
    expect(recent[0]!.thumbUrl).toBe('blob:fake')
  })

  it('والحجب في لقطة لا يمنع مصغَّرة الأخرى', async () => {
    await putCaptureWithBlob(capture('f', 6), bytes())
    await putCaptureWithBlob(capture('g', 7), bytes())
    await annotations.put({
      captureId: 'g',
      scene: {},
      updatedAt: 7,
      schemaVersion: 1,
      redaction: { total: 1, irreversible: 1 },
    })

    const recent = await loadRecent()
    const byId = new Map(recent.map((r) => [r.record.id, r]))
    expect(byId.get('g')!.withheld).toBe(true)
    expect(byId.get('f')!.withheld).toBe(false)
    expect(byId.get('f')!.thumbUrl).toBe('blob:fake')
  })
})
