import { Blob as NodeBlob } from 'node:buffer'

import { openDB } from 'idb'

import { defaultSettings, type Settings } from '@/shared/settings'
import { MIGRATIONS } from '@/shared/storage/migrations'
import { DB_NAME, STORE_NAMES, type RasdDB, type StoreName } from '@/shared/storage/schema'

import { issueFixture } from '../modules/issues/fixture'

/**
 * مكتبةٌ كاملة بشكل النسخة `0.1.0` — كل مخزن فيها بسجلّين على الأقلّ، وحالاتها الحدّية (`STAGES/07`).
 *
 * **مكتوبة النوع لكل مخزن:** `{ [S in StoreName]: … }` يُسقط الترجمة إن أُضيف مخزنٌ إلى `STORE_NAMES` بلا
 * سجلّات هنا — فاختبارات النسخ والاستعادة والحذف الكامل لا تمرّ على مكتبةٍ ينقصها مخزنٌ جديد.
 *
 * والوسوم متّسقة مع اللقطات عمدًا (العدّاد = عدد اللقطات الحاملة للوسم): الاستعادة تعيد حساب العدّاد من
 * اللقطات (ADR 0039)، فمكتبةٌ متّسقة تعود كما هي بايتًا ببايت.
 */

/** نسخة قاعدة البيانات في الإصدار `0.1.0` — ثابتةٌ هنا لا `DB_VERSION`: اختبار ترقيةٍ يبدأ من الماضي. */
export const V010_DB_VERSION = 4

export const bytesBlob = (bytes: readonly number[], type: string): Blob =>
  new NodeBlob([new Uint8Array(bytes)], { type }) as unknown as Blob

const at = 1_780_000_000_000

const capture = (
  id: string,
  over: Partial<RasdDB['captures']['value']> = {},
): RasdDB['captures']['value'] => ({
  id,
  createdAt: at,
  origin: 'https://shop.example',
  url: 'https://shop.example/cart',
  title: 'السلّة',
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
})

export type LibraryRecords = { [S in StoreName]: RasdDB[S]['value'][] }

/** يبني المكتبة من جديد في كل نداء — `Blob` لا يُشارَك بين اختبارين. */
export function libraryFixture(): LibraryRecords {
  return {
    captures: [
      capture('c1', { projectId: 'p1', tags: ['هبوط', 'نموذج'], favorite: true }),
      capture('c2', {
        createdAt: at + 1000,
        kind: 'full-page',
        tags: ['هبوط'],
        title: 'Landing — الصفحة الرئيسية',
        url: 'https://shop.example/',
        height: 6200,
      }),
      capture('c3', { createdAt: at + 2000, tags: ['قديم'], trashedAt: at + 5000, archived: true }),
    ],
    blobs: [
      { id: 'c1', blob: bytesBlob([137, 80, 78, 71, 1], 'image/png'), mime: 'image/png', bytes: 5 },
      {
        id: 'c2',
        blob: bytesBlob([82, 73, 70, 70, 2, 3], 'image/webp'),
        mime: 'image/webp',
        bytes: 6,
      },
      { id: 'c3', blob: bytesBlob([137, 80, 78, 71, 3], 'image/png'), mime: 'image/png', bytes: 5 },
      {
        id: 'ref-blob-1',
        blob: bytesBlob([137, 80, 78, 71, 9, 9], 'image/png'),
        mime: 'image/png',
        bytes: 6,
      },
    ],
    projects: [
      {
        id: 'p1',
        name: 'منصّة ٢٠',
        color: 'tool/capture/solid',
        createdAt: at,
        updatedAt: at + 10,
      },
      {
        id: 'p2',
        name: 'Design System',
        color: 'tool/inspect/solid',
        createdAt: at + 1,
        updatedAt: at + 1,
      },
    ],
    colors: [
      {
        id: 'col1',
        hex: '#1f6feb',
        name: 'أزرق العلامة',
        note: '',
        source: 'pixel',
        projectId: 'p1',
        sourceUrl: 'https://shop.example/',
        createdAt: at,
      },
      {
        id: 'col2',
        hex: '#0b0d10',
        name: '',
        note: 'خلفية داكنة',
        source: 'css',
        projectId: null,
        sourceUrl: null,
        createdAt: at + 1,
      },
    ],
    palettes: [
      {
        id: 'pal1',
        name: 'لوحة الهبوط',
        colors: ['#1f6feb', '#0b0d10'],
        projectId: 'p1',
        createdAt: at,
      },
      { id: 'pal2', name: 'Empty', colors: [], projectId: null, createdAt: at + 1 },
    ],
    references: [
      {
        id: 'r1',
        projectId: 'p1',
        origin: 'https://shop.example',
        path: '/cart',
        viewport: 'desktop',
        blobId: 'ref-blob-1',
        createdAt: at,
        exclusions: [
          {
            id: 'z1',
            label: 'الساعة',
            createdAt: at,
            anchor: {
              kind: 'rect',
              rect: { space: 'device', x: 10, y: 20, width: 120, height: 40 },
            },
          },
          {
            id: 'z2',
            label: null,
            createdAt: at + 1,
            anchor: {
              kind: 'element',
              selector: '.ad-slot',
              hosts: [],
              fingerprint: { tag: 'div', attrs: ['data-ad'], textHash: '0a1b2c3d', textLength: 0 },
              rect: { space: 'device', x: 0, y: 400, width: 728, height: 90 },
            },
          },
        ],
      },
      // يتيمٌ بلا بايتات — موجود في مكتبات حقيقية (`storage-upgrade-v4.test.ts`)، والنسخة تحمله كما هو.
      {
        id: 'r2',
        projectId: null,
        origin: 'https://news.example',
        path: '/',
        viewport: 'phone',
        blobId: 'missing-blob',
        createdAt: at + 1,
        exclusions: [],
      },
    ],
    annotations: [
      {
        captureId: 'c1',
        scene: { captureId: 'c1', items: [{ kind: 'arrow', from: [1, 2], to: [30, 40] }] },
        updatedAt: at + 20,
        schemaVersion: 1,
        redaction: { total: 1, irreversible: 1 },
      },
      // سجلٌّ من قبل حقل النسخة وملخّص الحجب — الغياب يُقرأ «النسخة الأولى».
      { captureId: 'c2', scene: { captureId: 'c2', items: [] }, updatedAt: at + 21 },
    ],
    guides: [
      { id: 'g1', title: 'دليل الدفع', projectId: 'p1', captureIds: ['c1', 'c2'], createdAt: at },
      { id: 'g2', title: 'فارغ', projectId: null, captureIds: [], createdAt: at + 1 },
    ],
    tags: [
      { name: 'هبوط', count: 2 },
      { name: 'نموذج', count: 1 },
      { name: 'قديم', count: 1 },
    ],
    thumbnails: [
      { id: 'c1', blob: bytesBlob([255, 216, 1], 'image/webp'), width: 320, height: 200 },
      { id: 'c2', blob: bytesBlob([255, 216, 2, 2], 'image/webp'), width: 320, height: 1377 },
    ],
    issues: [
      issueFixture(),
      issueFixture({ id: 'i2', status: 'resolved', projectId: 'p1', updatedAt: 9_000 }),
    ],
  }
}

/** إعدادات مستخدمٍ حقيقي بشكل `0.1.0`: مواقع مستثناة، واختصار معدَّل، وجولة التعريف مكتملة. */
export function settingsFixture(): Settings {
  const s = defaultSettings()
  return {
    ...s,
    capture: { ...s.capture, format: 'webp', quality: 0.8 },
    appearance: { ...s.appearance, theme: 'dark' },
    shortcuts: { toolKeys: { ...s.shortcuts.toolKeys, measure: 'KeyN' } },
    privacy: {
      ...s.privacy,
      excludedSites: ['bank.com', 'mail.google.com', 'intranet.example:8443/admin*'],
      incognito: 'off',
      autoDeleteAfterDays: 30,
    },
    onboarding: { completed: true, completedAt: at },
  }
}

/**
 * يبني قاعدة النسخة `version` بخطوات ترحيلها كما جرت عند المستخدمين — لا بمخطّطٍ منسوخ — ثمّ يكتب
 * `records` في معاملة واحدة ويُغلقها. نمط `storage-upgrade-v4.test.ts`.
 */
export async function seedDatabase(
  records: Partial<LibraryRecords>,
  version = V010_DB_VERSION,
): Promise<void> {
  const db = await openDB<RasdDB>(DB_NAME, version, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      for (let v = oldVersion + 1; v <= version; v++) MIGRATIONS[v]?.(database, transaction)
    },
  })
  const names = STORE_NAMES.filter((n) => (records[n]?.length ?? 0) > 0)
  if (names.length > 0) {
    const tx = db.transaction(names, 'readwrite')
    await Promise.all([
      ...names.flatMap((n) => (records[n] ?? []).map((r) => tx.objectStore(n).put(r as never))),
      tx.done,
    ])
  }
  db.close()
}

/** البايتات مقروءةً — مقارنة `Blob` بـ`toEqual` لا تقرأ المحتوى. */
export async function blobBytes(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())]
}

/**
 * سجلّات مخزن بشكلٍ يقارَن: كل `Blob` يُستبدل ببايتاته ونوعه، والترتيب بالمفتاح (ترتيب `getAll`).
 */
export async function comparable(records: readonly object[]): Promise<unknown[]> {
  const out: unknown[] = []
  for (const record of records) {
    const copy: Record<string, unknown> = { ...(record as Record<string, unknown>) }
    for (const [key, value] of Object.entries(copy)) {
      if (value && typeof (value as Blob).arrayBuffer === 'function') {
        copy[key] = { type: (value as Blob).type, bytes: await blobBytes(value as Blob) }
      }
    }
    out.push(copy)
  }
  return out
}
