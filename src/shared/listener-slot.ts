/**
 * مستمعو واجهات الإضافة الذين يعيشون عمر السياق — **مقعدٌ واحد لكل مفتاح في العالم الواحد** (`STAGES/21`، ADR 0048).
 *
 * `chrome.scripting.executeScript({ files: ['content.js'] })` **يعيد تنفيذ الحزمة كاملةً** في العالم المعزول نفسه عند كل
 * تفعيل، فكل تنفيذ يبني وحداته من جديد بمتغيّراتها: علامة «سجّلتُ مستمعًا» (`listening` · `watching`) تعود `false`،
 * وتُسجَّل نسخةٌ ثانية فوق الأولى التي لم يُزِلها أحد — فالنسخة الأقدم ميتة لكنّ مستمعها حيّ على `chrome.runtime.onMessage`
 * و`chrome.storage.onChanged`، ومعه إغلاقاتها كلّها. قِيس بـ`verify:memory`: واحدٌ زائدٌ لكل دورة تفعيل، خمسون بعد
 * خمسين دورة (2 ← 52)، لا يراه عدّاد DOM لأنها ليست مستمعي عُقد.
 *
 * فالتسجيل يمرّ من هنا: يُزال مستمعُ النسخة السابقة لهذا المفتاح قبل إضافة الجديد. **النسخة الأحدث تحلّ محلّ الأقدم**، وهو
 * المعنى الوحيد الصحيح — الأقدم لا يملك جلسة بعد الآن (`startOverlay` يعيد القائمة ولا يسجّل ثانيةً)، وإبقاؤها يجعل
 * مستمعين يردّان على الرسالة نفسها، وأوّلهما بلا معالجات فيردّ «لا مستقبِل» ويسبق الصحيح.
 *
 * في الخلفية وصفحات الإضافة تنفيذٌ واحد، فلا مقعد سابق ولا أثر لهذه الدالّة.
 */

/** ما تحتاجه الدالّة من حدثٍ في `chrome` — يطابق `chrome.events.Event` بلا اعتماد على نوعه. */
export interface ListenerEvent<F extends (...args: never[]) => unknown> {
  addListener(listener: F): void
  removeListener(listener: F): void
}

const SLOTS = Symbol.for('rasd.listener-slots')

type Slots = Map<string, () => void>

function slotsOf(): Slots {
  const holder = globalThis as unknown as Record<symbol, Slots | undefined>
  const existing = holder[SLOTS]
  if (existing) return existing
  const created: Slots = new Map<string, () => void>()
  holder[SLOTS] = created
  return created
}

/**
 * يضيف `listener` على `event` بعد أن يُزيل ما أضافته نسخةٌ سابقة من الشيفرة تحت `key`.
 *
 * يُزال المستمع السابق بالنداء الذي سجّله هو، فلا يلزم أن يشترك الإصداران في شيء غير المفتاح.
 */
export function replaceListener<F extends (...args: never[]) => unknown>(
  key: string,
  event: ListenerEvent<F>,
  listener: F,
): void {
  const slots = slotsOf()
  try {
    slots.get(key)?.()
  } catch {
    /* حدثٌ مات مع سياقه — لا يمنع التسجيل الجديد */
  }
  event.addListener(listener)
  slots.set(key, () => event.removeListener(listener))
}
