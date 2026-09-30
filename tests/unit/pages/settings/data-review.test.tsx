import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  awaitDownload,
  dropReasonText,
  importWarnings,
  lastBackupText,
  readLastBackup,
  recordLastBackup,
  restoreWarnings,
  settingValueText,
} from '@/pages/settings/data-context'
import { ImportSettingsDialog } from '@/pages/settings/parts/data/ImportSettingsDialog'
import { stripIsolates } from '@/shared/bidi/isolate'
import { defaultSettings } from '@/shared/settings'
import { planSettingsImport } from '@/shared/settings/transfer'

import type { RestorePlan } from '@/modules/backup/backup'

/**
 * ما كشفته المراجعة المستقلّة في واجهة قسم البيانات (`STAGES/07`) — كُتبت قبل إصلاحاتها.
 */

const DAY = 24 * 60 * 60 * 1000
let container: HTMLDivElement | null = null

beforeEach(() => {
  fakeBrowser.reset()
})

afterEach(() => {
  if (container) {
    render(null, container)
    container.remove()
    container = null
  }
  vi.restoreAllMocks()
})

const file = (settings: object) => JSON.stringify({ format: 'rasd.settings', version: 1, settings })

describe('استيراد الإعدادات يعرض ما سيتغيّر ويحذّر ممّا لا يُعكَس', () => {
  it('مدّة احتفاظٍ تقصر: تحذيرٌ خطِر بأن الحذف نهائي — وإطالتها أو إلغاؤها بلا تحذير', () => {
    const shorter = importWarnings([{ path: 'privacy.autoDeleteAfterDays', from: 0, to: 7 }])
    expect(shorter.map((w) => w.tone)).toEqual(['danger'])
    expect(stripIsolates(shorter[0]!.text)).toContain('تُحذف نهائيًّا')
    expect(importWarnings([{ path: 'privacy.autoDeleteAfterDays', from: 30, to: 7 }])).toHaveLength(
      1,
    )
    expect(importWarnings([{ path: 'privacy.autoDeleteAfterDays', from: 7, to: 30 }])).toEqual([])
    expect(importWarnings([{ path: 'privacy.autoDeleteAfterDays', from: 7, to: 0 }])).toEqual([])
  })

  it('«كل المواقع» والحفظ في النوافذ الخاصّة: تحذيران', () => {
    const w = importWarnings([
      { path: 'privacy.excludedSites', from: [], to: ['*'] },
      { path: 'privacy.incognito', from: 'no-save', to: 'allow' },
    ])
    expect(w).toHaveLength(2)
  })

  it('القيم بكلماتها: المدّة والتصفّح الخاص والتبديل والقائمة', () => {
    expect(settingValueText('privacy.autoDeleteAfterDays', 0)).toBe('بلا حذف')
    expect(settingValueText('privacy.autoDeleteAfterDays', 7)).toBe('٧ أيام')
    expect(settingValueText('privacy.autoDeleteAfterDays', 30)).toBe('٣٠ يومًا')
    expect(settingValueText('privacy.incognito', 'allow')).toBe('يعمل ويحفظ')
    expect(settingValueText('capture.openEditorAfter', false)).toBe('معطَّل')
    expect(settingValueText('privacy.excludedSites', ['a.com', 'b.com', 'c.com'])).toBe('٣ مواقع')
  })

  it('النافذة تسرد ما سيتغيّر بقيمتيه، وتعرض التحذير قبل «احفظ المقبول»', () => {
    const planned = planSettingsImport(
      file({ privacy: { autoDeleteAfterDays: 7 }, appearance: { theme: 'light' } }),
      defaultSettings(),
    )
    if (!planned.ok) throw new Error(planned.error)
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <ImportSettingsDialog
        fileName="x.json"
        plan={planned.value}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
      container,
    )
    const text = stripIsolates(container.textContent ?? '')
    expect(text).toContain('ما سيتغيّر')
    expect(text).toContain('مدّة الاحتفاظ باللقطات')
    expect(text).toContain('بلا حذف ← ٧ أيام')
    expect(text).toContain('وضع السمة')
    expect(text).toContain('تُحذف نهائيًّا')
    expect(container.querySelector('[data-import-changes="2"]')).not.toBeNull()
  })

  it('ملفٌّ فوق السقف: سببه بكلماته', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <ImportSettingsDialog
        fileName="x.json"
        plan="too-large"
        onSave={vi.fn()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
      container,
    )
    expect(container.textContent).toContain('الملفّ أكبر من ملفّ إعدادات')
  })

  it('آلاف المفاتيح المُسقَطة لا ترسم آلاف الصفوف', () => {
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, i]))
    const planned = planSettingsImport(file({ appearance: many }), defaultSettings())
    if (!planned.ok) throw new Error(planned.error)
    expect(planned.value.dropped).toHaveLength(500)
    container = document.createElement('div')
    document.body.appendChild(container)
    render(
      <ImportSettingsDialog
        fileName="x.json"
        plan={planned.value}
        onSave={vi.fn()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
      container,
    )
    expect(container.querySelectorAll('[data-dropped-row]').length).toBeLessThanOrEqual(50)
    expect(container.textContent).toContain('وغيرها')
  })

  it('قيمة الملفّ في سطر السبب معزولةٌ اتّجاهيًّا — محرف قلبٍ فيها لا يقلب ما بعدها', () => {
    const text = dropReasonText({ path: 'capture.format', reason: 'option', received: '‮svg' })
    expect(text).toMatch(/⁨‮svg⁩/u)
  })
})

describe('الاستعادة تحذّر ممّا سيكنسه الحذف الدوري', () => {
  const plan = (captures: object[]) => ({ records: { captures } }) as unknown as RestorePlan
  const now = Date.UTC(2026, 8, 30)

  it('لقطات الملفّ الأقدم من مدّة الاحتفاظ وغير المميّزة، وما في المهملات منذ أكثر من ثلاثين يومًا', () => {
    const w = restoreWarnings(
      plan([
        { createdAt: now - 60 * DAY, favorite: false, trashedAt: null },
        { createdAt: now - 60 * DAY, favorite: true, trashedAt: null },
        { createdAt: now - 2 * DAY, favorite: false, trashedAt: null },
        { createdAt: now - 90 * DAY, favorite: true, trashedAt: now - 45 * DAY },
      ]),
      30,
      now,
    )
    expect(w).toEqual({ retention: 1, trash: 1 })
    expect(
      restoreWarnings(plan([{ createdAt: 0, favorite: false, trashedAt: null }]), 0, now),
    ).toEqual({
      retention: 0,
      trash: 0,
    })
  })
})

describe('«آخر نسخة» لا تُسجَّل إلا لملفٍّ حُفظ، وتقول إن كانت ناقصة', () => {
  it('السجلّ يحمل ما تُرك، والسطر يقوله', async () => {
    const at = new Date(2026, 8, 30, 9, 5).getTime()
    await recordLastBackup({ at, skipped: 3 })
    const read = await readLastBackup()
    expect(read).toEqual({ at, skipped: 3 })
    const line = lastBackupText(read, new Date(2026, 8, 30, 15).getTime())
    expect(line).toContain('ناقصة')
    expect(lastBackupText({ at, skipped: 0 }, at)).not.toContain('ناقصة')
  })

  it('تنزيلٌ مُدار يُنتظر: `complete` أو `interrupted` (أُلغيت نافذة الحفظ)', async () => {
    type Listener = (delta: { id: number; state?: { current: string } }) => void
    const listeners = new Set<Listener>()
    const downloads = {
      search: vi.fn(() => Promise.resolve([{ id: 7, state: 'in_progress' }])),
      onChanged: {
        addListener: (l: Listener) => listeners.add(l),
        removeListener: (l: Listener) => listeners.delete(l),
      },
    }
    Object.assign(chrome, { downloads })
    const done = awaitDownload(7)
    await new Promise((r) => setTimeout(r, 0))
    for (const l of listeners) l({ id: 7, state: { current: 'interrupted' } })
    expect(await done).toBe('interrupted')
    expect(listeners.size).toBe(0)

    downloads.search.mockResolvedValueOnce([{ id: 8, state: 'complete' }])
    expect(await awaitDownload(8)).toBe('complete')
  })
})
