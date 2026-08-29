/**
 * عقد الرسائل — المصدر الوحيد لكل ما يُرسَل بين أجزاء الإضافة.
 *
 * `RequestMap` يربط كل نوع رسالة بحمولتها، و`ResponseMap` يربطه باستجابته.
 * إضافة رسالة تعني إضافة سطر في كلٍّ منهما؛ ونسيان أحدهما خطأ ترجمة لا عطل
 * وقت تشغيل. لا `any`، ولا سلسلة نصية حرّة في أي نداء.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

import type { DeviceRect } from '../geometry'
import type { PageName } from '../page-paths'
import type { RestrictionReason } from '../restricted'
import type { CaptureKind } from '../storage/schema'
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
  /**
   * ينفّذ التقاطًا **من الخلفية**: هي وحدها تملك `chrome.tabs.captureVisibleTab`.
   *
   * `rect` بفضاء **الجهاز** لا النافذة — التحويل يحدث في الصفحة مرّة واحدة
   * حيث تُعرف `dpr` الحيّة، فلا تُخمَّن في الخلفية. `null` يعني الجزء الظاهر
   * كاملًا بلا قصّ.
   *
   * الطبقة تُخفي نفسها وتضمن رسمة قبل أن ترسل — انظر `capture/hide-overlay`.
   */
  'capture/run': {
    /**
     * التبويب المستهدَف. **اختياري**: حين تُرسل الطبقة من داخل الصفحة يعرفه
     * المستقبِل من `sender.tab.id`، فإرساله يفتح بابًا لتناقض بين ما تظنّه
     * الصفحة وما هي فيه فعلًا. يبقى للمُرسِلين الذين لا `sender.tab` لهم —
     * نافذة الإضافة وصفحاتها.
     */
    tabId?: number
    kind: CaptureKind
    rect: DeviceRect | null
    /**
     * كثافة البكسل الحيّة وقت الالتقاط.
     *
     * تُرسَل ولا تُخمَّن: الخلفية لا تملك طريقًا موثوقًا لقراءتها (مقاس
     * النافذة ليس مقاس إطار العرض)، وهي تتغيّر بسحب النافذة بين شاشتين.
     * تُحفَظ في السجلّ ليعرف المحرّر والمكتبة بأي مقياس عُرضت اللقطة.
     */
    dpr: number
  }
  /**
   * يأمر الطبقة ببدء التقاط **فوري** (لا تحديد فيه).
   *
   * `viewport` لا وضع طبقة لها: لا شيء يُرسَم ولا يُنتظَر من المستخدم. ومع
   * ذلك تمرّ من الصفحة لا من الخلفية مباشرةً، لسببين: عدّاد التأجيل يجب أن
   * يُعرَض ويُلغى داخل الصفحة، وكثافة البكسل الحيّة لا تُقرأ إلا فيها.
   */
  'capture/start': { kind: CaptureKind }
  /**
   * يطلب من الطبقة أن تختفي **وتضمن أن رسمة وقعت** قبل أن تردّ.
   *
   * بلا هذا تصوّر الطبقة نفسها: عنصر المضيف في DOM الصفحة وفي طبقتها العليا،
   * و`captureVisibleTab` يلتقط ما يُرسَم فعلًا. «الاختفاء» وحده لا يكفي —
   * تغيير النمط لا يعني أن المتصفّح رسم بعد.
   *
   * غياب المستقبِل ليس خطأً: الالتقاط الفوري للجزء الظاهر لا يحقن طبقة أصلًا.
   */
  'capture/hide-overlay': void
  /** يُعيد إظهار الطبقة بعد انتهاء الالتقاط، نجح أو فشل. */
  'capture/show-overlay': void
  /**
   * يُرجع بايتات لقطة محفوظة، مُرمَّزة base64.
   *
   * الرسائل لا تحمل `Blob`، والصفحة لا تصل إلى IndexedDB الخاصة بالإضافة
   * (أصلها أصل الصفحة لا أصل الإضافة). فالنقل نصًّا هو الطريق الوحيد لتصل
   * البايتات إلى حيث يمكن كتابتها في الحافظة: مستند **مركَّز**.
   */
  'capture/blob': { id: string }
  /**
   * يهيّئ الصفحة لالتقاط كامل: يجد المُمرِّر، ويحيّد الثوابت، ويمهّد.
   *
   * ثلاث رسائل لا واحدة (`prepare`/`step`/`finish`) لأن الحلقة تُقاد من
   * الـservice worker: قيس أن `Port` مفتوحة **لا** تمنع إنهاءه (مات عند
   * 30.0s و31.1s)، وأن ما يُبقيه حيًّا هو نداءات واجهاته نفسها — وهي عنده.
   */
  'fullpage/prepare': void
  /** يمرّر إلى الموضع ويُرجع ما قُرئ فعلًا بعد الاستقرار. */
  'fullpage/step': { y: number; tileIndex: number; lastIndex: number }
  /** يستعيد كل ما مُسّ: الأنماط والموضع. يُنادى في `finally` دائمًا. */
  'fullpage/finish': void
  /**
   * يُجهض المهمّة الجارية.
   *
   * من الصفحة إلى الخلفية لأن الخلفية تملك الحلقة و`AbortController`.
   * `Esc` في الصفحة وزرّ الإلغاء في اللوحة كلاهما يمرّ من هنا.
   */
  'fullpage/cancel': void
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
  /** الأبعاد بالبكسل الفيزيائي — ما حُفظ فعلًا لا ما طُلب. */
  'capture/run': { id: string; width: number; height: number }
  'capture/start': { started: boolean }
  'capture/hide-overlay': { hidden: boolean }
  'capture/show-overlay': { shown: boolean }
  'capture/blob': { base64: string; mime: string; bytes: number }
  'fullpage/prepare': FullPagePrepared
  'fullpage/step': FullPageStep
  'fullpage/finish': { restored: boolean }
  'fullpage/cancel': { cancelled: boolean }
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

/**
 * ما تُبلّغه الصفحة عند التهيئة.
 *
 * كلّه **مقروء لا محسوب**: الأرقام المشتقّة (`scrollHeight × dpr`) خاطئة
 * مقيسًا، والحلقة تبني عليها القماش كلّه.
 */
export interface FullPagePrepared {
  /** ارتفاع نافذة العرض بالبكسل المنطقي — خطوة التمرير. */
  readonly step: number
  /** أقصى إزاحة تمرير مقروءة. */
  readonly maxScroll: number
  /** عرض النافذة — مقام المقياس. */
  readonly innerWidth: number
  /** عرض منطقة المحتوى بلا شريط التمرير. */
  readonly clientWidth: number
  /** `visualViewport.scale` — تكبير القرص يوقف المهمّة. */
  readonly visualScale: number
  /** هل شريط التمرير على جانب البداية؟ يُشتقّ وقت التشغيل لا من `dir`. */
  readonly gutterOnStart: boolean
  /** عدد العناصر العائمة التي أُخفيت — يُعلَن للمستخدم لا يُخفى عنه. */
  readonly hiddenFloating: number
  /** المستند يمرّر أيضًا وقد اختيرت حاوية — محتوًى خارجها لن يُلتقَط. */
  readonly rootAlsoScrolls: number
  /** التمهيد لم يكتمل ضمن ميزانيته — لا رسالة نجاح كاذبة. */
  readonly preflightComplete: boolean
}

/** ما تُبلّغه الصفحة بعد كل خطوة تمرير. */
export interface FullPageStep {
  /** الموضع **المقروء** بعد الاستقرار — لا المطلوب. */
  readonly scrollY: number
  /** ارتفاع المحتوى الآن — يُقرأ كل خطوة لأن الصفحة قد تنمو أو تتقلّص. */
  readonly scrollHeight: number
  readonly maxScroll: number
  readonly visualScale: number
}

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
