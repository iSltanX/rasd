/**
 * الإطارات — ما تحتاجه المرحلة 6 فعلًا، لا أكثر.
 *
 * **نطاق مقصود.** الحقن يجري بـ`allFrames: true`، فنسخة من الشيفرة تعمل في
 * كل إطار. لكن المرحلة 6 تبني **الطبقة** لا أدوات الفحص، والذي تحتاجه
 * الطبقة شيئان فقط: أن يرسم الإطار الأعلى وحده، وأن تُوسَم الإطارات التي
 * لا نصل إلى داخلها بدل أن تفشل الأداة فيها صامتة.
 *
 * سجلّ `frameId → إزاحة` المبنيّ بالرسائل تحتاجه **المرحلة 9** (كشف العناصر
 * عبر الإطارات) وحدها، ولا معنى لبنائه قبل وجود مستهلك يثبّت صحّته. وهو
 * كذلك مقيَّد بالصلاحيات الممنوحة: `chrome.webNavigation.getAllFrames` يحتاج
 * صلاحية `webNavigation` وهي **ليست** في سياسة صلاحيات رصد، فالمصدر الوحيد
 * لمعرّف الإطار هو `sender.frameId` في service worker.
 */

import { fromDomRect, type ViewportRect } from './coords'

export type FrameAccess = 'same-origin' | 'cross-origin' | 'unknown'

export interface SurveyedFrame {
  readonly el: HTMLIFrameElement
  /** مساحة الإطار في مستندنا، بإحداثيات النافذة. */
  readonly rect: ViewportRect
  readonly access: FrameAccess
  /** `about:srcdoc` و`about:blank` يرثان أصل الأب فيمكن الدخول إليهما. */
  readonly src: string
}

/**
 * هل نحن الإطار الأعلى؟
 *
 * `window.top === window` قد **يرمي** عبر الأصول في بعض السياقات، ويكذب حين
 * تعيد الصفحة تعريف `window.top`. المقارنة داخل `try` مع افتراض «لسنا
 * الأعلى» عند الشكّ هي الاختيار الآمن: إطار داخلي يظنّ نفسه الأعلى يرسم
 * طبقة ثانية مكرّرة، والعكس لا يرسم شيئًا — والثاني أهون وأظهر.
 */
export function isTopFrame(win: Window = globalThis.window): boolean {
  try {
    return win.top === win.self
  } catch {
    return false
  }
}

/** هل يمكن الوصول إلى مستند هذا الإطار؟ */
export function probeAccess(el: HTMLIFrameElement): FrameAccess {
  try {
    // مجرّد الوصول إلى `contentDocument` عبر الأصول يعطي `null` لا استثناء؛
    // لكن قراءة خاصية داخله ترمي. نجرّب القراءة لا الوجود.
    const doc = el.contentDocument
    if (!doc) return 'cross-origin'
    void doc.location.href
    return 'same-origin'
  } catch {
    return 'cross-origin'
  }
}

/**
 * يمسح إطارات هذا المستند.
 *
 * عناصر `<iframe>` نفسها تعيش في DOM مستندنا، فمساحتها معلومة لنا دائمًا
 * حتى حين يكون داخلها محجوبًا — وهذا بالضبط ما يجعل وسم «خارج النطاق»
 * ممكنًا: نعرف **أين** يقف الحاجز وإن لم نر ما خلفه.
 */
export function surveyFrames(doc: Document = document): SurveyedFrame[] {
  const out: SurveyedFrame[] = []
  for (const el of doc.querySelectorAll('iframe')) {
    const rect = fromDomRect(el.getBoundingClientRect())
    // إطار بلا مساحة لا يعني شيئًا للمستخدم.
    if (rect.width <= 0 || rect.height <= 0) continue
    out.push({ el, rect, access: probeAccess(el), src: el.getAttribute('src') ?? '' })
  }
  return out
}

/** الإطارات التي يجب وسمها بصريًا كخارج النطاق. */
export function blockedFrames(doc: Document = document): SurveyedFrame[] {
  return surveyFrames(doc).filter((f) => f.access !== 'same-origin')
}
