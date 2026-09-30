import { describe, expect, it, vi } from 'vitest'

import { createZoneSaver } from '@/content/zone-saver'
import { deviceRect } from '@/shared/geometry'
import { errText, ok } from '@/shared/result'

import type { ExclusionZone } from '@/shared/exclusion-schema'

/**
 * حفظ المناطق — قواعد المراجعة المستقلّة الثلاث (`STAGES/34`): مقاس المرجع المعروض، والتسلسل، والرجوع إلى آخر
 * قائمةٍ مؤكَّدة.
 */

const zone = (id: string): ExclusionZone => ({
  id,
  label: null,
  createdAt: 1,
  anchor: { kind: 'rect', rect: deviceRect(0, 0, 10, 10) },
})

/** إرسالٌ يُحَلّ يدويًّا — ترتيب الردود بيد الاختبار لا بيد المؤقّتات. */
function manualSend() {
  const calls: {
    viewport: string
    zones: readonly ExclusionZone[]
    resolve: (ok: boolean) => void
  }[] = []
  const send = vi.fn(
    (viewport: string, zones: readonly ExclusionZone[]) =>
      new Promise<
        ReturnType<typeof ok<{ exclusions: readonly ExclusionZone[] }>> | ReturnType<typeof errText>
      >((resolve) => {
        calls.push({
          viewport,
          zones,
          resolve: (success) =>
            resolve(
              success
                ? ok({ exclusions: zones })
                : errText('not-found', 'لا مرجع محفوظًا لهذا المقاس.'),
            ),
        })
      }),
  )
  return { send, calls }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createZoneSaver', () => {
  it('يكتب إلى مقاس المرجع المعروض ولو تغيّر عرض النافذة بعد تحميله', async () => {
    const { send, calls } = manualSend()
    const saver = createZoneSaver({ send, apply: vi.fn(), failed: vi.fn() })
    saver.reset('desktop', [])
    // النافذة صارت «جهازًا لوحيًّا» الآن — لا شأن للحفظ بها: المرجع المعروض مرجع سطح المكتب.
    saver.save([zone('a')])
    await flush()
    expect(calls[0]?.viewport).toBe('desktop')
  })

  it('الحفظ متسلسل: الثاني لا يُرسَل قبل أن يُردّ على الأوّل، فآخر ما أُرسل آخر ما يُكتب', async () => {
    const { send, calls } = manualSend()
    const apply = vi.fn()
    const saver = createZoneSaver({ send, apply, failed: vi.fn() })
    saver.reset('desktop', [])
    saver.save([zone('a')])
    saver.save([zone('a'), zone('b')])
    await flush()
    expect(calls).toHaveLength(1)
    calls[0]?.resolve(true)
    await flush()
    expect(calls).toHaveLength(2)
    // الأوّل أُكِّد، لكن حفظًا أحدث في الطابور: لا يسبقه إلى الشاشة.
    expect(apply).not.toHaveBeenCalled()
    calls[1]?.resolve(true)
    await saver.idle()
    expect(apply).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenLastCalledWith([zone('a'), zone('b')])
  })

  it('فشل حفظين متتاليين يعيد آخر قائمةٍ أكّدتها الخلفية — لا القائمة المتفائلة قبل الأخير', async () => {
    const { send, calls } = manualSend()
    const apply = vi.fn()
    const failed = vi.fn()
    const saver = createZoneSaver({ send, apply, failed })
    saver.reset('desktop', [zone('stored')])
    saver.save([zone('stored'), zone('x')])
    saver.save([zone('stored'), zone('x'), zone('y')])
    await flush()
    calls[0]?.resolve(false)
    await flush()
    calls[1]?.resolve(false)
    await saver.idle()
    expect(failed).toHaveBeenCalledTimes(2)
    expect(apply).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenLastCalledWith([zone('stored')])
  })

  it('مرجعٌ جديد يُسقط ما كان معلَّقًا للسابق: لا يُرسَل، ولا يُعرض ردّه', async () => {
    const { send, calls } = manualSend()
    const apply = vi.fn()
    const saver = createZoneSaver({ send, apply, failed: vi.fn() })
    saver.reset('desktop', [])
    saver.save([zone('a')])
    saver.save([zone('a'), zone('b')])
    await flush()
    saver.reset('phone', [zone('p')])
    calls[0]?.resolve(true)
    await saver.idle()
    // الأوّل كان قد أُرسل فكُتب في مرجعه — لكن ردّه لا يُعرض فوق مرجع الهاتف، والثاني لا يُرسَل أصلًا.
    expect(calls).toHaveLength(1)
    expect(apply).not.toHaveBeenCalled()
  })

  it('بلا مرجع معروض: لا إرسال، وإعلامٌ صريح', () => {
    const { send } = manualSend()
    const failed = vi.fn()
    const saver = createZoneSaver({ send, apply: vi.fn(), failed })
    saver.reset(null, [])
    saver.save([zone('a')])
    expect(send).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledOnce()
  })
})
