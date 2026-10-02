#!/usr/bin/env node
/**
 * حارس Firefox `activate` — مسار التفعيل الحقيقي من تبويبٍ بارد، بلا حقنٍ يدويّ ولا إقلاعٍ يدويّ.
 *
 * نظير `scripts/verify-activate.mjs` فوق `scripts/lib/bidi.mjs` (SS7). التفعيل يمرّ من `tool/activate` وحدها كما
 * تستدعيها النافذة والاختصار والقائمة، ويُقاس أثره في الصفحة لا في ردّ الرسالة (الردّ قال `started: true` يومًا ولا
 * شيء وقع — `verify:activate`):
 *   1. لا وضع مفروض قبل التفعيل (والمضيف إن وُجد خاملٌ من الاستئناف التلقائي).
 *   2. أداة طبقة (`measure`): مضيفٌ واحد بـ`popover` مفتوح، والوضع يتبدّل فعلًا في الجلسة وفي `storage.session`.
 *   3. تفعيلٌ ثانٍ (`inspect`) على التبويب نفسه: مضيفٌ واحد لا اثنان، والوضع الجديد.
 *   4. `full-page` من التبويب نفسه: المهمّة تكتمل وتُحفظ لقطة في المكتبة بمقاسٍ معقول.
 *   5. صفر خطأ من الإضافة في الطرفية.
 *
 *   pnpm build:firefox && pnpm firefox:activate
 *   RASD_GUARD_SABOTAGE=content.js pnpm firefox:activate   # السالب: يجب أن يسقط
 */
import { startGuard } from '../lib/bidi.mjs'

const PORT = 9233
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const g = await startGuard({
  prefix: 'activate',
  port: PORT,
  title: '── حارس Firefox: مسار التفعيل الحقيقي (تبويب بارد) ──',
  fixtures: true,
  stage: { hostPermissions: ['<all_urls>'] },
  hardTimeoutMs: 180_000,
})
const { ok, fail, note } = g
note(`المتصفّح: ${g.version}`)
if (!g.extId || !g.ext) await g.abort()

const site = await g.openSite('/rtl-ar/')
const inPage = g.inContext(site.context)

/** المضيفات في الصفحة من العالم الرئيسي — `popover` على ابنٍ مباشر لـ`<html>` بطبقة z القصوى. */
const readPage = async () =>
  JSON.parse(
    await inPage(`JSON.stringify((() => {
      const hosts = [...document.documentElement.children].filter((el) => el.hasAttribute('popover') && el.style.getPropertyValue('z-index') === '2147483647')
      return { hosts: hosts.length, open: hosts.map((h) => h.matches(':popover-open')) }
    })())`),
  )
const reportedMode = async () =>
  JSON.parse(
    await g.ext(
      `chrome.storage.session.get('rasd:session').then((s) => JSON.stringify((s['rasd:session']?.modes ?? {})[${site.tabId}] ?? null))`,
    ),
  )
const sessionMode = () => g.overlay(site.tabId, '(s) => s.modes.mode.value')

// ── 1) تبويبٌ بارد ───────────────────────────────────────────────
/*
 * «بارد» يعني بلا وضعٍ مفروض لا بلا طبقة: صلاحية `<all_urls>` تُفعّل الاستئناف التلقائي (`background/resume.ts`)
 * فيُركَّب المضيف خاملًا عند التحميل — تصرّفٌ حقيقي لصلاحيةٍ حقيقية، وحكم `verify:activate` نفسه. فالحكم على الوضع
 * والمضيف يُذكر عددًا.
 */
await sleep(400)
const before = await readPage()
const modeBefore = await reportedMode()
modeBefore === null && before.hosts <= 1
  ? ok(
      `تبويبٌ بارد: لا وضع مفروض قبل التفعيل الصريح (مضيفات ${before.hosts} — الاستئناف يركّبه خاملًا)`,
    )
  : fail(`قبل التفعيل: ${before.hosts} مضيفًا والوضع ${JSON.stringify(modeBefore)}`)

// ── 2) أداة طبقة ─────────────────────────────────────────────────
const act = await g
  .message('tool/activate', { tool: 'measure', tabId: site.tabId }, 45_000)
  .catch((e) => ({ ok: false, error: e.message }))
note(`ردّ التفعيل: ${JSON.stringify(act)}`)
await g.settle(site.context)
await sleep(300)
const after = await readPage()
after.hosts === 1 && after.open[0] === true
  ? ok('التفعيل وحده ركّب الطبقة: مضيفٌ واحد و`popover` مفتوح')
  : fail(
      `بعد التفعيل: ${after.hosts} مضيفًا (مفتوح: ${after.open.join(',')}) — ردّ ${JSON.stringify(act)}`,
    )
const live = await sessionMode()
const reported = await reportedMode()
live === 'measure' && reported === 'measure'
  ? ok('الوضع تبدّل فعلًا إلى «measure» — في الجلسة وفي storage.session')
  : fail(`الوضع: الجلسة ${JSON.stringify(live)} · المبلَّغ ${JSON.stringify(reported)}`)

// ── 3) تفعيلٌ ثانٍ ───────────────────────────────────────────────
const again = await g
  .message('tool/activate', { tool: 'inspect', tabId: site.tabId }, 45_000)
  .catch((e) => ({ ok: false, error: e.message }))
await g.settle(site.context)
await sleep(300)
const twice = await readPage()
const liveTwice = await sessionMode()
twice.hosts === 1 && liveTwice === 'inspect'
  ? ok('تفعيلٌ ثانٍ: مضيفٌ واحد لا اثنان، والوضع «inspect»')
  : fail(
      `تفعيلٌ ثانٍ: ${twice.hosts} مضيفًا والوضع ${JSON.stringify(liveTwice)} — ردّ ${JSON.stringify(again)}`,
    )

// ── 4) full-page ─────────────────────────────────────────────────
const previous = await g.message('capture/latest').catch(() => null)
const full = await g
  .message('tool/activate', { tool: 'full-page', tabId: site.tabId }, 60_000)
  .catch((e) => ({ ok: false, error: e.message }))
let saved = null
for (let i = 0; i < 120 && !saved; i++) {
  await sleep(500)
  const latest = await g.message('capture/latest').catch(() => null)
  if (latest?.ok && latest.value && latest.value.id !== previous?.value?.id) saved = latest.value
}
const geometry = JSON.parse(
  await inPage(
    `JSON.stringify({ w: innerWidth, h: document.documentElement.scrollHeight, dpr: devicePixelRatio })`,
  ),
)
saved && saved.width >= geometry.w * 0.9 && saved.height >= Math.min(geometry.h, 600) * 0.9
  ? ok(
      `full-page اكتمل وحُفظ في المكتبة — ${saved.width}×${saved.height} (الصفحة ${geometry.w}×${geometry.h})`,
    )
  : fail(
      `full-page لم تُحفظ لقطته: ردّ ${JSON.stringify(full)} · آخر لقطة ${JSON.stringify(saved)}`,
    )

// ── 5) الطرفية ───────────────────────────────────────────────────
const errors = await g.consoleErrors()
errors.length === 0
  ? ok('صفر خطأ من الإضافة في الطرفية')
  : fail(`أخطاء في الطرفية: ${errors.length}\n      ${errors.slice(0, 8).join('\n      ')}`)

await g.finish({ success: '✓ مسار التفعيل الحقيقي يعمل في Firefox من تبويبٍ بارد.' })
