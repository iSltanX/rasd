/**
 * قنوات `Port` — للتدفّقات الطويلة.
 *
 * **لماذا لا تكفي الرسالة العادية:** الـservice worker في MV3 يموت بعد 30 ثانية
 * خمول. التقاط صفحة من 40 بلاطة يحتاج ≥20 ثانية من نداءات مُنظَّمة الإيقاع،
 * والاستخراج والمقارنة أطول.
 *
 * **والقناة المفتوحة وحدها لا تمنع الإنهاء — النبضة هي التي تمنعه.** قِيس في
 * المرحلة 10: قناة مفتوحة **بلا** نبضة ماتت عند 30.0s و31.1s، ومع نبضة كل 20
 * ثانية بقيت حيّة عند 459 ثانية. ما يُبقي الـSW حيًّا هو **نداء واجهاته نفسها**
 * — والنبضة أرخص نداء دوري — لا مجرّد وجود منفذ مفتوح. مُسجَّل في
 * `Docs/Engineering.md §6` البند 34، ومقنَّن في
 * `Docs/ADR/0010-service-worker-drives-long-jobs.md`.
 *
 * ولهذا **لا تُقاد المهام الطويلة من هذه القناة**: تُقاد من الـSW نفسه
 * (`background/full-page-job.ts`) والصفحة تنفّذ رسائل معدودة. القناة هنا
 * لبثّ التقدّم والحالة، لا لإبقاء العامل حيًّا.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

import { rasdError, type RasdError } from '../result'

import { HEARTBEAT_MS, type ChannelDown, type ChannelName, type ChannelUp } from './contract'

export interface ChannelClientOptions {
  /** يُستدعى لكل رسالة قادمة من الطرف المضيف. */
  onMessage?: (message: ChannelDown) => void
  /** يُستدعى عند انقطاع القناة، قبل محاولة إعادة الاتصال. */
  onDisconnect?: (error: RasdError) => void
  /** يُستدعى بعد نجاح إعادة الاتصال. */
  onReconnect?: (attempt: number) => void
  /** تعطيل إعادة الاتصال — للاختبار والحالات التي يكفيها اتصال واحد. */
  autoReconnect?: boolean
  /** أقصى عدد محاولات قبل الاستسلام. */
  maxReconnects?: number
}

export interface ChannelClient {
  readonly name: ChannelName
  post(message: ChannelUp): boolean
  /** عدد مرّات إعادة الاتصال منذ الفتح — يُستخدم في الاختبارات والتشخيص. */
  reconnects(): number
  connected(): boolean
  close(): void
}

/**
 * يفتح قناة إلى الـservice worker مع نبضة وإعادة اتصال.
 *
 * إعادة الاتصال ضرورية لأن الـservice worker قد يُعاد تشغيله لأسباب خارجة عن
 * سيطرتنا (تحديث المتصفح، ضغط ذاكرة). الانقطاع ليس عطلًا بل حالة متوقّعة.
 */
export function openChannel(name: ChannelName, options: ChannelClientOptions = {}): ChannelClient {
  const autoReconnect = options.autoReconnect ?? true
  const maxReconnects = options.maxReconnects ?? 5

  let port: chrome.runtime.Port | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let reconnectCount = 0
  let closed = false

  const stopHeartbeat = () => {
    if (heartbeat !== null) {
      clearInterval(heartbeat)
      heartbeat = null
    }
  }

  const connect = () => {
    if (closed) return
    port = chrome.runtime.connect({ name })

    port.onMessage.addListener((message: unknown) => {
      options.onMessage?.(message as ChannelDown)
    })

    port.onDisconnect.addListener(() => {
      stopHeartbeat()
      port = null
      if (closed) return

      options.onDisconnect?.(rasdError('disconnected', `القناة ${name} انقطعت`))

      if (autoReconnect && reconnectCount < maxReconnects) {
        reconnectCount += 1
        const attempt = reconnectCount
        // تراجع أسّي بسيط: SW يحتاج لحظة ليقلع من جديد.
        setTimeout(
          () => {
            if (closed) return
            connect()
            options.onReconnect?.(attempt)
          },
          Math.min(100 * 2 ** (attempt - 1), 2000),
        )
      }
    })

    // النبضة تجدّد مهلة الخمول قبل انقضائها.
    heartbeat = setInterval(() => {
      try {
        port?.postMessage({ kind: 'ping' } satisfies ChannelUp)
      } catch {
        // الانقطاع يصل عبر onDisconnect؛ لا داعي للتعامل هنا.
      }
    }, HEARTBEAT_MS)
  }

  connect()

  return {
    name,
    post(message) {
      if (!port) return false
      try {
        port.postMessage(message)
        return true
      } catch {
        return false
      }
    },
    reconnects: () => reconnectCount,
    connected: () => port !== null,
    close() {
      closed = true
      stopHeartbeat()
      port?.disconnect()
      port = null
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// الطرف المضيف — داخل الـservice worker
// ─────────────────────────────────────────────────────────────────

export interface ChannelHost {
  post(message: ChannelDown): void
  readonly port: chrome.runtime.Port
}

type ChannelHandler = (host: ChannelHost, message: ChannelUp) => void

const hosts = new Set<chrome.runtime.Port>()
const channelHandlers = new Map<ChannelName, ChannelHandler>()
let hostListening = false

/** عدد القنوات المفتوحة الآن — ما دام > 0 فالـservice worker حيّ. */
export function openPortCount(): number {
  return hosts.size
}

/** يسجّل معالجًا لقناة داخل الـservice worker. */
/**
 * يبثّ رسالة إلى **كل** عملاء قناة، لا إلى منفذ بعينه.
 *
 * `ChannelHost.post` يخدم المنفذ الذي وصلت منه الرسالة؛ والمهمّة الطويلة
 * تبدأ من الـservice worker نفسه (باختصار لوحة مفاتيح مثلًا) فلا منفذ
 * «وارد» لها أصلًا، وقد يفتح المستخدم النافذة بعد بدئها. البثّ يجعل التقدّم
 * يصل إلى من كان مشتركًا ومن اشترك لاحقًا.
 */
export function broadcastChannel(name: ChannelName, message: ChannelDown): number {
  let sent = 0
  for (const port of hosts) {
    if (port.name !== name) continue
    try {
      port.postMessage(message)
      sent += 1
    } catch {
      // عميل أُغلق بين الفحص والإرسال — الانقطاع سيصل.
    }
  }
  return sent
}

export function serveChannel(name: ChannelName, handler: ChannelHandler): void {
  channelHandlers.set(name, handler)
  ensureHostListener()
}

function ensureHostListener() {
  if (hostListening) return
  hostListening = true

  chrome.runtime.onConnect.addListener((port) => {
    const handler = channelHandlers.get(port.name as ChannelName)
    if (!handler) return

    hosts.add(port)
    const host: ChannelHost = {
      port,
      post: (message) => {
        try {
          port.postMessage(message)
        } catch {
          // العميل أُغلق بين الفحص والإرسال — الانقطاع سيصل.
        }
      },
    }

    port.onMessage.addListener((message: unknown) => {
      const up = message as ChannelUp
      // النبضة تُردّ هنا لا في المعالج: إبقاء SW حيًّا مسؤولية الطبقة لا المهمّة.
      if (up.kind === 'ping') {
        host.post({ kind: 'pong', at: Date.now() })
        return
      }
      handler(host, up)
    })

    port.onDisconnect.addListener(() => {
      hosts.delete(port)
    })
  })
}

/** للاختبارات: يُفرِغ حالة الطرف المضيف. */
export function resetChannels() {
  hosts.clear()
  channelHandlers.clear()
  hostListening = false
}
