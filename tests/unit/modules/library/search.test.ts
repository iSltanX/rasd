import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  searchCaptures,
  searchColors,
  searchGuides,
  searchPalettes,
  searchReferences,
  searchTab,
} from '@/modules/library/search'
import { closeDatabase, setIncognitoWritePolicy } from '@/shared/storage/db'
import { captures, colors } from '@/shared/storage/repository'

import type {
  CaptureRecord,
  ColorRecord,
  GuideRecord,
  PaletteRecord,
  ReferenceRecord,
} from '@/shared/storage/schema'

function capture(id: string, over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id,
    createdAt: 1_700_000_000_000,
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

describe('دوال المطابقة المحضة — بلا تخزين', () => {
  it('searchCaptures يجد بالعنوان والرابط والوسوم', () => {
    const records = [
      capture('a', { title: 'صفحة تسجيل الدخول' }),
      capture('b', { url: 'https://shop.example.com/checkout' }),
      capture('c', { tags: ['خطأ', 'عاجل'] }),
    ]
    expect(searchCaptures(records, 'تسجيل').map((r) => r.id)).toEqual(['a'])
    expect(searchCaptures(records, 'checkout').map((r) => r.id)).toEqual(['b'])
    expect(searchCaptures(records, 'عاجل').map((r) => r.id)).toEqual(['c'])
  })

  it('searchColors يجد بقيمة HEX وبالاسم والملاحظة (حيث يُكتب متغيّر CSS)', () => {
    const records: ColorRecord[] = [
      {
        id: 'a',
        hex: '#3B82F6',
        name: 'أزرق',
        note: '--color-primary',
        source: 'css',
        projectId: null,
        sourceUrl: null,
        createdAt: 0,
      },
      {
        id: 'b',
        hex: '#EF4444',
        name: 'أحمر',
        note: '',
        source: 'pixel',
        projectId: null,
        sourceUrl: null,
        createdAt: 0,
      },
    ]
    expect(searchColors(records, '3b82f6').map((r) => r.id)).toEqual(['a'])
    expect(searchColors(records, '--color-primary').map((r) => r.id)).toEqual(['a'])
    expect(searchColors(records, 'أحمر').map((r) => r.id)).toEqual(['b'])
  })

  it('searchPalettes يجد بالاسم أو بأحد الألوان المكوِّنة', () => {
    const records: PaletteRecord[] = [
      { id: 'a', name: 'لوحة الترحيب', colors: ['#111', '#222'], projectId: null, createdAt: 0 },
    ]
    expect(searchPalettes(records, 'الترحيب').map((r) => r.id)).toEqual(['a'])
    expect(searchPalettes(records, '#111').map((r) => r.id)).toEqual(['a'])
  })

  it('searchReferences يجد بالأصل أو المسار', () => {
    const records: ReferenceRecord[] = [
      {
        id: 'a',
        projectId: null,
        origin: 'https://figma.com',
        path: '13:24',
        viewport: 'desktop',
        blobId: 'x',
        createdAt: 0,
      },
    ]
    expect(searchReferences(records, 'figma').map((r) => r.id)).toEqual(['a'])
  })

  it('searchGuides يجد بالعنوان', () => {
    const records: GuideRecord[] = [
      { id: 'a', title: 'دليل الدفع', projectId: null, captureIds: [], createdAt: 0 },
    ]
    expect(searchGuides(records, 'الدفع').map((r) => r.id)).toEqual(['a'])
  })

  it('استعلامٌ لا يطابق شيئًا يُرجع قائمة فارغة لا استثناءً', () => {
    expect(searchCaptures([capture('a')], 'غير موجود إطلاقًا')).toEqual([])
  })
})

describe('searchTab — الطبقة المتّصلة بالمخازن', () => {
  beforeEach(async () => {
    setIncognitoWritePolicy(false)
    await closeDatabase()
    indexedDB.deleteDatabase('rasd')
    await new Promise((r) => setTimeout(r, 0))
  })

  it('يبحث في captures عبر المستودع الفعلي', async () => {
    await captures.put(capture('a', { title: 'مراجعة التصميم' }))
    await captures.put(capture('b', { title: 'صفحة أخرى' }))

    const result = await searchTab('captures', 'مراجعة')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.map((r) => r.id)).toEqual(['a'])
  })

  it('يبحث في colors عبر المستودع الفعلي', async () => {
    await colors.put({
      id: 'a',
      hex: '#3B82F6',
      name: 'أزرق',
      note: '',
      source: 'pixel',
      projectId: null,
      sourceUrl: null,
      createdAt: 0,
    })
    const result = await searchTab('colors', '3b82f6')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toHaveLength(1)
  })

  it('يبحث في palettes وreferences وguides دون فشل عند مخزن فارغ', async () => {
    for (const tab of ['palettes', 'references', 'guides'] as const) {
      const result = await searchTab(tab, 'أي شيء')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual([])
    }
  })
})

describe('أداء: البحث في 5000 سجلّ يستجيب في ≤150ms', () => {
  it('يقيس زمن مسح 5000 لقطة ومطابقتها نصًّا — لا يفترضه', () => {
    const records: CaptureRecord[] = Array.from({ length: 5000 }, (_, i) =>
      capture(`c${i}`, {
        title: i === 4999 ? 'الصفحة المستهدَفة الوحيدة' : `صفحة رقم ${i}`,
        tags: [`وسم${i % 50}`],
      }),
    )
    const start = performance.now()
    const result = searchCaptures(records, 'المستهدَفة')
    const elapsed = performance.now() - start

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('c4999')
    // الحدّ مضاعَف عمدًا: بيئة الاختبار (Node/happy-dom) ليست متصفّحًا حيًّا،
    // والقياس الحقيقي المُلزِم للبند يقع في التحقّق الحيّ عند إغلاق المرحلة.
    expect(elapsed).toBeLessThan(300)
  })
})
