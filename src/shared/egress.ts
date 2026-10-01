/**
 * **مخرج الشبكة الواحد** — كل طلبٍ يخرج من رصد إلى غير أصل الإضافة يمرّ من هنا، ولا من غيره
 * ([ADR 0046](../../Docs/ADR/0046-named-network-services.md) §4).
 *
 * أربعة شروط بترتيبها، وكلٌّ يُغلق ولا يفتح:
 *   1. **الأصل مسمًّى** في `NETWORK_SERVICES`. وما سواه يُرفض قبل أن يُطلب — وسياسة أمن المحتوى ترفضه ثانيةً.
 *   2. **الإعدادات مقروءة من القرص لحظة الطلب** (`readSettingsFresh`) — لا من ذاكرةٍ قد تكون قديمة في سياقٍ لم
 *      يشترك في التغيّر. وقراءةٌ فشلت جهلٌ لا سماح: لا يُفترض أن «الوضع المحلّي» مطفأ.
 *   3. **«الوضع المحلّي فقط» مطفأ.** وهو مفعَّلٌ افتراضيًّا، فلا اتّصال على تثبيتٍ جديد أصلًا.
 *   4. **صلاحية المضيف المسمّاة ممنوحة** — يمنحها المستخدم بإيماءة «اتّصل»، ويسحبها من صفحة الإضافات.
 *
 * والطلب نفسه بلا ملفّات تعريف ولا مُحيل ولا ذاكرة مخبّأة ولا إعادة توجيه. و`tests/unit/egress-single-exit.test.ts` يمسح `src/`
 * فيُسقط أي `fetch` أو `XMLHttpRequest` أو `WebSocket` أو `sendBeacon` أو `EventSource` خارج هذا الملفّ وقائمته
 * المسمّاة — فمسار رفعٍ يُكتب غدًا لا يتجاوز الإنفاذ بنسيانه.
 *
 * `shared/` طبقة قاعدية: لا تستورد من أي طبقة أعلى منها.
 */

import { NETWORK_SERVICES, type NetworkServiceId } from './permission-policy'
import { hasHostPermission } from './permissions'
import { err, ok, type Result } from './result'
import { readSettingsFresh } from './settings'

/** لماذا لم يخرج الطلب — أو لماذا لم يُكمل. كلٌّ يقابل حالةً في الواجهة لا رسالةً عامّة. */
export type EgressRefusal =
  /** الأصل ليس خدمةً مسمّاة — عطلٌ برمجي لا قرار مستخدم. */
  | 'unnamed-origin'
  /** تعذّرت قراءة الإعدادات، فلا يُعرف إن كان «الوضع المحلّي» مفعَّلًا. */
  | 'settings-unreadable'
  /** «الوضع المحلّي فقط» مفعَّل — الإطار `integrations / local-only`. */
  | 'local-only'
  /** صلاحية المضيف المسمّاة غير ممنوحة — الإطار `integrations / missing-permission`. */
  | 'host-permission'
  /** خرج الطلب ولم يصل ردّ: انقطاع، أو حجبته السياسة، أو رفضه المتصفّح. */
  | 'network'

export interface EgressError {
  readonly refusal: EgressRefusal
  /** الخدمة التي طُلبت، إن عُرفت. */
  readonly service?: NetworkServiceId
  /** تفصيلٌ تقني للسجلّ — **لا يحمل ترويسات الطلب ولا جسمه** (فيهما الرمز). */
  readonly detail?: string | undefined
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>

/** الخدمة التي يتبعها عنوانٌ مطلق — بالأصل حرفًا، لا بالبادئة: `https://api.github.com.evil` ليست هي. */
export function serviceFor(url: string): (typeof NETWORK_SERVICES)[number] | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  // `blob:https://api.github.com/…` أصله الداخلي هو نفسه — والمخرج لـ`https` وحده.
  if (parsed.protocol !== 'https:') return null
  return NETWORK_SERVICES.find((service) => service.origin === parsed.origin) ?? null
}

/**
 * هل يُسمح الآن بالاتّصال بهذه الخدمة؟ الشروط 2–4 بلا طلب — لتعرض الواجهة الحالة قبل أن يضغط المستخدم شيئًا.
 */
export async function egressAllowed(id: NetworkServiceId): Promise<Result<null, EgressError>> {
  const service = NETWORK_SERVICES.find((s) => s.id === id)
  if (!service) return err({ refusal: 'unnamed-origin', detail: id })

  // من القرص لا من الذاكرة: «الوضع المحلّي» قد أُعيد من سياقٍ آخر بعد آخر قراءة هنا.
  const settings = await readSettingsFresh()
  if (!settings.ok) {
    return err({ refusal: 'settings-unreadable', service: id, detail: settings.error.detail })
  }
  if (settings.value.privacy.localOnly) return err({ refusal: 'local-only', service: id })
  if (!(await hasHostPermission(service.hostPattern))) {
    return err({ refusal: 'host-permission', service: id })
  }
  return ok(null)
}

/**
 * يُرسل طلبًا إلى خدمةٍ مسمّاة بعد الشروط الأربعة. ردٌّ بأيّ رمز حالة نجاحٌ هنا — تفسيره للعميل؛ والفشل فشلُ
 * الخروج أو الوصول وحدهما.
 */
export async function egressFetch(
  url: string,
  init: RequestInit = {},
  fetcher: Fetcher = (input, options) => fetch(input, options),
): Promise<Result<Response, EgressError>> {
  const service = serviceFor(url)
  if (!service) return err({ refusal: 'unnamed-origin', detail: safeOrigin(url) })

  const allowed = await egressAllowed(service.id)
  if (!allowed.ok) return allowed

  try {
    const response = await fetcher(url, {
      ...init,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      // لا إعادة توجيه: السياسة تحجب ما خرج عن الأصل، وهنا لا يُتبَع حتى داخله — الطلب يصل حيث سُمّي أو يفشل.
      redirect: 'error',
    })
    return ok(response)
  } catch (error) {
    // اسم الخطأ وحده: رسالة `TypeError` قد تحمل العنوان، والعنوان قد يحمل ما لا يُكتب في سجلّ.
    return err({
      refusal: 'network',
      service: service.id,
      detail: error instanceof Error ? error.name : 'unknown',
    })
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return 'invalid-url'
  }
}
