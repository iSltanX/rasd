import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PALETTE_MAX_COLORS,
  PALETTE_MAX_NAME,
  paletteRecord,
  registerLifecycle,
} from '@/background/lifecycle'
import { resetHandlers } from '@/shared/messaging/rpc'
import { resetSettingsCache } from '@/shared/settings'
import { closeDatabase } from '@/shared/storage/db'
import { palettes } from '@/shared/storage/repository'

/**
 * `palette/save` — «احفظ اللوحة» و«احفظ في المكتبة» كانا زرّين صامتين: لا مسار يكتب لوحة في
 * المكتبة أصلًا. والحمولة من سكربت محتوى فوق صفحةٍ قد تكون معادية، فتُصفّى في الخلفية.
 */

beforeEach(async () => {
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  fakeBrowser.reset()
  resetSettingsCache()
  resetHandlers()
  vi.restoreAllMocks()
  Object.assign(globalThis.chrome, {
    runtime: { ...globalThis.chrome.runtime, onConnect: { addListener: vi.fn() } },
    alarms: {
      create: vi.fn(),
      get: vi.fn().mockResolvedValue(undefined),
      onAlarm: { addListener: vi.fn() },
    },
  })
})

async function save(payload: unknown): Promise<{ ok: boolean; value?: unknown; error?: unknown }> {
  const replies: { ok: boolean }[] = []
  void (await fakeBrowser.runtime.onMessage.trigger(
    { __rasd: 1, id: 'p', type: 'palette/save', payload },
    { tab: { id: 4 } } as chrome.runtime.MessageSender,
    (reply: { ok: boolean }) => replies.push(reply),
  ))
  await vi.waitFor(() => expect(replies).toHaveLength(1))
  return replies[0]!
}

describe('palette/save', () => {
  it('يكتب اللوحة في المكتبة ويعيد معرّفها وعدد ما حُفظ', async () => {
    registerLifecycle()
    const reply = await save({ name: 'لوحة example.com', colors: ['#3B82F6', '#111827'] })
    expect(reply).toMatchObject({ ok: true, value: { count: 2 } })

    const all = await palettes.getAll()
    expect(all.ok && all.value).toEqual([
      expect.objectContaining({
        id: (reply.value as { id: string }).id,
        name: 'لوحة example.com',
        colors: ['#3B82F6', '#111827'],
        projectId: null,
      }),
    ])
  })

  it('حمولةٌ بلا لون صالح تُرفَض ولا يُكتب شيء', async () => {
    registerLifecycle()
    const reply = await save({ name: 'x', colors: ['red', 'url(evil)', '#12345'] })
    expect(reply).toMatchObject({ ok: false, error: { code: 'invalid-data' } })
    const all = await palettes.getAll()
    expect(all.ok && all.value).toEqual([])
  })
})

describe('paletteRecord — تصفية الحمولة', () => {
  it('`#RRGGBB` وحده، بلا تكرار بلا اعتبار لحالة الأحرف', () => {
    const r = paletteRecord('  لوحة  ', ['#aabbcc', '#AABBCC', 'rgb(0,0,0)', '#fff', '#00FF00'])
    expect(r?.colors).toEqual(['#aabbcc', '#00FF00'])
    expect(r?.name).toBe('لوحة')
  })

  it('بحدّ أعلى للألوان والاسم، والاسم الفارغ «لوحة»', () => {
    const many = Array.from({ length: 200 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`)
    expect(paletteRecord('', many)?.colors).toHaveLength(PALETTE_MAX_COLORS)
    expect(paletteRecord('', ['#000000'])?.name).toBe('لوحة')
    expect(paletteRecord('ا'.repeat(500), ['#000000'])?.name).toHaveLength(PALETTE_MAX_NAME)
  })

  it('لا لون صالحًا ⟵ لا سجلّ', () => {
    expect(paletteRecord('x', [])).toBeNull()
    expect(paletteRecord('x', ['#GGGGGG'])).toBeNull()
  })
})
