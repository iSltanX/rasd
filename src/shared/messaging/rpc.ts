/**
 * طبقة RPC — الطريق **الوحيد** لعبور حدّ بين أجزاء الإضافة.
 *
 * قاعدة ESLint تمنع `chrome.runtime.sendMessage` خارج هذا الملف. السبب أن
 * النداء الخام يرمي عند غياب المستقبِل، ولا مهلة له، ويقبل أي شكل حمولة —
 * ثلاث حالات تُنتج أعطالًا متقطّعة يصعب تتبّعها.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

import { err, ok, rasdError, toRasdError, type Result } from '../result'

import {
  isEnvelope,
  REQUEST_TIMEOUT_MS,
  type Envelope,
  type MessageType,
  type Payload,
  type Reply,
  type WireReply,
} from './contract'

let counter = 0
const nextId = (type: string) => `${type}#${(++counter).toString(36)}`

function envelope<T extends MessageType>(type: T, payload: Payload<T>): Envelope<T> {
  return { __rasd: 1, type, payload, id: nextId(type) }
}

/** يفشل الوعد بمهلة بدل أن يعلّق إلى الأبد. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<Result<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(err(rasdError('timeout', `تجاوز ${ms}ms`))), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(ok(value))
      },
      (thrown: unknown) => {
        clearTimeout(timer)
        resolve(err(toRasdError(thrown)))
      },
    )
  })
}

/** يفكّ الردّ السلكي إلى `Result`. */
function unwrapWire<T extends MessageType>(wire: unknown): Result<Reply<T>> {
  if (typeof wire !== 'object' || wire === null) {
    return err(rasdError('no-receiver', 'ردّ فارغ — المستقبِل لم يردّ'))
  }
  const reply = wire as WireReply<T>
  if (reply.ok) return ok(reply.value)
  return err({
    code: (reply.error.code ?? 'unknown') as never,
    message: reply.error.message,
    ...(reply.error.detail === undefined ? {} : { detail: reply.error.detail }),
  })
}

/**
 * يرسل إلى الـservice worker (أو أي مستمع في سياق الإضافة).
 *
 * لا يرمي أبدًا: كل فشل يعود كـ`Result`.
 */
export async function send<T extends MessageType>(
  type: T,
  payload: Payload<T>,
  options: { timeoutMs?: number } = {},
): Promise<Result<Reply<T>>> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS

  const raw = withTimeout(chrome.runtime.sendMessage(envelope(type, payload)), timeoutMs)
  const outcome = await raw
  if (!outcome.ok) return outcome
  return unwrapWire<T>(outcome.value)
}

/**
 * يرسل إلى إطار محدَّد داخل تبويب محدَّد.
 *
 * `frameId` ضروري لأن الصفحة قد تحوي إطارات، ورصد يعمل داخلها — انظر المرحلة 6.
 */
export async function sendToTab<T extends MessageType>(
  target: { tabId: number; frameId?: number },
  type: T,
  payload: Payload<T>,
  options: { timeoutMs?: number } = {},
): Promise<Result<Reply<T>>> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const opts = target.frameId === undefined ? undefined : { frameId: target.frameId }
  const outcome = await withTimeout(
    chrome.tabs.sendMessage(target.tabId, envelope(type, payload), opts),
    timeoutMs,
  )
  if (!outcome.ok) return outcome
  return unwrapWire<T>(outcome.value)
}

/** سياق يصل مع كل رسالة إلى المستقبِل. */
export interface MessageContext {
  readonly tabId?: number
  readonly frameId?: number
  readonly origin?: string
}

export type Handler<T extends MessageType> = (
  payload: Payload<T>,
  context: MessageContext,
) => Promise<Reply<T>> | Reply<T>

type HandlerMap = { [K in MessageType]?: Handler<K> }

const handlers: HandlerMap = {}
let listening = false

/**
 * يسجّل مستقبِلًا لنوع رسالة.
 *
 * المستقبِل يرمي بحرّية — الغلاف يحوّل الرمي إلى ردّ خطأ، فلا يعبر استثناء
 * حدّ الرسائل ولا يبقى المرسِل معلّقًا.
 */
export function onMessage<T extends MessageType>(type: T, handler: Handler<T>): () => void {
  handlers[type] = handler as HandlerMap[T]
  ensureListener()
  return () => {
    delete handlers[type]
  }
}

function ensureListener() {
  if (listening) return
  listening = true

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isEnvelope(message)) return false

    const handler = handlers[message.type] as Handler<MessageType> | undefined
    if (!handler) {
      sendResponse({
        ok: false,
        error: { code: 'no-receiver', message: `لا مستقبِل للرسالة ${message.type}` },
      } satisfies WireReply)
      // `true` حتى بعد ردّ متزامن: بعض البيئات تُسقط الردّ إذا عاد `false`.
      return true
    }

    const context: MessageContext = {
      ...(sender.tab?.id === undefined ? {} : { tabId: sender.tab.id }),
      ...(sender.frameId === undefined ? {} : { frameId: sender.frameId }),
      ...(sender.origin === undefined ? {} : { origin: sender.origin }),
    }

    void (async () => {
      try {
        const value = await handler(message.payload, context)
        sendResponse({ ok: true, value } satisfies WireReply)
      } catch (thrown) {
        const error = toRasdError(thrown, 'handler-failed')
        sendResponse({
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.detail === undefined ? {} : { detail: error.detail }),
          },
        } satisfies WireReply)
      }
    })()

    // `true` يُبقي القناة مفتوحة للردّ غير المتزامن.
    return true
  })
}

/** للاختبارات: يُفرِغ المستقبِلات المسجَّلة. */
export function resetHandlers() {
  for (const key of Object.keys(handlers)) {
    delete handlers[key as MessageType]
  }
  listening = false
}
