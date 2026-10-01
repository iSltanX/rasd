import { fakeBrowser } from '@webext-core/fake-browser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { replaceListener } from '@/shared/listener-slot'

import type * as Messaging from '@/shared/messaging'

/**
 * مستمعو واجهات الإضافة عبر إعادة تنفيذ `content.js` (`STAGES/21`، ADR 0048).
 *
 * `chrome.scripting.executeScript({ files })` يعيد تنفيذ الحزمة في العالم المعزول نفسه عند كل تفعيل، فتُبنى الوحدات
 * من جديد وتعود علامات «سجّلتُ مستمعًا» إلى `false`. **`vi.resetModules()` هو إعادة التنفيذ هذه** — والسالب الذي
 * يسقط قبل الإصلاح: مستمعٌ زائد لكل «تنفيذ» على `chrome.runtime.onMessage` و`chrome.storage.onChanged`، قِيس حيًّا
 * بخمسين دورة (2 ← 52).
 */

type Fn = (...args: never[]) => unknown

/** مجموعة المستمعين الأحياء على حدثٍ، بعدّ `addListener − removeListener` كما يعدّها الحارس الحيّ. */
function track(event: { addListener: Fn; removeListener: Fn }) {
  const live = new Set<unknown>()
  const add = event.addListener.bind(event)
  const remove = event.removeListener.bind(event)
  vi.spyOn(event, 'addListener').mockImplementation((fn: never) => {
    live.add(fn)
    return add(fn)
  })
  vi.spyOn(event, 'removeListener').mockImplementation((fn: never) => {
    live.delete(fn)
    return remove(fn)
  })
  return live
}

beforeEach(() => {
  fakeBrowser.reset()
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('replaceListener', () => {
  it('المفتاح الواحد مقعدٌ واحد: الجديد يحلّ محلّ السابق', () => {
    const live = track(fakeBrowser.storage.onChanged)
    const a = vi.fn()
    const b = vi.fn()
    replaceListener('test.key', fakeBrowser.storage.onChanged, a)
    replaceListener('test.key', fakeBrowser.storage.onChanged, b)
    expect(live.size).toBe(1)
    expect(live.has(b)).toBe(true)
  })

  it('مفتاحان مختلفان لا يزيح أحدهما الآخر', () => {
    const live = track(fakeBrowser.storage.onChanged)
    replaceListener('test.one', fakeBrowser.storage.onChanged, vi.fn())
    replaceListener('test.two', fakeBrowser.storage.onChanged, vi.fn())
    expect(live.size).toBe(2)
  })

  it('سياقان يتشاركان globalThis بحدثين مختلفين لا يزيح أحدهما الآخر (حزام التكامل)', () => {
    const background = { addListener: vi.fn(), removeListener: vi.fn() }
    const content = { addListener: vi.fn(), removeListener: vi.fn() }
    const fromBackground = vi.fn()
    replaceListener('runtime.onMessage', background, fromBackground)
    replaceListener('runtime.onMessage', content, vi.fn())
    expect(background.removeListener).not.toHaveBeenCalled()
    expect(content.removeListener).not.toHaveBeenCalled()
    // والنسخة الجديدة على الحدث نفسه تزيح القديمة فيه وحده.
    replaceListener('runtime.onMessage', background, vi.fn())
    expect(background.removeListener).toHaveBeenCalledWith(fromBackground)
    expect(content.removeListener).not.toHaveBeenCalled()
  })

  it('إزالةٌ ترمي لا تمنع تسجيل الجديد', () => {
    const throwing = {
      addListener: vi.fn(),
      removeListener: vi.fn(() => {
        throw new Error('مات السياق')
      }),
    }
    replaceListener('test.dead', throwing, vi.fn())
    const fresh = { addListener: vi.fn(), removeListener: vi.fn() }
    expect(() => replaceListener('test.dead', fresh, vi.fn())).not.toThrow()
    expect(fresh.addListener).toHaveBeenCalledTimes(1)
  })
})

describe('إعادة تنفيذ الحزمة لا تُراكم مستمعين', () => {
  it('رسائل الـRPC: مستمعٌ واحد بعد عشرة تنفيذات، والمعالج للنسخة الأحدث', async () => {
    const live = track(fakeBrowser.runtime.onMessage)
    let last: typeof Messaging | null = null
    for (let i = 0; i < 10; i++) {
      vi.resetModules()
      last = await import('@/shared/messaging')
      const unregister = last.onMessage('diagnostics/ping', () => ({
        version: `run-${i}`,
        uptimeMs: 1,
        openPorts: 0,
        incognito: false,
      }))
      // التفعيل ثم التعطيل: كل دورة تُفكَّك قبل التي تليها، كما في `teardown()` الجلسة.
      if (i < 9) unregister()
    }
    expect(live.size).toBe(1)

    const reply = await last!.send('diagnostics/ping', undefined)
    expect(reply.ok && reply.value.version).toBe('run-9')
  })

  it('الإعدادات: مستمعٌ واحد، والنسخة الأحدث ترى التغيّر', async () => {
    const live = track(fakeBrowser.storage.onChanged)
    let seen: string | null = null
    for (let i = 0; i < 10; i++) {
      vi.resetModules()
      const settings = await import('@/shared/settings')
      const stop = settings.watchSettings((s) => {
        if (i === 9) seen = s.shortcuts.toolKeys.inspect ?? null
      })
      if (i < 9) stop()
    }
    expect(live.size).toBe(1)

    await fakeBrowser.storage.local.set({
      'rasd:settings': { shortcuts: { toolKeys: { inspect: 'KeyJ' } } },
    })
    await vi.waitFor(() => expect(seen).toBe('KeyJ'))
  })

  it('حالة القفل: مستمعٌ واحد بعد عشرة تنفيذات', async () => {
    const live = track(fakeBrowser.storage.onChanged)
    for (let i = 0; i < 10; i++) {
      vi.resetModules()
      const lock = await import('@/shared/storage/lock-state')
      await lock.lockMode()
    }
    expect(live.size).toBe(1)
  })

  it('الثلاثة معًا: ثلاثة مستمعين في عالمٍ لا ثلاثين', async () => {
    const onChanged = track(fakeBrowser.storage.onChanged)
    const onMessage = track(fakeBrowser.runtime.onMessage)
    for (let i = 0; i < 10; i++) {
      vi.resetModules()
      const messaging = await import('@/shared/messaging')
      const settings = await import('@/shared/settings')
      const lock = await import('@/shared/storage/lock-state')
      messaging.onMessage('diagnostics/ping', () => ({
        version: 'x',
        uptimeMs: 1,
        openPorts: 0,
        incognito: false,
      }))
      settings.watchSettings(() => undefined)
      await lock.lockMode()
    }
    expect(onMessage.size).toBe(1)
    expect(onChanged.size).toBe(2)
  })
})
