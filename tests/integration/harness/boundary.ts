import { AsyncLocalStorage } from 'node:async_hooks'

import { fakeBrowser } from '@webext-core/fake-browser'
import { vi } from 'vitest'

/**
 * حدّ `content ↔ background` حقيقيًّا داخل عملية اختبار واحدة ([ADR 0033](../../../Docs/ADR/0033-property-tests-and-boundary-cycles.md)).
 *
 * اختبار التكامل المعتاد هنا يستورد الطرفين في رسم وحداتٍ واحد ويقلّد `sendMessage` بدالّة: فيتشارك
 * الطرفان سجلّ مستقبِلات `rpc.ts` نفسه وذاكرة الإعدادات نفسها، ويعبر الحمولةَ كائنٌ لم يُسلسَل قطّ.
 * كل ما يكسره الحدّ الحقيقي يمرّ أخضر. وهذا الملفّ يبني الحدّ بأربعة أشياء، لكلٍّ سببه:
 *
 * 1. **رسم وحداتٍ مستقلّ لكل سياق.** `vi.resetModules()` قبل استيراد كل سياق، فللخلفية نسختها
 *    من `rpc.ts` و`settings` و`db.ts`، ولسكربت المحتوى نسخته، ولصفحة الإضافة نسختها. مستقبِلٌ
 *    سُجّل في طرفٍ لا يراه الآخر إلا عبر الرسالة.
 * 2. **`chrome` لكلّ سياق.** `globalThis.chrome` وسيطٌ يسأل `AsyncLocalStorage` من يستدعيه، فيعطي
 *    كل سياق `runtime` و`tabs` خاصّين به. والسياق يتبع النداء عبر الوعود والمؤقّتات وردود
 *    IndexedDB، وهي كلّ ما يلزم ليُنسَب مستمعٌ أو إرسالٌ إلى صاحبه الحقيقي.
 * 3. **توجيه كروم لا توجيه الاختبار.** `runtime.sendMessage` يصل إلى سياقات الإضافة كلّها **عدا
 *    المرسِل** ولا يصل إلى سكربت محتوى أبدًا. `tabs.sendMessage` يصل إلى سكربتات المحتوى في ذلك
 *    التبويب وحدها. و`sender` يكتبه «المتصفّح» (التبويب والأصل والإطار) لا الحمولة.
 * 4. **السلك JSON.** كروم يسلسل رسائل الإضافة بـJSON: الـBlob يصل `{}`، و`undefined` يسقط، والدالّة
 *    تختفي. فكل رسالة وكل ردّ يمرّان بـ`JSON.stringify` ثمّ `JSON.parse`، ويُسلَّم كل مستقبِل نسخته.
 *
 * وحارسٌ خامس: **سكربت المحتوى لا يلمس IndexedDB** — كان سيفتح قاعدة الموقع المزار لا قاعدة الإضافة
 * (الصفّ 78). فأي وصول إليها من سياق محتوى يرمي.
 */

export type ContextKind = 'worker' | 'page' | 'content'

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => unknown

/** عبورٌ واحد للحدّ — ما يثبت أن الدورة مرّت من هنا لا من اختصار. */
export interface Crossing {
  readonly from: string
  readonly to: string
  readonly via: 'runtime' | 'tabs'
  readonly type: string
}

export interface BrowserContext {
  readonly name: string
  readonly kind: ContextKind
  readonly tabId: number | null
  readonly url: string
  /** يشغّل `fn` داخل هذا السياق: كل `chrome.*` وكل مستمع يُسجَّل فيه يُنسَب إليه. */
  run<T>(fn: () => T): T
  /** الوحدات التي حُمّلت لهذا السياق، بأسمائها كما طُلبت. */
  readonly modules: Readonly<Record<string, unknown>>
}

interface Context extends BrowserContext {
  readonly listeners: Set<Listener>
  readonly runtime: unknown
  readonly tabs: unknown
  modules: Record<string, unknown>
}

export const EXTENSION_ID = 'test-extension-id'
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`

const als = new AsyncLocalStorage<Context>()

/** السلك: JSON ذهابًا وإيابًا، كما يسلسل كروم رسائل الإضافة. */
const wire = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)

const typeOf = (message: unknown): string =>
  typeof (message as { type?: unknown } | null)?.type === 'string'
    ? (message as { type: string }).type
    : '?'

export interface Boundary {
  /** سجلّ العبورات بترتيب وقوعها. */
  readonly crossings: readonly Crossing[]
  /** العبورات لنوع رسالة واحد. */
  crossingsOf(type: string): readonly Crossing[]
  /** يبني سياقًا ويحمّل وحداته في رسم وحداتٍ جديد. */
  context(options: {
    readonly name: string
    readonly kind: ContextKind
    readonly tabId?: number
    readonly url: string
    readonly load: Readonly<Record<string, () => Promise<unknown>>>
  }): Promise<BrowserContext>
  /** ما يعيده `captureVisibleTab` — تصل إليه الخلفية وحدها. */
  onCapture(fn: (windowId: number) => Promise<string>): void
  /** يعيد `chrome` وIndexedDB إلى أصلهما. */
  dispose(): void
}

export function createBoundary(): Boundary {
  const contexts: Context[] = []
  const crossings: Crossing[] = []
  let capture: ((windowId: number) => Promise<string>) | null = null

  const current = (): Context | undefined => als.getStore()

  const senderOf = (ctx: Context): chrome.runtime.MessageSender => {
    const origin = new URL(ctx.url).origin
    if (ctx.kind === 'worker') return { id: EXTENSION_ID, url: ctx.url, origin }
    return {
      id: EXTENSION_ID,
      url: ctx.url,
      origin,
      frameId: 0,
      ...(ctx.tabId === null
        ? {}
        : { tab: { id: ctx.tabId, url: ctx.url, active: true } as chrome.tabs.Tab }),
    }
  }

  /**
   * التسليم: كل مستقبِل في مهمّة لاحقة داخل سياقه، بنسخته من الرسالة. أوّل ردٍّ يفوز، ومستمعٌ
   * يُرجع `true` يُبقي القناة مفتوحة. بلا مستقبِل أصلًا يُرفض الوعد بنصّ كروم نفسه.
   */
  const deliver = (
    from: Context,
    targets: readonly Context[],
    message: unknown,
    via: Crossing['via'],
  ) => {
    const pairs = targets.flatMap((t) => [...t.listeners].map((l) => [t, l] as const))
    if (pairs.length === 0) {
      return Promise.reject(
        new Error('Could not establish connection. Receiving end does not exist.'),
      )
    }
    const type = typeOf(message)
    const serialised = JSON.stringify(message)
    const sender = senderOf(from)

    return new Promise<unknown>((resolve, reject) => {
      let settled = false
      let open = false
      let pending = pairs.length
      for (const [target, listener] of pairs) {
        crossings.push({ from: from.name, to: target.name, via, type })
        target.run(() =>
          setTimeout(() => {
            const kept = listener(JSON.parse(serialised), wire(sender), (response?: unknown) => {
              if (settled) return
              settled = true
              resolve(wire(response))
            })
            if (kept === true) open = true
            pending -= 1
            if (pending === 0 && !open && !settled) {
              settled = true
              reject(new Error('The message port closed before a response was received.'))
            }
          }, 0),
        )
      }
    })
  }

  const build = (base: Omit<Context, 'runtime' | 'tabs' | 'run' | 'modules'>): Context => {
    const ctx = base as Context
    const onMessage = {
      addListener: (fn: Listener) => void ctx.listeners.add(fn),
      removeListener: (fn: Listener) => void ctx.listeners.delete(fn),
      hasListener: (fn: Listener) => ctx.listeners.has(fn),
      hasListeners: () => ctx.listeners.size > 0,
    }
    /*
     * المنافذ ليست من الدورتين: الخلفية تسجّل مستمع `onConnect` عند الإقلاع (`serveChannel`)،
     * و`fake-browser` لا يطبّقه. فالمستمع يُحفظ ولا يُستدعى، و`connect` يرمي بسببٍ صريح — دورةٌ
     * تحتاج منفذًا تسقط هنا لا في مكانٍ غامض.
     */
    const onConnect = {
      addListener: () => undefined,
      removeListener: () => undefined,
      hasListener: () => false,
    }
    const runtime = new Proxy(fakeBrowser.runtime, {
      get(target, prop, receiver) {
        if (prop === 'onMessage') return onMessage
        if (prop === 'onConnect') return onConnect
        if (prop === 'connect') {
          return () => {
            throw new Error('المنافذ (runtime.connect) خارج ما تحاكيه دورتا التكامل.')
          }
        }
        if (prop === 'sendMessage') {
          return (message: unknown) => {
            // الرسالة لا تصل إلى سكربت محتوى، ولا ترتدّ إلى مرسِلها.
            const targets = contexts.filter((c) => c.kind !== 'content' && c !== ctx)
            return deliver(ctx, targets, message, 'runtime')
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
    const tabs = new Proxy(fakeBrowser.tabs, {
      get(target, prop, receiver) {
        if (prop === 'sendMessage') {
          return (tabId: number, message: unknown, options?: { frameId?: number }) => {
            if (ctx.kind === 'content') throw new Error('tabs.sendMessage غير متاح لسكربت المحتوى.')
            const targets = contexts.filter(
              (c) =>
                c.kind === 'content' &&
                c.tabId === tabId &&
                (options?.frameId === undefined || options.frameId === 0),
            )
            return deliver(ctx, targets, message, 'tabs')
          }
        }
        if (prop === 'captureVisibleTab') {
          return (windowId: number) => {
            if (ctx.kind !== 'worker') throw new Error('captureVisibleTab للخلفية وحدها.')
            if (!capture) throw new Error('لا لقطة مهيّأة لـcaptureVisibleTab.')
            return capture(windowId)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
    Object.assign(ctx, {
      runtime,
      tabs,
      modules: {},
      run: <T>(fn: () => T): T => als.run(ctx, fn),
    })
    return ctx
  }

  const chromeProxy = new Proxy(fakeBrowser, {
    get(target, prop, receiver) {
      const ctx = current()
      if (ctx && prop === 'runtime') return ctx.runtime
      if (ctx && prop === 'tabs') return ctx.tabs
      return Reflect.get(target, prop, receiver) as unknown
    },
  })
  vi.stubGlobal('chrome', chromeProxy)
  vi.stubGlobal('browser', chromeProxy)

  const realIdb = globalThis.indexedDB
  vi.stubGlobal(
    'indexedDB',
    new Proxy(realIdb, {
      get(target, prop) {
        if (current()?.kind === 'content') {
          throw new Error('سكربت المحتوى وصل إلى IndexedDB — التخزين تملكه الخلفية وصفحات الإضافة.')
        }
        const value: unknown = Reflect.get(target, prop, target)
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value
      },
    }),
  )

  return {
    crossings,
    crossingsOf: (type) => crossings.filter((c) => c.type === type),
    async context({ name, kind, tabId, url, load }) {
      const ctx = build({
        name,
        kind,
        tabId: tabId ?? null,
        url,
        listeners: new Set(),
      })
      contexts.push(ctx)
      // رسم وحداتٍ جديد: كل ما يُستورد بعد هذا السطر نسخةٌ لهذا السياق وحده.
      vi.resetModules()
      for (const [key, importer] of Object.entries(load)) {
        ctx.modules[key] = await ctx.run(importer)
      }
      return ctx
    },
    onCapture(fn) {
      capture = fn
    },
    dispose() {
      contexts.length = 0
      vi.unstubAllGlobals()
    },
  }
}
