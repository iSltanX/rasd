/**
 * خيط الطمس — ينفّذ عمليات البكسل بعيدًا عن خيط الواجهة.
 *
 * **يعمل من صفحة المحرر لا من الـservice worker.** إنشاء `Worker` داخل
 * الـSW مستحيل حرفيًّا (`typeof Worker === 'undefined'`، البند 31 في §6)،
 * والمحرر مستندٌ كامل مفتوح طوال التحرير. انظر ADR 0014.
 *
 * **ولا يملك هذا الملفّ منطقًا خاصًّا به.** كل الحساب في
 * `modules/editor/redact.ts` و`pixel-ops.ts`، والخيط الرئيسي ينادي **الدوالّ
 * نفسها** عند السقوط. فالمسار المتزامن يُنتج البايتات نفسها لا مثيلها —
 * والفرق بين «نفسها» و«مثيلها» هو الفرق بين اختبار تفاضلي يمرّ وآخر يفشل
 * بحسب أيّ المسارين عمل.
 *
 * **و`self` يُلَفّ في `ctx` مكتوب النوع.** مقيس: مع `DOM` في `lib` يُحلّ
 * `self` إلى `Window & typeof globalThis` بلا خطأ، فيُفحَص
 * `postMessage(msg, transfer)` مقابل تحميلات **النافذة** — أي أن قائمة
 * النقل، وهي عصب العقد كلّه، لا تُفحَص أصلًا. واللفّ يُعيد الفحص إلى
 * تحميلات الـworker.
 */

import { applyOps } from '@/modules/editor/redact'

import type { BlurFailure, BlurReply, BlurRequest } from '@/modules/editor/blur-protocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

/** يبني عرضًا على المخزن المنقول — بلا `ImageData`، فهي ليست منقولة. */
function viewOf(req: BlurRequest): {
  data: Uint8ClampedArray
  width: number
  height: number
} {
  return {
    data: new Uint8ClampedArray(req.buffer),
    width: req.width,
    height: req.height,
  }
}

ctx.addEventListener('message', (event: MessageEvent<BlurRequest>) => {
  const req = event.data
  const started = performance.now()

  try {
    const img = viewOf(req)
    if (img.data.length !== req.width * req.height * 4) {
      throw new Error(`مقاس المخزن ${img.data.length} لا يطابق ${req.width}×${req.height}`)
    }

    applyOps(img, req.ops)

    const reply: BlurReply = {
      id: req.id,
      buffer: req.buffer,
      ms: performance.now() - started,
    }
    /*
     * **المخزن يُعاد منقولًا لا منسوخًا.** لقطة 4000×3000 تعني 48 ميغابايت،
     * ونسخها ذهابًا وإيابًا في كل تغيير شدّة يُلغي كل فائدة إخراج الحساب من
     * الخيط الرئيسي — بل يزيد الضغط على الذاكرة بدل أن يخفّه.
     */
    ctx.postMessage(reply, [reply.buffer])
  } catch (error) {
    const failure: BlurFailure = {
      id: req.id,
      error: error instanceof Error ? error.message : String(error),
    }
    // بلا مخزن: الأصل بقي عند المُرسِل إن لم يُنقل، أو ضاع إن نُقل — وفي
    // الحالتين يسقط العميل إلى المسار المتزامن على نسخته الخاصّة.
    ctx.postMessage(failure)
  }
})

/** إشعار جهوز — يُثبت أن الملفّ حُمِّل فعلًا لا أنه بُني فقط. */
ctx.postMessage({ id: -1, ready: true })
