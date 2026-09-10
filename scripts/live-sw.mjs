/**
 * الارتباط بـ**service worker حيّ** للإضافة — لا بهدفٍ موجود.
 *
 * **العلّة، مقيسةً لا مفترَضة.** كانت أربعة عشر سكربت فحص تنسخ الشكل نفسه:
 * ابحث عن هدف `service_worker` على أصل الإضافة، ثمّ ارتبط به، ثمّ قيِّم فيه
 * فورًا. والافتراض المستتر أن **وجود الهدف يعني جهوز سياق الإضافة فيه** —
 * وليس كذلك: الهدف يظهر في `Target.getTargets` قبل أن يكتمل إقلاع العامل،
 * فيقع التقييم في سياقٍ يُشغِّل JS **بلا ربط `chrome`**.
 *
 * وعلى جهاز التطوير يسبق الإقلاعُ أوّلَ استطلاع فلا يظهر شيء أبدًا؛ وعلى
 * عدّاء CI يظهر متقطّعًا. المقيس حرفيًّا في أوّل تشغيل CI في تاريخ المشروع
 * (`Rasd_Plan.md §6` الصفّان 95 و96): `chrome is not defined` في تشغيل،
 * ومرورٌ كامل في الذي يليه، بنفس الشيفرة وبنفس إصدار المتصفّح.
 *
 * **ولماذا وحدة واحدة لا أربع عشرة رقعة**: العطل واحد لأن الشيفرة واحدة
 * منسوخة. ورقعةٌ في كل نسخة تعني أربعة عشر موضعًا تنحرف عن بعضها عند أوّل
 * تعديل لاحق — وهو عين ما تمنعه قاعدة «الدالّة نفسها لا مثيلها».
 *
 * **والانتظار على المحكّ الصحيح**: `chrome.runtime.id` موجود فعلًا — لا
 * مجرّد `typeof chrome`، فالربط قد يوجد ناقصًا أثناء الإقلاع. ومع **إعادة
 * استكشاف الهدف وإعادة الارتباط في كل دورة**: العامل قد يُستبدَل أثناء
 * إقلاعه، فيصير المُرتبَط به هدفًا ميّتًا لا يحييه انتظار.
 */

/** المهلة الافتراضية — سخيّة لأن عدّاء CI أبطأ من جهاز التطوير بمراتب. */
const DEFAULT_TIMEOUT_MS = 25_000

/**
 * @param {(method: string, params?: object, sessionId?: string) => Promise<any>} send
 *   دالّة إرسال CDP الخاصّة بالسكربت المستدعي — تُمرَّر ولا تُستورَد، فكل
 *   سكربت يملك اتصاله ومُعرِّف جلسته.
 * @param {string | null} extId مُعرِّف الإضافة بعد `Extensions.loadUnpacked`.
 * @returns {Promise<{ sw: object | null, swSession: string | null }>}
 *   الهدف وجلسته حين يصير السياق حيًّا؛ وآخرُ ما وُجد عند انتهاء المهلة —
 *   فيقرّر المستدعي ما يفعل، ولا يُبتلع الحكم هنا.
 */
export async function attachLiveServiceWorker(send, extId, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!extId) return { sw: null, swSession: null }

  const ownOrigin = `chrome-extension://${extId}/`
  const deadline = Date.now() + timeoutMs
  let sw = null
  let swSession = null

  while (Date.now() < deadline) {
    const { targetInfos } = await send('Target.getTargets')
    const found = targetInfos.find(
      (t) => t.type === 'service_worker' && String(t.url).startsWith(ownOrigin),
    )
    if (found) {
      if (!sw || found.targetId !== sw.targetId) {
        sw = found
        swSession = (await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true }))
          .sessionId
        await send('Runtime.enable', {}, swSession)
      }
      let live
      try {
        const res = await send(
          'Runtime.evaluate',
          {
            expression: `typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id)`,
            returnByValue: true,
          },
          swSession,
        )
        live = res?.result?.value === true
      } catch {
        // السياق يُستبدَل أثناء الإقلاع — تُعاد المحاولة، ولا يُبتلع الحكم
      }
      if (live === true) return { sw, swSession }
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  return { sw, swSession }
}

/**
 * نفس الانتظار، لسكربتات تملك مُقيِّمًا جاهزًا لا جلسة CDP خامًا.
 *
 * ثلاثة سكربتات (‏`capture`/`lifecycle`/`popup`) تُجرِّد الارتباط في
 * `findAndAttach` التي تُرجع `{ evaluate }` — وهي عامّة تُستعمَل لأهداف
 * صفحات أيضًا، فلا يصحّ حشو شرط `chrome.runtime.id` داخلها. فيُنتظَر
 * السياق **عند موضع النداء الخاصّ بالـservice worker وحده**.
 *
 * @param {(expression: string) => Promise<any>} evaluate مُقيِّم الهدف المُرتبَط.
 * @returns {Promise<boolean>} هل صار سياق الإضافة حيًّا قبل انتهاء المهلة.
 */
export async function waitForExtensionContext(evaluate, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const live = await evaluate(
        `String(typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id))`,
      )
      if (String(live) === 'true') return true
    } catch {
      // السياق يُستبدَل أثناء الإقلاع — تُعاد المحاولة، ولا يُبتلع الحكم
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}
