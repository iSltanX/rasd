import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isTopFrame, probeAccess, surveyFrames } from '@/content/frames'
import { isMounted, mountHost, unmountHost } from '@/content/host'
import { createModeManager } from '@/content/mode-manager'
import { startPersistence } from '@/content/persistence'
import { BINDINGS, deepActiveElement, installShortcuts, isTypingTarget } from '@/content/shortcuts'
import { startSync } from '@/content/sync'
import { MODES } from '@/shared/modes'

/**
 * طبقة المحتوى — ما يمكن إثباته بلا متصفّح.
 *
 * happy-dom بلا محرّك تخطيط وبلا `showPopover`، فما يُثبَت هنا هو **المنطق**:
 * آلة الأوضاع، ومطابقة المفاتيح، وانضباط حلقة الإطار، وبقاء الإلحاق،
 * ونظافة التفكيك. العزل الفعلي والطبقة العليا وأثر التمرير كلّها تحتاج
 * Chrome حقيقيًا وتُقاس في جولة Playwright.
 */

describe('مدير الأوضاع', () => {
  it('يبدأ خاملًا', () => {
    expect(createModeManager().mode.value).toBe('idle')
  })

  it('وضع واحد نشط: الانتقال يستبدل لا يراكم', () => {
    const m = createModeManager()
    m.set('area')
    m.set('inspect')
    expect(m.mode.value).toBe('inspect')
  })

  it('يرفض وضعًا غير معروف', () => {
    const m = createModeManager()
    const r = m.set('nope' as never)
    expect(r.ok).toBe(false)
  })

  it('Esc يعود إلى idle من كل وضع', () => {
    for (const mode of MODES) {
      const m = createModeManager()
      m.set(mode)
      expect(m.escape()).toBe('idle')
      expect(m.mode.value).toBe('idle')
    }
  })

  it('الانشغال يمنع الانتقال ولا يمنع الإلغاء', () => {
    const m = createModeManager()
    m.set('area')
    m.busy.value = true

    const blocked = m.set('inspect')
    expect(blocked.ok).toBe(false)
    expect(m.mode.value).toBe('area')

    // الإلغاء الصريح يتجاوز الانشغال — وإلا عَلِق المستخدم.
    expect(m.escape()).toBe('idle')
    expect(m.busy.value).toBe(false)
  })

  it('خطّافات المغادرة ثم الدخول، بالترتيب', () => {
    const order: string[] = []
    const m = createModeManager()
    m.on('area', { onEnter: () => order.push('enter:area'), onExit: () => order.push('exit:area') })
    m.on('inspect', { onEnter: () => order.push('enter:inspect') })
    m.set('area')
    m.set('inspect')
    expect(order).toEqual(['enter:area', 'exit:area', 'enter:inspect'])
  })

  it('خطّاف يرمي لا يوقف الانتقال', () => {
    const m = createModeManager()
    m.on('area', {
      onEnter: () => {
        throw new Error('عطل أداة')
      },
    })
    expect(() => m.set('area')).not.toThrow()
    expect(m.mode.value).toBe('area')
  })

  it('الانتقال إلى الوضع نفسه لا يبثّ شيئًا', () => {
    const seen: string[] = []
    const m = createModeManager()
    m.subscribe((next) => seen.push(next))
    m.set('area')
    m.set('area')
    expect(seen).toEqual(['area'])
  })

  it('إلغاء الاشتراك يعمل', () => {
    const seen: string[] = []
    const m = createModeManager()
    const off = m.subscribe((next) => seen.push(next))
    m.set('area')
    off()
    m.set('inspect')
    expect(seen).toEqual(['area'])
  })
})

describe('الاختصارات', () => {
  let cleanup: (() => void) | null = null
  afterEach(() => {
    cleanup?.()
    cleanup = null
    document.body.innerHTML = ''
  })

  const press = (init: Partial<KeyboardEventInit> & { code: string }) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

  it('يطابق على `code` لا على `key` — يعمل مع لوحة عربية', () => {
    const actions: string[] = []
    cleanup = installShortcuts({ onAction: (a) => actions.push(JSON.stringify(a)) })
    // لوحة عربية: مفتاح I يعطي `key` عربيًا، و`code` يبقى KeyI.
    press({ code: 'KeyI', key: 'ي', altKey: true, shiftKey: true })
    expect(actions).toContain(JSON.stringify({ kind: 'mode', mode: 'inspect' }))
  })

  it('macOS: ⌥⇧I يعطي key غريبًا ويظلّ يعمل', () => {
    const actions: string[] = []
    cleanup = installShortcuts({ onAction: (a) => actions.push(JSON.stringify(a)) })
    press({ code: 'KeyI', key: 'ˆ', altKey: true, shiftKey: true })
    expect(actions).toContain(JSON.stringify({ kind: 'mode', mode: 'inspect' }))
  })

  it('المُعدِّل الناقص لا يطابق', () => {
    const actions: unknown[] = []
    cleanup = installShortcuts({ onAction: (a) => actions.push(a) })
    press({ code: 'KeyI', altKey: true })
    expect(actions).toHaveLength(0)
  })

  it('لا يلتقط شيئًا والتركيز في حقل إدخال', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const actions: unknown[] = []
    cleanup = installShortcuts({ onAction: (a) => actions.push(a) })
    press({ code: 'KeyI', altKey: true, shiftKey: true })
    expect(actions).toHaveLength(0)
  })

  it('حقل داخل جذر ظلّ مفتوح يُكتشف أيضًا', () => {
    const hostEl = document.createElement('div')
    document.body.appendChild(hostEl)
    const root = hostEl.attachShadow({ mode: 'open' })
    const input = document.createElement('input')
    root.appendChild(input)
    input.focus()
    // `document.activeElement` يتوقّف عند المضيف — الحارس يجب أن يغوص.
    expect(document.activeElement).toBe(hostEl)
    expect(isTypingTarget(deepActiveElement())).toBe(true)
  })

  it('checkbox ليس موضع كتابة', () => {
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    expect(isTypingTarget(cb)).toBe(false)
  })

  it('contenteditable موضع كتابة', () => {
    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    document.body.appendChild(div)
    expect(isTypingTarget(div)).toBe(true)
  })

  it('Esc يُبتلع فقط حين يُطلب ذلك', () => {
    cleanup = installShortcuts({ onAction: () => undefined, shouldSwallowEscape: () => false })
    const e = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    cleanup()

    cleanup = installShortcuts({ onAction: () => undefined, shouldSwallowEscape: () => true })
    const e2 = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true })
    window.dispatchEvent(e2)
    expect(e2.defaultPrevented).toBe(true)
  })

  it('اختصارات الأوضاع تُبتلع حتى لا تراها الصفحة', () => {
    cleanup = installShortcuts({ onAction: () => undefined })
    const e = new KeyboardEvent('keydown', {
      code: 'KeyM',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('⇧ يُبثّ ضغطًا ورفعًا ولا يُبتلع', () => {
    const actions: string[] = []
    cleanup = installShortcuts({ onAction: (a) => actions.push(JSON.stringify(a)) })
    const down = new KeyboardEvent('keydown', { key: 'Shift', bubbles: true, cancelable: true })
    window.dispatchEvent(down)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', bubbles: true }))
    expect(actions).toEqual([
      JSON.stringify({ kind: 'constrain', held: true }),
      JSON.stringify({ kind: 'constrain', held: false }),
    ])
    expect(down.defaultPrevented).toBe(false)
  })

  it('فكّ التركيب يزيل المستمعات', () => {
    const actions: unknown[] = []
    const off = installShortcuts({ onAction: (a) => actions.push(a) })
    off()
    press({ code: 'KeyI', altKey: true, shiftKey: true })
    expect(actions).toHaveLength(0)
  })

  it('كل ارتباط يحمل أمرًا معروفًا', () => {
    for (const b of BINDINGS) expect(b.code.length).toBeGreaterThan(0)
  })
})

describe('حلقة المزامنة', () => {
  it('لا تدور بلا سبب — لا إطار مجدوَل عند البداية', () => {
    const loop = startSync({ onFrame: () => undefined })
    expect(loop.pending).toBe(false)
    loop.stop()
  })

  it('عشرة إبطالات في إطار واحد ترسم مرّة', async () => {
    let frames = 0
    const loop = startSync({ onFrame: () => frames++ })
    for (let i = 0; i < 10; i++) loop.invalidate('scroll')
    expect(loop.pending).toBe(true)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => setTimeout(r, 0))
    expect(frames).toBe(1)
    loop.stop()
  })

  it('تجمع الأسباب وتسلّمها مرّة واحدة', async () => {
    let seen: string[] = []
    const loop = startSync({ onFrame: (reasons) => (seen = [...reasons].sort()) })
    loop.invalidate('scroll')
    loop.invalidate('resize')
    loop.invalidate('scroll')
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toEqual(['resize', 'scroll'])
    loop.stop()
  })

  it('بعد الإيقاف لا يُجدوَل شيء', async () => {
    let frames = 0
    const loop = startSync({ onFrame: () => frames++ })
    loop.stop()
    loop.invalidate('manual')
    expect(loop.pending).toBe(false)
    await new Promise((r) => setTimeout(r, 20))
    expect(frames).toBe(0)
  })

  it('حدث تمرير يُبطل', async () => {
    let frames = 0
    const loop = startSync({ onFrame: () => frames++ })
    window.dispatchEvent(new Event('scroll'))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await new Promise((r) => setTimeout(r, 0))
    expect(frames).toBe(1)
    loop.stop()
  })
})

describe('البقاء', () => {
  let hostEl: HTMLElement | null = null

  beforeEach(() => {
    hostEl = document.createElement('div')
    document.documentElement.appendChild(hostEl)
  })

  afterEach(() => {
    hostEl?.remove()
    hostEl = null
  })

  it('يعيد الإلحاق حين تحذف الصفحة المضيف', async () => {
    let reattached = 0
    const p = startPersistence({
      isAttached: () => Boolean(hostEl?.isConnected),
      reattach: () => {
        reattached++
        document.documentElement.appendChild(hostEl!)
      },
      onRouteChange: () => undefined,
    })

    hostEl!.remove()
    await new Promise((r) => setTimeout(r, 0))
    expect(reattached).toBeGreaterThan(0)
    expect(hostEl!.isConnected).toBe(true)
    p.stop()
  })

  it('يتراجع بعد محاولات، ولا يعلق في حلقة لا تنتهي', async () => {
    let attempts = 0
    let gaveUp = 0
    const p = startPersistence({
      maxAttempts: 3,
      // صفحة عنيدة: الإلحاق لا ينجح أبدًا.
      isAttached: () => false,
      reattach: () => {
        attempts++
        // طفرة في كل محاولة — تحاكي عيّنة `mutating/`.
        const junk = document.createElement('div')
        document.documentElement.appendChild(junk)
        junk.remove()
      },
      onRouteChange: () => undefined,
      onGiveUp: () => gaveUp++,
    })

    document.documentElement.appendChild(document.createElement('div')).remove()
    await new Promise((r) => setTimeout(r, 50))

    expect(gaveUp).toBe(1)
    expect(attempts).toBeLessThanOrEqual(3)
    expect(p.surrendered).toBe(true)
    p.stop()
  })

  it('`resume()` يعيد ربط المراقب فعليًا لا يصفّر عدّادًا فقط', async () => {
    let reattached = 0
    const p = startPersistence({
      maxAttempts: 1,
      // صفحة عنيدة: لا ينجح الإلحاق أبدًا.
      isAttached: () => false,
      reattach: () => {
        reattached++
        // إلحاق حقيقي يُحدث طفرة، فيعيد إطلاق المراقب — وهذه هي الحلقة
        // التي يوجد `maxAttempts` لكسرها.
        const node = document.createElement('div')
        document.documentElement.appendChild(node)
        node.remove()
      },
      onRouteChange: () => undefined,
    })

    document.documentElement.appendChild(document.createElement('div')).remove()
    await new Promise((r) => setTimeout(r, 30))
    expect(p.surrendered).toBe(true)

    const before = reattached
    p.resume()
    document.documentElement.appendChild(document.createElement('div')).remove()
    await new Promise((r) => setTimeout(r, 30))
    // لو بقي المراقب مفصولًا بعد الاستئناف لما زاد العدّاد إطلاقًا.
    expect(reattached).toBeGreaterThan(before)
    p.stop()
  })

  /*
   * الاختبارات التالية تقارن **مراجع** `history.pushState` قبل التغليف وبعده
   * وبعد الاستعادة — وهو عين الغرض. الربط هنا يغيّر المرجع فيُبطل ما نقيسه.
   */
  /* eslint-disable @typescript-eslint/unbound-method */
  it('`pushState` يبلّغ عن تغيّر المسار — المصدر الوحيد لهذه الإشارة', () => {
    const routes: string[] = []
    const p = startPersistence({
      isAttached: () => true,
      reattach: () => undefined,
      onRouteChange: (url) => routes.push(url),
    })
    history.pushState({}, '', '/tasks')
    expect(routes).toHaveLength(1)
    p.stop()
  })

  it('`replaceState` يبلّغ أيضًا', () => {
    const routes: string[] = []
    const p = startPersistence({
      isAttached: () => true,
      reattach: () => undefined,
      onRouteChange: (url) => routes.push(url),
    })
    history.replaceState({}, '', '/other')
    expect(routes).toHaveLength(1)
    p.stop()
  })

  it('التغليف يحفظ القيمة المرجَعة و`this`', () => {
    const original = history.pushState
    const p = startPersistence({
      isAttached: () => true,
      reattach: () => undefined,
      onRouteChange: () => undefined,
    })
    expect(history.pushState).not.toBe(original)
    expect(() => history.pushState({}, '', '/x')).not.toThrow()
    p.stop()
    // الاستعادة تعيد الأصلية بالضبط.
    expect(history.pushState).toBe(original)
  })

  it('لا يمحو تغليف الصفحة إن غلّفت بعدنا', () => {
    const p = startPersistence({
      isAttached: () => true,
      reattach: () => undefined,
      onRouteChange: () => undefined,
    })
    const ours = history.pushState
    // الصفحة تغلّف فوقنا بعد أن ركّبنا.
    const pageWrapped = function (this: History, ...args: Parameters<History['pushState']>) {
      return ours.apply(this, args)
    }
    history.pushState = pageWrapped
    p.stop()
    // تفكيكنا يجب أن يترك تغليف الصفحة قائمًا لا أن يدهسه.
    expect(history.pushState).toBe(pageWrapped)
    history.pushState = ours
  })
  /* eslint-enable @typescript-eslint/unbound-method */
})

describe('الإطارات', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('الإطار الأعلى يُتعرَّف عليه', () => {
    expect(isTopFrame(window)).toBe(true)
  })

  it('نافذة ترمي عند قراءة `top` تُعدّ غير عليا — الأأمن', () => {
    const hostile = {
      get top() {
        throw new Error('cross-origin')
      },
    } as unknown as Window
    expect(isTopFrame(hostile)).toBe(false)
  })

  it('المسح يتجاهل الإطارات بلا مساحة', () => {
    document.body.innerHTML = '<iframe src="about:blank"></iframe>'
    // happy-dom بلا تخطيط: كل المستطيلات صفرية، فلا يُرصد شيء.
    expect(surveyFrames()).toHaveLength(0)
  })

  it('`probeAccess` لا يرمي على إطار غير محمَّل', () => {
    const el = document.createElement('iframe')
    document.body.appendChild(el)
    expect(() => probeAccess(el)).not.toThrow()
  })
})

describe('المضيف — التركيب والتفكيك', () => {
  afterEach(() => {
    unmountHost()
    vi.restoreAllMocks()
  })

  it('setInteractive يفتح المضيف **والطبقة** معًا', async () => {
    const r = await mountHost()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const { hostEl, layer } = r.value

    // المضيف وحده لا يكفي: المستمعات على الطبقة داخل جذر الظلّ، وحدثٌ
    // يستقرّ على المضيف لا ينزل إلى شجرة ظلّه فلا يصلها أبدًا. قيس في
    // Chrome: بـ`pointer-events:none` على الطبقة يُطلَق مستمع المضيف وحده.
    r.value.setInteractive(true)
    expect(hostEl.style.pointerEvents).toBe('auto')
    expect(layer.getAttribute('data-rasd-interactive')).toBe('true')

    r.value.setInteractive(false)
    expect(hostEl.style.pointerEvents).toBe('none')
    expect(layer.hasAttribute('data-rasd-interactive')).toBe(false)
  })

  it('يركّب جذر ظلّ مغلق ولا يترك اسمًا يمكن استهدافه', async () => {
    const r = await mountHost()
    expect(r.ok).toBe(true)
    if (!r.ok) return

    // مغلق: لا وصول من الصفحة.
    expect(r.value.hostEl.shadowRoot).toBeNull()
    // لا اسم يطابق `[id*="rasd"]` أو `rasd-overlay` كما تستهدف العيّنة العدائية.
    expect(r.value.hostEl.id).toBe('')
    expect(r.value.hostEl.className).toBe('')
    expect(r.value.hostEl.tagName.toLowerCase()).not.toContain('rasd')
  })

  it('يُلحق بـ`documentElement` لا بـ`body`', async () => {
    const r = await mountHost()
    if (!r.ok) return
    expect(r.value.hostEl.parentElement).toBe(document.documentElement)
  })

  it('الأنماط الحرجة سطرية وبـ`!important`', async () => {
    const r = await mountHost()
    if (!r.ok) return
    const style = r.value.hostEl.style
    expect(style.getPropertyPriority('position')).toBe('important')
    expect(style.getPropertyValue('position')).toBe('fixed')
    expect(style.getPropertyPriority('z-index')).toBe('important')
    // الاتجاه مذكور صراحةً: `all: initial` لا يعيد ضبطه.
    expect(style.getPropertyValue('direction')).toBe('ltr')
  })

  it('الحقن المتكرِّر لا يُنشئ مضيفًا ثانيًا', async () => {
    const a = await mountHost()
    const b = await mountHost()
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.value.hostEl).toBe(a.value.hostEl)
    expect(document.documentElement.querySelectorAll('*').length).toBeGreaterThan(0)
  })

  it('`isMounted` يعكس الحالة', async () => {
    expect(isMounted()).toBe(false)
    await mountHost()
    expect(isMounted()).toBe(true)
    unmountHost()
    expect(isMounted()).toBe(false)
  })

  it('التفكيك يزيل المضيف ولا يترك أثرًا في الشجرة', async () => {
    const before = document.documentElement.children.length
    const r = await mountHost()
    if (!r.ok) return
    expect(document.documentElement.children.length).toBe(before + 1)
    r.value.teardown()
    expect(document.documentElement.children.length).toBe(before)
    expect(isMounted()).toBe(false)
  })

  it('التفكيك مرّتين آمن', async () => {
    const r = await mountHost()
    if (!r.ok) return
    r.value.teardown()
    expect(() => r.value.teardown()).not.toThrow()
  })

  it('`reassert` يعيد الإلحاق بعد حذف الصفحة له', async () => {
    const r = await mountHost()
    if (!r.ok) return
    r.value.hostEl.remove()
    expect(r.value.hostEl.isConnected).toBe(false)
    r.value.reassert()
    expect(r.value.hostEl.isConnected).toBe(true)
  })

  it('بلا `showPopover` يبقى على الطبقة الدنيا بلا رمي', async () => {
    // happy-dom يعلن `popover` في النموذج الأوّلي بلا الدالّة — وهذا بالضبط
    // سبب فحص `typeof el.showPopover === 'function'` لا `'popover' in …`.
    const r = await mountHost()
    if (!r.ok) return
    expect(r.value.level).toBe('fixed')
  })
})
