import 'fake-indexeddb/auto'

import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assignImageAsReference } from '@/modules/compare/reference'
import { loadPopupContext } from '@/pages/popup/context'
import { resetHandlers } from '@/shared/messaging'
import { selectPopupState, type PopupContext } from '@/shared/popup-state'
import { patchSettings, resetSettingsCache } from '@/shared/settings'
import { closeDatabase } from '@/shared/storage/db'
import { setTabMode } from '@/shared/storage/session'

type PermissionsApi = { contains: ReturnType<typeof vi.fn> }

/** يموِّه `chrome.permissions.contains` وحدها — `fake-browser` لا يطبّقها. */
function installPermissionsApi(granted: boolean): PermissionsApi {
  const api: PermissionsApi = { contains: vi.fn().mockResolvedValue(granted) }
  Object.assign(globalThis.chrome, { permissions: api })
  return api
}

/**
 * تحميل سياق النافذة من التخزين الحقيقي (لا اختلاق) — الإعدادات من `chrome.storage.local`
 * والجلسة من `chrome.storage.session` بمسارَي `getSettingsResult` و`getSession` الفعليين: هل تُشغِّل
 * قراءتاهما الحالاتِ فعليًّا عبر `selectPopupState`، لا فقط تُعيدان الحقول بمعزل عن بقية الأنبوب.
 */

function toContext(
  partial: Awaited<ReturnType<typeof loadPopupContext>>,
  online: boolean,
): PopupContext {
  return { ...partial, online }
}

beforeEach(async () => {
  fakeBrowser.reset()
  resetHandlers()
  // `references` تعيش عبر الملفّ كلّه في `fake-indexeddb` بلا هذا — مرجعٌ
  // كتبه اختبارٌ سابق يبقى مرئيًّا لتاليه، فيُصدَّق طلب صلاحية لم يعد سببه قائمًا.
  await closeDatabase()
  indexedDB.deleteDatabase('rasd')
  // الإعدادات والجلسة تُقرآن من التخزين مباشرةً لا برسالة إلى العامل (`STAGES/04`) — فتُكتبان فيه.
  resetSettingsCache()
  await patchSettings({ onboarding: { completed: true, completedAt: 1 } })
})

describe('loadPopupContext — restricted', () => {
  it('صفحة chrome:// تُنتج restriction محظورة تُشغِّل حالة restricted', async () => {
    const partial = await loadPopupContext(1, 'chrome://settings')
    expect(partial.restriction).toEqual({ injectable: false, reason: 'browser-internal' })
    expect(selectPopupState(toContext(partial, true))).toBe('restricted')
  })

  it('صفحة عادية تُنتج restriction مسموحة — لا تُشغِّل restricted', async () => {
    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.restriction).toEqual({ injectable: true })
    expect(selectPopupState(toContext(partial, true))).not.toBe('restricted')
  })

  it('عنوان غائب (تبويب بلا url) يُعامَل كمحظور — الافتراض الآمن', async () => {
    const partial = await loadPopupContext(1, undefined)
    expect(partial.restriction).toEqual({ injectable: false, reason: 'invalid-url' })
  })
})

describe('loadPopupContext — تعذّر قراءة الإعدادات', () => {
  it('قراءة ساقطة تُقرأ منعًا لا قائمة فارغة — الأدوات لا تُعرض على جهلٍ بالمواقع المستثناة', async () => {
    resetSettingsCache()
    vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('تعذّرت القراءة'))
    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.restriction.injectable).toBe(false)
    expect(selectPopupState(toContext(partial, true))).toBe('restricted')
    vi.restoreAllMocks()
  })
})

describe('loadPopupContext — offline', () => {
  it('online:false في السياق المُدمَج تُشغِّل حالة offline بصرف النظر عن القناة', async () => {
    const partial = await loadPopupContext(1, 'https://example.com/')
    // `online` لا تصل من `loadPopupContext` — النافذة تدمجها من `navigator.onLine`
    // الحيّ (انظر تعليق الدالّة). المحاكاة هنا تمثّل تلك الخطوة.
    expect(selectPopupState(toContext(partial, false))).toBe('offline')
    expect(selectPopupState(toContext(partial, true))).not.toBe('offline')
  })
})

describe('loadPopupContext — الجولة الأولى والوضع الحيّ', () => {
  it('onboarding.completed=false على صفحة مسموحة يُنتج firstRun', async () => {
    await patchSettings({ onboarding: { completed: false, completedAt: null } })

    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.firstRun).toBe(true)
    expect(selectPopupState(toContext(partial, true))).toBe('first-run')
  })

  it('صفحة مقيّدة لا تُنتج firstRun أبدًا — restricted أولى', async () => {
    await patchSettings({ onboarding: { completed: false, completedAt: null } })

    const partial = await loadPopupContext(1, 'chrome://settings')
    expect(partial.firstRun).toBe(false)
    expect(selectPopupState(toContext(partial, true))).toBe('restricted')
  })

  it('وضع فحص محفوظ لهذا التبويب في الجلسة يصل عبر liveMode', async () => {
    await setTabMode(7, 'inspect')
    const partial = await loadPopupContext(7, 'https://example.com/')
    expect(partial.liveMode).toBe('inspect')
    expect(selectPopupState(toContext(partial, true))).toBe('inspect-active')
  })

  it('وضع تبويب آخر لا يُقرأ — كل تبويب معزول', async () => {
    await setTabMode(7, 'inspect')
    const partial = await loadPopupContext(8, 'https://example.com/')
    expect(partial.liveMode).toBeNull()
  })
})

/**
 * `permissionNeeded` — الميزة الوحيدة التي تشترط صلاحية مضيف اليوم
 * («البقاء عبر التنقّل»، المرحلة 16). ثلاث حالات فقط تُنتج الطلب: مرجعٌ
 * محفوظ لهذه الصفحة تحديدًا، **و** الصلاحية غير ممنوحة بعد.
 */
describe('loadPopupContext — permissionNeeded', () => {
  it('مرجع محفوظ + صلاحية غير ممنوحة ⇒ الطلب يظهر', async () => {
    installPermissionsApi(false)
    await assignImageAsReference(
      new Blob(['x'], { type: 'image/png' }),
      { origin: 'https://example.com', path: '/', viewport: 'custom' },
      null,
    )

    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.permissionNeeded).toEqual({ origin: 'https://example.com' })
    expect(selectPopupState(toContext(partial, true))).toBe('permission')
  })

  it('مرجع محفوظ + صلاحية ممنوحة ⇒ لا طلب', async () => {
    installPermissionsApi(true)
    await assignImageAsReference(
      new Blob(['x'], { type: 'image/png' }),
      { origin: 'https://example.com', path: '/', viewport: 'custom' },
      null,
    )

    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.permissionNeeded).toBeNull()
  })

  it('لا مرجع محفوظ لهذه الصفحة ⇒ لا طلب رغم غياب الصلاحية', async () => {
    installPermissionsApi(false)
    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.permissionNeeded).toBeNull()
  })

  it('مرجع محفوظ لمسار آخر على الأصل نفسه لا يُشغِّل الطلب', async () => {
    installPermissionsApi(false)
    await assignImageAsReference(
      new Blob(['x'], { type: 'image/png' }),
      { origin: 'https://example.com', path: '/other', viewport: 'custom' },
      null,
    )

    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.permissionNeeded).toBeNull()
  })

  it('مرجع محفوظ بمقاس «هاتف» لا «مخصّص» يُشغِّل الطلب أيضًا — الأربعة تُفحَص لا واحد', async () => {
    installPermissionsApi(false)
    await assignImageAsReference(
      new Blob(['x'], { type: 'image/png' }),
      { origin: 'https://example.com', path: '/', viewport: 'phone' },
      null,
    )

    const partial = await loadPopupContext(1, 'https://example.com/')
    expect(partial.permissionNeeded).toEqual({ origin: 'https://example.com' })
  })

  it('صفحة مقيّدة لا تُشغِّل الطلب حتى مع مرجع محفوظ', async () => {
    installPermissionsApi(false)
    await assignImageAsReference(
      new Blob(['x'], { type: 'image/png' }),
      { origin: 'chrome://settings', path: '/', viewport: 'custom' },
      null,
    )

    const partial = await loadPopupContext(1, 'chrome://settings')
    expect(partial.permissionNeeded).toBeNull()
  })
})

describe('loadRecent — أحدث لقطتين بلا قراءة المكتبة كلّها', () => {
  it('الأحدث أوّلًا، والمحذوفة تُتخطّى، ولا getAll على الفهرس', async () => {
    const { captures } = await import('@/shared/storage/repository')
    const { loadRecent } = await import('@/pages/popup/context')
    const base = {
      origin: 'https://example.com',
      url: 'https://example.com/',
      title: 'لقطة',
      kind: 'area' as const,
      status: 'ready' as const,
      projectId: null,
      tags: [],
      width: 10,
      height: 10,
      devicePixelRatio: 1,
      favorite: false,
      archived: false,
    }
    await captures.putMany(
      Array.from({ length: 40 }, (_, i) => ({
        ...base,
        id: `c${String(i).padStart(2, '0')}`,
        createdAt: 1_000 + i,
        trashedAt: i === 39 ? 5 : null,
      })),
    )
    const getAll = vi.spyOn(IDBIndex.prototype, 'getAll')
    const recent = await loadRecent()
    expect(recent.map((r) => r.record.id)).toEqual(['c38', 'c37'])
    expect(getAll).not.toHaveBeenCalled()
    getAll.mockRestore()
  })
})
