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

/** المقاعد لكل كائن حدث: مفتاحٌ ← نداء إزالة مستمعه. */
type Slots = WeakMap<object, Map<string, () => void>>

function slotsOf(): Slots {
  const holder = globalThis as unknown as Record<symbol, Slots | undefined>
  const existing = holder[SLOTS]
  if (existing) return existing
  const created: Slots = new WeakMap()
  holder[SLOTS] = created
  return created
}

/**
 * يضيف `listener` على `event` بعد أن يُزيل ما أضافته نسخةٌ سابقة من الشيفرة على **الحدث نفسه** تحت `key`.
 *
 * **المقعد للزوج (كائن الحدث، المفتاح) لا للمفتاح وحده.** في المتصفّح كائن `chrome.runtime.onMessage` ثابت الهوية في
 * العالم الواحد عبر إعادة تنفيذ الحزمة، فتجد النسخةُ الجديدة مقعد القديمة. أمّا حيث تتشارك سياقاتٌ كثيرة `globalThis`
 * واحدًا بأحداثٍ مختلفة (حزام اختبارات التكامل: الخلفية والصفحة والمحتوى في عمليةٍ واحدة) فمفتاحٌ نصّي عامّ كان
 * يجعل تسجيل السياق الثاني يُزيل مستمع الأوّل من حدثه — فتعلّقت الرسائل حتى المهلة.
 *
 * يُزال المستمع السابق بالنداء الذي سجّله هو، فلا يلزم أن يشترك الإصداران في شيء غير الحدث والمفتاح.
 */
export function replaceListener<F extends (...args: never[]) => unknown>(
  key: string,
  event: ListenerEvent<F>,
  listener: F,
): void {
  const slots = slotsOf()
  let byKey = slots.get(event)
  if (!byKey) {
    byKey = new Map()
    slots.set(event, byKey)
  }
  try {
    byKey.get(key)?.()
  } catch {
    /* حدثٌ مات مع سياقه — لا يمنع التسجيل الجديد */
  }
  event.addListener(listener)
  byKey.set(key, () => event.removeListener(listener))
}
