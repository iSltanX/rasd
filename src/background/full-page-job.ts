/**
 * حلقة الالتقاط الكامل — تُقاد من الـservice worker.
 *
 * **خلافًا لنصّ الخطّة**، التي تقول «الحلقة من content script مع `Port` دائم
 * يبقي الـSW حيًّا». نصفها الثاني خاطئ مقيسًا: قناة مفتوحة **بلا** نبضة
 * ماتت عند 30.0s و31.1s في تجربتين. وما يُبقي الـSW حيًّا فعلًا هو نداءات
 * واجهاته نفسها — وهي هنا لا هناك. فالقيادة تُعكَس: الحلقة في الـSW، والصفحة
 * تنفّذ ثلاث رسائل قصيرة (تهيئة · خطوة · إنهاء).
 *
 * **والبايتات لا تعبر `chrome.runtime` أبدًا.** البلاطة تُلتقَط في الـSW
 * وتُرسَم في قماشه وتُغلَق فيه. قيس أن `Blob` و`ImageBitmap` يمرّان عبر
 * الرسائل ككائن فارغ `{}` بلا خطأ — فقدٌ صامت يمرّ من كل اختبار.
 *
 * **والاستعادة في `finally` بلا استثناء**: صفحة تُترك بعناصرها مخفيّة
 * وأنماطها معدَّلة أسوأ من التقاط فاشل.
 */

import { maxTiles, truncationOf } from '@/modules/capture/full-page/limits'
import {
  gutterOf,
  pinchBlocked,
  scaleOf,
  stitchHeight,
  tileTop,
} from '@/modules/capture/full-page/tiles'
import { sendToTab } from '@/shared/messaging'
import { errText, ok, type Result } from '@/shared/result'

import { captureTile } from './capture-service'
import { dataUrlToBytes } from './image-ops'
import { StreamingStitcher } from './stitch'

import type { FullPagePrepared, FullPageStep } from '@/shared/messaging/contract'

/**
 * أقصى عدد بلاطات مهما اتّسعت الذاكرة — حارس التمرير اللانهائي.
 *
 * صفحة تنمو مع كل تمرير لا تنتهي أبدًا. الحدّ يوقف الحلقة ويُعلِم المستخدم
 * بدل الدوران، ويبقى تحته حارس الذاكرة الذي يُبلَغ أوّلًا في الحالة النمطية.
 */
export const HARD_TILE_CAP = 200

/**
 * كم مرّة متتالية يجوز أن ينمو المحتوى قبل إعلانه تمريرًا لانهائيًّا.
 *
 * مرّة واحدة لا تكفي: مقال منتهٍ من اثني عشر قسمًا قيس أنه ينمو 2,400px
 * (‏3.37× ارتفاع النافذة) أثناء التمهيد ثم يستقرّ — فإعلانه لانهائيًّا يبتره.
 */
const GROWTH_STREAK = 3

export interface FullPageProgress {
  readonly done: number
  readonly total: number
  readonly capturedPx: number
  readonly totalPx: number
}

export interface FullPageResult {
  readonly blob: Blob
  readonly width: number
  readonly height: number
  readonly tiles: number
  /** بُتر الالتقاط: إمّا لبلوغ حدّ الصورة وإمّا لنموّ الصفحة. */
  readonly truncated: 'limit' | 'growth' | null
  readonly notes: FullPagePrepared
}

export interface FullPageOptions {
  readonly tabId: number
  readonly signal?: AbortSignal
  readonly onProgress?: (p: FullPageProgress) => void
}

/**
 * مهلة سخيّة: خطوة التمرير تشمل الاستقرار وقد تشمل تمهيدًا داخل الحاوية.
 * وأقصر منها يُجهض مهمّة سليمة على صفحة بطيئة.
 */
const PAGE_TIMEOUT_MS = 15_000

const askPrepare = (tabId: number) =>
  sendToTab({ tabId }, 'fullpage/prepare', undefined, { timeoutMs: PAGE_TIMEOUT_MS })

const askStep = (tabId: number, payload: { y: number; tileIndex: number; lastIndex: number }) =>
  sendToTab({ tabId }, 'fullpage/step', payload, { timeoutMs: PAGE_TIMEOUT_MS })

const askFinish = (tabId: number) =>
  sendToTab({ tabId }, 'fullpage/finish', undefined, { timeoutMs: PAGE_TIMEOUT_MS })

/**
 * ينفّذ التقاطًا كاملًا من أوّل الصفحة إلى آخرها.
 *
 * الترتيب: تهيئة ← حارس ← حلقة (خطوة ← التقاط ← رسم) ← ترميز ← استعادة.
 */
export async function runFullPage(options: FullPageOptions): Promise<Result<FullPageResult>> {
  const { tabId, signal } = options

  const prepared = await askPrepare(tabId)
  if (!prepared.ok) return prepared
  const notes = prepared.value

  // تكبير القرص يكسر النموذج كلّه: `innerHeight` و`devicePixelRatio` أعميان
  // عنه، واللقطة تبقى بالأبعاد نفسها بمحتوًى مرسوم بمقياس آخر.
  if (pinchBlocked(notes.visualScale)) {
    await askFinish(tabId)
    return errText('cancelled', 'الصفحة مكبَّرة بالقرص. أعد التكبير إلى 100% ثم حاول مرّة أخرى.')
  }

  let stitcher: StreamingStitcher | null = null

  try {
    /*
     * فهرس البلاطة الأخيرة **المتوقَّع**، لا سقف الحلقة.
     *
     * التصنيف بالمرساة يحتاجه من البلاطة الأولى: العنصر المرسى إلى الأسفل
     * يظهر في الأخيرة وحدها. وتمرير `0` للبلاطة الأولى يجعلها تبدو أخيرةً
     * فيُزرع الشريط السفلي في وسط الصفحة — قيس هذا العيب بالبكسل: لافتة
     * بارتفاع 58px ظهرت عند y=655 في صفحة طولها 9,690px.
     *
     * وتمرير سقف الحلقة (200) يقع في الخطأ المقابل: لا بلاطة تساويه أبدًا،
     * فلا يظهر الشريط السفلي إطلاقًا.
     */
    const plannedLastIndex = Math.max(0, Math.ceil(notes.maxScroll / Math.max(1, notes.step)))

    // ── البلاطة الأولى تُحدّد المقياس وأبعاد القماش ──────────────
    const first = await step(tabId, 0, 0, plannedLastIndex, signal)
    if (!first.ok) return first

    const shot0 = await captureTile(tabId)
    if (!shot0.ok) return shot0
    const probe = await measure(shot0.value)
    if (!probe.ok) return probe

    const scale = scaleOf(probe.value, notes.innerWidth)
    const gutter = gutterOf(notes.innerWidth, notes.clientWidth, scale)
    const tileH = probe.value.height
    const contentW = probe.value.width - gutter

    const plannedLast = first.value.maxScroll
    const wanted = stitchHeight(plannedLast, scale, tileH)
    const cut = truncationOf(contentW, wanted)
    const height = cut ? cut.allowedHeight : wanted
    const cap = Math.min(maxTiles(contentW, tileH), HARD_TILE_CAP)

    const made = StreamingStitcher.create({ width: contentW, height })
    if (!made.ok) return made
    stitcher = made.value

    const drawn0 = await stitcher.drawTile(shot0.value, 0, gutter, notes.gutterOnStart)
    if (!drawn0.ok) return drawn0

    // ── الحلقة ──────────────────────────────────────────────────
    let y = 0
    let done = 1
    let growth = 0
    let truncated: FullPageResult['truncated'] = cut ? 'limit' : null
    let live = first.value

    while (done < cap) {
      signal?.throwIfAborted()

      const nextY = Math.min(y + notes.step, live.maxScroll)
      // بلغنا القاع: لا خطوة جديدة تضيف شيئًا.
      if (nextY <= y) break

      // يُعاد الحساب كل بلاطة: الصفحة قد تنمو أو تتقلّص فينتقل «الأخير».
      const lastIndex = Math.min(
        cap - 1,
        Math.max(done, Math.ceil(live.maxScroll / Math.max(1, notes.step))),
      )
      const moved = await step(tabId, nextY, done, lastIndex, signal)
      if (!moved.ok) return moved
      const now = moved.value

      // النموّ: يُحتسب بالتتابع لا بمرّة واحدة.
      if (now.maxScroll > live.maxScroll + notes.step) growth += 1
      else growth = 0
      if (growth >= GROWTH_STREAK) {
        truncated = 'growth'
        break
      }
      live = now

      const top = tileTop(now.scrollY, scale)
      if (top >= height) {
        truncated ??= 'limit'
        break
      }

      const shot = await captureTile(tabId)
      if (!shot.ok) return shot
      const drawn = await stitcher.drawTile(shot.value, top, gutter, notes.gutterOnStart)
      if (!drawn.ok) return drawn

      y = now.scrollY
      done += 1
      options.onProgress?.({
        done,
        total: cap,
        capturedPx: Math.min(top + tileH, height),
        totalPx: height,
      })

      // القاع فعلًا: الموضع المقروء بلغ الحدّ.
      if (now.scrollY >= now.maxScroll) break
    }

    const finished = await stitcher.finish()
    if (!finished.ok) return finished
    stitcher = null

    return ok({
      blob: finished.value.blob,
      width: finished.value.width,
      height: finished.value.height,
      tiles: finished.value.tiles,
      truncated,
      notes,
    })
  } finally {
    stitcher?.release()
    // الاستعادة مهما كان المآل — ومهما فشلت هي نفسها.
    await askFinish(tabId).catch(() => null)
  }
}

/** خطوة تمرير واحدة، بحراسة الإجهاض قبلها وبعدها. */
async function step(
  tabId: number,
  y: number,
  tileIndex: number,
  lastIndex: number,
  signal?: AbortSignal,
): Promise<Result<FullPageStep>> {
  signal?.throwIfAborted()
  const moved = await askStep(tabId, { y, tileIndex, lastIndex })
  signal?.throwIfAborted()
  if (!moved.ok) return moved
  return ok(moved.value)
}

/** أبعاد لقطة، بفكّ ترميز واحد يُغلَق فورًا. */
async function measure(dataUrl: string): Promise<Result<{ width: number; height: number }>> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([dataUrlToBytes(dataUrl)]))
  } catch (thrown) {
    return errText('invalid-data', 'تعذّر فكّ ترميز أوّل بلاطة.', String(thrown))
  }
  try {
    return ok({ width: bitmap.width, height: bitmap.height })
  } finally {
    bitmap.close()
  }
}

// ─────────────────────────────────────────────────────────────────
// المهمّة الجارية
// ─────────────────────────────────────────────────────────────────

/**
 * مهمّة واحدة في كل لحظة.
 *
 * المُنظِّم مفرد على مستوى الوحدة (`capture-service.ts`) وحدّ Chrome عامّ
 * للإضافة لا لكل تبويب — فمهمّتان متوازيتان تتجاعان معًا وتُطيلان كلتيهما.
 * والرفض الصريح أوضح للمستخدم من بطء لا يفهم سببه.
 */
let active: { tabId: number; controller: AbortController } | null = null

export function isFullPageRunning(): boolean {
  return active !== null
}

/** يُلغي المهمّة الجارية إن وُجدت. الاستعادة تقع في `finally` داخل الحلقة. */
export function cancelFullPage(): boolean {
  if (!active) return false
  active.controller.abort()
  return true
}

export interface StartedJob {
  readonly started: boolean
  readonly reason?: string
}

/**
 * يبدأ مهمّة ويبثّ تقدّمها على قناة المهام.
 *
 * **لا تُنتظَر**: الحلقة تستغرق عشرين ثانية وأكثر، ونداء التفعيل يجب أن يعود
 * فورًا كي لا يعلّق الاختصار أو زرّ النافذة.
 */
export function startFullPage(
  tabId: number,
  deps: {
    broadcast: (message: {
      kind: 'progress' | 'done' | 'failed'
      done?: number
      total?: number
      note?: string
      result?: unknown
      code?: string
      message?: string
    }) => void
    save: (result: FullPageResult) => Promise<Result<{ id: string }>>
  },
): StartedJob {
  if (active) return { started: false, reason: 'ثمّة التقاط كامل جارٍ بالفعل.' }

  const controller = new AbortController()
  active = { tabId, controller }

  void (async () => {
    try {
      const run = await runFullPage({
        tabId,
        signal: controller.signal,
        onProgress: (p) => {
          deps.broadcast({
            kind: 'progress',
            done: p.done,
            total: p.total,
            note: `${p.capturedPx} / ${p.totalPx}`,
          })
        },
      })

      if (!run.ok) {
        // التفصيل إلى console الخلفية لا إلى الرسالة: المستخدم يقرأ الجملة
        // العربية، والمشخِّص يحتاج نصّ المتصفّح الخام.
        console.warn('[رصد] فشل الالتقاط الكامل:', run.error.code, run.error.detail ?? '')
        deps.broadcast({ kind: 'failed', code: run.error.code, message: run.error.message })
        return
      }

      const saved = await deps.save(run.value)
      if (!saved.ok) {
        deps.broadcast({ kind: 'failed', code: saved.error.code, message: saved.error.message })
        return
      }

      deps.broadcast({
        kind: 'done',
        result: {
          id: saved.value.id,
          width: run.value.width,
          height: run.value.height,
          tiles: run.value.tiles,
          truncated: run.value.truncated,
        },
      })
    } catch (thrown) {
      const aborted = thrown instanceof Error && thrown.name === 'AbortError'
      deps.broadcast({
        kind: 'failed',
        code: aborted ? 'cancelled' : 'handler-failed',
        message: aborted ? 'أُلغي الالتقاط. أُعيدت الصفحة كما كانت.' : String(thrown),
      })
    } finally {
      active = null
    }
  })()

  return { started: true }
}
