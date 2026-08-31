import { fakeBrowser } from '@webext-core/fake-browser'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { activateTool, COMMAND_TOOL } from '@/background/commands'
import { onMessage, resetHandlers } from '@/shared/messaging'

/**
 * تفعيل الأدوات — نقطة الدخول الوحيدة التي تحقن الطبقة وتُقلعها وتبدّل وضعها.
 *
 * الاختصارات الأربعة (حدّ Chrome) لا يمكن إطلاقها فعليًا من بيئة اختبار —
 * لا CDP ولا Playwright يملكان واجهة تُطلق مُسرِّع `chrome.commands` نفسه.
 * ما يُختبَر هنا هو الحلقة الكاملة بعد ذلك.
 *
 * **لماذا أُعيدت كتابة تمويه `executeScript` (2026-08-31):** كانت الاختبارات
 * تسجّل مستقبِل `mode/set` **بيدها** ثم تتحقّق من وصول الرسالة — أي أنها
 * تصنع بنفسها الشرط الذي لا يصنعه الإنتاج. وكان الحقن مموَّهًا إلى `no-op`
 * ناجح دائمًا. فحين شُحن `activateTool` بلا نداء إقلاع أصلًا — يحقن الملفّ
 * ثم يرسل إلى مستقبِلات لا وجود لها — بقيت هذه الاختبارات خضراء عشر مراحل
 * بينما كل نقطة دخول للمستخدم ميتة.
 *
 * فالعالم المُحاكى أدناه يحفظ القيد الحقيقي: **حقن الملفّ لا يسجّل
 * مستقبِلًا**، والتسجيل لا يقع إلا بنداء الإقلاع. حذفُ ذلك النداء من
 * الإنتاج يُسقط هذه الاختبارات — وهو ما تحقّقتُ منه بتعطيله مؤقّتًا.
 * والحارس الحيّ المقابل: `scripts/verify-activate.mjs` من تبويب بارد.
 */

type ScriptingApi = { executeScript: ReturnType<typeof vi.fn> }

let scripting: ScriptingApi
let tabsGet: ReturnType<typeof vi.fn>

interface ContentWorld {
  /** حُقن ملفّ الطبقة — يُصدِّر `startOverlay` ولا يستدعيه. */
  injected: boolean
  /** أُقلعت الجلسة فعلًا — عندها وحدها تُسجَّل المستقبِلات. */
  booted: number
  modes: string[]
  captures: string[]
}

/**
 * يركّب عالم صفحة مُصغَّرًا خلف `executeScript`.
 *
 * `files` ⇒ حقنٌ صامت. `func` ⇒ إقلاعٌ يسجّل المستقبِلات ويردّ نجاحه —
 * تمامًا كما يفعل `globalThis.__rasdContent.startOverlay()` في الصفحة.
 *
 * `bootSucceeds: false` يحاكي صفحةً أُقلعت فيها الطبقة وفشلت (إطار داخلي
 * مثلًا، أو مضيف تعذّر تركيبه).
 */
function installContentWorld(
  options: { bootSucceeds?: boolean; onModeSet?: () => void } = {},
): ContentWorld {
  const world: ContentWorld = { injected: false, booted: 0, modes: [], captures: [] }

  scripting.executeScript = vi.fn((opts: { files?: string[]; func?: unknown }) => {
    if (opts.files) {
      world.injected = true
      return Promise.resolve(undefined)
    }
    if (!opts.func) return Promise.resolve(undefined)

    // إقلاعٌ بلا حقن مستحيل — يحرس ترتيب الخطوتين في الإنتاج.
    if (!world.injected) return Promise.resolve([{ result: false }])
    if (options.bootSucceeds === false) return Promise.resolve([{ result: false }])

    if (world.booted === 0) {
      onMessage('mode/set', ({ mode }) => {
        options.onModeSet?.()
        world.modes.push(mode)
        return { ok: true } as const
      })
      onMessage('capture/start', ({ kind }) => {
        world.captures.push(kind)
        return { started: true }
      })
    }
    world.booted += 1
    return Promise.resolve([{ result: true }])
  })

  return world
}

beforeEach(() => {
  fakeBrowser.reset()
  resetHandlers()
  scripting = { executeScript: vi.fn().mockResolvedValue(undefined) }
  tabsGet = vi.fn()
  Object.assign(globalThis.chrome, { scripting })
  Object.assign(globalThis.chrome.tabs, {
    get: tabsGet,
    sendMessage: (_tabId: number, message: unknown) => fakeBrowser.runtime.sendMessage(message),
  })
})

describe('COMMAND_TOOL', () => {
  it('أربعة اختصارات بالضبط — حدّ Chrome الأقصى', () => {
    expect(Object.keys(COMMAND_TOOL)).toHaveLength(4)
  })

  it('كل الأدوات الأربع التقاط فوري، لا وضع طبقة تفاعلي معقَّد', () => {
    expect(new Set(Object.values(COMMAND_TOOL))).toEqual(
      new Set(['area', 'element', 'viewport', 'full-page']),
    )
  })
})

describe('activateTool', () => {
  for (const [command, tool] of Object.entries(COMMAND_TOOL)) {
    it(`${command} → يحقن الطبقة ويُقلعها ويبدّل الوضع لـ${tool}`, async () => {
      tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
      const world = installContentWorld()

      const result = await activateTool(5, tool)

      expect(scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 5 },
        files: ['content.js'],
      })
      expect(world.booted).toBe(1)
      expect(result.started).toBe(true)
    })
  }

  it('viewport و full-page لا يُرسلان mode/set — لا وضع طبقة يقابلهما بعد', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    const world = installContentWorld()

    const result = await activateTool(5, 'viewport')

    expect(result).toEqual({ started: true, mode: null })
    expect(world.modes).toEqual([])
    expect(world.captures).toEqual(['viewport'])
  })

  it('area/element يبدّلان الوضع فعليًا عبر mode/set', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    const world = installContentWorld()

    const result = await activateTool(5, 'area')

    expect(result).toEqual({ started: true, mode: 'area' })
    expect(world.modes).toEqual(['area'])
  })

  it('صفحة مقيّدة ترفض الحقن — لا محاولة executeScript', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'chrome://settings' })

    const result = await activateTool(5, 'area')

    expect(result).toEqual({ started: false, reason: 'browser-internal' })
    expect(scripting.executeScript).not.toHaveBeenCalled()
  })

  /**
   * **الاختبار الذي كان مفقودًا.**
   *
   * لا يسجّل مستقبِلًا بيده: المستقبِل لا يوجد إلا إن أقلعت الطبقة. فلو
   * حُذف نداء الإقلاع من `activateTool` لما سُجِّل شيء، ولفشل التسليم،
   * ولانقلبت النتيجة إلى `boot-failed` — وهذا بالضبط ما كان يقع في
   * الإنتاج بينما الاختبارات خضراء.
   */
  it('بلا إقلاع ناجح لا تفعيل — النتيجة `boot-failed` لا نجاحًا كاذبًا', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    const world = installContentWorld({ bootSucceeds: false })

    const result = await activateTool(5, 'area')

    expect(result).toEqual({ started: false, reason: 'boot-failed' })
    expect(world.modes).toEqual([])
  })

  it('إقلاعٌ نجح ورسالةٌ لم تصل ⇒ `no-receiver` لا `started: true`', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    // عالمٌ يُقلع ولا يسجّل شيئًا — يفصل فشل التسليم عن فشل الإقلاع.
    scripting.executeScript = vi.fn((opts: { files?: string[]; func?: unknown }) =>
      Promise.resolve(opts.func ? [{ result: true }] : undefined),
    )

    const result = await activateTool(5, 'area')

    expect(result).toEqual({ started: false, reason: 'no-receiver' })
  })

  it('فشل الرسالة الأولى يُعاد مرّة واحدة قبل الاستسلام', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    let attempts = 0
    installContentWorld({
      onModeSet: () => {
        attempts += 1
        if (attempts === 1) throw new Error('لا مستقبِل بعد')
      },
    })

    const result = await activateTool(5, 'inspect')

    expect(result).toEqual({ started: true, mode: 'inspect' })
    expect(attempts).toBe(2)
  })

  it('التفعيل مرّتين على تبويب واحد يُقلع مرّة واحدة — الإقلاع آمن التكرار', async () => {
    tabsGet.mockResolvedValue({ id: 5, url: 'https://example.com/' })
    const world = installContentWorld()

    await activateTool(5, 'area')
    await activateTool(5, 'colour')

    // نداءان للإقلاع، وجلسةٌ واحدة تُبنى — الحارس في `content/index.ts`.
    expect(world.booted).toBe(2)
    expect(world.modes).toEqual(['area', 'colour'])
  })
})
