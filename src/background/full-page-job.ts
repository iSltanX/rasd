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
import { isIncognitoContext } from '@/shared/env'
import { sendToTab } from '@/shared/messaging'
import { errText, ok, type Result } from '@/shared/result'
import { patchSession, updateSession, type SessionState } from '@/shared/storage/session'

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
 * فاصل نبض التقدّم في الجلسة — أقصر بكثير من `JOB_STALL_MS` (90 ثانية) الذي يقيس به الحارس الركود.
 */
const PROGRESS_PERSIST_MS = 5_000

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
let active: {
  /** معرّف المهمّة كما كُتب في الجلسة — به تُعرف مهمّة هذا العامل من يتيمة عاملٍ مات. */
  id: string
  tabId: number
  controller: AbortController
  /**
   * بدأ الحفظ — **لحظة الالتزام**. قبلها يُقبَل الإلغاء ويُحترَم، وبعدها يُرفَض صادقًا: إلغاءٌ يُردّ عليه
   * «أُلغي» ثمّ تُحفظ اللقطة كذبٌ على مستخدمٍ ألغى ربّما لأن محتوًى حسّاسًا ظهر (تدقيق Copilot، D2).
   */
  committed: boolean
} | null = null

/**
 * تبويبٌ يُستعاد الآن من مهمّةٍ يتيمة (`recoverOrphanedJob`). التقاطٌ جديد عليه أثناء الاستعادة تقع فيه رسائلها
 * (`fullpage/finish` · `capture/show-overlay`) فتُفسده — فيُرفض `busy` حتى تنتهي (المراجعة المستقلّة، R4).
 */
let restoringTab: number | null = null

export function isFullPageRunning(): boolean {
  return active !== null || restoringTab !== null
}

/**
 * يُلغي المهمّة الجارية إن وُجدت ولم تبلغ الحفظ. الاستعادة تقع في `finally` داخل الحلقة.
 *
 * `true` وعدٌ بألّا تُحفظ لقطة؛ و`false` إن لم تكن مهمّة، أو بدأ حفظها فلا رجعة.
 */
export function cancelFullPage(): boolean {
  if (!active || active.committed) return false
  active.controller.abort()
  return true
}

/**
 * يستعيد مهمّةً يتيمة عند إقلاع العامل — تُستدعى مرّة من `registerLifecycle`.
 *
 * المهمّة تُكتب في الجلسة، والعلَم `active` في ذاكرة العامل. فعاملٌ يموت أثناء التقاط (انهيار، أو إيقافٌ
 * من المتصفّح) يترك `session.job` حيّةً بلا حلقة، والصفحةَ مُمرَّرة بعناصرها المخفيّة: قِيس في كروم بإيقاف
 * العامل عبر CDP أن المهمّة بقيت بعد الاستيقاظ والصفحة عند 3039px بلا استعادة، فتعرض النافذة «يلتقط» حتى
 * يمسحها الحارس بعد نحو دقيقتين ونصف (تدقيق Copilot، N3). وكل مهمّة في الجلسة ساعةَ الإقلاع لعاملٍ مات —
 * **إلا مهمّة هذا العامل نفسه**: الحدث الذي أيقظه قد يكون تفعيلًا بدأ التقاطًا قبل أن يأتي دور هذه في
 * الطابور. ولا تُستعاد صفحةٌ بدأ عليها هذا العامل التقاطًا: الاستعادة تُفسد الجديد. **ولا مهمّةُ السياق الآخر**:
 * عاملا التصفّح العادي والخاص يتشاركان الجلسة (`SessionState.job.incognito`)، وأحدهما لا يعرف هل الآخر حيّ.
 *
 * `true` إن وُجدت يتيمة فمُسحت؛ وكتابةٌ فاشلة تُعيد `false` — والصفحة تُستعاد مع ذلك. والبثّ `interrupted`، أو
 * `interrupted-saving` ليتيمةٍ بلغت لحظة الالتزام.
 */
export async function recoverOrphanedJob(
  broadcast: (message: { kind: 'failed'; code: string; message: string }) => void,
): Promise<boolean> {
  const incognito = isIncognitoContext()
  let orphan = null as SessionState['job']
  const cleared = await updateSession((current) => {
    const job = current.job
    if (!job || job.id === active?.id || (job.incognito ?? false) !== incognito) return current
    orphan = job
    return { ...current, job: null }
  })
  if (!orphan) return false
  if (!cleared.ok) console.warn(`[رصد] تعذّر مسح مهمّةٍ يتيمة من الجلسة: ${cleared.error.message}`)
  else console.warn(`[رصد] مهمّة يتيمة من عاملٍ سابق أُنهيت: ${orphan.kind} (${orphan.id})`)

  if (orphan.kind === 'full-page' && active?.tabId !== orphan.tabId) {
    // الصفحة قد تكون أُغلقت أو تنقّلت — لا مستقبِل حينها ولا ما يُستعاد. والطبقة تُظهَر أيضًا: عاملٌ مات بين
    // إخفائها للّقطة (`capture/hide-overlay`) وإظهارها يتركها مخفيّةً، و`fullpage/finish` لا يُظهرها.
    restoringTab = orphan.tabId
    try {
      await askFinish(orphan.tabId).catch(() => null)
      await sendToTab({ tabId: orphan.tabId }, 'capture/show-overlay', undefined, {
        timeoutMs: PAGE_TIMEOUT_MS,
      }).catch(() => null)
    } finally {
      restoringTab = null
    }
  }
  // يتيمةٌ ملتزمة: بدأ حفظها قبل موت العامل، فربّما حُفظت — لا يُقال «لم يُحفظ» ولا يُعرف غيره (R4-06).
  broadcast(
    orphan.committed
      ? {
          kind: 'failed',
          code: 'interrupted-saving',
          message: 'توقّف رصد أثناء حفظ اللقطة، فقد تكون حُفظت. تحقّق منها في المكتبة.',
        }
      : {
          kind: 'failed',
          code: 'interrupted',
          message: 'توقّف الالتقاط قبل اكتماله فلم يُحفظ. أُعيدت الصفحة كما كانت.',
        },
  )
  return cleared.ok
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
  if (isFullPageRunning()) return { started: false, reason: 'ثمّة التقاط كامل جارٍ بالفعل.' }

  const controller = new AbortController()
  const job = { id: crypto.randomUUID(), tabId, controller, committed: false }
  active = job

  /*
   * **حالة المهمّة تُكتَب في الجلسة — وإلا فحالة «جارٍ الالتقاط» غير قابلة
   * للوصول أصلًا.**
   *
   * `selectPopupState` يختار `capturing` من `session.job` وحده، ولم يكن
   * أحدٌ يكتبه قطّ: `sweepStalledJobs` يمسح مهمّةً لا يمكن أن توجد،
   * والنافذة تعرض شبكة الأدوات أثناء التقاطٍ يستغرق عشرين ثانية، وقناة
   * التقدّم تصل رسائلها إلى `liveProgress` **فتُهمَل** لأنها لا تُعرض إلا
   * داخل حالة لا تُختار.
   *
   * **ونبضُ تقدّمٍ كل `PROGRESS_PERSIST_MS` لا كل بلاطة**: الحارس يقيس الركود من `updatedAt`، فمهمّةٌ لا
   * تكتب تقدّمها تُمسَح وهي تعمل (تدقيق Copilot، D3). والنبض أخشن من البلاطة عمدًا: `Popup.tsx` يفضّل
   * `liveProgress` الحيّة على `job.done/total`، فلا داعي لكتابة كل بلاطة.
   *
   * **والكتابات لا تُنتظَر** — النداء يجب أن يعود فورًا (انظر ترويسة الدالّة) — فيرتّبها طابور الجلسة
   * (`updateSession`): نبضٌ أخير لم يُكتب بعد يقع قبل مسح `finally` لا بعده. والنبض والمسح **مشروطان
   * بأن تكون مهمّة الجلسة هذه نفسها**، فلا يُحيي نبضٌ مهمّةً مُسحت، ولا يمسح خروجٌ مهمّةً غيرها.
   */
  const record = {
    id: job.id,
    kind: 'full-page',
    tabId,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    incognito: isIncognitoContext(),
    committed: false,
    done: 0,
    total: 0,
  }
  const mine = (current: SessionState) => current.job?.id === record.id
  void patchSession({ job: { ...record } })

  void (async () => {
    try {
      const run = await runFullPage({
        tabId,
        signal: controller.signal,
        onProgress: (p) => {
          const now = Date.now()
          if (now - record.updatedAt >= PROGRESS_PERSIST_MS) {
            Object.assign(record, { updatedAt: now, done: p.done, total: p.total })
            void updateSession((current) =>
              mine(current) ? { ...current, job: { ...record } } : current,
            )
          }
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

      /*
       * **آخر فحصٍ للإلغاء، ولحظة الالتزام، في دورةٍ واحدة بلا `await` بينهما.**
       *
       * الحلقة لا ترى الإجهاض بعد آخر بلاطة: الترميز (`stitcher.finish`) والاستعادة يجريان بعدها، وقِيس في
       * كروم أن إلغاءً من النافذة أو بـ`Esc` يصل في هذه النافذة (100–400ms على صفحة طويلة) فيُقبل ثمّ تُحفظ
       * اللقطة. فإلغاءٌ سبق هذا السطر يُحترَم هنا، وما بعده يجد `committed` فيُرفَض صادقًا.
       */
      controller.signal.throwIfAborted()
      job.committed = true

      /*
       * **والالتزام يُكتب في الجلسة قبل الحفظ.** `deps.save` يلتزم في القاعدة ثمّ تُمسح المهمّة في `finally`،
       * فعاملٌ يموت بينهما كان يترك يتيمةً يبثّ عنها خلَفُه «فلم يُحفظ» واللقطة محفوظة (تدقيق R4، R4-06). لا
       * عمليةٌ واحدة تجمع القاعدة والجلسة، فالصادق أن يعرف الخلَف أن الحفظ ربّما وقع. والكتابة الفاشلة لا تمنع
       * الحفظ: أسوأ أثرها الرسالة القديمة في حالةٍ نادرة.
       */
      // ونبضٌ حديث معه: الحفظ لا يبدأ بما بقي من مهلة الحارس بعد آخر نبض (المراجعة المستقلّة).
      Object.assign(record, { committed: true, updatedAt: Date.now() })
      await updateSession((current) =>
        mine(current) ? { ...current, job: { ...record } } : current,
      )

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
      // تُمسَح في `finally` كالحالة الحيّة تمامًا: خروجٌ بنجاح أو فشل أو
      // إلغاء يجب ألّا يترك النافذة عالقة على «جارٍ الالتقاط».
      void updateSession((current) => (mine(current) ? { ...current, job: null } : current))
    }
  })()

  return { started: true }
}
