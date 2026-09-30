import { describe, expect, it, vi } from 'vitest'

import {
  captureFailed,
  captureNotCopied,
  captureSaved,
  createNoticeCenter,
  exitNotice,
  fileSaved,
  NOTICE_MS,
  paletteSaved,
  toolKeyLabel,
  valueCopied,
} from '@/content/notices'
import { buildBindings } from '@/content/shortcuts'
import { stripIsolates } from '@/shared/bidi'

/**
 * إشعارات الأدوات فوق الصفحة — كان النجاح بلا أثر والفشل في `console` وحده. النصوص دوالّ محضة،
 * والمركز إشعارٌ واحد يحلّ الجديد فيه محلّ القديم.
 */

function fakeClock() {
  const timers = new Map<number, () => void>()
  let next = 1
  return {
    setTimeout: vi.fn((run: () => void, _ms: number) => {
      const id = next++
      timers.set(id, run)
      return id
    }),
    clearTimeout: vi.fn((id: unknown) => timers.delete(id as number)),
    fire: () => {
      for (const [id, run] of [...timers]) {
        timers.delete(id)
        run()
      }
    },
    pending: () => timers.size,
  }
}

describe('createNoticeCenter', () => {
  it('يُظهر الإشعار ثمّ يُخفيه بعد مهلة درجته', () => {
    const clock = fakeClock()
    const center = createNoticeCenter(clock)
    center.show(captureFailed('انتهت المهلة'))
    expect(center.current.value?.title).toBe('تعذّر الالتقاط')
    expect(clock.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), NOTICE_MS.danger)
    clock.fire()
    expect(center.current.value).toBeNull()
  })

  it('الجديد يحلّ محلّ القديم ويلغي مهلته — لا يُخفيه مؤقّت سابقه', () => {
    const clock = fakeClock()
    const center = createNoticeCenter(clock)
    center.show(captureFailed('أ'))
    center.show(valueCopied('اللون', '#3B82F6'))
    expect(clock.clearTimeout).toHaveBeenCalledTimes(1)
    expect(clock.pending()).toBe(1)
    expect(center.current.value?.title).toBe('نُسخ اللون')
  })

  it('الإغلاق يُخفي فورًا ويلغي المهلة', () => {
    const clock = fakeClock()
    const center = createNoticeCenter(clock)
    center.show(fileSaved('rasd-inspect.css'))
    center.dismiss()
    expect(center.current.value).toBeNull()
    expect(clock.pending()).toBe(0)
  })
})

describe('نصوص الإشعارات', () => {
  it('الالتقاط: «حُفظت اللقطة» أو «حُفظ العنصر»، والمقاس غربيّ معزول، و«افتح» تفتحها', () => {
    const open = vi.fn()
    const area = captureSaved('area', 656, 369, open)
    expect(area.title).toBe('حُفظت اللقطة')
    expect(area.detail).toBe('في المكتبة، بمقاس ⁦656 × 369⁩')
    expect(captureSaved('viewport', 1, 1, open).title).toBe('حُفظت اللقطة')
    expect(captureSaved('element', 720, 232, open).title).toBe('حُفظ العنصر')
    area.action?.run()
    expect(open).toHaveBeenCalledOnce()
    expect(area.action?.label).toBe('افتح')
  })

  it('الفشل خطرٌ بسببه — لا يُبتلع', () => {
    expect(captureFailed('الصفحة مقيّدة')).toEqual({
      tone: 'danger',
      title: 'تعذّر الالتقاط',
      detail: 'الصفحة مقيّدة',
    })
    expect(captureNotCopied('اللقطة محفوظة في المكتبة.').title).toBe('لم تُنسخ اللقطة')
  })

  it('اللوحة المحفوظة بعدّها العربي: «٨ ألوان» · «لونان» · «١٢ لونًا»', () => {
    const open = vi.fn()
    expect(paletteSaved(8, open).detail).toBe('٨ ألوان في المكتبة')
    expect(paletteSaved(2, open).detail).toBe('لونان في المكتبة')
    expect(paletteSaved(12, open).detail).toBe('١٢ لونًا في المكتبة')
  })

  it('القيمة المنسوخة معزولة كي لا يقلبها السطر العربي', () => {
    const n = valueCopied('المحدِّد', '.cta-btn > span')
    expect(n.detail).toBe('⁦.cta-btn > span⁩ في الحافظة')
  })
})

describe('إشعار الخروج بـEsc', () => {
  it('المفتاح من الربط الحيّ — من غيّر حرف الفحص يرى حرفه', () => {
    expect(toolKeyLabel(buildBindings(), 'inspect')).toBe('⌥⇧I')
    const custom = buildBindings({ inspect: 'KeyJ' })
    expect(toolKeyLabel(custom, 'inspect')).toBe('⌥⇧J')
    expect(stripIsolates(exitNotice('inspect', custom)?.detail ?? '')).toBe('اضغط ⌥⇧J لتعود.')
  })

  it('لكل أداة عنوانها كما في إطارها، والالتقاط يقول إن شيئًا لم يُحفظ', () => {
    const b = buildBindings()
    expect(exitNotice('inspect', b)?.title).toBe('خرجت من الفحص')
    expect(exitNotice('colour', b)?.title).toBe('أُغلقت القطّارة')
    expect(exitNotice('measure', b)?.title).toBe('خرجت من القياس')
    expect(exitNotice('area', b)).toEqual({
      tone: 'info',
      title: 'أُلغي الالتقاط',
      detail: 'لم تُحفظ لقطة.',
    })
    expect(exitNotice('element', b)?.title).toBe('أُلغي الالتقاط')
  })

  it('المقارنة والخمول بلا إشعار — لا إطار لهما', () => {
    expect(exitNotice('compare', buildBindings())).toBeNull()
    expect(exitNotice('idle', buildBindings())).toBeNull()
  })
})
