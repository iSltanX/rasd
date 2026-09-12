/**
 * ضمان **خادم عيّنات حيّ** — لا عمليةٍ مُطلَقة ولا مهلةٍ مقدَّرة.
 *
 * **العلّة، مقيسةً لا مفترَضة.** عشرة سكربتات فحص تعتمد على
 * `scripts/fixtures-serve.mjs` على المنفذ 5399، وكانت تنقسم شكلين كلاهما
 * يفترض ما يجب أن يقيسه:
 *
 * - **ثمانية تُطلق الخادم ثمّ تنام 600ms** (`setTimeout(r, 600)`) وتمضي.
 *   النوم تقديرٌ لا محكّ: إن تأخّر الإقلاع على عدّاء محمَّل مضى الفحص إلى
 *   صفحةٍ لم تُخدَم بعد. وإن كان المنفذ مشغولًا سقط المولود صامتًا
 *   (‏`stdio: 'ignore'`) فلا أحد يعلم أيَّ خادم تُخاطَب.
 * - **اثنان يستطلعان المنفذ ثمّ يخرجان** إن لم يجداه: `verify-capture.mjs`
 *   و`verify-popup.mjs`. وهذا هو سبب **صفرهما في كل جولات CI**: لا خطوة في
 *   `ci.yml` تشغّل الخادم أصلًا، فالحارسان يخرجان 1 قبل أن يفحصا شيئًا —
 *   فجوة بيئة قُرئت أربع جولات على أنها تقطّعٌ مجهول السبب.
 *
 * **ولماذا وحدة واحدة لا عشر رقع**: هو عين تعليل [`live-sw.mjs`](./live-sw.mjs) —
 * العطل واحد لأن الشيفرة واحدة منسوخة، ورقعةٌ في كل نسخة تعني عشرة مواضع
 * تنحرف عند أوّل تعديل لاحق.
 *
 * **والانتظار على المحكّ الصحيح**: لا «المنفذ مفتوح» — فقد يفتحه غيرنا —
 * بل **جسد الجذر يحمل عنوان خادم العيّنات**. وهذا يميّز ثلاث حالات كانت
 * تُخلَط: خادمنا يعمل (يُعاد استعماله)، وخادمٌ آخر يحتلّ المنفذ (يُعلَن ولا
 * يُخمَّن)، ولا خادم (يُطلَق ويُنتظَر حتى يجيب فعلًا).
 */
import { spawn } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'

/** المنفذ المتّفق عليه في السكربتات العشرة كلّها. */
export const FIXTURES_PORT = Number(process.env.RASD_FIXTURES_PORT ?? 5399)

/** المهلة الافتراضية — سخيّة لأن عدّاء CI أبطأ من جهاز التطوير بمراتب. */
const DEFAULT_TIMEOUT_MS = 20_000

/** بصمة جذر خادم العيّنات: يكتبها `fixtures-serve.mjs` في صفحة `/` وحدها. */
const ROOT_MARKER = 'rasd fixtures'

const serverScript = fileURLToPath(new URL('./fixtures-serve.mjs', import.meta.url))

/**
 * هل يجيب **خادم العيّنات** على هذا المنفذ الآن؟
 *
 * @returns {Promise<'ours' | 'foreign' | 'none'>}
 *   `ours` جسد الجذر يحمل البصمة · `foreign` شيء آخر يجيب · `none` لا أحد.
 */
export async function probeFixtures(port = FIXTURES_PORT) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`)
    const body = await res.text()
    return body.includes(ROOT_MARKER) ? 'ours' : 'foreign'
  } catch {
    return 'none'
  }
}

/**
 * يضمن خادم عيّنات حيًّا: يُعيد استعمال العامل، أو يُطلق واحدًا وينتظر جوابه.
 *
 * @param {{ port?: number, timeoutMs?: number }} [options]
 * @returns {Promise<{ url: string, port: number, spawned: boolean, stop: () => void }>}
 *   `stop` تقتل **ما أطلقناه نحن وحده** — فخادمٌ كان يعمل قبلنا (نافذة مطوّر
 *   مفتوحة) لا يُقتَل بانتهاء فحصٍ لم يُطلقه.
 * @throws إن احتلّ المنفذَ شيء آخر، أو لم يجب المولود قبل المهلة — ومعه
 *   خَرْجه القياسي، فالسبب يُنطَق لا يُبتلَع.
 */
export async function ensureFixturesServer(options = {}) {
  const port = options.port ?? FIXTURES_PORT
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const url = `http://127.0.0.1:${port}/`

  const before = await probeFixtures(port)
  if (before === 'ours') return { url, port, spawned: false, stop: () => {} }
  if (before === 'foreign') {
    throw new Error(
      `المنفذ ${port} يجيب لكنّه ليس خادم العيّنات — أوقف ما يحتلّه قبل الفحص. ` +
        `(‏لا يُخمَّن أنه خادمنا: هذا عين الافتراض الذي بُنيت هذه الوحدة لمنعه.)`,
    )
  }

  const proc = spawn(process.execPath, [serverScript], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RASD_FIXTURES_PORT: String(port) },
  })
  let output = ''
  proc.stdout.on('data', (d) => (output += d))
  proc.stderr.on('data', (d) => (output += d))

  let exited = null
  proc.on('exit', (code) => (exited = code))

  const stop = () => {
    if (!proc.killed) proc.kill()
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(
        `خادم العيّنات خرج بالرمز ${exited} قبل أن يجيب — خَرْجه:\n${output.trim() || '(صامت)'}`,
      )
    }
    if ((await probeFixtures(port)) === 'ours') return { url, port, spawned: true, stop }
    await new Promise((r) => setTimeout(r, 100))
  }

  stop()
  throw new Error(
    `خادم العيّنات لم يجب على ${url} خلال ${timeoutMs}ms — خَرْجه:\n${output.trim() || '(صامت)'}`,
  )
}
