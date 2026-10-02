/**
 * نقاط الفرق بين المتصفّحات — `Docs/Browsers/Architecture.md` §4.5.
 *
 * **كل قدرة تسأل عن واجهتها لا عن المتصفّح.** «هل `URL.createObjectURL` موجودة؟» تصحّ في متصفّحٍ لم نعرفه بعد،
 * و«هل نحن Firefox؟» لا تصحّ إلا فيما بُني له. فالدوال الثلاث الأولى أدناه تفحص الواجهة **عند النداء** لا عند
 * التحميل (فالسياق الواحد قد يفقدها وسياقٌ آخر يملكها: عامل Chromium بلا `createObjectURL` وصفحة أحداث Firefox
 * بها)، و**`privateBrowsingModel()` وحدها تقرأ `TARGET`** لأن لا واجهة تكشف أن البيان رُفض فيه `split`.
 *
 * ولا شيء هنا يرمي: كل دالّة تعيد قيمةً تقول ما جرى، فمن يستدعيها بـ`void` من خلفيةٍ لا يترك رفضًا يتيمًا.
 */
import { TARGET } from './target'

/** صفحة اختصارات المتصفّح حين لا يعرض المتصفّح واجهةً لفتحها. */
const SHORTCUTS_PAGE = 'chrome://extensions/shortcuts'

/**
 * عنوانٌ يُسلَّم إلى `chrome.downloads.download`، ومعه ما يحرّره.
 *
 * `blob:` يبقى حيًّا حتى يُحرَّر، فمن بنى واحدًا يستدعي `release()` بعد انتهاء التنزيل (`downloads.onChanged`)
 * أو فشل بدئه. و`data:` لا يحتاج شيئًا، فـ`release` له لا تفعل شيئًا — كي لا يفرّق المستهلك بينهما.
 */
export interface DownloadUrl {
  readonly url: string
  /** `blob:` يلزمه تحرير، و`data:` لا. */
  readonly kind: 'blob' | 'data'
  /** يحرّر `blob:` — آمنةٌ للنداء أكثر من مرّة، ولا أثر لها على `data:`. */
  readonly release: () => void
}

/** حجم قطعة `String.fromCharCode(...chunk)` — نشر مصفوفةٍ كاملة يُسقط المكدّس فوق بضعة عشرات الآلاف. */
const CHUNK = 0x8000

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

/**
 * عنوان تنزيلٍ لبايتات `blob` من الخلفية: `blob:` حين تتوفّر `URL.createObjectURL`، وإلا `data:`.
 *
 * عامل Chromium بلا `createObjectURL` ⇐ `data:` (مقيس حتى 20MB). وصفحة أحداث Firefox بها ⇐ `blob:` — وهناك
 * يُرفض `data:` ويُقبل `blob:` [مقيس: `Docs/Firefox/firefox_rasd.md` §3]. نوع الـblob هو نوع العنوان.
 */
export async function downloadUrl(blob: Blob): Promise<DownloadUrl> {
  if (typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob)
    let released = false
    return {
      url,
      kind: 'blob',
      release: () => {
        if (released) return
        released = true
        URL.revokeObjectURL(url)
      },
    }
  }
  return { url: await toDataUrl(blob), kind: 'data', release: () => {} }
}

/**
 * يفتح صفحة اختصارات المتصفّح. تعيد `true` إن سُلِّم الطلب للمتصفّح، و`false` إن تعذّر — فتعرض الواجهة
 * عندها نصًّا بديلًا بلا رابط (`SHORTCUTS_FALLBACK_HINT`).
 *
 * `chrome.commands.openShortcutSettings` إن وُجدت (Firefox)، وإلا `tabs.create` للعنوان الداخلي. وفي Opera وEdge
 * وVivaldi يُحوَّل العنوان إلى صفحتها [يُقاس بـ`scripts/chromium-probe.mjs`]؛ وتسليم التبويب لا يعني أنه فُتح
 * فعلًا، فالقياس بالمسبار لا بهذه القيمة وحدها.
 */
export async function openShortcutSettings(): Promise<boolean> {
  try {
    // الواجهة ليست في أنواع Chrome (Firefox وحده يعرضها): تُكشف بالحضور لا بالنوع.
    const commands = chrome.commands as { openShortcutSettings?: () => Promise<void> } | undefined
    if (typeof commands?.openShortcutSettings === 'function') {
      await commands.openShortcutSettings()
    } else {
      await chrome.tabs.create({ url: SHORTCUTS_PAGE })
    }
    return true
  } catch {
    return false
  }
}

/** النصّ الذي يحلّ محلّ زرّ فتح صفحة الاختصارات حين يتعذّر فتحها — بلا رابط، يقول أين يُسنَد الاختصار. */
export const SHORTCUTS_FALLBACK_HINT =
  'تعذّر فتح صفحة الاختصارات. أسنده من صفحة الإضافات في المتصفّح، ثمّ الاختصارات.'

/**
 * `split`: للمتصفّح نسخةٌ ثانية من الإضافة في النوافذ الخاصّة، فالخيارات الثلاثة (معطَّل · بلا حفظ · يحفظ) حقيقية.
 * `not_allowed`: لا تعمل الإضافة هناك أصلًا، فلا خيار يُعرض.
 */
export type PrivateBrowsingModel = 'split' | 'not_allowed'

/**
 * نموذج التصفّح الخاص — **الوحيدة التي تقرأ الهدف**: البيان يُثبَّت فيه `incognito: "split"` ويُرفض في Firefox
 * (`not_allowed`)، ولا واجهة وقت التشغيل تكشف الفرق قبل أن يلزم.
 */
export function privateBrowsingModel(): PrivateBrowsingModel {
  return TARGET === 'firefox' ? 'not_allowed' : 'split'
}

/** الجملة التي تحلّ محلّ خيارات التصفّح الخاص حين يكون النموذج `not_allowed`. */
export const PRIVATE_BROWSING_UNAVAILABLE_NOTE = 'لا يعمل رصد في النوافذ الخاصّة في Firefox.'

/**
 * هل يعرف المتصفّح موافقة جمع البيانات؟ — `data_collection` في ردّ `permissions.getAll()`.
 *
 * كشفٌ فقط: طلب الموافقة بنقرة «أرسل» مع إذن المضيف خارج هذه الدالّة. ومتصفّحٌ يرفض القراءة أو يغيب عنه
 * الحقل يعني «لا» — لا شيء يُطلب.
 */
export async function dataConsentSupported(): Promise<boolean> {
  try {
    const granted: object = await chrome.permissions.getAll()
    return 'data_collection' in granted
  } catch {
    return false
  }
}
