/**
 * عقد الرسائل — المصدر الوحيد لكل ما يُرسَل بين أجزاء الإضافة.
 *
 * `RequestMap` يربط كل نوع رسالة بحمولتها، و`ResponseMap` يربطه باستجابته.
 * إضافة رسالة تعني إضافة سطر في كلٍّ منهما؛ ونسيان أحدهما خطأ ترجمة لا عطل
 * وقت تشغيل. لا `any`، ولا سلسلة نصية حرّة في أي نداء.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

import type { PageName } from '../page-paths'
import type { RestrictionReason } from '../restricted'
import type { ActiveMode } from '../storage/session'

/** أدوات القائمة الرئيسية: أوضاع الطبقة الستّة القابلة للتفعيل، زائد نوعا الالتقاط الفوري. */
export type ToolName = Exclude<ActiveMode, 'idle'> | 'viewport' | 'full-page'

// ─────────────────────────────────────────────────────────────────
// الطلبات — رسالة واحدة، ردّ واحد
// ─────────────────────────────────────────────────────────────────

/** ما تحمله كل رسالة. `void` يعني بلا حمولة. */
export interface RequestMap {
  'diagnostics/ping': void
  'diagnostics/storage': void
  'tab/can-operate': { tabId: number }
  'settings/get': void
  'settings/patch': { patch: Record<string, unknown> }
  'settings/reset': void
  'session/get': void
  'session/patch': { patch: Record<string, unknown> }
  /**
   * مدير الأوضاع داخل الصفحة يبثّ تغيّر وضعه — النافذة تقرؤه عبر `session/get`
   * لتعرض حالتها الحيّة (`capturing` · `inspect-active` · `colors`) بلا
   * انتظار نتيجة أداة لم تُبنَ بعد. لا تحمل `tabId`: صفحة العميل لا تعرف
   * تبويبها، والمُرسِل يوفّره في `MessageContext` عبر `sender.tab.id`.
   */
  'mode/report': { mode: ActiveMode }
  /**
   * أمر مباشر من النافذة أو قائمة السياق: بدّل وضع الطبقة داخل هذه الصفحة.
   * المستقبِل هو `content/index.ts` — يُسجَّل بينما الجلسة قائمة، ويُلغى في
   * التفكيك، فرسالة تصل بعد الإغلاق تلقى «لا مستقبِل» لا سلوكًا صامتًا خاطئًا.
   */
  'mode/set': { mode: ActiveMode }
  /**
   * أداة من النافذة أو الاختصار أو قائمة السياق: تحقن الطبقة إن غابت، ثم
   * تبدّل الوضع المقابل. `viewport` و`full-page` ليستا وضعًا بعد — محرّك
   * الالتقاط في المرحلتين 8 و10 — فتنجحان بالحقن وحده الآن.
   *
   * `tabId` صريح لا مُستنتَج: النافذة صفحة إضافة، لا محتوى تبويب، فرسالتها
   * لا تحمل `sender.tab` إطلاقًا.
   */
  'tool/activate': { tool: ToolName; tabId: number }
  'page/open': { page: PageName; active?: boolean }
  'offscreen/ensure': void
  'offscreen/close': void
}

/** ما ترجعه كل رسالة. */
export interface ResponseMap {
  'diagnostics/ping': {
    version: string
    /** منذ متى والـservice worker الحالي يعمل، بالميلي ثانية. */
    uptimeMs: number
    /** عدد القنوات المفتوحة الآن — دليل حيّ على إبقاء SW مستيقظًا. */
    openPorts: number
    incognito: boolean
  }
  'diagnostics/storage': {
    usageBytes: number
    quotaBytes: number
    ratio: number
    level: 'ok' | 'warn' | 'block'
  }
  'tab/can-operate': { allowed: true } | { allowed: false; reason: RestrictionReason }
  'settings/get': Record<string, unknown>
  'settings/patch': Record<string, unknown>
  'settings/reset': Record<string, unknown>
  'session/get': Record<string, unknown>
  'session/patch': Record<string, unknown>
  'mode/report': { ok: true }
  'mode/set': { ok: true }
  'tool/activate':
    { started: true; mode: ActiveMode | null } | { started: false; reason: RestrictionReason }
  'page/open': { tabId: number }
  'offscreen/ensure': { created: boolean }
  'offscreen/close': { closed: boolean }
}

export type MessageType = keyof RequestMap & keyof ResponseMap

export type Payload<T extends MessageType> = RequestMap[T]
export type Reply<T extends MessageType> = ResponseMap[T]

/** الشكل السلكي الفعلي. لا يُبنى يدويًا — `send()` يبنيه. */
export interface Envelope<T extends MessageType = MessageType> {
  readonly __rasd: 1
  readonly type: T
  readonly payload: RequestMap[T]
  /** معرّف يُستخدم في السجلّ وربط الطلب بالردّ عند التتبّع. */
  readonly id: string
}

/** الردّ السلكي: نجاح أو خطأ، لا استثناء يعبر الحدّ. */
export type WireReply<T extends MessageType = MessageType> =
  | { readonly ok: true; readonly value: ResponseMap[T] }
  | { readonly ok: false; readonly error: { code: string; message: string; detail?: string } }

export function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __rasd?: unknown }).__rasd === 1 &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

// ─────────────────────────────────────────────────────────────────
// القنوات — تدفّق طويل باتجاهين
// ─────────────────────────────────────────────────────────────────

/** أسماء القنوات. القناة تبقي الـservice worker حيًّا ما دامت مفتوحة. */
export const CHANNELS = {
  /** تقدّم مهمة طويلة: الالتقاط الكامل (المرحلة 10)، الاستخراج (14). */
  job: 'rasd:job',
  /** بثّ حالة وضع الفحص من الصفحة إلى بقية الإضافة (المرحلة 6). */
  inspect: 'rasd:inspect',
  /** نبضة صرفة — تُبقي SW مستيقظًا بلا حمولة. */
  keepalive: 'rasd:keepalive',
} as const

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS]

/** رسائل القناة من الطرف المضيف (SW) إلى العميل. */
export type ChannelDown =
  | {
      readonly kind: 'progress'
      readonly done: number
      readonly total: number
      readonly note?: string
    }
  | { readonly kind: 'done'; readonly result: unknown }
  | { readonly kind: 'failed'; readonly code: string; readonly message: string }
  | { readonly kind: 'pong'; readonly at: number }

/** رسائل القناة من العميل إلى الطرف المضيف. */
export type ChannelUp =
  | { readonly kind: 'ping' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'start'; readonly job: string; readonly input?: unknown }

/** فاصل النبضة. أقصر من مهلة خمول الـservice worker البالغة 30 ثانية. */
export const HEARTBEAT_MS = 20_000

/** مهلة الطلب الواحد. أطول من أبطأ نداء `chrome.*` متوقّع. */
export const REQUEST_TIMEOUT_MS = 10_000
