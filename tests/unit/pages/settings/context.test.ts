import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it } from 'vitest'

import { saveAppearance } from '@/pages/settings/context'
import { getSettings, resetSettingsCache } from '@/shared/settings'

/**
 * `saveAppearance` — الحارس السالب لعطل رصدته مراجعة Gate B في الوحدة 20.1.
 *
 * محاولة أولى كانت تقرأ `current` هنا ثمّ تدمجه وتُمرِّر appearance **كاملة**
 * إلى `patchSettings` — فتصير كتابةً كاملة تستبدل لا دمجًا جزئيًّا حقيقيًّا،
 * وقراءتها المسبَقة نافذة سباق إضافية لم تكن موجودة في `patchSettings` نفسها.
 * الإصلاح: تمرير `patch` كما هو، فتُنفَّذ قراءة `current` **مرّة واحدة** داخل
 * `patchSettings` نفسها وقت الكتابة الفعلية.
 *
 * **حدٌّ باقٍ متعمَّد**: نداءان متزامنان فعلًا (كلاهما يبدأ قبل أن ينتهي أيّهما)
 * لا يزالان عرضةً لسباقٍ متأصّل في `patchSettings` نفسها (`shared/settings/index.ts`)
 * — بلا قفل بين القراءة والكتابة، وهذا سطحٌ مشترك لكل مستدعٍ في المشروع، لا
 * خاصّ بهذه الصفحة، وخارج نطاق الوحدة 20.1. ما تثبته هذه الوحدة: تسلسلٌ
 * فعليّ (كل نداء يُنتظَر قبل التالي) يحفظ كل التغييرات، بلا استبدال كامل.
 */

beforeEach(() => {
  fakeBrowser.reset()
  resetSettingsCache()
})

describe('saveAppearance', () => {
  it('لا تمحو مفاتيح المظهر الأخرى', async () => {
    await saveAppearance({ density: 'compact' })
    const s = await getSettings()
    expect(s.appearance.density).toBe('compact')
    expect(s.appearance.theme).toBe('system')
    expect(s.appearance.language).toBe('ar')
  })

  it('نداءان متتاليان (كلٌّ مُنتظَر) — الوضع ثم الكثافة — يحفظان كليهما', async () => {
    await saveAppearance({ theme: 'dark' })
    await saveAppearance({ density: 'compact' })
    const s = await getSettings()
    expect(s.appearance.theme).toBe('dark')
    expect(s.appearance.density).toBe('compact')
  })

  it('فشل الكتابة يعود Result سالبًا — لا يُبتلَع', async () => {
    const original = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
    fakeBrowser.storage.local.set = () => Promise.reject(new Error('quota'))
    const result = await saveAppearance({ theme: 'dark' })
    expect(result.ok).toBe(false)
    fakeBrowser.storage.local.set = original
  })
})
