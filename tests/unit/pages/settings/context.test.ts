import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  saveAnnotation,
  saveAppearance,
  saveCapture,
  saveColors,
  saveShortcut,
} from '@/pages/settings/context'
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

describe('saveCapture / saveAnnotation / saveColors — الوحدة 20.2', () => {
  it('saveCapture لا تمحو مفاتيح التصوير الأخرى', async () => {
    await saveCapture({ saveLocation: 'library-and-downloads' })
    const s = await getSettings()
    expect(s.capture.saveLocation).toBe('library-and-downloads')
    expect(s.capture.format).toBe('png')
  })

  it('saveAnnotation لا تمحو مفاتيح التعليقات الأخرى', async () => {
    await saveAnnotation({ pinShape: 'square' })
    const s = await getSettings()
    expect(s.annotation.pinShape).toBe('square')
    expect(s.annotation.color).toBe('tool/annotate/solid')
  })

  it('saveColors لا تمحو مفاتيح الألوان الأخرى', async () => {
    await saveColors({ hideNeutrals: false })
    const s = await getSettings()
    expect(s.colors.hideNeutrals).toBe(false)
    expect(s.colors.defaultFormat).toBe('hex')
  })
})

describe('saveShortcut — الوحدة 20.2', () => {
  it('تكتب حرف أداة واحدة وتقرؤه', async () => {
    await saveShortcut('inspect', 'KeyJ')
    const s = await getSettings()
    expect(s.shortcuts.toolKeys.inspect).toBe('KeyJ')
  })

  it('لا تمحو تخصيصًا سابقًا لأداة أخرى — الحارس السالب لعطل رصدته مراجعة Gate B للوحدة 20.2', async () => {
    /*
     * نفس علّة `saveAppearance` بالضبط (الحاشية أعلاه)، رصدتها مراجعة Gate B
     * هنا: المحاولة الأولى (`saveShortcuts` بخريطة كاملة يدمجها المكوّن من
     * `props` قبل النداء) كانت تفقد تعديلًا سابقًا لأن لقطة `props` ليست
     * حيّة. الإصلاح هنا مطابق لإصلاح `saveAppearance`: القراءة الطازجة تقع
     * **داخل** `saveShortcut` نفسها (عبر `getSettings()`) وقت الكتابة الفعلية.
     */
    await saveShortcut('measure', 'KeyN')
    await saveShortcut('inspect', 'KeyH')
    const s = await getSettings()
    expect(s.shortcuts.toolKeys.inspect).toBe('KeyH')
    expect(s.shortcuts.toolKeys.measure).toBe('KeyN')
  })

  it('ثلاث كتابات متتالية (كلٌّ مُنتظَر) تحفظ الثلاث معًا', async () => {
    await saveShortcut('inspect', 'KeyJ')
    await saveShortcut('measure', 'KeyN')
    await saveShortcut('colour', 'KeyL')
    const s = await getSettings()
    expect(s.shortcuts.toolKeys).toEqual({
      inspect: 'KeyJ',
      measure: 'KeyN',
      colour: 'KeyL',
      compare: 'KeyD',
    })
  })
})
