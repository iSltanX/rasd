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
import type { InspectSnapshot } from '../inspect-schema'
import type { PageName } from '../page-paths'
import type { RestrictionReason } from '../restricted'
import type { CaptureKind, ColorSource, Viewport } from '../storage/schema'
import type { ActiveMode } from '../storage/session'

/** أدوات القائمة الرئيسية: أوضاع الطبقة الستّة القابلة للتفعيل، زائد نوعا الالتقاط الفوري. */
export type ToolName = Exclude<ActiveMode, 'idle'> | 'viewport' | 'full-page'

/**
 * سبب تعذّر التفعيل — قيدُ عنوانٍ يُكتشَف **قبل** الحقن، أو فشلٌ بعده.
 *
 * السببان الأخيران جديدان: كان التفعيل يردّ `started: true` دائمًا ما دام
 * العنوان قابلًا للحقن، فيُبلَّغ المستخدم بنجاحٍ لم يقع. `boot-failed` يعني
 * أن الطبقة لم تُقلِع في الصفحة، و`no-receiver` أن الإقلاع تمّ ولم تصل
 * الرسالة التالية إلى مستقبِل — حالتان مختلفتان في التشخيص فلا تُدمجان.
 */
export type ActivationFailure = RestrictionReason | 'boot-failed' | 'no-receiver'

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
   * يقرأ مرجع المقارنة المحفوظ لهذه الصفحة، إن وُجد (§8.1).
   *
   * **من الخلفية لا من الصفحة**: سكربت المحتوى يعمل بأصل الصفحة المزارة لا
   * أصل الإضافة، فـ`indexedDB` عنده قاعدة **الموقع** لا قاعدة رصد. قِيس
   * مباشرةً: `location.origin` هناك هو الموقع، و`indexedDB.databases()`
   * فارغة، ولا ترى ما كتبه الـservice worker. نفس علّة `capture/blob`
   * ([ADR 0009](../../../Docs/ADR/0009-capture-in-service-worker.md))
   * والصفّ 78 في `Rasd_Plan.md §6`.
   *
   * **الأصل والمسار من التبويب لا من الحمولة** — نفس قاعدة `colour/save`:
   * المصدر الموثوق ما يعرفه المتصفّح. وخلافًا لها يُرمى عند تعذّر القراءة
   * لا يُترَك `null`: هنا مفتاح السجلّ نفسه لا حقل وصفي، ومفتاح خاطئ
   * يُطابق سجلّ موقعٍ آخر أو يستبدله.
   *
   * **`viewport` من الحمولة**: تصنيف المقاس الحيّ معرفةُ الصفحة وحدها ولا
   * سبيل لاشتقاقه من `tabId` — نفس منطق `dpr` في `capture/run`.
   */
  'reference/load': { viewport: Viewport }
  /**
   * يعيّن مرجعًا لهذه الصفحة: من لقطة محفوظة، أو من صورة وصلت من الصفحة
   * (إفلات · لصق) مُرمَّزة base64 لأن الرسائل لا تحمل `Blob`.
   *
   * والردّ يحمل بايتات المرجع المكتوب توًّا — فلا نداء قراءة ثانٍ بعده.
   */
  /**
   * أحدث لقطة محفوظة غير محذوفة — `null` إن لم تُلتقَط لقطة بعد.
   *
   * **من الخلفية لأن الصفحة لا تصل إلى مخزن الإضافة** (نفس علّة
   * `reference/load`). وهي ما يجعل «استخدم آخر لقطة» تعمل بعد التقاطٍ
   * كامل قادته الخلفية: ذاك المسار لا يمرّ بالصفحة أصلًا فلا يترك فيها
   * أثرًا، وكان الزرّ يقرأ متغيّرًا محليًّا يبقى فارغًا دومًا في تلك الحالة.
   *
   * `trashedAt` يُصفّى هنا لا عند العرض — نفس منطق `loadRecent` في النافذة.
   */
  'capture/latest': void
  'reference/set': {
    viewport: Viewport
    source: { kind: 'capture'; captureId: string } | { kind: 'image'; base64: string; mime: string }
  }
  /**
   * استئنافٌ تلقائي لوضع المقارنة بعد تنقّل — من `background/resume.ts`
   * وحدها، بعد تحقّقها من صلاحية مضيف ممنوحة لأصل الصفحة («البقاء عبر
   * التنقّل» في `Rasd_Plan.md §8`، تنفيذ المرحلة 16).
   *
   * **الصفحة تقرِّر لا الخلفية**: المستقبِل يستدعي `reference/load` أوّلًا
   * ولا يدخل وضع `compare` إلا إن وجد مرجعًا لمساره تحديدًا — وإلا لأقحمت
   * كل صفحة على أصلٍ مصرَّح له المستخدمَ في وضعٍ لم يطلبه.
   */
  'compare/resume': void
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
   * يُرجع لقطة **خامًا** للجزء الظاهر، بلا حفظ في المكتبة.
   *
   * **لماذا رسالة مستقلّة عن `capture/run`:** تلك تحفظ سجلًّا وBlob وتُرجع
   * `id` فقط — وعيّنة اللون تحتاج **بكسلات** ولا تريد سجلًّا. عيّنةٌ واحدة
   * تُنتج لقطة في المكتبة تعني تلويث تاريخ المستخدم بكل مرور مؤشِّر.
   *
   * **ولماذا مرّة واحدة لا لكل حركة:** `captureVisibleTab` محدود بنداءين
   * في الثانية (`CAPTURE_INTERVAL_MS = 550`) وزمنه المقيس 234–351ms —
   * أي ≈1.8 عيّنة/ثانية مقابل 60 يحتاجها مؤشِّر يتحرّك. الصفحة تفكّ اللقطة
   * مرّة وتقرأ منها محلّيًا (2.25µs للرقعة الواحدة مقيسة)، وتطلب لقطة
   * جديدة عند الإبطال وحده: تمرير · تغيّر مقاس · تغيّر كثافة البكسل.
   */
  'colour/frame': void
  /**
   * يحفظ لونًا في المكتبة (`Rasd_Ar.md §6.15`).
   *
   * **من الخلفية لا من الصفحة**، كالتقاطات المرحلة 8: قاعدة البيانات
   * مملوكة للـservice worker، وسياسة التصفّح الخاصّ والحصّة تُقرّران هناك.
   * والصفحة لا تعرف عنوانها الموثوق أصلًا — `sender.tab.url` هو المصدر.
   */
  'colour/save': {
    readonly hex: string
    readonly name: string
    readonly note: string
    /** `pixel` أو `css` — أيّ المصدرين أعطى القيمة. */
    readonly source: ColorSource
  }
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
  /**
   * تُبلّغ الخلفية بلقطة فحص مثبَّتة.
   *
   * **عند التثبيت وحده لا عند التمرير**: التمرير يتغيّر عشر مرّات في
   * الثانية، وبثّ لقطة كاملة بكل واحدة يُغرق القناة بلا فائدة — النافذة لا
   * تُعرَض أثناء التمرير أصلًا.
   */
  'inspect/report': { snapshot: InspectSnapshot | null }
  /** تقرأ آخر لقطة مثبَّتة لتبويب. */
  'inspect/get': { tabId: number }
  /**
   * `params` أُضيف في المرحلة 15.
   *
   * لا طريق قبله لفتح المحرر على لقطة بعينها: `Popup.tsx` يحمل معرّف اللقطة
   * ويُسقطه عند النداء. والمعاملات تُبنى استعلامًا فوق مسار الصفحة في
   * الخلفية، لأن الصفحة لا تملك `chrome.runtime.getURL` بمسار مطلق موثوق قبل
   * أن تُفتح.
   */
  'page/open': { page: PageName; active?: boolean; params?: Record<string, string> }
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
    { started: true; mode: ActiveMode | null } | { started: false; reason: ActivationFailure }
  /** بايتات المرجع مُرمَّزة — `null` يعني: لا مرجع محفوظ لهذه الصفحة (نتيجة سليمة لا خطأ). */
  'reference/load': { base64: string; mime: string; bytes: number } | null
  'reference/set': { base64: string; mime: string; bytes: number }
  'compare/resume': { ok: true }
  'capture/latest': { id: string; width: number; height: number } | null
  /** الأبعاد بالبكسل الفيزيائي — ما حُفظ فعلًا لا ما طُلب. */
  'capture/run': { id: string; width: number; height: number }
  'capture/start': { started: boolean }
  'capture/hide-overlay': { hidden: boolean }
  'capture/show-overlay': { shown: boolean }
  'capture/blob': { base64: string; mime: string; bytes: number }
  /**
   * عنوان بيانات PNG للجزء الظاهر، بفضاء **الجهاز**.
   *
   * بلا `dpr`: الصفحة تشتقّ مقياس الصورة إلى إحداثيات النافذة من أبعاد
   * الصورة نفسها مقسومةً على مقاس إطار العرض. الاشتقاق يصحّح نفسه ويشمل
   * تكبير المتصفّح، بينما تمرير رقم من الخلفية يفترض ما لا تعرفه هي.
   */
  'colour/frame': { dataUrl: string }
  'colour/save': { id: string }
  'fullpage/prepare': FullPagePrepared
  'fullpage/step': FullPageStep
  'fullpage/finish': { restored: boolean }
  'fullpage/cancel': { cancelled: boolean }
  'inspect/report': { ok: true }
  'inspect/get': { snapshot: InspectSnapshot | null }
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
